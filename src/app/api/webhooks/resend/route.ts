import { NextResponse } from "next/server";
import { reconcileInquiryProviderEvent } from "@/products/inquiries";

export const dynamic = "force-dynamic";
export const MAX_RESEND_WEBHOOK_BODY_BYTES = 1024 * 1024;

/** Read a signed callback without allowing an unbounded body into memory. */
async function readBoundedBody(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESEND_WEBHOOK_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = chunk.value;
      size += value.byteLength;
      if (size > MAX_RESEND_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } catch {
    return null;
  }
}

/**
 * Resend's signed callback endpoint. The raw request body is verified before
 * it is parsed or allowed to change delivery state.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[resend webhook] RESEND_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const eventId = request.headers.get("svix-id")?.trim() || "";
  const timestamp = request.headers.get("svix-timestamp")?.trim() || "";
  const signature = request.headers.get("svix-signature")?.trim() || "";
  if (!eventId || !timestamp || !signature) {
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
  }

  const body = await readBoundedBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Webhook body too large" }, { status: 413 });
  }
  let event: unknown;
  try {
    const { Resend } = await import("resend");
    // Verification is local and does not call the API. The SDK still requires
    // a constructor key, so use a non-secret sentinel when only the webhook
    // secret is configured.
    const resend = new Resend(process.env.RESEND_API_KEY?.trim() || "re_webhook_verify_only");
    event = resend.webhooks.verify({
      payload: body,
      headers: { id: eventId, timestamp, signature },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const result = await reconcileInquiryProviderEvent({ event, eventId });
  if (result.status === "unavailable") {
    return NextResponse.json({ received: false, status: result.status, reason: result.reason }, { status: 503 });
  }
  if (result.status === "unmatched") {
    // Keep the event retryable while an accepted marker or reply-address index
    // is still propagating. The reconciler never invents a delivery or reply.
    return NextResponse.json({ received: false, status: result.status, reason: result.reason }, { status: 503 });
  }
  return NextResponse.json({ received: true, status: result.status });
}
