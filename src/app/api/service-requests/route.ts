import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody } from "@/platform/workspaces/http";
import {
  PostgresServiceRequestStore,
  ServiceRequestAccessError,
  ServiceRequestConflictError,
  ServiceRequestNotFoundError,
  ServiceRequestService,
  ServiceRequestStoreError,
  ServiceRequestValidationError,
  type ServiceRequestActor,
} from "@/platform/service-requests";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function json(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function actor(): Promise<ServiceRequestActor | null> {
  const user = await getSessionUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user?.id || !email || !user.email_confirmed_at || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { userId: user.id, verifiedEmail: email };
}

function service(): ServiceRequestService {
  return new ServiceRequestService(PostgresServiceRequestStore);
}

function failure(error: unknown): NextResponse {
  if (error instanceof ServiceRequestValidationError) return json({ error: { code: "invalid_request", message: error.message } }, 400);
  if (error instanceof ServiceRequestAccessError) return json({ error: { code: "request_forbidden", message: error.message } }, 403);
  if (error instanceof ServiceRequestNotFoundError) return json({ error: { code: "request_not_found", message: error.message } }, 404);
  if (error instanceof ServiceRequestConflictError) return json({ error: { code: "request_conflict", message: error.message } }, 409);
  if (error instanceof ServiceRequestStoreError) return json({ error: { code: "source_unavailable", message: error.message } }, 503);
  return json({ error: { code: "source_unavailable", message: "Service request data is unavailable right now." } }, 503);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!workspaceReleaseEnabled()) return json({ error: { code: "release_closed", message: "Service requests are not enabled." } }, 503);
  let current: ServiceRequestActor | null;
  try { current = await actor(); } catch { return json({ error: { code: "source_unavailable", message: "Service request data is unavailable right now." } }, 503); }
  if (!current) return json({ error: { code: "unauthenticated", message: "Sign in with a confirmed email." } }, 401);
  try {
    const params = new URL(request.url).searchParams;
    const requestId = params.get("requestId");
    if (requestId) return json({ request: await service().read(current, requestId) });
    const businessId = params.get("businessId");
    if (businessId) return json({ requests: await service().list(current, { businessId }) });
    const providerWorkspaceId = params.get("providerWorkspaceId");
    if (providerWorkspaceId) return json({ requests: await service().list(current, { providerWorkspaceId }) });
    if (params.get("providerKind") === "strelva") return json({ requests: await service().list(current, { providerKind: "strelva" }) });
    throw new ServiceRequestValidationError("Choose a business, request or provider inbox.");
  } catch (error) { return failure(error); }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!workspaceReleaseEnabled()) return json({ error: { code: "release_closed", message: "Service requests are not enabled." } }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: { code: "invalid_origin", message: "Open Strelva directly to save a service request." } }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: { code: "invalid_content_type", message: "Send a JSON request." } }, 415);
  }
  let current: ServiceRequestActor | null;
  try { current = await actor(); } catch { return json({ error: { code: "source_unavailable", message: "Service request data is unavailable right now." } }, 503); }
  if (!current) return json({ error: { code: "unauthenticated", message: "Sign in with a confirmed email." } }, 401);
  try {
    const saved = await service().execute(current, await readWorkspaceBody(request, 30_000));
    return json({ request: saved });
  } catch (error) { return failure(error); }
}
