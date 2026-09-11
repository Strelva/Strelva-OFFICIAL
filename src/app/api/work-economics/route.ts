import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { executeJobEconomicsCommand, findJobEconomicsForTarget, readJobEconomics } from "@/platform/work-economics/service";
import {
  JobEconomicsAccessError,
  JobEconomicsConflictError,
  JobEconomicsNotFoundError,
  JobEconomicsPersistenceError,
  JobEconomicsPayerError,
  JobEconomicsTargetError,
  JobEconomicsValidationError,
  JOB_ECONOMICS_POLICY,
} from "@/platform/work-economics/types";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, { status, headers: responseHeaders });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return false;
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

function verifiedActor(user: Awaited<ReturnType<typeof getSessionUser>>): { userId: string; verifiedEmail: string } | null {
  if (!user?.id || !user.email_confirmed_at || !user.email) return null;
  return { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
}

async function actorForRequest() {
  return verifiedActor(await getSessionUser());
}

class BodyTooLargeError extends Error {}

async function readBoundedObject(request: Request): Promise<Record<string, unknown> | null> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const bytes = Number(declared);
    if (Number.isFinite(bytes) && bytes > MAX_BODY_BYTES) throw new BodyTooLargeError();
  }
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function failure(error: unknown): NextResponse {
  if (error instanceof JobEconomicsValidationError) return json({ error: error.message }, 400);
  if (error instanceof JobEconomicsPayerError) return json({ error: error.message }, 403);
  if (error instanceof JobEconomicsAccessError) return json({ error: error.message }, 403);
  if (error instanceof JobEconomicsTargetError) return json({ error: error.message }, 404);
  if (error instanceof JobEconomicsNotFoundError) return json({ error: error.message }, 404);
  if (error instanceof JobEconomicsConflictError) return json({ error: error.message }, 409);
  if (error instanceof JobEconomicsPersistenceError) return json({ error: error.message }, 503);
  return json({ error: "We couldn't update this work economics record." }, 503);
}

function responseFor(
  inspection: Awaited<ReturnType<typeof readJobEconomics>> | null,
  canManage: boolean,
  currentActorId: string,
) {
  return {
    ledger: inspection?.job ?? null,
    usage: inspection?.usage ?? [],
    policy: inspection?.policy ?? JOB_ECONOMICS_POLICY,
    currentActorId,
    canManage,
    canAccept: Boolean(inspection && inspection.job.payerId === currentActorId && inspection.job.status === "draft"),
  };
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Work economics is not enabled." }, 503);
  try {
    const actor = await actorForRequest();
    if (!actor) return json({ error: "Unauthorized" }, 401);
    const params = new URL(request.url).searchParams;
    const jobId = params.get("jobId");
    if (jobId) {
      const inspection = await readJobEconomics(actor, jobId);
      return json(responseFor(inspection, inspection.job.payerId === actor.userId, actor.userId));
    }
    const queryValues = {
      productId: params.get("productId"),
      resourceKind: params.get("resourceKind"),
      workspaceId: params.get("workspaceId"),
      workId: params.get("workId"),
      tenantId: params.get("tenantId"),
      businessId: params.get("businessId"),
      requestId: params.get("requestId"),
      capabilityId: params.get("capabilityId"),
    };
    const lookup = await findJobEconomicsForTarget(actor, Object.fromEntries(
      Object.entries(queryValues).filter(([, value]) => value !== null),
    ));
    return json(responseFor(lookup.inspection, lookup.canManage, actor.userId));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Work economics is not enabled." }, 503);
  try {
    const actor = await actorForRequest();
    if (!actor) return json({ error: "Unauthorized" }, 401);
    if (!sameOrigin(request)) return json({ error: "Open Strelva directly to make this change." }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ error: "Send a JSON request." }, 415);
    }
    const body = await readBoundedObject(request);
    if (!body) return json({ error: "Invalid request body." }, 400);
    const inspection = await executeJobEconomicsCommand(actor, body);
    return json(responseFor(inspection, inspection.job.payerId === actor.userId, actor.userId));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "Request body is too large." }, 413);
    return failure(error);
  }
}
