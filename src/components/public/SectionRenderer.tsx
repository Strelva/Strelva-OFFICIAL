import type { ContentSection, PageSectionConfig, SitePageConfig } from "@/lib/types";
import { getContent, getPageConfig } from "@/lib/storage";
import { DEFAULT_PAGE_CONFIG } from "@/lib/pageConfigDefaults";

// Section components
import { Hero } from "./Hero";
import { Services } from "./Services";
import { Story } from "./Story";
import { Testimonials } from "./Testimonials";
import { Events } from "./Events";
import { Providers } from "./Providers";
import { Contact } from "./Contact";
import { Faq } from "./Faq";
import { Shop } from "./Shop";
import { BookingWidget } from "./BookingWidget";
import { TrustStrip } from "./TrustStrip";
import { TestimonialQuote } from "./TestimonialQuote";
import { PageCTA } from "./PageCTA";
import { PageHeader } from "./PageHeader";
import { InstagramFeed } from "./InstagramFeed";
import { VagaroEmbed } from "./VagaroEmbed";

// Which content keys each section type needs
const SECTION_CONTENT_KEYS: Record<string, ContentSection[]> = {
  hero: ["hero", "settings"],
  services: ["services"],
  story: ["story"],
  testimonials: ["testimonials"],
  events: ["events"],
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
};

// Section labels for the edit-mode overlay
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
};

// Map section type → editable content section key (for dashboard click-to-edit)
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
      return { story: content.story };
    case "testimonials":
      return { testimonials: content.testimonials };
    case "events":
      return { events: content.events };
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
        handle: (settings?.instagramHandle as string) || "rohlaxwellness",
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
};

interface SectionRendererProps {
  pageSlug: string;
  tenant: string;
  editMode?: boolean;
}

export async function SectionRenderer({ pageSlug, tenant, editMode }: SectionRendererProps) {
  // Load page config
  let pageConfig: SitePageConfig;
  try {
    pageConfig = await getPageConfig(tenant);
  } catch {
    pageConfig = DEFAULT_PAGE_CONFIG;
  }

  const page = pageConfig[pageSlug] || DEFAULT_PAGE_CONFIG[pageSlug];
  if (!page) return null;

  // Get visible sections sorted by order
  const visibleSections = page.sections
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  // Collect all unique content keys needed
  const contentKeysSet = new Set<ContentSection>();
  for (const section of visibleSections) {
    const keys = SECTION_CONTENT_KEYS[section.type] || [];
    for (const k of keys) contentKeysSet.add(k);
    // page-header can reference content via contentKey prop
    if (section.props?.contentKey) {
      contentKeysSet.add(section.props.contentKey as ContentSection);
    }
  }

  // Fetch all content in parallel
  const contentKeys = Array.from(contentKeysSet);
  const results = await Promise.all(contentKeys.map((k) => getContent(k, tenant)));
  const content: Record<string, unknown> = {};
  contentKeys.forEach((k, i) => {
    content[k] = results[i];
  });

  return (
    <>
      {visibleSections.map((sectionConfig) => {
        const Component = SECTION_COMPONENTS[sectionConfig.type];
        if (!Component) return null;

        const props = buildSectionProps(sectionConfig, content, pageSlug);
        if (!props) return null;

        const editableSection = EDITABLE_SECTION_MAP[sectionConfig.type];

        return (
          <div
            key={`${sectionConfig.type}-${sectionConfig.order}`}
            data-reb-section={sectionConfig.type}
            data-reb-editable={editableSection || undefined}
            data-reb-label={SECTION_LABELS[sectionConfig.type]}
          >
            <Component {...props} />
          </div>
        );
      })}
    </>
  );
}
