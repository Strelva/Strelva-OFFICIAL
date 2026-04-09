/**
 * Per-template field schemas for the dashboard content editor.
 *
 * Why this exists: SECTION_FIELDS/ARRAY_CONFIGS were originally generic
 * (wellness-shaped). But each template renders a different content shape —
 * food-brand doesn't have phone/hours, it has locationTitle/locationDescription
 * and story paragraphs and stats. Gating fields on template here keeps the
 * editor honest: Amy only ever sees fields her template actually renders.
 *
 * Merge order in PropertiesEditor: template-specific → generic fallback.
 */

export type SimpleFieldType = "text" | "textarea" | "url" | "email" | "tel" | "image" | "color" | "number" | "select";

export interface SimpleFieldDef {
  key: string;
  label: string;
  type: SimpleFieldType;
  placeholder?: string;
  /** Only used when type === "select". Rendered as a native <select>. */
  options?: { value: string; label: string }[];
}

// Curated font picker shared by fontDisplay and fontBody. Must stay in sync
// with the next/font imports in GLDF's src/app/layout.tsx — those load the
// corresponding --font-* CSS variables at build time. Dynamic font loading
// is intentionally not supported.
const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "Fraunces", label: "Fraunces" },
  { value: "Instrument_Serif", label: "Instrument Serif" },
  { value: "Playfair_Display", label: "Playfair Display" },
  { value: "DM_Serif_Display", label: "DM Serif Display" },
  { value: "Inter", label: "Inter" },
  { value: "DM_Sans", label: "DM Sans" },
  { value: "Manrope", label: "Manrope" },
  { value: "Work_Sans", label: "Work Sans" },
];

export interface NestedFieldDef {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "url"
    | "tel"
    | "select"
    | "toggle"
    | "date"
    | "image"
    | "object-array";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  itemFields?: NestedFieldDef[];
}

export type SectionArrayConfig =
  | {
      kind: "objects";
      arrayKey: string;
      nameKey: string;
      detailKey: string;
      label: string;
      addLabel: string;
      fields: Array<NestedFieldDef>;
      defaultItem: () => Record<string, unknown>;
    }
  | {
      kind: "strings";
      arrayKey: string;
      label: string;
      addLabel: string;
      placeholder?: string;
      multiline?: boolean;
    };

