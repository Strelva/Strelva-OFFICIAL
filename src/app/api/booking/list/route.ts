import { NextResponse } from "next/server";
import { getBookings, getBookingConfig } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { zonedTodayIso } from "@/lib/booking";

export async function GET(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";

    const [bookings, config] = await Promise.all([
      getBookings(tenant),
      getBookingConfig(tenant),
    ]);
    const today = zonedTodayIso(config.timezone);

    const filtered = bookings.filter((b) => {
      if (status === "upcoming") return b.date >= today;
      if (status === "past") return b.date < today;
      return true;
    });

    // Sort by date descending, then by start time descending
    filtered.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.startTime.localeCompare(a.startTime);
    });

    return NextResponse.json(filtered);
  } catch {
    return NextResponse.json({ error: "Failed to load bookings" }, { status: 500 });
  }
}
