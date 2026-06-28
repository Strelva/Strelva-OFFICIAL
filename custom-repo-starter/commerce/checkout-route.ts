import { NextResponse } from "next/server";
import type StripeNS from "stripe";
import { fetchCatalog } from "./catalog";
import { rateLimit, clientIp } from "./rate-limit";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_RATE, SHIPPING_MIN_DAYS, SHIPPING_MAX_DAYS } from "./shipping";

/**
 * POST handler for `/api/checkout`. Drop this into a client repo as
 * `src/app/api/checkout/route.ts` (re-exporting POST).
 *
 * Rock-solid by construction:
 *  - rate-limited + body-size capped
 *  - prices come from the Strelva catalog SERVER-SIDE, never from the browser
 *  - SOLD-OUT items are rejected (inStock enforced here, not just shown)
 *  - returns a Stripe embedded-checkout client secret (no redirect off-site)
 */
interface CheckoutItem {
  slug: string;
  quantity: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  const { allowed } = rateLimit(`checkout:${clientIp(request)}`, 5);
  if (!allowed) {
    return NextResponse.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
  }
  if (Number(request.headers.get("content-length") || 0) > 100_000) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Checkout isn't configured yet." }, { status: 503 });
  }

  let body: { items?: CheckoutItem[] };
  try {
    body = (await request.json()) as { items?: CheckoutItem[] };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }
  if (items.length > 20) {
    return NextResponse.json({ error: "Too many items" }, { status: 400 });
  }

  const catalog = await fetchCatalog();
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));

  const lineItems: StripeNS.Checkout.SessionCreateParams.LineItem[] = [];
  let subtotalCents = 0;
  // Stripe requires every line item AND the shipping rate to share one currency.
  // Capture the cart's currency from the first item and reject a mixed-currency
  // cart up front (rather than letting Stripe fail with a cryptic error).
  let cartCurrency = "";

  for (const item of items) {
    if (!item || typeof item.slug !== "string") {
      return NextResponse.json({ error: "Invalid item" }, { status: 400 });
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return NextResponse.json({ error: `Invalid quantity for ${item.slug}` }, { status: 400 });
    }
    const product = bySlug.get(item.slug);
    if (!product) {
      return NextResponse.json({ error: `Product not found: ${item.slug}` }, { status: 400 });
    }
    if (!product.inStock) {
      return NextResponse.json({ error: `${product.name} is sold out.` }, { status: 409 });
    }
    if (product.priceCents <= 0) {
      return NextResponse.json({ error: `${product.name} isn't available for purchase.` }, { status: 400 });
    }
    const currency = (product.currency || "USD").toLowerCase();
    if (!cartCurrency) cartCurrency = currency;
    else if (currency !== cartCurrency) {
      return NextResponse.json({ error: "All items must be in the same currency." }, { status: 400 });
    }
    subtotalCents += product.priceCents * quantity;
    lineItems.push({
      price_data: {
        currency,
        product_data: {
          name: product.name,
          description: product.description.slice(0, 500) || undefined,
          // Stripe requires absolute image URLs — drop root-relative ones.
          images: product.images.filter((i) => /^https?:\/\//i.test(i)).slice(0, 1),
        },
        unit_amount: product.priceCents,
      },
      quantity,
    });
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeSecretKey);

  const freeShipping = subtotalCents >= FREE_SHIPPING_THRESHOLD * 100;
  const shippingCents = freeShipping ? 0 : Math.round(SHIPPING_RATE * 100);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const returnUrl = `${siteUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;

  const params: StripeNS.Checkout.SessionCreateParams = {
    mode: "payment",
    // This Stripe SDK labels embedded checkout "embedded_page" (not "embedded").
    ui_mode: "embedded_page",
    line_items: lineItems,
    shipping_address_collection: { allowed_countries: ["US"] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: shippingCents, currency: cartCurrency || "usd" },
          display_name: freeShipping ? "Free shipping" : "Standard shipping",
          delivery_estimate: {
            minimum: { unit: "business_day", value: SHIPPING_MIN_DAYS },
            maximum: { unit: "business_day", value: SHIPPING_MAX_DAYS },
          },
        },
      },
    ],
    return_url: returnUrl,
  };

  try {
    const session = await stripe.checkout.sessions.create(params);
    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error("[checkout] Stripe session failed:", err);
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 502 });
  }
}
