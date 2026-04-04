import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { NextResponse } from "next/server";
import type { TemplateId } from "@/lib/types";

const businessInputSchema = z.object({
  businessName: z.string().min(1),
  industry: z.string().min(1),
  location: z.string().optional(),
  description: z.string().min(10),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  bookingUrl: z.string().url().optional(),
});

const INDUSTRY_TO_TEMPLATE: Record<string, TemplateId> = {
  wellness: "wellness",
  spa: "wellness",
  fitness: "wellness",
  yoga: "wellness",
  massage: "wellness",
  stretching: "wellness",
  restaurant: "restaurant",
  cafe: "restaurant",
  bakery: "restaurant",
  "food truck": "restaurant",
  bar: "restaurant",
  plumbing: "trades",
  electrical: "trades",
  hvac: "trades",
  roofing: "trades",
  landscaping: "trades",
  construction: "trades",
  cleaning: "trades",
  painting: "trades",
  handyman: "trades",
  law: "professional",
  accounting: "professional",
  consulting: "professional",
  therapy: "professional",
  dental: "professional",
  medical: "professional",
  real_estate: "professional",
};

function pickTemplate(industry: string): TemplateId {
  const lower = industry.toLowerCase().trim();
  for (const [key, template] of Object.entries(INDUSTRY_TO_TEMPLATE)) {
    if (lower.includes(key)) return template;
  }
  return "wellness"; // safe default — most generic layout
}

const generatedContentSchema = z.object({
  hero: z.object({
    headline: z.string(),
    subheadline: z.string(),
    tagline: z.string(),
    ctaText: z.string(),
    ctaLink: z.string(),
  }),
  services: z.object({
    sectionLabel: z.string(),
    headline: z.string(),
    description: z.string(),
    services: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        duration: z.string(),
        price: z.string(),
        featured: z.boolean(),
        who_its_for: z.string(),
        booking_link: z.string(),
        comingSoon: z.boolean(),
        image_url: z.string(),
      })
    ),
  }),
  story: z.object({
    sectionLabel: z.string(),
    headline: z.string(),
    accentText: z.string(),
    statement: z.string(),
    paragraphs: z.array(z.string()),
    stats: z.array(z.object({ value: z.string(), label: z.string() })),
    quote: z.string(),
    quoteAttribution: z.string(),
  }),
  testimonials: z.object({
    sectionLabel: z.string(),
    headline: z.string(),
    testimonials: z.array(
      z.object({
        id: z.string(),
        quote: z.string(),
        author: z.string(),
        location: z.string(),
      })
    ),
  }),
  faq: z.object({
    sectionLabel: z.string(),
    headline: z.string(),
    description: z.string(),
    faqs: z.array(
      z.object({
        id: z.string(),
        question: z.string(),
        answer: z.string(),
      })
    ),
  }),
  contact: z.object({
    email: z.string(),
    phone: z.string(),
    address: z.string(),
    hours: z.string(),
    locationTitle: z.string(),
    locationDescription: z.string(),
    instagramUrl: z.string(),
    facebookUrl: z.string(),
  }),
  settings: z.object({
    siteName: z.string(),
    siteTagline: z.string(),
    siteDescription: z.string(),
    siteKeywords: z.string(),
    ownerName: z.string(),
    footerTagline: z.string(),
    copyrightText: z.string(),
  }),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = businessInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { businessName, industry, location, description, phone, email, bookingUrl } = parsed.data;
  const template = pickTemplate(industry);

  const prompt = `Generate website content for a business with these details:

Business name: ${businessName}
Industry: ${industry}
${location ? `Location: ${location}` : ""}
Description: ${description}
${phone ? `Phone: ${phone}` : ""}
${email ? `Email: ${email}` : ""}
${bookingUrl ? `Booking URL: ${bookingUrl}` : ""}

Generate compelling, specific content that sounds like the business owner wrote it — not generic marketing copy. Use the business description to infer services, tone, and personality.

Rules:
- Hero headline: 6 words max, punchy, no clichés
- Services: generate 3-5 realistic services with prices and durations based on the industry
- Story: write in first person as the owner, 2-3 paragraphs, authentic voice
- Testimonials: generate 3 realistic reviews from local customers
- FAQ: generate 4-6 common questions for this type of business
- Contact: use provided info, leave blanks as empty strings
- Settings: generate SEO-friendly tagline and description
- All booking_link fields: use "${bookingUrl || ""}"
- All image_url fields: use "" (owner will upload later)
- CTA link: use "${bookingUrl || "#contact"}"
- Stats in story: use realistic-sounding numbers for the industry
- IDs: use kebab-case slugs`;

  try {
    const result = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: generatedContentSchema,
      prompt,
    });

    return NextResponse.json({
      content: result.object,
      template,
      subdomain: businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Content generation failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
