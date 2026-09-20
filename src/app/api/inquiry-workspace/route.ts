import { NextResponse } from "next/server";
import { getAuthUserId, requireTenantAccess, requireTenantPermission, verifyAuth } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { readJsonObject } from "@/lib/request-body";
import { requireActiveSubscription } from "@/lib/subscription";
import {
  InquiryConcurrencyError,
  InquiryPersistenceError,
  InquiryValidationError,
  executeInquirySurface,
  inquiryPermissionForAction,
  inquiryReleaseEnabled,
  parseInquirySurfaceAction,
  readInquirySurface,
} from "@/products/inquiries/server";
import {
  INQUIRY_WORKSPACE_EXIT_CODE,
  InquiryWorkspaceExitBlockedError,
  InquiryWorkspaceExitUnavailableError,
  resolveInquiryWorkspace,
} from "@/products/inquiries/server";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

function requestedTenant(request: Request, body?: Record<string, unknown>): string | null {
  const value = body ? body.tenantId : new URL(request.url).searchParams.get("tenantId");
  if (typeof value !== "string") return null;
  const tenant = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(tenant) ? tenant : null;
}

async function contextFor(request: Request, body?: Record<string, unknown>) {
  const requested = requestedTenant(request, body);
  if (!requested) return { error: json({ error: "A tenantId is required." }, 400) } as const;
  // The control-plane business picker may select any granted membership.
  // Authorization, not a browser-supplied header or the control-plane hostname,
  // establishes the selected tenant before any business data is read.
  const tenant = requested;
  const denied = await requireTenantAccess(tenant);
  if (denied) return { error: denied } as const;
  const config = await getTenantConfig(tenant);
  if (!config || !config.active) return { error: json({ error: "Business unavailable." }, 404) } as const;
  const workspace = await resolveInquiryWorkspace({
    tenantId: tenant,
    tenantStableId: config.stableId,
    fallbackBusinessId: config.stableId ?? tenant,
  });
  return { tenantId: tenant, config, businessId: workspace.businessId, exitCompleted: workspace.exitCompleted } as const;
}

function expectedRevision(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return value;
  return undefined;
}

function failure(error: unknown) {
  if (error instanceof InquiryWorkspaceExitBlockedError) return json({ error: error.message, code: error.code }, 409);
  if (error instanceof InquiryWorkspaceExitUnavailableError) return json({ error: error.message, code: error.code }, 503);
  if (error instanceof InquiryConcurrencyError) return json({ error: error.message, currentRevision: error.current?.revision ?? null }, 409);
  if (error instanceof InquiryValidationError) return json({ error: error.message }, 400);
  if (error instanceof InquiryPersistenceError) return json({ error: "Inquiry workspace is temporarily unavailable." }, 503);
  if (error instanceof Error && error.name === "EventPersistenceError") return json({ error: "The governed change queue is temporarily unavailable." }, 503);
  // Engine operation errors are user-correctable (for example, a missing
  // rehearsal). Keep the sentence useful while bounding it at the API edge.
  if (error instanceof Error && error.message) return json({ error: error.message.slice(0, 500) }, 400);
  return json({ error: "We couldn't complete this request." }, 503);
}

export async function GET(request: Request) {
  if (!inquiryReleaseEnabled()) return json({ error: "Inquiry workspace is not enabled." }, 503);
  if (!(await verifyAuth())) return json({ error: "Unauthorized" }, 401);
  try {
    const context = await contextFor(request);
    if ("error" in context && context.error) return context.error;
    const result = await readInquirySurface({ tenantId: context.tenantId, businessId: context.businessId, config: context.config });
    return json({ snapshot: result.snapshot });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!inquiryReleaseEnabled()) return json({ error: "Inquiry workspace is not enabled." }, 503);
  if (!(await verifyAuth())) return json({ error: "Unauthorized" }, 401);
  if (!sameOrigin(request)) return json({ error: "Open Strelva directly to make this change." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);

  try {
    const body = await readJsonObject(request);
    if (!body) return json({ error: "Invalid request body." }, 400);
    const context = await contextFor(request, body);
    if ("error" in context && context.error) return context.error;
    if (context.exitCompleted) return json({ error: "Inquiry configuration is stopped for this workspace.", code: INQUIRY_WORKSPACE_EXIT_CODE }, 409);
    const actorId = await getAuthUserId();
    if (!actorId) return json({ error: "Unauthorized" }, 401);
    const revision = expectedRevision(body.expectedRevision);
    if (revision === undefined) return json({ error: "An expected revision is required." }, 400);
    const action = parseInquirySurfaceAction(body.action, actorId, context.businessId);
    const denied = await requireTenantPermission(context.tenantId, inquiryPermissionForAction(action));
    if (denied) return denied;
    if (action.kind === "publish" || action.kind === "undo") {
      const blocked = await requireActiveSubscription(context.tenantId);
      if (blocked) return blocked;
    }
    const result = await executeInquirySurface({ context, action, expectedRevision: revision, actorId });
    return json(result);
  } catch (error) {
    return failure(error);
  }
}
