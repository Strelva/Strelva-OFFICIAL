/**
 * Seed Sanity with default content for a tenant.
 * Usage: npx tsx scripts/seed-sanity.ts [tenant]
 */
import { createClient } from "@sanity/client";
import { defaults } from "../src/lib/defaults";
import { DEFAULT_BOOKING_CONFIG } from "../src/lib/booking";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
});

const tenant = process.argv[2] || "rohlax";

async function seed() {
  console.log(`Seeding Sanity for tenant: ${tenant}`);

  // Map of section → Sanity document type + data
  const documents: Array<{ _type: string; tenant: string; [key: string]: unknown }> = [
    {
      _type: "hero",
      tenant,
      headline: defaults.hero.headline,
      subheadline: defaults.hero.subheadline,
      tagline: defaults.hero.tagline,
      ctaText: defaults.hero.ctaText,
      ctaLink: defaults.hero.ctaLink,
      // backgroundImage left empty — Chelsea uploads her own
    },
    {
      _type: "services",
      tenant,
      sectionLabel: defaults.services.sectionLabel,
      headline: defaults.services.headline,
      description: defaults.services.description,
      services: defaults.services.services.map((s) => ({
        _key: s.id,
        name: s.name,
        description: s.description,
        duration: s.duration,
        price: s.price,
        featured: s.featured,
        who_its_for: s.who_its_for,
        booking_link: s.booking_link,
        comingSoon: s.comingSoon,
      })),
    },
    {
      _type: "story",
      tenant,
      sectionLabel: defaults.story.sectionLabel,
      headline: defaults.story.headline,
      accentText: defaults.story.accentText,
      statement: defaults.story.statement,
      paragraphs: defaults.story.paragraphs,
      stats: defaults.story.stats.map((s, i) => ({ _key: `stat-${i}`, ...s })),
      quote: defaults.story.quote,
      quoteAttribution: defaults.story.quoteAttribution,
      // portraitImage left empty — Chelsea uploads her own
    },
    {
      _type: "testimonials",
      tenant,
      sectionLabel: defaults.testimonials.sectionLabel,
      headline: defaults.testimonials.headline,
      testimonials: defaults.testimonials.testimonials.map((t) => ({
        _key: t.id,
        quote: t.quote,
        author: t.author,
        location: t.location,
      })),
    },
    {
      _type: "events",
      tenant,
      sectionLabel: defaults.events.sectionLabel,
      headline: defaults.events.headline,
      events: defaults.events.events.map((e) => ({
        _key: e.id,
        title: e.title,
        date: e.date,
        time: e.time,
        location: e.location,
        description: e.description,
        hosted_by: e.hosted_by,
        external_link: e.external_link,
      })),
    },
    {
      _type: "providers",
      tenant,
      sectionLabel: defaults.providers.sectionLabel,
      headline: defaults.providers.headline,
      description: defaults.providers.description,
      providers: defaults.providers.providers.map((p) => ({
        _key: p.id,
        name: p.name,
        category: p.category,
        service: p.service,
        why_i_recommend: p.why_i_recommend,
        booking_link: p.booking_link,
        phone: p.phone,
      })),
    },
    {
      _type: "contact",
      tenant,
      ...defaults.contact,
    },
    {
      _type: "siteSettings",
      tenant,
      ...defaults.settings,
    },
    {
      _type: "faq",
      tenant,
      sectionLabel: defaults.faq.sectionLabel,
      headline: defaults.faq.headline,
      description: defaults.faq.description,
      faqs: defaults.faq.faqs.map((f) => ({
        _key: f.id,
        question: f.question,
        answer: f.answer,
      })),
    },
    {
      _type: "shop",
      tenant,
      sectionLabel: defaults.shop.sectionLabel,
      headline: defaults.shop.headline,
      description: defaults.shop.description,
      items: defaults.shop.items.map((item) => ({
        _key: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        price: item.price,
        external_link: item.external_link,
      })),
    },
    {
      _type: "bookingConfig",
      tenant,
      ...DEFAULT_BOOKING_CONFIG,
      weeklySchedule: DEFAULT_BOOKING_CONFIG.weeklySchedule.map((s, i) => ({
        _key: `day-${i}`,
        ...s,
      })),
    },
  ];

  for (const doc of documents) {
    // Check if document already exists for this tenant
    const existing = await client.fetch(
      `*[_type == $type && tenant == $tenant][0]._id`,
      { type: doc._type, tenant }
    );

    if (existing) {
      console.log(`  Updating ${doc._type}...`);
      await client.patch(existing).set(doc).commit();
    } else {
      console.log(`  Creating ${doc._type}...`);
      await client.create(doc);
    }
  }

  console.log("Done!");
}

seed().catch(console.error);
