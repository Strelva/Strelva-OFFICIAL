import type { SectionData } from "@/components/dashboard/ContentBrowser";
import { truncate, getFreshness } from "@/lib/utils";
import type { ContentMap } from "@/lib/types";

const SECTION_BUILDERS: { [K in keyof ContentMap]?: (data: ContentMap[K], timestamps: Record<string, string>) => SectionData } = {
  hero: (d, ts) => ({
    preview: truncate((d.headline || "").replace(/\n/g, " "), 50),
    status: d.headline ? "live" : "empty",
    chatPrompt: "Update my hero headline",
    freshness: getFreshness("hero", ts),
    items: [
      { label: (d.headline || "").replace(/\n/g, " "), detail: "headline" },
      { label: d.subheadline || "(no subheadline)", detail: "subheadline" },
      { label: d.ctaText || "CTA", detail: "CTA" },
    ].filter((item) => item.label),
  }),
  services: (d, ts) => ({
    preview: (d.services || []).slice(0, 3).map((s) => s.name).join(", "),
    status: (d.services?.length || 0) > 0 ? "live" : "empty",
    count: `${d.services?.length || 0}`,
    chatPrompt: "Update my services",
    freshness: getFreshness("services", ts),
    items: (d.services || []).map((s) => ({ label: s.name, detail: `$${s.price} · ${s.duration}` })),
  }),
  products: (d, ts) => ({
    preview: (d.products || []).slice(0, 3).map((p) => p.name).join(", "),
    status: (d.products?.length || 0) > 0 ? "live" : "empty",
    count: `${d.products?.length || 0}`,
    chatPrompt: "Update my products",
    freshness: getFreshness("products", ts),
    items: (d.products || []).map((p) => ({ label: p.name, detail: p.price ? `$${p.price}` : "" })),
  }),
  story: (d, ts) => ({
    preview: truncate(d.headline || d.statement || "Your story", 50),
    status: "live",
    chatPrompt: "Update my about section",
    freshness: getFreshness("story", ts),
    items: (d.paragraphs || []).map((p, i) => ({ label: truncate(p, 60), detail: `paragraph ${i + 1}` })),
  }),
  testimonials: (d, ts) => ({
    preview: (d.testimonials?.length || 0) > 0 ? truncate(d.testimonials[0].quote, 50) : "No reviews yet",
    status: (d.testimonials?.length || 0) > 0 ? "live" : "empty",
    count: `${d.testimonials?.length || 0}`,
    chatPrompt: "Add a new testimonial",
    freshness: getFreshness("testimonials", ts),
    items: (d.testimonials || []).map((t) => ({ label: `"${truncate(t.quote, 40)}"`, detail: t.author })),
  }),
  events: (d, ts) => ({
    preview: (d.events?.length || 0) > 0 ? d.events[0].title : "No upcoming events",
    status: (d.events?.length || 0) > 0 ? "live" : "empty",
    count: `${d.events?.length || 0}`,
    chatPrompt: "Add a new event",
    freshness: getFreshness("events", ts),
    items: (d.events || []).map((e) => ({ label: e.title, detail: e.date })),
  }),
  providers: (d, ts) => ({
    preview: (d.providers || []).slice(0, 3).map((p) => p.name).join(", "),
    status: (d.providers?.length || 0) > 0 ? "live" : "empty",
    count: `${d.providers?.length || 0}`,
    chatPrompt: "Update my providers list",
    freshness: getFreshness("providers", ts),
    items: (d.providers || []).map((p) => ({ label: p.name, detail: p.service })),
  }),
  contact: (d, ts) => ({
    preview: [d.phone, d.email].filter(Boolean).join(" · "),
    status: d.email ? "live" : "empty",
    chatPrompt: "Update my contact information",
    freshness: getFreshness("contact", ts),
    items: [
      d.phone && { label: d.phone, detail: "phone" },
      d.email && { label: d.email, detail: "email" },
      d.address && { label: d.address, detail: "address" },
      d.hours && { label: truncate(d.hours, 40), detail: "hours" },
    ].filter(Boolean) as { label: string; detail: string }[],
  }),
  settings: (d, ts) => ({
    preview: d.siteName || "(not set)",
    status: "configured",
    chatPrompt: "Update my site settings",
    freshness: getFreshness("settings", ts),
    items: [
      { label: d.siteName || "(not set)", detail: "site name" },
      { label: d.ownerName || "(not set)", detail: "owner" },
      d.siteTagline && { label: d.siteTagline, detail: "tagline" },
      d.siteDescription && { label: truncate(d.siteDescription, 40), detail: "SEO desc" },
    ].filter(Boolean) as { label: string; detail: string }[],
  }),
  faq: (d, ts) => ({
    preview: (d.faqs?.length || 0) > 0 ? d.faqs[0].question : "No FAQ yet",
    status: (d.faqs?.length || 0) > 0 ? "live" : "empty",
    count: `${d.faqs?.length || 0}`,
    chatPrompt: "Update my FAQ",
    freshness: getFreshness("faq", ts),
    items: (d.faqs || []).map((f) => ({ label: f.question, detail: "" })),
  }),
  theme: (d, ts) => {
    const colors = d?.colors || {};
    const colorCount = Object.values(colors).filter(Boolean).length;
    return {
      preview: d?.fontDisplay ? `${d.fontDisplay.split(",")[0]} · ${colorCount} colors` : "Brand palette",
      status: colorCount > 0 ? "configured" : "empty",
      chatPrompt: "Update my brand colors and fonts",
      freshness: getFreshness("theme", ts),
      items: [
        d?.fontDisplay && { label: d.fontDisplay, detail: "display font" },
        d?.fontBody && { label: d.fontBody, detail: "body font" },
        colors.sage && { label: colors.sage, detail: "sage" },
        colors.cream && { label: colors.cream, detail: "cream" },
      ].filter(Boolean) as { label: string; detail: string }[],
    };
  },
  rewardsConfig: (d, ts) => ({
    preview: `${d?.starsPerBag || 0}★/bag · ${d?.starsToRedeem || 0}★ → $${d?.redemptionValue || 0}`,
    status: d?.starsPerBag ? "configured" : "empty",
    chatPrompt: "Update my rewards settings",
    freshness: getFreshness("rewardsConfig", ts),
    items: [
      { label: `${d?.starsPerBag ?? 0}`, detail: "stars per bag" },
      { label: `${d?.starsToRedeem ?? 0}`, detail: "stars to redeem" },
      { label: `$${d?.redemptionValue ?? 0}`, detail: "redemption value" },
      { label: `${d?.newsletterBonus ?? 0}`, detail: "newsletter bonus" },
      { label: `${d?.subscriptionBonus ?? 0}`, detail: "subscription bonus" },
      { label: `${d?.tierThresholdSuper ?? 0}`, detail: "super tier at" },
    ],
  }),
  navigation: (d, ts) => ({
    preview: (d?.menuItems || []).slice(0, 4).map((m) => m.label).join(" · ") || "No menu items",
    status: (d?.menuItems?.length || 0) > 0 ? "live" : "empty",
    count: `${d?.menuItems?.length || 0}`,
    chatPrompt: "Update my nav menu",
    freshness: getFreshness("navigation", ts),
    items: (d?.menuItems || []).map((m) => ({ label: m.label, detail: m.href })),
  }),
  footer: (d, ts) => ({
    preview: truncate(d?.tagline || "Footer", 50),
    status: (d?.columns?.length || 0) > 0 ? "live" : "empty",
    count: `${d?.columns?.length || 0}`,
    chatPrompt: "Update my footer",
    freshness: getFreshness("footer", ts),
    items: (d?.columns || []).map((c) => ({
      label: c.heading,
      detail: `${(c.links || []).length} links`,
    })),
  }),
  shop: (d, ts) => ({
    preview: (d.items?.length || 0) > 0 ? d.items[0].name : "No shop items",
    status: (d.items?.length || 0) > 0 ? "live" : "empty",
    count: `${d.items?.length || 0}`,
    chatPrompt: "Update my shop",
    freshness: getFreshness("shop", ts),
    items: (d.items || []).map((s) => ({ label: s.name, detail: s.price ? `$${s.price}` : "" })),
  }),
};

/**
 * Builds sectionData from whatever sections the template provides.
 * Works for any template — wellness, food-brand, restaurant, etc.
 */
export function buildSectionData(
  sections: Record<string, unknown>,
  timestamps: Record<string, string>,
): Record<string, SectionData> {
  const result: Record<string, SectionData> = {};
  for (const [key, data] of Object.entries(sections)) {
    const builder = SECTION_BUILDERS[key as keyof ContentMap];
    if (builder && data) {
      // Safe: builder is typed to ContentMap[K] for the matching K; the runtime
      // data came from getContent(section) which returns the same shape. The cast
      // is confined to this one dispatch site instead of a file-level disable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[key] = (builder as (d: any, ts: Record<string, string>) => SectionData)(data, timestamps);
    }
  }
  return result;
}
