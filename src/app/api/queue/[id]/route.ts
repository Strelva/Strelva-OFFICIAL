import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { resolveEventAction } from "@/lib/event-actions";
import { readJsonObject } from "@/lib/request-body";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
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

  if (action !== "approved" && action !== "dismissed") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const result = await resolveEventAction(tenant, id, action);
  if (result.reason === "not_found") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (result.reason === "wrong_tenant") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, changed: result.changed });
}
