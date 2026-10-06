import { NextResponse } from "next/server";
import { addEvent } from "@/lib/events";
import { getRedis } from "@/lib/redis";
import crypto from "crypto";
import { recordCalendlyBooking } from "@/platform/bookings/calendly";
import { bookingStoreWriteEnabled } from "@/platform/bookings/flags";

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

/**
 * Two payload shapes are accepted. The older one nests the invitee
 * (`payload.invitee`); Calendly's API v2 webhooks send the invitee resource
 * itself as `payload` (its `uri`, `name`, `email`, `timezone`), with the host in
 * `scheduled_event.event_memberships[].user`.
 */
interface CalendlyWebhookPayload {
  event: string;
  payload: Partial<CalendlyInvitee> & {
    invitee?: CalendlyInvitee;
    event?: CalendlyEvent;
    scheduled_event?: {
      uri: string;
      name: string;
      start_time: string;
      end_time: string;
      event_memberships?: Array<{ user?: string }>;
    };
  };
}

function inviteeOf(payload: CalendlyWebhookPayload["payload"]): Partial<CalendlyInvitee> {
  if (payload.invitee) return payload.invitee;
  return { uri: payload.uri, name: payload.name, email: payload.email, timezone: payload.timezone };
}

/** The host's Calendly user: from the event membership (API v2), else from a user-scoped event URI. */
function userUriOf(payload: CalendlyWebhookPayload["payload"], eventUri: string): string | null {
  const member = payload.scheduled_event?.event_memberships?.find((m) => typeof m.user === "string" && m.user.startsWith("https://api.calendly.com/users/"))?.user;
  if (member) return member;
  const match = eventUri.match(/users\/([^/]+)/);
  return match ? `https://api.calendly.com/users/${match[1]}` : null;
}

const SIGNATURE_MAX_AGE_SECONDS = 300;

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const sigParts = signature.split(",").find((p) => p.startsWith("v1="))?.split("=") ?? [];
  const sigValue = sigParts[1];
  if (!sigValue) return false;

  const [timestampPart] = signature.split(",").find((p) => p.startsWith("t="))?.split("=") ?? [];
  const timestamp = timestampPart ? (signature.split(",")[0]?.split("=")[1] ?? null) : null;

  if (!timestamp) return false;

  // Replay-prevention: reject any webhook older than 5 minutes.
  const tsSeconds = parseInt(timestamp, 10);
  if (isNaN(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > SIGNATURE_MAX_AGE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  try {
    const provided = Buffer.from(sigValue, "hex");
    const expected = Buffer.from(expectedSig, "hex");
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

async function findTenantByUserUri(userUri: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  // Fast path: O(1) reverse index written at connection time.
  const indexed = await redis.get<string>(`calendly-user-uri:${userUri}`);
  if (indexed) return indexed;

  // Fallback for connections saved before the reverse index existed. Avoid the
  // blocking KEYS command — SCAN the keyspace cursor-by-cursor instead. Backfill
  // the reverse index on a hit so this scan doesn't recur for that user.
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, {
      match: "calendly-meta:*",
      count: 100,
    });
    cursor = next;
    for (const key of batch) {
      const meta = await redis.get<{ userUri: string; orgUri: string }>(key);
      if (meta?.userUri === userUri) {
        const tenantId = key.replace("calendly-meta:", "");
        await redis.set(`calendly-user-uri:${userUri}`, tenantId, {
          ex: 60 * 60 * 24 * 365,
        });
        return tenantId;
      }
    }
  } while (cursor !== "0");
  return null;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.CALENDLY_WEBHOOK_SECRET;

  const body = await req.text();
  const signature = req.headers.get("Calendly-Webhook-Signature") || "";

  if (!webhookSecret) {
    console.error("Calendly webhook secret not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const valid = verifySignature(body, signature, webhookSecret);
  if (!valid) {
    console.error("Calendly webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: CalendlyWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // `invitee.canceled` only matters to the one booking store (it cancels the
  // imported booking); without the store's write switch it is acknowledged as before.
  const isCancel = payload.event === "invitee.canceled";
  if (payload.event !== "invitee.created" && !(isCancel && bookingStoreWriteEnabled())) {
    return NextResponse.json({ received: true });
  }

  const inner = payload.payload && typeof payload.payload === "object" ? payload.payload : {};
  const invitee = inviteeOf(inner);
  const { scheduled_event } = inner;

  const eventUri = scheduled_event?.uri || inner.event?.uri || "";
  const userUri = userUriOf(inner, eventUri);

  let tenantId: string | null = null;
  if (userUri) {
    tenantId = await findTenantByUserUri(userUri);
  }

  if (!tenantId) {
    console.error("Calendly webhook: could not determine tenant");
    return NextResponse.json({ error: "Unknown tenant" }, { status: 400 });
  }

  // The booking itself, in the one store (a no-op unless its write switch is on).
  await recordCalendlyBooking(tenantId, {
    event: payload.event,
    invitee,
    scheduledEvent: {
      uri: eventUri,
      name: scheduled_event?.name ?? inner.event?.name,
      start_time: scheduled_event?.start_time ?? inner.event?.start_time,
      end_time: scheduled_event?.end_time ?? inner.event?.end_time,
    },
  });
  if (isCancel) return NextResponse.json({ received: true });

  const eventName = scheduled_event?.name || "Booking";
  const startTime: string | undefined =
    typeof scheduled_event?.start_time === "string"
      ? scheduled_event.start_time
      : typeof inner.event?.start_time === "string"
      ? inner.event.start_time
      : undefined;
  const startTimeStr = startTime ? new Date(startTime).toLocaleString() : "time TBD";

  try {
    await addEvent({
      tenantId,
      source: "calendly",
      type: "booking",
      title: `New booking: ${invitee.name ?? "Customer"}`,
      body: `${eventName} scheduled for ${startTimeStr}`,
      status: "pending",
      metadata: {
        inviteeName: invitee.name,
        inviteeEmail: invitee.email,
        eventType: eventName,
        scheduledTime: startTime ?? null,
        endTime: scheduled_event?.end_time,
        timezone: invitee.timezone,
      },
    });
  } catch (err) {
    // Log and return 200 so Calendly does not retry — a transient Redis/Postgres
    // failure here would otherwise cause a retry storm that duplicates events.
    console.error("[calendly webhook] addEvent failed — acknowledging to prevent retry:", err);
  }

  return NextResponse.json({ received: true });
}
