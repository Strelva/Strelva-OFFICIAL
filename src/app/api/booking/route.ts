import { NextResponse } from "next/server";
import { createBooking, getAvailableSlots, logActivity } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { isRateLimited, rateLimitKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    if (isRateLimited(rateLimitKey(request, "booking"), 10)) {
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

    // Verify slot is still available
    const available = await getAvailableSlots(date, serviceId, tenant);
    if (!available.includes(startTime)) {
      return NextResponse.json(
        { error: "This time slot is no longer available. Please choose another time." },
        { status: 409 }
      );
    }

    // Calculate end time (parse service duration or default 60)
    const { getContent } = await import("@/lib/storage");
    const services = await getContent("services", tenant);
    const service = services.services.find((s) => s.id === serviceId);
    const duration = service ? parseInt(service.duration) || 60 : 60;

    const [startH, startM] = startTime.split(":").map(Number);
    const endMinutes = startH * 60 + startM + duration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    const booking = await createBooking(
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

    await logActivity(
      {
        text: `New booking: ${serviceName} on ${date} at ${startTime} for ${clientName}`,
        time: new Date().toISOString(),
        type: "booking",
      },
      tenant
    );

    return NextResponse.json({ success: true, booking });
  } catch {
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
