/**
 * Seed a tenant's content in Redis (or dev-content.json)
 *
 * Usage:
 *   npx tsx scripts/seed-tenant.ts carolee
 *   npx tsx scripts/seed-tenant.ts rohlax
 */

import { setContent } from "../src/lib/storage";
import type { ContentMap } from "../src/lib/types";
import { defaults as rohlaxDefaults, defaultFaq, defaultShop, defaultProducts, defaultTheme, defaultRewardsConfig, defaultNavigation, defaultFooter } from "../src/lib/defaults";

const caroleeDefaults: ContentMap = {
  hero: {
    headline: "We Are Our\nOwn Healers.",
    subheadline: "Holistic Healing & Natural Vitality",
    tagline:
      "Energy work, mentorship, and natural products to help you reconnect with your body's innate wisdom.",
    ctaText: "Book a Session",
    ctaLink: "#booking",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=2400&h=1600&fit=crop&q=90",
  },
  services: {
    sectionLabel: "Services",
    headline: "Healing Offerings",
    description:
      "Every session is intuitively guided to meet you where you are. Whether you're seeking energy clearing, spiritual mentorship, or simply a space to be heard.",
    services: [
      {
        id: "reiki-energy",
        name: "Reiki & Energy Work",
        description:
          "A gentle, hands-on energy healing session that helps clear blockages, reduce stress, and restore balance to your body's natural energy flow. Each session is intuitively guided to address what your body needs most.",
        duration: "60 min",
        price: "75",
        featured: true,
        who_its_for: "Anyone seeking stress relief, emotional balance, or energetic clearing",
        booking_link: "",
        comingSoon: false,
        image_url: "",
      },
      {
        id: "mentorship",
        name: "Mentorship & Listening",
        description:
          "A sacred space for deep conversation and spiritual guidance. Whether you're navigating a life transition, seeking clarity, or simply need to be truly heard — this is your time.",
        duration: "60 min",
        price: "65",
        featured: false,
        who_its_for: "Those seeking guidance through life transitions or spiritual growth",
        booking_link: "",
        comingSoon: false,
        image_url: "",
      },
      {
        id: "combined-session",
        name: "Energy + Mentorship Combo",
        description:
          "The full experience — begin with guided conversation to set your intention, then move into energy work to release what no longer serves you. Integration guidance included.",
        duration: "90 min",
        price: "110",
        featured: false,
        who_its_for: "Those ready for deep healing work combining mind, body, and spirit",
        booking_link: "",
        comingSoon: false,
        image_url: "",
      },
    ],
  },
  story: {
    sectionLabel: "About Carolee",
    headline: "Your vitality\nis waiting.",
    accentText: "Healer, mentor, maker",
    statement:
      "In 2014, my health crisis became my awakening. What started as a search for answers became a calling to help others find theirs.",
    paragraphs: [
      "After years of declining health that conventional medicine couldn't explain, I discovered the power of energy work, nutrition, and trusting the body's innate healing wisdom. That journey didn't just restore my health — it transformed my entire life.",
      "Now I help others reconnect with their own vitality through Reiki, mentorship, and the natural products I create at Bella Grace. Every offering comes from lived experience, not textbooks.",
      "Whether you're dealing with chronic stress, navigating a life transition, or simply feeling called to something deeper — you don't have to figure it out alone.",
    ],
    stats: [
      { value: "10+", label: "Years Healing" },
      { value: "1:1", label: "Personal Sessions" },
    ],
    quote: "We are our own healers.",
    quoteAttribution: "Carolee Fraass",
    imageUrl:
      "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1200&h=1600&fit=crop",
  },
  testimonials: {
    sectionLabel: "Testimonials",
    headline: "Words from the Community",
    testimonials: [],
  },
  events: {
    sectionLabel: "Events",
    headline: "Upcoming Gatherings",
    events: [],
  },
  providers: {
    sectionLabel: "Trusted Providers",
    headline: "Healing Network",
    description:
      "Practitioners I trust and recommend for complementary care.",
    providers: [],
  },
  contact: {
    email: "hello@caroleefraass.com",
    phone: "",
    address: "Virtual Sessions Available",
    hours: "By appointment",
    locationTitle: "Virtual &\nIn-Person",
    locationDescription:
      "Sessions available virtually or in-person by arrangement. Bella Grace products ship nationwide.",
    instagramUrl: "",
    facebookUrl: "",
    googleMapsUrl: "",
  },
  settings: {
    siteName: "Carolee Fraass",
    siteTagline: "Holistic Healing & Natural Vitality",
    siteDescription:
      "Holistic wellness with Carolee Fraass — Reiki energy work, spiritual mentorship, and Bella Grace natural products. Virtual and in-person sessions available.",
    siteKeywords:
      "Reiki, energy healing, holistic wellness, mentorship, spiritual guidance, Bella Grace, natural products",
    ownerName: "Carolee",
    ownerTitle: "Holistic Healer & Mentor",
    footerTagline: "We are our own healers.",
    copyrightText: "Carolee Fraass",
    bookingUrl: "",
    instagramHandle: "",
    vagaro_embed_id: "",
  },
  faq: {
    ...defaultFaq,
    faqs: [
      {
        id: "faq-1",
        question: "What is Reiki?",
        answer: "Reiki is a gentle, hands-on energy healing technique that promotes relaxation, reduces stress, and supports the body's natural ability to heal. During a session, I channel universal life energy to help clear blockages and restore balance.",
      },
      {
        id: "faq-2",
        question: "Do I need to believe in energy work for it to help?",
        answer: "Not at all. You don't need any specific belief system. Many people come simply seeking relaxation or stress relief and find the experience deeply calming. Your body does the work — I just help facilitate the space.",
      },
      {
        id: "faq-3",
        question: "What should I expect during a session?",
        answer: "You'll lie fully clothed on a comfortable table. I'll gently place my hands on or near various points on your body. Most people feel warmth, tingling, or deep relaxation. Many fall asleep — that's perfectly normal and welcome.",
      },
    ],
  },
  shop: {
    ...defaultShop,
    headline: "Bella Grace & More",
    description: "Natural products I create and tools I recommend to support your healing journey.",
    items: [],
  },
  products: defaultProducts,
  theme: defaultTheme,
  rewardsConfig: defaultRewardsConfig,
  navigation: defaultNavigation,
  footer: defaultFooter,
};

