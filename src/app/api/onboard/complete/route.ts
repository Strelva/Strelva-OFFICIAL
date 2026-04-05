import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createTenant } from "@/lib/tenants";
import { setContent } from "@/lib/storage";
import type { ContentSection, ContentMap, TemplateId } from "@/lib/types";

const completeSchema = z.object({
  businessName: z.string().min(1),
  ownerName: z.string().min(1),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  industry: z.string().optional(),
  subdomain: z.string().min(1).regex(/^[a-z0-9-]+$/),
  template: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
  bookingUrl: z.string().url().optional(),
});

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { businessName, ownerName, ownerEmail, industry, subdomain, template, content, bookingUrl } = parsed.data;

  // Create tenant in DB
  try {
    await createTenant({
      subdomain,
      siteName: businessName,
      ownerName,
      ownerEmail: ownerEmail || "",
      industry: industry || "",
      template: template as TemplateId,
      features: ["newsletter"],
      customDomains: [],
      bookingUrl,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return NextResponse.json({ error: "That subdomain is taken. Try a different one." }, { status: 409 });
    }
    throw err;
  }

  // Seed generated content
  const sections = Object.keys(content) as ContentSection[];
  await Promise.all(
    sections.map((section) =>
      setContent(section, content[section] as ContentMap[typeof section], subdomain)
    )
  );

  // Create Stripe checkout (skip if Stripe not configured — dev mode)
  const priceId = process.env.STRIPE_REB_PRICE_ID;
  if (process.env.STRIPE_SECRET_KEY && priceId) {
    const stripe = getStripe();

    const customer = await stripe.customers.create({
      email: ownerEmail,
      name: ownerName,
      metadata: { tenantId: subdomain },
    });

    const origin = req.headers.get("origin") || "https://reb.studio";

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?welcome=true&tenant=${subdomain}`,
      cancel_url: `${origin}/onboard?step=checkout&tenant=${subdomain}`,
      metadata: { tenantId: subdomain },
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      tenantId: subdomain,
      checkoutUrl: session.url,
    });
  }

  // Dev mode — no Stripe, just redirect to dashboard
  return NextResponse.json({
    tenantId: subdomain,
    checkoutUrl: null,
    dashboardUrl: `/dashboard?welcome=true&tenant=${subdomain}`,
  });
}
