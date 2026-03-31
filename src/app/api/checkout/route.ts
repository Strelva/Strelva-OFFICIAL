import { NextRequest, NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";

interface CheckoutItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subscription: boolean;
  subscriptionInterval?: string;
}

export async function POST(req: NextRequest) {
  const { items } = (await req.json()) as { items: CheckoutItem[] };

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY in environment." },
      { status: 500 }
    );
  }

  // Dynamic import to avoid build issues if stripe isn't installed yet
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeKey);

  const tenant = await getTenantFromHeaders();
  const origin = req.headers.get("origin") || `https://${tenant}`;

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
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    });
  }

  for (const item of subItems) {
    const weeks = parseInt(item.subscriptionInterval || "4") || 4;
    const discountedPrice = Math.round(item.price * 0.85 * 100);
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: `${item.name} (Subscribe & Save)` },
        unit_amount: discountedPrice,
        recurring: { interval: "week", interval_count: weeks },
      },
      quantity: item.quantity,
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
                amount: items.reduce((s, i) => s + i.price * i.quantity, 0) >= 45 ? 0 : 599,
                currency: "usd",
              },
              display_name:
                items.reduce((s, i) => s + i.price * i.quantity, 0) >= 45
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
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
