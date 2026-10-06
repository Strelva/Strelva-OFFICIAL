import { NextResponse } from "next/server";
import { createBookingAtomic, getContent, logActivity } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { isRateLimitedAsync, isRateLimitedPerInstance, rateLimitKey } from "@/lib/rate-limit";
import { bookingReadSource } from "@/platform/bookings/flags";
import { readJsonObject } from "@/lib/request-body";
import { sendBookingConfirmation } from "@/lib/delivery-email";
import { notifyOwnerOfBooking } from "@/platform/bookings/notices";

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const UNAVAILABLE = "We couldn't save your booking just now, so nothing was booked. Please try again in a minute.";

/**
 * The visitor's rate limit. Redis is required for it in production and fails
 * closed. With the one booking store serving (its exclusion constraint guards
 * every slot), a Redis outage falls back to a per-instance limit so a
 * client's customer can still book; otherwise the visitor is told honestly
 * that nothing was booked.
 */
async function bookingRateLimit(request: Request): Promise<"ok" | "limited" | "unavailable"> {
  const key = rateLimitKey(request, "booking");
  try {
    return (await isRateLimitedAsync(key, 10)) ? "limited" : "ok";
  } catch (error) {
    if ((await bookingReadSource()) !== "postgres") return "unavailable";
    console.warn("[booking] rate limit store unavailable; using the per-instance limit while the one booking store serves:", error instanceof Error ? error.message : error);
    return isRateLimitedPerInstance(key, 10) ? "limited" : "ok";
  }
}

/** After the booking is stored, nothing that follows may turn it into a failure for the visitor. */
async function afterStored(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[booking] ${label} failed after the booking was stored (non-fatal):`, error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request) {
  try {
    const limit = await bookingRateLimit(request);
    if (limit === "unavailable") return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    if (limit === "limited") {
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

    // A visitor booking on a live site is never billing-gated: a lapsed or
    // past-due payment never drops a client's customer (money-and-data rule 6).
    const tenant = await getTenantFromHeaders();

    // Calculate end time (parse service duration or default 60)
    const services = await getContent("services", tenant);
    const serviceList = Array.isArray(services.services) ? services.services : [];
    const service = serviceList.find((s) => s.id === serviceId);
    if (!service || service.comingSoon) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }
    const duration = parseInt(service.duration, 10) || 60;

    const [startH, startM] = startTime.split(":").map(Number) as [number, number];
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
      // Only the one booking store (reads flipped) returns a code: a paused
      // bookings System, or a service the business record no longer offers.
      if (result.code === "invalid_service") return NextResponse.json({ error: "Invalid service" }, { status: 400 });
      // Nothing could be stored or guarded (store and Redis both unavailable): say so, never claim success.
      if (result.code === "unavailable") return NextResponse.json({ error: result.error }, { status: 503 });
      return NextResponse.json({ error: result.error, ...(result.code === "paused" ? { paused: true } : {}) }, { status: 409 });
    }
    const requested = result.requested === true;
    // With reads on the one store, the name comes from the business record.
    const bookedService = result.booking.serviceName;

    await afterStored("activity log", () => logActivity(
      {
        text: `${requested ? "New booking request" : "New booking"}: ${bookedService} on ${date} at ${startTime} for ${clientName}`,
        time: new Date().toISOString(),
        type: "booking",
      },
      tenant
    ));
    // "New booking" to the owner recipient (off unless STRELVA_BOOKING_OWNER_NOTICE=1).
    // A request reaches the owner as a Needs you item instead.
    await afterStored("owner notice", () => notifyOwnerOfBooking(tenant, result.booking));

    // A request isn't confirmed yet, so no confirmation goes out.
    if (requested) return NextResponse.json({ success: true, booking: result.booking, confirmationSent: false, requested: true });

    // Confirm to the customer. Fail-soft: the booking already committed, so an email
    // failure must never surface as an error. Gated by CUSTOMER_EMAIL_ENABLED (default
    // off) — when it doesn't send, `confirmationSent` is false and the widget shows honest
    // copy instead of claiming an email went out.
    let confirmationSent = false;
    try {
      const config = await getTenantConfig(tenant);
      confirmationSent = await sendBookingConfirmation({
        to: clientEmail,
        clientName,
        serviceName: bookedService,
        date,
        time: startTime,
        businessName: config?.siteName ?? "",
        tenantId: tenant,
      });
    } catch (err) {
      console.error("[booking] confirmation email failed (non-fatal):", err);
    }

    return NextResponse.json({ success: true, booking: result.booking, confirmationSent });
  } catch {
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
