import { NextResponse } from "next/server";
import { verifyAuth, requireTenantPermission } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import type { EventWorkflowAction } from "@/lib/event-actions";
import { decideTenantEvent, decideTenantEventAsOperator, operatorRefusal, sessionTenantDecider, verifiedOperator } from "@/lib/operator-decisions";
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

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "publishing:manage");
  if (permissionDenied) return permissionDenied;
  // An operator here (any tenant via ?tenant=) decides as the operator, never
  // as the owner, with audit rows; owner-routed items stay the owner's.
  const decider = await sessionTenantDecider(tenant);
  if (!decider) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Operator-only fulfillment transitions require a verified operator, even
  // for the tenant owner (who otherwise holds publishing:manage), and always
  // run as that operator.
  const decision = { tenantId: tenant, eventId: id, action: action as EventWorkflowAction, auditAction: `dashboard.queue.${action}` };
  let result;
  if (OPERATOR_ONLY_ACTIONS.has(action as EventWorkflowAction)) {
    const operator = decider.kind === "operator" ? decider.operator : await verifiedOperator();
    if (!operator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    result = await decideTenantEventAsOperator(operator, decision);
  } else {
    result = await decideTenantEvent(decider, decision);
  }
  const refused = operatorRefusal(result.reason);
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });
  if (result.reason === "not_found") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (result.reason === "wrong_tenant") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, changed: result.changed });
}
