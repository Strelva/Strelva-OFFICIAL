import { NextResponse } from "next/server";
import { verifyAuth, requireTenantPermission } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { decideTenantEvent, operatorRefusal, sessionTenantDecider } from "@/lib/operator-decisions";
import { readJsonObject } from "@/lib/request-body";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "publishing:manage");
  if (permissionDenied) return permissionDenied;
  // An operator decides as the operator, never as the owner (operator-decisions.ts).
  const decider = await sessionTenantDecider(tenant);
  if (!decider) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  try {
    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const status = typeof body.status === "string" ? body.status : undefined;

    if (status !== "approved" && status !== "dismissed") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const result = await decideTenantEvent(decider, { tenantId: tenant, eventId: id, action: status, auditAction: `dashboard.event.${status}` });
    const refused = operatorRefusal(result.reason);
    if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });
    if (result.reason === "not_found" || result.reason === "wrong_tenant") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, changed: result.changed });
  } catch {
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}
