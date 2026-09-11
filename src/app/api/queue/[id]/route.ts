import { NextResponse } from "next/server";
import { getAuthUserId, verifyAuth, requireTenantPermission, isSuperAdmin } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { resolveEventAction, type EventWorkflowAction } from "@/lib/event-actions";
import { readJsonObject } from "@/lib/request-body";

const ALLOWED_ACTIONS = new Set<EventWorkflowAction>([
  "approved",
  "dismissed",
  "triaged",
  "quoted",
  "accepted",
  "in_progress",
  "shipped",
  "declined",
]);

// The custom-change-request fulfillment transitions are OPERATOR work (Strelva
// triages/quotes/ships a build). A client owner must not self-advance their own
// request through the internal pipeline — the UI gates these to operators, but
// the server has to enforce it too (the UI gate is bypassable via a direct call).
const OPERATOR_ONLY_ACTIONS = new Set<EventWorkflowAction>([
  "triaged",
  "quoted",
  "accepted",
  "in_progress",
  "shipped",
  "declined",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorId = await getAuthUserId();
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "publishing:manage");
  if (permissionDenied) return permissionDenied;

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : undefined;

  if (!ALLOWED_ACTIONS.has(action as EventWorkflowAction)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Operator-only fulfillment transitions require super-admin, even for the
  // tenant owner (who otherwise holds publishing:manage).
  if (OPERATOR_ONLY_ACTIONS.has(action as EventWorkflowAction) && !(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await resolveEventAction(tenant, id, action as EventWorkflowAction, actorId);
  if (result.reason === "not_found") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (result.reason === "wrong_tenant") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, changed: result.changed });
}
