import { NextResponse } from "next/server";
import { getScaffoldBaseUrl, getTenantId } from "../scaffold-client";

/**
 * POST handler for `/api/webhooks/stripe`. Drop into a client repo as
 * `src/app/api/webhooks/stripe/route.ts`.
 *
 * On a completed checkout it fires the Strelva `order` beacon, so the owner's
 * dashboard Store shows the sale (revenue, recent orders, best sellers) in real
 * time. The beacon is idempotent on `orderId` (the Stripe session id), so a
 * Stripe re-delivery won't double-count.
 *
 * Configure `STRIPE_WEBHOOK_SECRET` and point a Stripe webhook at this route for
 * the `checkout.session.completed` event.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const sig = request.headers.get("stripe-signature") || "";
  const bodyText = await request.text();

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);

  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyText, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Surface the sale on the owner's Strelva dashboard (best-effort). Guard the
    // amount: Stripe types amount_total as nullable, and a $0 beacon would
    // silently pollute revenue + mask a broken session — skip it instead.
    const amountCents = session.amount_total;
    const base = getScaffoldBaseUrl();
    const tenant = getTenantId();
    if (base && typeof amountCents === "number" && amountCents > 0) {
      await fetch(`${base}/api/v1/track/${tenant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "order",
          orderId: session.id,
          amountCents,
          currency: (session.currency ?? "usd").toUpperCase(),
        }),
      }).catch(() => {});
    } else if (!amountCents) {
      console.warn(`[stripe webhook] session ${session.id} completed with no amount_total — order beacon skipped`);
    }

    // TODO: send the order confirmation email (Resend) — RESEND_API_KEY.
    // TODO: itemize the order beacon (expand line_items) if you want best-sellers.
    console.log(`[stripe webhook] paid session ${session.id}`);
  }

  return NextResponse.json({ received: true });
}
