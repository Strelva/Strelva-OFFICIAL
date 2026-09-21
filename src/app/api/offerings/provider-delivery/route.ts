import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server-client";
import { isSuperAdminUser } from "@/lib/db/repositories";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  OfferingAccessError,
  OfferingConflictError,
  OfferingNotFoundError,
  OfferingService,
  OfferingStoreError,
  OfferingValidationError,
  PostgresOfferingStore,
  ProviderDeliveryService,
  postgresProviderDeliveries,
  type OfferingActor,
} from "@/platform/offerings";
import {
  acceptOperationalAssignment,
  inspectOperationalAssignment,
  revokeOperationalAssignment,
} from "@/products/operations/server";
import { readWorkspaceBody } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

async function actor(): Promise<OfferingActor | null> {
  const user = await getSessionUser();
  const email = user?.email?.trim().toLowerCase();
  return user?.id && email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: email } : null;
}

function service() {
  const offerings = new OfferingService(new PostgresOfferingStore());
  return new ProviderDeliveryService(postgresProviderDeliveries, {
    read: (current, businessId, installationId) => offerings.read(current, businessId, installationId),
    async canManage(current, businessId) { return (await offerings.list(current, businessId)).permissions.canManage; },
  }, {
    inspect: inspectOperationalAssignment,
    accept: acceptOperationalAssignment,
    revoke: revokeOperationalAssignment,
  });
}

function failure(error: unknown) {
  if (error instanceof OfferingValidationError) return json({ error: { code: "invalid_request", message: error.message } }, 400);
  if (error instanceof OfferingAccessError) return json({ error: { code: "delivery_forbidden", message: error.message } }, 403);
  if (error instanceof OfferingNotFoundError) return json({ error: { code: "delivery_not_found", message: error.message } }, 404);
  if (error instanceof OfferingConflictError) return json({ error: { code: "delivery_conflict", message: error.message } }, 409);
  if (error instanceof OfferingStoreError) return json({ error: { code: "source_unavailable", message: error.message } }, 503);
  return json({ error: { code: "source_unavailable", message: "Provider delivery is unavailable right now." } }, 503);
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: { code: "release_closed", message: "Provider delivery is not enabled." } }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: { code: "unauthenticated", message: "Sign in with a confirmed email." } }, 401);
    const businessId = new URL(request.url).searchParams.get("businessId") ?? "";
    const deliveries = await service().list(current, businessId);
    let canManage = false;
    try {
      canManage = (await new OfferingService(new PostgresOfferingStore()).list(current, businessId)).permissions.canManage;
    } catch (error) {
      // Agency members are intentionally not customer-workspace members. Their
      // delivery list is still readable, but a missing or failed offering read
      // must remain a source failure rather than looking like no permission.
      if (!(error instanceof OfferingAccessError)) throw error;
    }
    const isInternalStaff = await isSuperAdminUser(current.userId);
    return json({ deliveries: await Promise.all(deliveries.map(async (delivery) => {
      const assigned = await inspectOperationalAssignment(current, delivery.assignmentId).catch(() => null);
      return {
        ...delivery,
        canManage,
        canAccept: delivery.status === "requested" && assigned?.assignment.assigneeUserId === current.userId
          && (assigned.assignment.assigneeKind === "agency" || isInternalStaff),
      };
    })) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: { code: "release_closed", message: "Provider delivery is not enabled." } }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: { code: "invalid_origin", message: "Open Strelva directly to manage provider delivery." } }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: { code: "invalid_content_type", message: "Send a JSON request." } }, 415);
  }
  try {
    const current = await actor();
    if (!current) return json({ error: { code: "unauthenticated", message: "Sign in with a confirmed email." } }, 401);
    return json({ delivery: await service().execute(current, await readWorkspaceBody(request, 20_000)) });
  } catch (error) { return failure(error); }
}
