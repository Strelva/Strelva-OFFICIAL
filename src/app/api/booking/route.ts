import { NextResponse } from "next/server";
import { createBookingAtomic, getContent, logActivity } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    if (await isRateLimitedAsync(rateLimitKey(request, "booking"), 10)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const { serviceId, serviceName, date, startTime, clientName, clientEmail, clientPhone, notes } = body;

    if (!serviceId || !serviceName || !date || !startTime || !clientName || !clientEmail) {
      return NextResponse.json(
        { error: "Missing required fields: serviceId, serviceName, date, startTime, clientName, clientEmail" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!clientEmail.includes("@") || !clientEmail.includes(".")) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const tenant = await getTenantFromHeaders();

    // Calculate end time (parse service duration or default 60)
    const services = await getContent("services", tenant);
    const service = services.services.find((s) => s.id === serviceId);
    const duration = service ? parseInt(service.duration) || 60 : 60;

    const [startH, startM] = startTime.split(":").map(Number);
    const endMinutes = startH * 60 + startM + duration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    // Atomic booking: claims slot with Redis SETNX, then creates booking
    // Prevents race condition where two concurrent requests both pass availability check
    const result = await createBookingAtomic(
      {
        serviceId,
        serviceName,
        date,
        startTime,
        endTime,
        clientName,
        clientEmail,
        clientPhone: clientPhone || "",
        notes: notes || undefined,
      },
      tenant
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    await logActivity(
      {
        text: `New booking: ${serviceName} on ${date} at ${startTime} for ${clientName}`,
        time: new Date().toISOString(),
        type: "booking",
      },
      tenant
    );

    return NextResponse.json({ success: true, booking: result.booking });
  } catch {
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
