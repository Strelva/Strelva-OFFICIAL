import type { SitePageConfig } from "./types";

// 3-page IA: Home, About, Contact. Book Now → Vagaro.
// Services/FAQ/testimonials live on Home as pre-booking decision content.
// Chelsea can add/remove/reorder any section on any page from the dashboard.

export const DEFAULT_PAGE_CONFIG: SitePageConfig = {
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