const TENANT_DEFAULTS: Record<string, ContentMap> = {
  rohlax: rohlaxDefaults,
  carolee: caroleeDefaults,
};

async function seed(tenantId: string) {
  // Check if tenant is registered in the central config
  const { getTenantConfig, getAllTenants } = await import("../src/lib/tenants");
  const tenantConfig = await getTenantConfig(tenantId);

  if (!tenantConfig) {
    const allTenants = await getAllTenants();
    console.error(`Tenant "${tenantId}" not found in src/lib/tenants.ts.`);
    console.error(`Registered tenants: ${allTenants.map((t: { id: string }) => t.id).join(", ")}`);
    console.error(`\nAdd the tenant to TENANTS in src/lib/tenants.ts first.`);
    process.exit(1);
  }

  // Use tenant-specific defaults if available, otherwise fall back to template defaults
  const data = TENANT_DEFAULTS[tenantId] ?? rohlaxDefaults;

  console.log(`Seeding content for tenant: ${tenantId} (template: ${tenantConfig.template})`);

  const sections = Object.keys(data) as (keyof ContentMap)[];
  for (const section of sections) {
    await setContent(section, data[section], tenantId);
    console.log(`  ✓ ${section}`);
  }

  console.log(`\nDone! ${sections.length} sections seeded for "${tenantId}".`);
  console.log(`\nOnboarding checklist:`);
  console.log(`  □ Set Clerk publicMetadata: { tenants: ["${tenantId}"] } on client's user`);
  console.log(`  □ Add Vercel domain: ${tenantConfig.subdomain}.reb.studio`);
  if (tenantConfig.customDomains?.length) {
    console.log(`  □ Configure custom domains: ${tenantConfig.customDomains.join(", ")}`);
  }
  console.log(`  □ Create Stripe subscription via /admin`);
}

const tenantId = process.argv[2];
if (!tenantId) {
  import("../src/lib/tenants").then(({ getAllTenants }) =>
    getAllTenants().then((tenants) => {
      console.error("Usage: npx tsx scripts/seed-tenant.ts <tenant-id>");
      console.error("Registered tenants: " + tenants.map((t: { id: string }) => t.id).join(", "));
      process.exit(1);
    })
  );
} else {
  seed(tenantId).catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
