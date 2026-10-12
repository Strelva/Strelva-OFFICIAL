import { createHash } from "node:crypto";
import { assertBusinessCheckoutAdmission, connectEnabled, getConnectedMerchant, moneyRpc, type ConnectedAccount } from "@/platform/connect";
import { workspaceIdForTenant } from "@/platform/business-billing";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getContent } from "@/lib/storage";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { trackError } from "@/platform/infra/monitoring";

const checkoutItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  subscription: z.boolean(),
  subscriptionInterval: z.string().optional(),
});

type CheckoutItem = z.infer<typeof checkoutItemSchema>;

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

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const itemsResult = z.array(checkoutItemSchema).safeParse(body.items);
  if (!itemsResult.success) {
    return NextResponse.json({ error: "Invalid cart item" }, { status: 400 });
  }
  const items: CheckoutItem[] = itemsResult.data;

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

  // Verify the tenant exists and is active before creating a Stripe session.
  const tenantConfig = await getTenantConfig(tenant);
  if (!tenantConfig || tenantConfig.active === false) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const connectedCheckout = (process.env.STRELVA_CONNECT_CHECKOUT_TENANTS ?? "").split(",").map(v => v.trim()).includes(tenant);
  let merchantAccount: string | undefined;
  let paymentId: string | undefined;
  let paymentKey: string | undefined;
  let existingSession: string | undefined;
  let checkoutMerchant: ConnectedAccount | undefined;
  if (connectedCheckout) {
    if (!connectEnabled()) return NextResponse.json({error:"Business payments are not enabled."},{status:503});
    // Existing customers are activated separately after merchant/KYC/provider verification.
    const key = req.headers.get("idempotency-key");
    if (!key || key.length < 8 || key.length > 200) return NextResponse.json({error:"A stable payment request key is required."},{status:400});
    if (hasSubscription) return NextResponse.json({error:"Connected recurring store checkout requires a separately approved recurring-sale policy."},{status:409});
    try {
      const workspaceId = await workspaceIdForTenant(tenant);
      if (!workspaceId) return NextResponse.json({error:"The business merchant is unavailable."},{status:503});
      const merchant = await getConnectedMerchant(workspaceId);
      checkoutMerchant=merchant;
      merchantAccount = merchant.stripe_account_id!;
      const subtotal = lineItems.reduce((sum,item)=>sum+item.price_data.unit_amount*item.quantity,0);
      const payment = await moneyRpc<{id:string}>("reserve_business_payment", {p_workspace_id:workspaceId,p_key:key,p_purpose:"checkout",p_amount:subtotal+(subtotal>=4500?0:599),p_currency:"usd",p_reference:createHash("sha256").update(JSON.stringify(lineItems)).digest("hex")});
      await moneyRpc("claim_business_payment_channel",{p_payment_id:payment.id,p_channel:"checkout"});
      existingSession=(await moneyRpc<{sessionId?:string}>("prepare_business_checkout",{p_payment_id:payment.id}))?.sessionId;
      paymentId=payment.id;paymentKey=`payment:${payment.id}`;
    } catch {return NextResponse.json({error:"The business merchant could not be confirmed."},{status:503});}
  }
  try {
    if(paymentId && checkoutMerchant && !existingSession) await assertBusinessCheckoutAdmission(paymentId,checkoutMerchant);
    const session = existingSession ? await stripe.checkout.sessions.retrieve(existingSession,{stripeAccount:merchantAccount}) : await stripe.checkout.sessions.create({
      ...(paymentId ? {metadata:{businessPaymentId:paymentId},payment_intent_data:{application_fee_amount:0,metadata:{businessPaymentId:paymentId}}} : {}),
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
    }, merchantAccount ? {stripeAccount:merchantAccount,idempotencyKey:paymentKey} : undefined);
    if(paymentId) await moneyRpc("record_business_payment_event",{p_account_id:merchantAccount,p_event_id:`checkout:${session.id}`,p_object_id:session.id,p_payment_id:paymentId,p_kind:"checkout_created",p_amount:0});

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // A failed Stripe checkout-session creation otherwise leaves no server trail.
    trackError(err, { op: "checkout.createSession" });
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
