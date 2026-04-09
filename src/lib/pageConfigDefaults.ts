import type { SitePageConfig } from "./types";

// Wellness: 3-page IA with booking-focused content
const WELLNESS_PAGE_CONFIG: SitePageConfig = {
  home: {
    sections: [
      { type: "hero", visible: true, order: 0 },
      { type: "trust-strip", visible: true, order: 1 },
      { type: "services", visible: true, order: 2 },
      { type: "testimonial-quote", visible: true, order: 3 },
      { type: "faq", visible: true, order: 4 },
      { type: "instagram-feed", visible: true, order: 5 },
      { type: "newsletter", visible: true, order: 6 },
      { type: "cta", visible: true, order: 7 },
    ],
  },
  about: {
    sections: [
      { type: "page-header", visible: true, order: 0, props: { contentKey: "story" } },
      { type: "story", visible: true, order: 1 },
      { type: "providers", visible: true, order: 2 },
      { type: "cta", visible: true, order: 3 },
    ],
  },
  contact: {
    sections: [
      { type: "page-header", visible: true, order: 0, props: { title: "Get in touch" } },
      { type: "contact", visible: true, order: 1 },
      { type: "cta", visible: true, order: 2 },
    ],
  },
};

// Food brand: product-focused layout + worked `about` example page.
// Keep in sync with templates/food-brand/index.ts FOOD_BRAND_PAGE_CONFIG.
const FOOD_BRAND_PAGE_CONFIG: SitePageConfig = {
  home: {
    sections: [
      { type: "hero", visible: true, order: 0 },
      { type: "trust-strip", visible: true, order: 1 },
      { type: "products", visible: true, order: 2 },
      { type: "notify", visible: true, order: 3 },
      { type: "story", visible: true, order: 4 },
      { type: "typographic-break", visible: true, order: 5 },
      { type: "comparison", visible: true, order: 6 },
      { type: "testimonials", visible: true, order: 7 },
      { type: "contact", visible: true, order: 8 },
      { type: "email-popup", visible: true, order: 9 },
    ],
    seo: {
      title: "Great Lakes Dried Fruit — Orchard Dried Apple Snacks",
      description:
        "Small-batch dried apple snacks from Great Lakes orchards. No preservatives, no added sugar — just fruit.",
      ogImage: "",
    },
  },
  about: {
    sections: [
      { type: "story", visible: true, order: 0 },
      { type: "typographic-break", visible: true, order: 1 },
      { type: "testimonials", visible: true, order: 2 },
      { type: "contact", visible: true, order: 3 },
    ],
    seo: {
      title: "About Great Lakes Dried Fruit — Our Orchard Story",
      description:
        "How a small Great Lakes family orchard turned into a preservative-free dried fruit brand.",
      ogImage: "",
    },
  },
};

const TEMPLATE_PAGE_CONFIGS: Record<string, SitePageConfig> = {
  wellness: WELLNESS_PAGE_CONFIG,
  "food-brand": FOOD_BRAND_PAGE_CONFIG,
  restaurant: WELLNESS_PAGE_CONFIG,
  trades: WELLNESS_PAGE_CONFIG,
  professional: WELLNESS_PAGE_CONFIG,
};

export function getDefaultPageConfig(template: string): SitePageConfig {
  return TEMPLATE_PAGE_CONFIGS[template] || WELLNESS_PAGE_CONFIG;
}

/** @deprecated Use getDefaultPageConfig(template) instead */
export const DEFAULT_PAGE_CONFIG: SitePageConfig = WELLNESS_PAGE_CONFIG;
