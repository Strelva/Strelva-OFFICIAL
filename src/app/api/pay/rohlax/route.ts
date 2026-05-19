import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import {
  ROHLAX_PAYMENT_MAX_CENTS,
  ROHLAX_PAYMENT_MIN_CENTS,
  ROHLAX_PAYMENT_TENANT,
  ROHLAX_PAYMENT_TITLE,
  formatRohlaxPaymentAmount,
  parseRohlaxPaymentAmount,
} from "@/lib/rohlax-payment";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

function getRequestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export async function POST(req: NextRequest) {
  if (await isRateLimitedAsync(rateLimitKey(req, "rohlax-payment"), 8)) {
    return NextResponse.json({ error: "Too many payment attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const amountCents = parseRohlaxPaymentAmount(body.amount);
  if (amountCents === null) {
    return NextResponse.json(
      {
        error: `Choose an amount from ${formatRohlaxPaymentAmount(ROHLAX_PAYMENT_MIN_CENTS)} to ${formatRohlaxPaymentAmount(ROHLAX_PAYMENT_MAX_CENTS)}.`,
      },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY before collecting payment." },
      { status: 500 }
    );
  }

  const customerEmail = normalizeEmail(body.customerEmail);
  const stripe = getStripe();
  const origin = getRequestOrigin(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: ROHLAX_PAYMENT_TITLE,
              description: "One-time flexible payment for Rohlax Wellness.",
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      success_url: `${origin}/pay/rohlax?payment=success&amount=${amountCents}`,
      cancel_url: `${origin}/pay/rohlax?payment=cancelled&amount=${amountCents}`,
      client_reference_id: ROHLAX_PAYMENT_TENANT,
      metadata: {
        tenantId: ROHLAX_PAYMENT_TENANT,
        paymentPurpose: "website_setup_contribution",
        selectedAmountCents: String(amountCents),
      },
      payment_intent_data: {
        metadata: {
          tenantId: ROHLAX_PAYMENT_TENANT,
          paymentPurpose: "website_setup_contribution",
          selectedAmountCents: String(amountCents),
        },
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
    }

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
