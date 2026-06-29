import { NextRequest, NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getContent } from "@/lib/storage";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { trackError } from "@/lib/monitoring";

interface CheckoutItem {
  productId: string;
  quantity: number;
  subscription: boolean;
  subscriptionInterval?: string;
}

function parseProductPrice(price: string): number | null {
  const value = Number.parseFloat(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseQuantity(quantity: unknown): number | null {
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return null;
  }
  return quantity;
}

function parseSubscriptionWeeks(interval: string | undefined): number {
  const weeks = Number.parseInt(interval || "4", 10);
  return Number.isFinite(weeks) && weeks >= 1 && weeks <= 52 ? weeks : 4;
}

function getRequestOrigin(req: NextRequest): string {
  // Trusted origin only — not client-spoofable x-forwarded-* headers — for the
  // Stripe success/cancel redirect (which carries the session id).
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  if (await isRateLimitedAsync(rateLimitKey(req, "checkout"), 10)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const items = body.items as CheckoutItem[];

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY in environment." },
      { status: 500 }
    );
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeKey);

  const tenant = await getTenantFromHeaders();
  const productsContent = await getContent("products", tenant);
  const productList = Array.isArray(productsContent.products) ? productsContent.products : [];
  const productById = new Map(productList.map((product) => [product.id, product]));
  const origin = getRequestOrigin(req);

  // Separate one-time and subscription items
  const oneTimeItems = items.filter((i) => !i.subscription);
  const subItems = items.filter((i) => i.subscription);

  const lineItems: Array<{
    price_data: {
      currency: string;
      product_data: { name: string };
      unit_amount: number;
      recurring?: { interval: "week"; interval_count: number };
    };
    quantity: number;
  }> = [];

  for (const item of oneTimeItems) {
    const product = productById.get(item.productId);
    const unitPrice = product ? parseProductPrice(product.price) : null;
    const quantity = parseQuantity(item.quantity);
    if (!product || unitPrice === null || quantity === null || product.comingSoon) {
      return NextResponse.json({ error: "Invalid cart item" }, { status: 400 });
    }

    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: product.name },
        unit_amount: Math.round(unitPrice * 100),
      },
      quantity,
    });
  }

  for (const item of subItems) {
    const product = productById.get(item.productId);
    const unitPrice = product ? parseProductPrice(product.price) : null;
    const quantity = parseQuantity(item.quantity);
    if (!product || unitPrice === null || quantity === null || product.comingSoon) {
      return NextResponse.json({ error: "Invalid cart item" }, { status: 400 });
    }

    const weeks = parseSubscriptionWeeks(item.subscriptionInterval);
    const discountedPrice = Math.round(unitPrice * 0.85 * 100);
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: `${product.name} (Subscribe & Save)` },
        unit_amount: discountedPrice,
        recurring: { interval: "week", interval_count: weeks },
      },
      quantity,
    });
  }

  // If mix of one-time and subscription, Stripe requires mode=subscription
  const hasSubscription = subItems.length > 0;
  const mode = hasSubscription ? "subscription" : "payment";

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: lineItems,
      success_url: `${origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#products`,
      shipping_address_collection: { allowed_countries: ["US"] },
      ...(mode === "payment" && {
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: {
                amount:
                  lineItems.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0) >= 4500
                    ? 0
                    : 599,
                currency: "usd",
              },
              display_name:
                lineItems.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0) >= 4500
                  ? "Free Shipping"
                  : "Standard Shipping",
              delivery_estimate: {
                minimum: { unit: "business_day", value: 3 },
                maximum: { unit: "business_day", value: 7 },
              },
            },
          },
        ],
      }),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // A failed Stripe checkout-session creation otherwise leaves no server trail.
    trackError(err, { op: "checkout.createSession" });
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
