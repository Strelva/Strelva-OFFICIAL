import { z } from "zod";
import type { ContentSection } from "./types";

const SAFE_URL_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

const safeUrl = z.string().max(10000).refine(
  (val) => {
    if (!val || val.trim() === "") return true;
    try {
      const url = new URL(val);
      return SAFE_URL_PROTOCOLS.includes(url.protocol);
    } catch {
      return val.startsWith("/") || val.startsWith("#");
    }
  },
  { message: "Invalid URL or unsafe protocol" }
);

const safeImageUrl = z.string().max(10000).refine(
  (val) => {
    if (!val || val.trim() === "") return true;
    try {
      const url = new URL(val);
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return val.startsWith("/");
    }
  },
  { message: "Invalid image URL" }
);

// Theme values are interpolated into inline CSS custom properties on the public
// site. Constrain them so a content value can't carry CSS-injection/defacement
// payloads (hex, rgb/hsl, named colors, or a CSS var reference only).
const cssColor = z
  .string()
  .max(64)
  .refine(
    (v) =>
      v.trim() === "" ||
      /^#[0-9a-fA-F]{3,8}$/.test(v) ||
      /^(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)$/.test(v) ||
      /^[a-zA-Z]+$/.test(v) ||
      /^var\(--[a-zA-Z0-9-]+\)$/.test(v),
    { message: "Invalid color value" }
  );
const cssFont = z
  .string()
  .max(120)
  .refine((v) => v.trim() === "" || /^[a-zA-Z0-9\s,"'._-]+$/.test(v), {
    message: "Invalid font value",
  });

export const heroSchema = z.object({
  headline: z.string().max(10000).min(1),
  subheadline: z.string().max(10000),
  tagline: z.string().max(10000),
  ctaText: z.string().max(10000).min(1),
  ctaLink: safeUrl,
  backgroundImageUrl: safeImageUrl,
  logoUrl: safeImageUrl.optional(),
});

export const serviceItemSchema = z.object({
  id: z.string().max(10000).min(1),
  name: z.string().max(10000).min(1),
  description: z.string().max(10000),
  duration: z.string().max(10000),
  price: z.string().max(10000),
  featured: z.boolean(),
  who_its_for: z.string().max(10000),
  booking_link: safeUrl,
  comingSoon: z.boolean(),
  image_url: safeImageUrl.optional().default(""),
});

export const servicesSchema = z.object({
  sectionLabel: z.string().max(10000),
  headline: z.string().max(10000).min(1),
  description: z.string().max(10000),
  services: z.array(serviceItemSchema).max(500),
});

export const storySchema = z.object({
  sectionLabel: z.string().max(10000),
  headline: z.string().max(10000).min(1),
  accentText: z.string().max(10000),
  statement: z.string().max(10000).min(1),
  paragraphs: z.array(z.string().max(20000)).max(200),
  stats: z.array(z.object({ value: z.string().max(10000), label: z.string() })).max(50),
  quote: z.string().max(10000),
  quoteAttribution: z.string().max(10000),
  imageUrl: safeImageUrl,
  secondaryImageUrl: safeImageUrl.optional(),
});

export const testimonialItemSchema = z.object({
  id: z.string().max(10000).min(1),
  quote: z.string().max(10000).min(1),
  // author required (non-empty) — the append path already rejects empty; the PUT
  // path must match so a blank author can't slip in via a full-section save.
  author: z.string().max(10000).min(1),
  location: z.string().max(10000),
});

export const testimonialsSchema = z.object({
  sectionLabel: z.string().max(10000),
  headline: z.string().max(10000),
  testimonials: z.array(testimonialItemSchema).max(500),
});

export const eventItemSchema = z.object({
  id: z.string().max(10000).min(1),
  title: z.string().max(10000).min(1),
  date: z.string().max(10000),
  time: z.string().max(10000),
  location: z.string().max(10000),
  description: z.string().max(10000),
  hosted_by: z.string().max(10000),
  external_link: safeUrl,
  image_url: safeImageUrl.optional().default(""),
});

export const eventsSchema = z.object({
  sectionLabel: z.string().max(10000),
  headline: z.string().max(10000),
  events: z.array(eventItemSchema).max(500),
});

export const providerItemSchema = z.object({
  id: z.string().max(10000).min(1),
  name: z.string().max(10000).min(1),
  category: z.string().max(10000),
  service: z.string().max(10000),
  why_i_recommend: z.string().max(10000),
  booking_link: safeUrl,
  phone: z.string().max(10000),
  photo_url: safeImageUrl,
});

