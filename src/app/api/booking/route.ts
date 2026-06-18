import { NextResponse } from "next/server";
import { createBookingAtomic, getContent, logActivity } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { requireActiveSubscription } from "@/lib/subscription";

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    if (await isRateLimitedAsync(rateLimitKey(request, "booking"), 10)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { serviceId, date, startTime } = body;
    const clientName = cleanText(body.clientName, 160);
    const clientEmail = cleanText(body.clientEmail, 320).toLowerCase();
    const clientPhone = cleanText(body.clientPhone, 80);
    const notes = cleanText(body.notes, 1000);

    if (!serviceId || !date || !startTime || !clientName || !clientEmail) {
      return NextResponse.json(
        { error: "Missing required fields: serviceId, date, startTime, clientName, clientEmail" },
        { status: 400 }
      );
    }
    if (typeof serviceId !== "string" || !isValidDate(date) || !isValidTime(startTime)) {
      return NextResponse.json({ error: "Invalid booking details" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const tenant = await getTenantFromHeaders();
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    // Calculate end time (parse service duration or default 60)
    const services = await getContent("services", tenant);
    const serviceList = Array.isArray(services.services) ? services.services : [];
    const service = serviceList.find((s) => s.id === serviceId);
    if (!service || service.comingSoon) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }
    const duration = parseInt(service.duration, 10) || 60;

    const [startH, startM] = startTime.split(":").map(Number);
    const endMinutes = startH * 60 + startM + duration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    // Atomic booking: claims slot with Redis SETNX, then creates booking
    // Prevents race condition where two concurrent requests both pass availability check
    const result = await createBookingAtomic(
      {
        serviceId,
        serviceName: service.name,
        date,
        startTime,
        endTime,
        clientName,
        clientEmail,
        clientPhone,
        notes: notes || undefined,
      },
      tenant
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    await logActivity(
      {
        text: `New booking: ${service.name} on ${date} at ${startTime} for ${clientName}`,
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
