import { NextResponse } from "next/server";
import { updateBooking, logActivity } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { verifyAuth, requireTenantPermission } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const tenant = await getTenantFromHeaders();
    const permissionDenied = await requireTenantPermission(tenant, "settings:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const status = typeof body.status === "string" ? body.status : undefined;
    const notes = typeof body.notes === "string" ? body.notes : undefined;

    if (status && !["confirmed", "cancelled", "completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (status === "cancelled") updates.cancelledAt = new Date().toISOString();

    const booking = await updateBooking(id, updates, tenant);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    await logActivity(
      {
        text: `Booking ${status || "updated"}: ${booking.serviceName} on ${booking.date} for ${booking.clientName}`,
        time: new Date().toISOString(),
        type: "booking",
      },
      tenant
    );

    return NextResponse.json({ success: true, booking });
  } catch {
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}