export const providersSchema = z.object({
  sectionLabel: z.string().max(10000),
  headline: z.string().max(10000),
  description: z.string().max(10000),
  providers: z.array(providerItemSchema).max(200),
});

export const faqItemSchema = z.object({
  id: z.string().max(10000).min(1),
  question: z.string().max(10000).min(1),
  answer: z.string().max(10000).min(1),
});

export const faqSchema = z.object({
  sectionLabel: z.string().max(10000),
  headline: z.string().max(10000),
  description: z.string().max(10000),
  faqs: z.array(faqItemSchema).max(200),
});

export const shopItemSchema = z.object({
  id: z.string().max(10000).min(1),
  name: z.string().max(10000).min(1),
  description: z.string().max(10000),
  category: z.string().max(10000),
  price: z.string().max(10000),
  external_link: safeUrl,
  image_url: safeImageUrl,
});

export const shopSchema = z.object({
  sectionLabel: z.string().max(10000),
  headline: z.string().max(10000),
  description: z.string().max(10000),
  items: z.array(shopItemSchema).max(500),
});

export const contactSchema = z.object({
  headline: z.string().max(10000).optional().default(""),
  description: z.string().max(10000).optional().default(""),
  email: z.string().max(10000).email(),
  phone: z.string().max(10000).optional().default(""),
  address: z.string().max(10000).optional().default(""),
  hours: z.string().max(10000).optional().default(""),
  locationTitle: z.string().max(10000),
  locationDescription: z.string().max(10000),
  instagramUrl: safeUrl,
  facebookUrl: safeUrl,
  googleMapsUrl: safeUrl.optional().default(""),
});

export const productItemSchema = z.object({
  id: z.string().max(10000).min(1),
  name: z.string().max(10000).min(1),
  description: z.string().max(10000),
  ingredients: z.string().max(10000),
  imageUrl: safeImageUrl,
  badge: z.string().max(10000),
  featured: z.boolean(),
  price: z.string().max(10000),
  stripePaymentLink: safeUrl,
  comingSoon: z.boolean(),
});

export const productsSchema = z.object({
  sectionLabel: z.string().max(10000),
  headline: z.string().max(10000).min(1),
  description: z.string().max(10000),
  products: z.array(productItemSchema).max(500),
  bottomNote: z.string().max(10000),
});

export const siteSettingsSchema = z.object({
  siteName: z.string().max(10000).min(1),
  siteTagline: z.string().max(10000),
  siteDescription: z.string().max(10000),
  siteKeywords: z.string().max(10000).optional().default(""),
  ownerName: z.string().max(10000).optional().default(""),
  ownerTitle: z.string().max(10000).optional().default(""),
  footerTagline: z.string().max(10000),
  copyrightText: z.string().max(10000),
  bookingUrl: safeUrl.optional().default(""),
  instagramHandle: z.string().max(10000).optional().default(""),
  vagaro_embed_id: z.string().max(10000).regex(/^[A-Za-z0-9/_-]*$/, "Invalid embed id").optional().default(""),
  logoUrl: safeImageUrl.optional().default(""),
  marqueeText: z.string().max(10000).optional().default(""),
  // Brand Kit: how the AI should sound when it writes/updates the site. Fed into
  // the agent prompt (aboutBlock) so the owner's voice actually shapes output.
  brandVoice: z.string().max(10000).optional().default(""),
});

export const themeSchema = z.object({
  colors: z.object({
    cream: cssColor,
    creamDark: cssColor,
    creamMid: cssColor,
    sage: cssColor,
    sageLight: cssColor,
    sageDark: cssColor,
    bark: cssColor,
    barkLight: cssColor,
    barkFaded: cssColor,
    wheat: cssColor,
    wheatLight: cssColor,
    terra: cssColor,
    terraLight: cssColor,
  }),
  fontDisplay: cssFont,
  fontBody: cssFont,
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const bookingConfigSchema = z.object({
  timezone: z.string().max(64),
  weeklySchedule: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        start: z.string().max(10000).regex(HHMM, "Invalid time"),
        end: z.string().max(10000).regex(HHMM, "Invalid time"),
        enabled: z.boolean(),
      })
    )
    .max(14),
  slotDuration: z.number().int().min(1).max(1440),
  bufferTime: z.number().int().min(0).max(1440),
  bookingLeadTime: z.number().int().min(0).max(525600),
  maxAdvanceBooking: z.number().int().min(0).max(525600),
  requirePayment: z.boolean(),
});

