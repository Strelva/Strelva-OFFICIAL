import { NextResponse } from "next/server";
import { getBookings } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    const tenant = await getTenantFromHeaders();
    const dateRange = from && to ? { from, to } : undefined;
    const bookings = await getBookings(tenant, dateRange);

    // Sort by date + time, upcoming first
    bookings.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });

    return NextResponse.json(bookings);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
