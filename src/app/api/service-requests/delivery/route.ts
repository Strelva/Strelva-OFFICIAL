import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody } from "@/platform/workspaces/http";
import {
  DeliveryCommitmentService, mutateServiceRequestCommitment, readServiceDeliveryWork, readServiceDeliveryPermissions,
  PostgresServiceRequestStore, ServiceRequestService, ServiceRequestAccessError, ServiceRequestConflictError,
  ServiceRequestNotFoundError, ServiceRequestStoreError, ServiceRequestValidationError, type ServiceRequestActor,
} from "@/platform/service-requests";

export const dynamic = "force-dynamic";
export const maxDuration = 10;
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
async function actor(): Promise<ServiceRequestActor | null> {
  const user = await getSessionUser();
  const email = user?.email?.trim().toLowerCase();
  return user?.id && email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: email } : null;
}
function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof ServiceRequestValidationError) return json({ error: { message: "Check the delivery fields and revision." } }, 400);
  if (error instanceof ServiceRequestAccessError) return json({ error: { message: error.message } }, 403);
  if (error instanceof ServiceRequestNotFoundError) return json({ error: { message: error.message } }, 404);
  if (error instanceof ServiceRequestConflictError) return json({ error: { message: error.message } }, 409);
  return json({ error: { message: error instanceof ServiceRequestStoreError ? error.message : "Delivery data could not be confirmed. Check again before repeating work." } }, 503);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: { message: "Delivery is not enabled." } }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: { message: "Sign in with a confirmed email." } }, 401);
    const params = new URL(request.url).searchParams;
    const requestId = params.get("requestId");
    if (requestId) {
      const id = z.string().uuid().parse(requestId);
      const saved = await new ServiceRequestService(PostgresServiceRequestStore).read(current, id);
      const permissions = await readServiceDeliveryPermissions(current, id);
      return json({ actorId: current.userId, request: saved, permissions });
    }
    const providerWorkspaceId = params.get("providerWorkspaceId");
    if (!providerWorkspaceId && params.get("providerKind") !== "strelva") throw new ServiceRequestValidationError();
    return json({ requests: await readServiceDeliveryWork(current, providerWorkspaceId ? z.string().uuid().parse(providerWorkspaceId) : undefined) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: { message: "Delivery is not enabled." } }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: { message: "Open Strelva directly to change a delivery." } }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: { message: "Send a JSON request." } }, 415);
  try {
    const current = await actor();
    if (!current) return json({ error: { message: "Sign in with a confirmed email." } }, 401);
    const saved = await new DeliveryCommitmentService(mutateServiceRequestCommitment).execute(current, await readWorkspaceBody(request, 20_000));
    return json({ request: saved });
  } catch (error) { return failure(error); }
}