export const rewardsConfigSchema = z.object({
  starsPerBag: z.number(),
  starsToRedeem: z.number(),
  redemptionValue: z.number(),
  newsletterBonus: z.number(),
  subscriptionBonus: z.number(),
  tierThresholdSuper: z.number(),
});

// Every href is safeUrl-validated so a `javascript:`/`data:` scheme can't be
// stored and rendered into an <a href> on the client's public site (stored XSS).
export const navMenuItemSchema = z.object({
  label: z.string().max(10000),
  href: safeUrl,
});

export const navigationSchema = z.object({
  menuItems: z.array(navMenuItemSchema).max(50),
  ctaLabel: z.string().max(10000),
  ctaHref: safeUrl,
});

export const footerColumnLinkSchema = z.object({
  label: z.string().max(10000),
  href: safeUrl,
});

export const footerColumnSchema = z.object({
  heading: z.string().max(10000),
  links: z.array(footerColumnLinkSchema),
});

export const footerSchema = z.object({
  tagline: z.string().max(10000),
  columns: z.array(footerColumnSchema),
  socialLinks: z.array(z.object({ label: z.string().max(10000), href: safeUrl })),
  copyrightText: z.string().max(10000),
});

export const seoMetaSchema = z.object({
  title: z.string().max(10000).optional(),
  description: z.string().max(10000).optional(),
  ogImage: z.string().max(10000).optional(),
});

export const pageSectionConfigBaseSchema = z.object({
  type: z.string().max(10000),
  visible: z.boolean(),
  order: z.number(),
  props: z.record(z.string().max(10000), z.unknown()).optional(),
  variant: z.string().max(10000).optional(),
  layout: z.object({
    gap: z.enum(["tight", "normal", "loose"]).optional(),
    padding: z.enum(["none", "normal", "spacious"]).optional(),
  }).optional(),
});

export const pageSectionConfigSchema = pageSectionConfigBaseSchema.extend({
  responsive: z.object({
    mobile: pageSectionConfigBaseSchema.partial().optional(),
    tablet: pageSectionConfigBaseSchema.partial().optional(),
  }).optional(),
});

export const pageConfigSchema = z.object({
  sections: z.array(pageSectionConfigSchema),
  seo: seoMetaSchema.optional(),
});

export const sitePageConfigSchema = z.record(z.string().max(10000), pageConfigSchema);

export const designTokenScopeSchema = z.enum([
  "colors",
  "fonts",
  "buttons",
  "spacing",
  "radius",
  "motion",
  "imagery",
]);

export const sectionCapabilitySchema = z.object({
  variants: z.array(z.string().max(10000)),
  editableFields: z.array(z.string().max(10000)),
  styleProps: z.array(z.string().max(10000)),
  allowedActions: z.array(z.enum(["read", "draft", "publish", "request_custom"])).optional(),
});

export const customComponentCapabilitySchema = z.object({
  id: z.string().max(10000),
  label: z.string().max(10000),
  description: z.string().max(10000).optional(),
  adminOnly: z.boolean(),
  exposure: z.enum(["inline", "custom_request"]).optional(),
  supportedProps: z.array(z.string().max(10000)).optional(),
  requestableChanges: z.array(z.string().max(10000)).optional(),
});

export const siteCapabilityManifestSchema = z.object({
  contractVersion: z.string().max(10000),
  sections: z.record(z.string().max(10000), sectionCapabilitySchema),
  designTokens: z.array(designTokenScopeSchema),
  supportsPageConfig: z.boolean(),
  supportsNavigationConfig: z.boolean(),
  supportsFooterConfig: z.boolean(),
  supportsDraftPreview: z.boolean(),
  supportsInlineEditing: z.boolean(),
  customOnlyFeatures: z.array(z.string().max(10000)),
  customRequestEndpoint: z.string().max(10000).optional(),
  customComponents: z.array(customComponentCapabilitySchema),
});

export const sectionSchemas: Record<ContentSection, z.ZodType> = {
  hero: heroSchema,
  services: servicesSchema,
  story: storySchema,
  testimonials: testimonialsSchema,
  events: eventsSchema,
  providers: providersSchema,
  contact: contactSchema,
  settings: siteSettingsSchema,
  faq: faqSchema,
  shop: shopSchema,
  products: productsSchema,
  theme: themeSchema,
  rewardsConfig: rewardsConfigSchema,
  navigation: navigationSchema,
  footer: footerSchema,
};
