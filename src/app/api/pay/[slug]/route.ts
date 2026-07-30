import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import {
  getPayLink,
  resolvePayLinkChargeCents,
  formatPayLinkAmount,
  isFixedAmount,
  normalizePayLinkSlug,
  PAY_LINK_PURPOSE,
} from "@/lib/pay-links";
import { payLinkProductName, payLinkProductDescription } from "@/lib/pay-link-copy";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
  });
}

function getRequestOrigin(req: NextRequest): string {
  // Trusted origin only — the Stripe success/cancel redirect carries the session
  // id, so it must not be built from client-spoofable x-forwarded-* headers.
  // NEXT_PUBLIC_APP_URL is the canonical app host; req.nextUrl.origin is the
  // platform-derived origin (both server-trusted).
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await params;
  const slug = normalizePayLinkSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (await isRateLimitedAsync(rateLimitKey(req, `pay-link:${slug}`), 8)) {
    return NextResponse.json(
      { error: "Too many payment attempts. Try again in a minute." },
      { status: 429 },
    );
  }

  const config = await getPayLink(slug);
  if (!config) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Fixed-amount links charge the configured amount regardless of input. Range
  // links read the submitted amount (always WHOLE DOLLARS per the pay-links
  // units contract) and validate it against [min,max]. Fixed links must NOT
  // round-trip config.amountCents (already cents) through the dollar resolver.
  const amountCents = isFixedAmount(config)
    ? (config.amountCents as number)
    : resolvePayLinkChargeCents(config, body.amount);
  if (amountCents === null) {
    const range =
      isFixedAmount(config) || config.minCents === undefined || config.maxCents === undefined
        ? formatPayLinkAmount(config.amountCents ?? 0)
        : `${formatPayLinkAmount(config.minCents)} to ${formatPayLinkAmount(config.maxCents)}`;
    return NextResponse.json({ error: `Choose an amount of ${range}.` }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY before collecting payment." },
      { status: 500 },
    );
  }

  const customerEmail = normalizeEmail(body.customerEmail);
  const stripe = getStripe();
  const origin = getRequestOrigin(req);
  const paymentPurpose = PAY_LINK_PURPOSE[config.door];

  // The billing webhook keys off metadata.tenantId; only set it when known so a
  // pre-tenant lead does not falsely attribute to a tenant. paySlug + leadSlug
  // preserve attribution until the tenant is provisioned.
  const metadata: Record<string, string> = {
    paySlug: config.slug,
    door: config.door,
    paymentPurpose,
    selectedAmountCents: String(amountCents),
    ...(config.tenantId ? { tenantId: config.tenantId } : {}),
    ...(config.leadSlug ? { leadSlug: config.leadSlug } : {}),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: payLinkProductName(config),
              description: payLinkProductDescription(config),
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(config.tenantId ? { client_reference_id: config.tenantId } : {}),
      success_url: `${origin}/pay/${config.slug}?payment=success`,
      cancel_url: `${origin}/pay/${config.slug}?payment=cancelled`,
      metadata,
      payment_intent_data: { metadata },
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
