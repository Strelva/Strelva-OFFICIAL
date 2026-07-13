import type { ContentSection, PageSectionConfig, SitePageConfig } from "@/lib/types";
import type { TemplateDefinition } from "../registry";
import { getTemplateManifest } from "@/lib/template-manifests";

// Reuse shared public components — restaurant doesn't need custom UI,
// just a different page structure and section selection
import { Hero } from "@/components/public/Hero";
import { Services } from "@/components/public/Services";
import { Story } from "@/components/public/Story";
import { Testimonials } from "@/components/public/Testimonials";
import { Events } from "@/components/public/Events";
import { Contact } from "@/components/public/Contact";
import { Faq } from "@/components/public/Faq";
import { TrustStrip } from "@/components/public/TrustStrip";
import { TestimonialQuote } from "@/components/public/TestimonialQuote";
import { PageCTA } from "@/components/public/PageCTA";
import { PageHeader } from "@/components/public/PageHeader";
import { NewsletterSignup } from "@/components/public/NewsletterSignup";
import { Header } from "@/components/public/Header";
import { Footer } from "@/components/public/Footer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SECTION_COMPONENTS: Record<string, React.ComponentType<any>> = {
  hero: Hero,
  services: Services, // doubles as "menu"
  story: Story,
  testimonials: Testimonials,
  events: Events, // specials, live music, etc.
  contact: Contact,
  faq: Faq,
  "trust-strip": TrustStrip,
  "testimonial-quote": TestimonialQuote,
  cta: PageCTA,
  "page-header": PageHeader,
  newsletter: NewsletterSignup,
};

const SECTION_CONTENT_KEYS: Record<string, ContentSection[]> = {
  hero: ["hero", "settings"],
  services: ["services", "settings"],
  story: ["story", "settings"],
  testimonials: ["testimonials"],
  events: ["events", "settings"],
  contact: ["contact"],
  faq: ["faq"],
  "trust-strip": ["settings", "contact"],
  "testimonial-quote": ["testimonials"],
  cta: ["settings"],
  "page-header": [],
  newsletter: [],
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  services: "Menu",
  story: "Our Story",
  testimonials: "Reviews",
  events: "Events & Specials",
  contact: "Location & Hours",
  faq: "FAQ",
  "trust-strip": "Trust Strip",
  "testimonial-quote": "Featured Review",
  cta: "Reservation CTA",
  "page-header": "Page Header",
  newsletter: "Newsletter",
};

const EDITABLE_SECTION_MAP: Record<string, string> = {
  hero: "hero",
  services: "services",
  story: "story",
  testimonials: "testimonials",
  events: "events",
  contact: "contact",
  faq: "faq",
};

const RESTAURANT_PAGE_CONFIG: SitePageConfig = {
  home: {
    sections: [
      { type: "hero", visible: true, order: 0 },
      { type: "trust-strip", visible: true, order: 1 },
      { type: "services", visible: true, order: 2 },
      { type: "testimonial-quote", visible: true, order: 3 },
      { type: "events", visible: true, order: 4 },
      { type: "faq", visible: true, order: 5 },
      { type: "newsletter", visible: true, order: 6 },
      { type: "cta", visible: true, order: 7, props: { ctaText: "Make a Reservation", ctaHref: "#contact" } },
    ],
  },
  about: {
    sections: [
      { type: "page-header", visible: true, order: 0, props: { contentKey: "story" } },
      { type: "story", visible: true, order: 1 },
      { type: "testimonials", visible: true, order: 2 },
      { type: "cta", visible: true, order: 3, props: { ctaText: "Make a Reservation", ctaHref: "#contact" } },
    ],
  },
  contact: {
    sections: [
      { type: "page-header", visible: true, order: 0, props: { title: "Visit us" } },
      { type: "contact", visible: true, order: 1 },
    ],
  },
};

function buildSectionProps(
  sectionConfig: PageSectionConfig,
  content: Record<string, unknown>,
  _pageSlug: string
): Record<string, unknown> | null {
  const { type, props: customProps } = sectionConfig;
  const settings = content.settings as Record<string, unknown> | undefined;

  switch (type) {
    case "hero":
      return { hero: content.hero, ownerName: settings?.ownerName, variant: sectionConfig.variant };
    case "services":
      return { services: content.services, bookingUrl: settings?.bookingUrl, variant: sectionConfig.variant };
    case "story":
      return { story: content.story, ownerName: settings?.ownerName };
    case "testimonials":
      return { testimonials: content.testimonials };
    case "events":
      return { events: content.events, settings: content.settings };
    case "contact":
      return { contact: content.contact };
    case "faq":
      return { faq: content.faq };
    case "trust-strip":
      return { settings: content.settings, contact: content.contact };
    case "testimonial-quote":
      return { testimonials: content.testimonials };
    case "cta":
      return {
        ...(customProps || {}),
        ctaHref: (customProps?.ctaHref as string) || settings?.bookingUrl || "#contact",
      };
    case "newsletter":
      return {};
    case "page-header": {
      let title = (customProps?.title as string) || undefined;
      if (!title && customProps?.contentKey) {
        const src = content[customProps.contentKey as string] as Record<string, unknown> | undefined;
        if (src?.headline) title = (src.headline as string).split("\n")[0];
      }
      return { title, description: customProps?.description as string };
    }
    default:
      return null;
  }
}

export const restaurantTemplate: TemplateDefinition = {
  id: "restaurant",
  components: SECTION_COMPONENTS,
  contentKeys: SECTION_CONTENT_KEYS,
  buildProps: buildSectionProps,
  labels: SECTION_LABELS,
  editableSections: EDITABLE_SECTION_MAP,
  Header,
  Footer,
  themeVars: {
    "--cream": "#faf8f4",
    "--sage": "#8b6f47",
    "--sage-light": "#a6895f",
    "--sage-dark": "#6b5434",
  },
  defaultPageConfig: RESTAURANT_PAGE_CONFIG,
  contentSections: [...getTemplateManifest("restaurant").contentSections],
};
