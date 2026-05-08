import { NextResponse } from "next/server";
import { addEvent } from "@/lib/events";
import { getRedis } from "@/lib/redis";
import crypto from "crypto";

/**
 * Vegaro webhook payload structure.
 * Placeholder based on common booking system patterns - adjust once API docs are available.
 */
interface VegaroBookingPayload {
  event: string; // e.g., "booking.created", "booking.cancelled", "booking.updated"
  data: {
    id: string;
    business_id: string;
    client: {
      name: string;
      email?: string;
      phone?: string;
    };
    service: {
      id: string;
      name: string;
      duration: number; // minutes
      price?: number;
    };
    staff?: {
      id: string;
      name: string;
    };
    start_time: string; // ISO datetime
    end_time: string;
    status: string;
    notes?: string;
    created_at: string;
  };
}

/**
 * Verify Vegaro webhook signature if supported.
 * Placeholder implementation - adjust once signature scheme is documented.
 */
function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  // Common pattern: HMAC-SHA256
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    );
  } catch {
    return false;
  }
}

/**
 * Find tenant by Vegaro business ID.
 */
async function findTenantByBusinessId(businessId: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  // Check all Vegaro connections for matching business ID
  const keys = await redis.keys("connections:*:vegaro");
  for (const key of keys) {
    const connection = await redis.get<{ apiKey: string; tenantId: string }>(key);
    if (connection?.apiKey === businessId) {
      return connection.tenantId;
    }
  }
  return null;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.VEGARO_WEBHOOK_SECRET;

  const body = await req.text();
  const signature = req.headers.get("X-Vegaro-Signature") ||
                    req.headers.get("X-Webhook-Signature") || "";

  if (!webhookSecret) {
    console.error("Vegaro webhook secret not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const valid = verifySignature(body, signature, webhookSecret);
  if (!valid) {
    console.error("Vegaro webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: VegaroBookingPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle booking creation events
  const bookingEvents = ["booking.created", "booking_created", "new_booking", "appointment.created"];
  if (!bookingEvents.includes(payload.event)) {
    // Acknowledge but don't process
    return NextResponse.json({ received: true });
  }

  const { data } = payload;
  if (!data?.business_id) {
    console.error("Vegaro webhook: missing business_id");
    return NextResponse.json({ error: "Missing business_id" }, { status: 400 });
  }

  // Find tenant by business ID
  const tenantId = await findTenantByBusinessId(data.business_id);
  if (!tenantId) {
    console.error(`Vegaro webhook: no tenant found for business ${data.business_id}`);
    return NextResponse.json({ error: "Unknown business" }, { status: 400 });
  }

  // Format booking time for display
  const startTime = new Date(data.start_time);
  const formattedTime = startTime.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Emit unified event
  await addEvent({
    tenantId,
    source: "vegaro",
    type: "booking",
    title: `New booking: ${data.client.name}`,
    body: `${data.service.name} on ${formattedTime}`,
    status: "pending",
    metadata: {
      bookingId: data.id,
      clientName: data.client.name,
      clientEmail: data.client.email,
      clientPhone: data.client.phone,
      serviceName: data.service.name,
      serviceDuration: data.service.duration,
      servicePrice: data.service.price,
      staffName: data.staff?.name,
      scheduledTime: data.start_time,
      endTime: data.end_time,
      notes: data.notes,
    },
  });

  return NextResponse.json({ received: true });
}
