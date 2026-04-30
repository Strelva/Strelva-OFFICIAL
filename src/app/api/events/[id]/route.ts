import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { resolveEvent } from "@/lib/events";
import { requireActiveSubscription } from "@/lib/subscription";

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

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const { status } = body;

    if (!status || !["approved", "dismissed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await resolveEvent(id, status);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}
