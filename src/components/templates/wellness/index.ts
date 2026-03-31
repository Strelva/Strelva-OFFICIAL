import type { ContentSection, PageSectionConfig } from "@/lib/types";
import type { TemplateDefinition } from "../registry";

// Section components
import { Hero } from "@/components/public/Hero";
import { Services } from "@/components/public/Services";
import { Story } from "@/components/public/Story";
import { Testimonials } from "@/components/public/Testimonials";
import { Events } from "@/components/public/Events";
import { Providers } from "@/components/public/Providers";
import { Contact } from "@/components/public/Contact";
import { Faq } from "@/components/public/Faq";
import { Shop } from "@/components/public/Shop";
import { BookingWidget } from "@/components/public/BookingWidget";
import { TrustStrip } from "@/components/public/TrustStrip";
import { TestimonialQuote } from "@/components/public/TestimonialQuote";
import { PageCTA } from "@/components/public/PageCTA";
import { PageHeader } from "@/components/public/PageHeader";
import { InstagramFeed } from "@/components/public/InstagramFeed";
import { VagaroEmbed } from "@/components/public/VagaroEmbed";
import { NewsletterSignup } from "@/components/public/NewsletterSignup";

// Layout components
import { Header } from "@/components/public/Header";
import { Footer } from "@/components/public/Footer";

// Config
import { DEFAULT_PAGE_CONFIG } from "@/lib/pageConfigDefaults";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SECTION_COMPONENTS: Record<string, React.ComponentType<any>> = {
  hero: Hero,
  services: Services,
  story: Story,
  testimonials: Testimonials,
  events: Events,
  providers: Providers,
  contact: Contact,
  faq: Faq,
  shop: Shop,
  "booking-widget": BookingWidget,
  "trust-strip": TrustStrip,
  "testimonial-quote": TestimonialQuote,
  cta: PageCTA,
  "page-header": PageHeader,
  "instagram-feed": InstagramFeed,
  "vagaro-booking": VagaroEmbed,
  newsletter: NewsletterSignup,
};

const SECTION_CONTENT_KEYS: Record<string, ContentSection[]> = {
  hero: ["hero", "settings"],
  services: ["services"],
  story: ["story", "settings"],
  testimonials: ["testimonials"],
  events: ["events", "settings"],
  providers: ["providers", "settings"],
  contact: ["contact"],
  faq: ["faq"],
  shop: ["shop"],
  "booking-widget": ["services", "testimonials", "settings"],
  "trust-strip": ["settings", "contact"],
  "testimonial-quote": ["testimonials"],
  cta: [],
  "page-header": [],
  "instagram-feed": ["settings"],
  "vagaro-booking": ["settings"],
  newsletter: [],
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  services: "Services",
  story: "About",
  testimonials: "Testimonials",
  events: "Events",
  providers: "Providers",
  contact: "Contact",
  faq: "FAQ",
  shop: "Shop",
  "booking-widget": "Booking",
  "trust-strip": "Trust Strip",
  "testimonial-quote": "Quote",
  cta: "Call to Action",
  "page-header": "Page Header",
  "instagram-feed": "Instagram Feed",
  "vagaro-booking": "Vagaro Booking",
  newsletter: "Newsletter Signup",
};

const EDITABLE_SECTION_MAP: Record<string, string> = {
  hero: "hero",
  services: "services",
  story: "story",
  testimonials: "testimonials",
  events: "events",
  providers: "providers",
  contact: "contact",
  faq: "faq",
  shop: "shop",
};

function buildSectionProps(
  sectionConfig: PageSectionConfig,
  content: Record<string, unknown>,
  pageSlug: string
): Record<string, unknown> | null {
  const { type, props: customProps } = sectionConfig;

  switch (type) {
    case "hero":
      return {
        hero: content.hero,
        ownerName: (content.settings as Record<string, unknown>)?.ownerName,
      };
    case "services":
      return { services: content.services };
    case "story":
      return {
        story: content.story,
        ownerName: (content.settings as Record<string, unknown>)?.ownerName,
      };
    case "testimonials":
      return { testimonials: content.testimonials };
    case "events":
      return { events: content.events, settings: content.settings };
    case "providers":
      return {
        providers: content.providers,
        ownerName: (content.settings as Record<string, unknown>)?.ownerName,
      };
    case "contact":
      return { contact: content.contact };
    case "faq":
      return { faq: content.faq };
    case "shop":
      return { shop: content.shop };
    case "booking-widget": {
      const svc = content.services as Record<string, unknown>;
      const test = content.testimonials as Record<string, unknown>;
      const settings = content.settings as Record<string, unknown>;
      const serviceItems = (svc?.services as Array<Record<string, unknown>>) || [];
      const prices = serviceItems
        .map((s) => parseInt(String(s.price || "0")))
        .filter((p) => p > 0);
      return {
        services: serviceItems,
        bookingUrl: settings?.bookingUrl,
        minPrice: prices.length > 0 ? String(Math.min(...prices)) : undefined,
        reviewCount: ((test?.testimonials as unknown[]) || []).length,
      };
    }
    case "trust-strip":
      return { settings: content.settings, contact: content.contact };
    case "testimonial-quote":
      return { testimonials: content.testimonials };
    case "cta":
      return customProps || {};
    case "instagram-feed": {
      const settings = content.settings as Record<string, unknown>;
      return {
        handle: (settings?.instagramHandle as string) || "",
        posts: (customProps?.posts as string[]) || undefined,
      };
    }
    case "vagaro-booking": {
      const settings = content.settings as Record<string, unknown>;
      return {
        embedId: (settings?.vagaro_embed_id as string) || "rohlaxwellness",
        fallbackUrl: (settings?.bookingUrl as string) || undefined,
      };
    }
    case "newsletter":
      return {};
    case "page-header": {
      // Title from explicit props, or from a content section via contentKey
      let title = (customProps?.title as string) || undefined;
      if (!title && customProps?.contentKey) {
        const src = content[customProps.contentKey as string] as Record<string, unknown> | undefined;
        if (src?.headline) {
          title = (src.headline as string).split("\n")[0];
        }
      }
      const description = (customProps?.description as string) || undefined;
      return { title, description };
    }
    default:
      return null;
  }
}

export const wellnessTemplate: TemplateDefinition = {
  id: "wellness",
  components: SECTION_COMPONENTS,
  contentKeys: SECTION_CONTENT_KEYS,
  buildProps: buildSectionProps,
  labels: SECTION_LABELS,
  editableSections: EDITABLE_SECTION_MAP,
  Header,
  Footer,
  themeVars: {},
  defaultPageConfig: DEFAULT_PAGE_CONFIG,
  contentSections: [
    "hero",
    "services",
    "story",
    "testimonials",
    "events",
    "providers",
    "contact",
    "settings",
    "faq",
    "shop",
  ],
};
