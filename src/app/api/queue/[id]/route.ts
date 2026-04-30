import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { resolveEvent } from "@/lib/events";
import { requireActiveSubscription } from "@/lib/subscription";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (action !== "approved" && action !== "dismissed") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await resolveEvent(id, action);

  return NextResponse.json({ success: true });
}
