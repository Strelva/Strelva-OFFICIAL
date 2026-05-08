import { NextResponse } from "next/server";
import { getAvailableSlots, getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";

export async function GET(request: Request) {
  if (await isRateLimitedAsync(rateLimitKey(request, "booking-availability"), 60)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const serviceId = searchParams.get("serviceId");

  if (!date || !serviceId || serviceId.length > 120) {
    return NextResponse.json(
      { error: "date and serviceId are required" },
      { status: 400 }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const services = await getContent("services", tenant);
    const service = services.services.find((item) => item.id === serviceId);
    if (!service || service.comingSoon) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }

    const slots = await getAvailableSlots(date, serviceId, tenant);
    return NextResponse.json({ date, serviceId, slots });
  } catch {
    return NextResponse.json({ error: "Failed to get availability" }, { status: 500 });
  }
}
