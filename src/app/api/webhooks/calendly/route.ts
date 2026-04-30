import { NextResponse } from "next/server";
import { addEvent } from "@/lib/events";
import { getRedis } from "@/lib/redis";
import crypto from "crypto";

interface CalendlyInvitee {
  uri: string;
  name: string;
  email: string;
  timezone?: string;
}

interface CalendlyEvent {
  uri: string;
  name: string;
  start_time: string;
  end_time: string;
  event_type: string;
}

interface CalendlyWebhookPayload {
  event: string;
  payload: {
    invitee: CalendlyInvitee;
    event: CalendlyEvent;
    scheduled_event: {
      uri: string;
      name: string;
      start_time: string;
      end_time: string;
    };
  };
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const [, sigValue] = signature.split(",").find((p) => p.startsWith("v1="))?.split("=") ?? [];
  if (!sigValue) return false;

  const [timestampPart] = signature.split(",").find((p) => p.startsWith("t="))?.split("=") ?? [];
  const timestamp = timestampPart ? signature.split(",")[0].split("=")[1] : null;

  if (!timestamp) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(sigValue, "hex"),
    Buffer.from(expectedSig, "hex")
  );
}

async function findTenantByUserUri(userUri: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  const keys = await redis.keys("calendly-meta:*");
  for (const key of keys) {
    const meta = await redis.get<{ userUri: string; orgUri: string }>(key);
    if (meta?.userUri === userUri) {
      return key.replace("calendly-meta:", "");
    }
  }
  return null;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.CALENDLY_WEBHOOK_SECRET;

  const body = await req.text();
  const signature = req.headers.get("Calendly-Webhook-Signature") || "";

  if (webhookSecret && signature) {
    try {
      const valid = verifySignature(body, signature, webhookSecret);
      if (!valid) {
        console.error("Calendly webhook signature verification failed");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } catch (err) {
      console.error("Calendly webhook signature error:", err);
      return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
    }
  }

  let payload: CalendlyWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.event !== "invitee.created") {
    return NextResponse.json({ received: true });
  }

  const { invitee, scheduled_event } = payload.payload;

  const eventUri = scheduled_event?.uri || payload.payload.event?.uri || "";
  const userUriMatch = eventUri.match(/users\/([^/]+)/);
  const userUri = userUriMatch ? `https://api.calendly.com/users/${userUriMatch[1]}` : null;

  let tenantId: string | null = null;
  if (userUri) {
    tenantId = await findTenantByUserUri(userUri);
  }

  if (!tenantId) {
    console.error("Calendly webhook: could not determine tenant");
    return NextResponse.json({ error: "Unknown tenant" }, { status: 400 });
  }

  const eventName = scheduled_event?.name || "Booking";
  const startTime = scheduled_event?.start_time || payload.payload.event?.start_time;

  await addEvent({
    tenantId,
    source: "calendly",
    type: "booking",
    title: `New booking: ${invitee.name}`,
    body: `${eventName} scheduled for ${new Date(startTime).toLocaleString()}`,
    status: "pending",
    metadata: {
      inviteeName: invitee.name,
      inviteeEmail: invitee.email,
      eventType: eventName,
      scheduledTime: startTime,
      endTime: scheduled_event?.end_time,
      timezone: invitee.timezone,
    },
  });

  return NextResponse.json({ received: true });
}
