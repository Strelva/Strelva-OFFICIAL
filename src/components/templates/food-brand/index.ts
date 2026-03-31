import type { ContentSection, PageSectionConfig, SitePageConfig } from "@/lib/types";
import type { TemplateDefinition } from "../registry";

// Section components
import { Hero } from "./Hero";
import { Products } from "./Products";
import { Story } from "./Story";
import { Testimonials } from "./Testimonials";
import { Contact } from "./Contact";
import { Comparison } from "./Comparison";
import { Notify } from "./Notify";
import { EmailPopup } from "./EmailPopup";
import { TypographicBreak } from "./TypographicBreak";
import { TrustStrip } from "./TrustStrip";

// Layout components
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CartLayoutWrapper } from "./CartLayoutWrapper";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SECTION_COMPONENTS: Record<string, React.ComponentType<any>> = {
  hero: Hero,
  "trust-strip": TrustStrip,
  products: Products,
  notify: Notify,
  story: Story,
  "typographic-break": TypographicBreak,
  comparison: Comparison,
  testimonials: Testimonials,
  contact: Contact,
  "email-popup": EmailPopup,
};

const SECTION_CONTENT_KEYS: Record<string, ContentSection[]> = {
  hero: ["hero", "settings"],
  products: ["products"],
  story: ["story"],
  testimonials: ["testimonials"],
  contact: ["contact"],
  "trust-strip": [],
  notify: [],
  "typographic-break": [],
  comparison: [],
  "email-popup": [],
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  products: "Products",
  story: "Our Story",
  testimonials: "Testimonials",
  contact: "Contact",
  "trust-strip": "Trust Strip",
  notify: "Email Signup",
  "typographic-break": "Divider",
  comparison: "Comparison",
  "email-popup": "Email Popup",
};

const EDITABLE_SECTION_MAP: Record<string, string> = {
  hero: "hero",
  products: "products",
  story: "story",
  testimonials: "testimonials",
  contact: "contact",
};

function buildSectionProps(
  sectionConfig: PageSectionConfig,
  content: Record<string, unknown>,
  _pageSlug: string
): Record<string, unknown> | null {
  switch (sectionConfig.type) {
    case "hero":
      return { hero: content.hero };
    case "products":
      return { products: content.products };
    case "story":
      return { story: content.story };
    case "testimonials":
      return { testimonials: content.testimonials };
    case "contact":
      return { contact: content.contact };
    case "trust-strip":
    case "notify":
    case "typographic-break":
    case "comparison":
    case "email-popup":
      return {};
    default:
      return null;
  }
}

const THEME_VARS: Record<string, string> = {
  "--cream": "#faf8f5",
  "--cream-dark": "#f0ece5",
  "--cream-mid": "#e8e2d8",
  "--sage": "#5a260c",
  "--sage-light": "#7a3a18",
  "--sage-dark": "#3d1a08",
  "--sage-wash": "rgba(90, 38, 12, 0.08)",
  "--bark": "#2c2418",
  "--bark-light": "#5a4d3e",
  "--bark-faded": "#8a7d6e",
  "--wheat": "#c8a96e",
  "--wheat-light": "#dcc08a",
  "--terra": "#b5634b",
  "--terra-light": "#c97a64",
};

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
  },
};

export const foodBrandTemplate: TemplateDefinition = {
  id: "food-brand",
  components: SECTION_COMPONENTS,
  contentKeys: SECTION_CONTENT_KEYS,
  buildProps: buildSectionProps,
  labels: SECTION_LABELS,
  editableSections: EDITABLE_SECTION_MAP,
  LayoutWrapper: CartLayoutWrapper,
  Header,
  Footer,
  themeVars: THEME_VARS,
  defaultPageConfig: FOOD_BRAND_PAGE_CONFIG,
  contentSections: ["hero", "story", "products", "testimonials", "contact", "settings"],
};