export interface TemplateEditorSchema {
  /** Scalar fields rendered above any array editors for the section. */
  sectionFields: Record<string, SimpleFieldDef[]>;
  /** One or more array editors per section (string arrays or object arrays). */
  sectionArrays: Record<string, SectionArrayConfig[]>;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// --- food-brand (GLDF) ---
// Matches GLDF/src/lib/types.ts exactly — no dead fields.
export const FOOD_BRAND_SCHEMA: TemplateEditorSchema = {
  sectionFields: {
    hero: [
      { key: "headline", label: "Headline", type: "textarea", placeholder: "Main heading (use \\n for line breaks)" },
      { key: "subheadline", label: "Subheadline", type: "text", placeholder: "Short accent above headline" },
      { key: "tagline", label: "Tagline", type: "textarea", placeholder: "What makes the brand different..." },
      { key: "ctaText", label: "Button text", type: "text", placeholder: "See Our Products" },
      { key: "ctaLink", label: "Button link", type: "url", placeholder: "#products or https://..." },
      { key: "backgroundImageUrl", label: "Background image", type: "image" },
    ],
    story: [
      { key: "headline", label: "Headline", type: "textarea", placeholder: "Use \\n for line breaks" },
      { key: "accentText", label: "Caption under image", type: "text", placeholder: "From the shores of Lake Erie" },
      { key: "statement", label: "Opening statement", type: "textarea", placeholder: "One big sentence that sets the tone..." },
      { key: "quote", label: "Pull quote", type: "textarea", placeholder: "A memorable line..." },
      { key: "quoteAttribution", label: "Quote attribution", type: "text", placeholder: "— Name" },
      { key: "imageUrl", label: "Story image", type: "image" },
    ],
    products: [
      { key: "headline", label: "Section headline", type: "text", placeholder: "What We Make" },
      { key: "description", label: "Section intro", type: "textarea", placeholder: "A short intro..." },
      { key: "bottomNote", label: "Bottom note", type: "text", placeholder: "More flavors coming soon" },
    ],
    testimonials: [
      { key: "headline", label: "Section headline", type: "text", placeholder: "What People Are Saying" },
    ],
    contact: [
      { key: "email", label: "Email", type: "email", placeholder: "hello@example.com" },
      { key: "locationTitle", label: "Location title", type: "textarea", placeholder: "Western\\nNew York" },
      { key: "locationDescription", label: "Location description", type: "textarea", placeholder: "Small-batch apple snacks..." },
      { key: "instagramUrl", label: "Instagram URL", type: "url", placeholder: "https://instagram.com/..." },
      { key: "facebookUrl", label: "Facebook URL", type: "url", placeholder: "https://facebook.com/..." },
    ],
    settings: [
      { key: "siteName", label: "Site name", type: "text", placeholder: "Great Lakes Dried Fruit" },
      { key: "siteTagline", label: "Tagline", type: "text", placeholder: "Orchard-Dried Apple Snacks" },
      { key: "siteDescription", label: "Meta description", type: "textarea", placeholder: "How you appear in search results..." },
      { key: "footerTagline", label: "Footer tagline", type: "text", placeholder: "Orchard-dried. Ingredient-honest." },
      { key: "copyrightText", label: "Copyright line", type: "text", placeholder: "Great Lakes Dried Fruit" },
    ],
    // Theme: stored shape is nested (colors.*, fontDisplay, fontBody).
    // Color fields use dot-notation keys; PropertiesEditor resolves them
    // via getNestedValue/setNestedValue.
    theme: [
      { key: "fontDisplay", label: "Display font", type: "select", options: FONT_OPTIONS },
      { key: "fontBody", label: "Body font", type: "select", options: FONT_OPTIONS },
      { key: "colors.cream", label: "Cream", type: "color" },
      { key: "colors.creamDark", label: "Cream Dark", type: "color" },
      { key: "colors.creamMid", label: "Cream Mid", type: "color" },
      { key: "colors.sage", label: "Sage", type: "color" },
      { key: "colors.sageLight", label: "Sage Light", type: "color" },
      { key: "colors.sageDark", label: "Sage Dark", type: "color" },
      { key: "colors.bark", label: "Bark", type: "color" },
      { key: "colors.barkLight", label: "Bark Light", type: "color" },
      { key: "colors.barkFaded", label: "Bark Faded", type: "color" },
      { key: "colors.wheat", label: "Wheat", type: "color" },
      { key: "colors.wheatLight", label: "Wheat Light", type: "color" },
      { key: "colors.terra", label: "Terra", type: "color" },
      { key: "colors.terraLight", label: "Terra Light", type: "color" },
    ],
    rewardsConfig: [
      { key: "starsPerBag", label: "Stars per bag purchased", type: "number", placeholder: "100" },
      { key: "starsToRedeem", label: "Stars needed to redeem", type: "number", placeholder: "100" },
      { key: "redemptionValue", label: "Dollars off per redemption", type: "number", placeholder: "5" },
      { key: "newsletterBonus", label: "Newsletter signup bonus", type: "number", placeholder: "50" },
      { key: "subscriptionBonus", label: "Subscription signup bonus", type: "number", placeholder: "30" },
      { key: "tierThresholdSuper", label: "Stars to reach Super tier", type: "number", placeholder: "500" },
    ],
    navigation: [
      { key: "ctaLabel", label: "CTA button label", type: "text", placeholder: "Shop Now" },
      { key: "ctaHref", label: "CTA button link", type: "url", placeholder: "#products or https://..." },
    ],
    footer: [
      { key: "tagline", label: "Footer tagline", type: "text", placeholder: "Orchard-dried. Ingredient-honest." },
      { key: "copyrightText", label: "Copyright line", type: "text", placeholder: "Great Lakes Dried Fruit" },
    ],
  },
  sectionArrays: {
    story: [
      {
        kind: "strings",
        arrayKey: "paragraphs",
        label: "Story paragraphs",
        addLabel: "Add paragraph",
        placeholder: "Write a paragraph...",
        multiline: true,
      },
      {
        kind: "objects",
        arrayKey: "stats",
        nameKey: "value",
        detailKey: "label",
        label: "Stats",
        addLabel: "Add stat",
        fields: [
          { key: "value", label: "Value", type: "text", placeholder: "100%", required: true },
          { key: "label", label: "Label", type: "text", placeholder: "Real Ingredients", required: true },
        ],
        defaultItem: () => ({ value: "", label: "" }),
      },
    ],
    products: [
      {
        kind: "objects",
        arrayKey: "products",
        nameKey: "name",
        detailKey: "price",
        label: "Products",
        addLabel: "Add product",
        fields: [
          { key: "name", label: "Name", type: "text", placeholder: "Product name", required: true },
          { key: "description", label: "Description", type: "textarea", placeholder: "What makes it special..." },
          { key: "ingredients", label: "Ingredients", type: "text", placeholder: "Apples, Cinnamon, Maple" },
          { key: "price", label: "Price", type: "text", placeholder: "5.99" },
          { key: "badge", label: "Badge", type: "text", placeholder: "BESTSELLER" },
          { key: "stripePaymentLink", label: "Stripe link", type: "url", placeholder: "https://buy.stripe.com/..." },
          { key: "imageUrl", label: "Product photo", type: "image" },
          { key: "featured", label: "Featured", type: "toggle" },
          { key: "comingSoon", label: "Coming soon", type: "toggle" },
          {
            key: "reviews",
            label: "Reviews",
            type: "object-array",
            itemFields: [
              { key: "author", label: "Author", type: "text", placeholder: "Customer name" },
              { key: "rating", label: "Rating (1-5)", type: "text", placeholder: "5" },
              { key: "text", label: "Review", type: "textarea", placeholder: "What they said..." },
            ],
          },
        ],
        defaultItem: () => ({
          id: uid(),
          name: "",
          description: "",
          ingredients: "",
          price: "",
          badge: "",
          stripePaymentLink: "",
          imageUrl: "",
          featured: false,
          comingSoon: false,
          reviews: [],
        }),
      },
    ],
    testimonials: [
      {
        kind: "objects",
        arrayKey: "testimonials",
        nameKey: "author",
        detailKey: "quote",
        label: "Reviews",
        addLabel: "Add review",
        fields: [
          { key: "author", label: "Author", type: "text", placeholder: "Customer name", required: true },
          { key: "quote", label: "Quote", type: "textarea", placeholder: "What they said...", required: true },
          { key: "location", label: "Location", type: "text", placeholder: "Buffalo, NY" },
        ],
        defaultItem: () => ({ id: uid(), quote: "", author: "", location: "" }),
      },
    ],
    navigation: [
      {
        kind: "objects",
        arrayKey: "menuItems",
        nameKey: "label",
        detailKey: "href",
        label: "Menu items",
        addLabel: "Add menu item",
        fields: [
          { key: "label", label: "Label", type: "text", placeholder: "Shop", required: true },
          { key: "href", label: "Link", type: "url", placeholder: "#products or /path", required: true },
        ],
        defaultItem: () => ({ label: "", href: "" }),
      },
    ],
    footer: [
      {
        kind: "objects",
        arrayKey: "columns",
        nameKey: "heading",
        detailKey: "heading",
        label: "Footer columns",
        addLabel: "Add column",
        fields: [
          { key: "heading", label: "Heading", type: "text", placeholder: "Navigate", required: true },
          {
            key: "links",
            label: "Links",
            type: "object-array",
            itemFields: [
              { key: "label", label: "Label", type: "text", placeholder: "Products" },
              { key: "href", label: "Link", type: "url", placeholder: "#products or /path" },
            ],
          },
        ],
        defaultItem: () => ({ heading: "", links: [] }),
      },
      {
        kind: "objects",
        arrayKey: "socialLinks",
        nameKey: "label",
        detailKey: "href",
        label: "Social links",
        addLabel: "Add social link",
        fields: [
          { key: "label", label: "Label", type: "text", placeholder: "Instagram", required: true },
          { key: "href", label: "URL", type: "url", placeholder: "https://instagram.com/...", required: true },
        ],
        defaultItem: () => ({ label: "", href: "" }),
      },
    ],
  },
};

const REGISTRY: Record<string, TemplateEditorSchema> = {
  "food-brand": FOOD_BRAND_SCHEMA,
};

export function getTemplateSchema(template: string | undefined): TemplateEditorSchema | null {
  if (!template) return null;
  return REGISTRY[template] ?? null;
}
