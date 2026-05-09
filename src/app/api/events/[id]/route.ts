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

  const { id } = await params;

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const permissionDenied = await requireTenantPermission(tenant, "publishing:manage");
  if (permissionDenied) return permissionDenied;

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

    const result = await resolveEventAction(tenant, id, status);
    if (result.reason === "not_found" || result.reason === "wrong_tenant") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, changed: result.changed });
  } catch {
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}
