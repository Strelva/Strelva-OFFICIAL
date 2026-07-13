import type { ContentSection, TemplateId } from "@/lib/types";
import { getTenantConfig } from "@/lib/tenants";

export interface TemplateManifest {
  id: TemplateId;
  contentSections: ContentSection[];
  componentTypes: string[];
  editableSections: Record<string, string>;
  /** Compatibility shape for code that needs to distinguish render keys from content keys. */
  components: Record<string, true>;
}

type ManifestInput = Omit<TemplateManifest, "components">;

function manifest(input: ManifestInput): TemplateManifest {
  return {
    ...input,
    components: Object.fromEntries(input.componentTypes.map((type) => [type, true])),
  };
}

const TEMPLATE_MANIFESTS: Record<TemplateId, TemplateManifest> = {
  wellness: manifest({
    id: "wellness",
    contentSections: [
      "hero",
      "services",
      "story",
      "testimonials",
      "events",
      "providers",
      "contact",
      "settings",
      "theme",
      "faq",
      "shop",
    ],
    componentTypes: [
      "hero",
      "services",
      "story",
      "testimonials",
      "events",
      "providers",
      "contact",
      "faq",
      "shop",
      "booking-widget",
      "trust-strip",
      "testimonial-quote",
      "cta",
      "page-header",
      "instagram-feed",
      "vagaro-booking",
      "newsletter",
    ],
    editableSections: {
      hero: "hero",
      services: "services",
      story: "story",
      testimonials: "testimonials",
      events: "events",
      providers: "providers",
      contact: "contact",
      faq: "faq",
      shop: "shop",
    },
  }),
  "food-brand": manifest({
    id: "food-brand",
    contentSections: [
      "hero",
      "story",
      "products",
      "testimonials",
      "contact",
      "settings",
      "theme",
      "rewardsConfig",
      "navigation",
      "footer",
    ],
    componentTypes: [
      "hero",
      "trust-strip",
      "products",
      "notify",
      "story",
      "typographic-break",
      "comparison",
      "testimonials",
      "contact",
      "email-popup",
    ],
    editableSections: {
      hero: "hero",
      products: "products",
      story: "story",
      testimonials: "testimonials",
      contact: "contact",
    },
  }),
  restaurant: manifest({
    id: "restaurant",
    contentSections: [
      "hero",
      "services",
      "story",
      "testimonials",
      "events",
      "contact",
      "settings",
      "theme",
      "faq",
    ],
    componentTypes: [
      "hero",
      "services",
      "story",
      "testimonials",
      "events",
      "contact",
      "faq",
      "trust-strip",
      "testimonial-quote",
      "cta",
      "page-header",
      "newsletter",
    ],
    editableSections: {
      hero: "hero",
      services: "services",
      story: "story",
      testimonials: "testimonials",
      events: "events",
      contact: "contact",
      faq: "faq",
    },
  }),
  trades: manifest({
    id: "trades",
    contentSections: [
      "hero",
      "services",
      "story",
      "testimonials",
      "contact",
      "settings",
      "theme",
      "faq",
    ],
    componentTypes: [
      "hero",
      "services",
      "story",
      "testimonials",
      "contact",
      "faq",
      "trust-strip",
      "testimonial-quote",
      "cta",
      "page-header",
    ],
    editableSections: {
      hero: "hero",
      services: "services",
      story: "story",
      testimonials: "testimonials",
      contact: "contact",
      faq: "faq",
    },
  }),
  professional: manifest({
    id: "professional",
    contentSections: [
      "hero",
      "services",
      "story",
      "testimonials",
      "contact",
      "settings",
      "theme",
      "faq",
    ],
    componentTypes: [
      "hero",
      "services",
      "story",
      "testimonials",
      "contact",
      "faq",
      "trust-strip",
      "testimonial-quote",
      "cta",
      "page-header",
      "newsletter",
    ],
    editableSections: {
      hero: "hero",
      services: "services",
      story: "story",
      testimonials: "testimonials",
      contact: "contact",
      faq: "faq",
    },
  }),
  "fashion-stylist": manifest({
    id: "fashion-stylist",
    contentSections: ["settings", "contact", "hero", "theme", "navigation", "footer"],
    componentTypes: ["jada-home"],
    editableSections: {},
  }),
};

export function getTemplateManifest(templateId?: string | null): TemplateManifest {
  return TEMPLATE_MANIFESTS[templateId as TemplateId] ?? TEMPLATE_MANIFESTS.wellness;
}

export function getTemplateManifests(): Record<TemplateId, TemplateManifest> {
  return TEMPLATE_MANIFESTS;
}

export async function getTemplateManifestForTenant(tenant: string): Promise<TemplateManifest> {
  const config = await getTenantConfig(tenant);
  return getTemplateManifest(config?.template);
}
