import type { SitePageConfig } from "./types";

// Sections like services, events, faq, shop, providers render their own headlines
// internally — they only need the page-header as a top-padding spacer.
// The about page uses a custom page-header with the story headline.
// The contact page has a custom "Get in touch" title in the page-header.

export const DEFAULT_PAGE_CONFIG: SitePageConfig = {
  home: {
    sections: [
      { type: "hero", visible: true, order: 0 },
      { type: "trust-strip", visible: true, order: 1 },
      { type: "testimonial-quote", visible: true, order: 2 },
      { type: "instagram-feed", visible: true, order: 3 },
      { type: "newsletter", visible: true, order: 4 },
      { type: "cta", visible: true, order: 5 },
    ],
  },
  services: {
    sections: [
      { type: "page-header", visible: true, order: 0 },
      { type: "services", visible: true, order: 1 },
      { type: "booking-widget", visible: true, order: 2 },
      { type: "testimonials", visible: true, order: 3 },
    ],
  },
  about: {
    sections: [
      { type: "page-header", visible: true, order: 0, props: { contentKey: "story" } },
      { type: "story", visible: true, order: 1 },
      { type: "cta", visible: true, order: 2 },
    ],
  },
  contact: {
    sections: [
      { type: "page-header", visible: true, order: 0, props: { title: "Get in touch" } },
      { type: "contact", visible: true, order: 1 },
      { type: "cta", visible: true, order: 2 },
    ],
  },
  events: {
    sections: [
      { type: "page-header", visible: true, order: 0 },
      { type: "events", visible: true, order: 1 },
      { type: "cta", visible: true, order: 2 },
    ],
  },
  faq: {
    sections: [
      { type: "page-header", visible: true, order: 0 },
      { type: "faq", visible: true, order: 1 },
      { type: "cta", visible: true, order: 2 },
    ],
  },
  providers: {
    sections: [
      { type: "page-header", visible: true, order: 0 },
      { type: "providers", visible: true, order: 1 },
      {
        type: "cta",
        visible: true,
        order: 2,
        props: {
          heading: "Know your body better",
          description: "Explore our services and find the right fit for your wellness journey.",
          ctaText: "View Services",
          ctaHref: "/services",
        },
      },
    ],
  },
  shop: {
    sections: [
      { type: "page-header", visible: true, order: 0 },
      { type: "shop", visible: true, order: 1 },
      { type: "cta", visible: true, order: 2 },
    ],
  },
};
