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
    const amountCents = session.amount_total;
    const currency = (session.currency ?? "usd").toUpperCase();

    // Expand the line items once (best-effort) — used for both the itemized
    // beacon (best sellers) and the confirmation email. A failure here must
    // never fail the webhook; the beacon still records revenue + order count.
    let items: Array<{ name: string; quantity: number }> = [];
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      items = lineItems.data.map((li) => ({ name: li.description ?? "Item", quantity: li.quantity ?? 1 }));
    } catch {
      // no itemization available
    }

    // 1. Surface the sale on the owner's Strelva dashboard (best-effort). Guard
    //    the amount: Stripe types amount_total as nullable, and a $0 beacon
    //    would pollute revenue + mask a broken session — skip it instead.
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
          currency,
          ...(items.length ? { items } : {}),
        }),
      }).catch(() => {});
    } else if (!amountCents) {
      console.warn(`[stripe webhook] session ${session.id} completed with no amount_total — order beacon skipped`);
    }

    // 2. Order confirmation email (best-effort). Needs RESEND_API_KEY +
    //    ORDER_EMAIL_FROM (a verified Resend sender) + the customer's email.
    const customerEmail = session.customer_details?.email;
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.ORDER_EMAIL_FROM;
    if (resendKey && from && customerEmail && typeof amountCents === "number") {
      try {
        const { Resend } = await import("resend");
        const total = (amountCents / 100).toLocaleString("en-US", { style: "currency", currency });
        const lines = items.map((i) => `${i.quantity} x ${i.name}`).join("\n");
        await new Resend(resendKey).emails.send({
          from,
          to: customerEmail,
          subject: "Your order is confirmed",
          text: `Thanks for your order!\n\n${lines}${lines ? "\n\n" : ""}Total: ${total}\n\nWe'll email tracking when it ships.`,
        });
      } catch {
        // email is a nicety; never fail the webhook over it
      }
    }

    console.log(`[stripe webhook] paid session ${session.id}`);
  }

  return NextResponse.json({ received: true });
}
