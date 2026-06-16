import { z } from "zod";
import type { ContentSection } from "./types";

const SAFE_URL_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

const safeUrl = z.string().refine(
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

const safeImageUrl = z.string().refine(
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
  headline: z.string().min(1),
  subheadline: z.string(),
  tagline: z.string(),
  ctaText: z.string().min(1),
  ctaLink: safeUrl,
  backgroundImageUrl: safeImageUrl,
  logoUrl: safeImageUrl.optional(),
});

export const serviceItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  duration: z.string(),
  price: z.string(),
  featured: z.boolean(),
  who_its_for: z.string(),
  booking_link: safeUrl,
  comingSoon: z.boolean(),
  image_url: safeImageUrl.optional().default(""),
});

export const servicesSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string().min(1),
  description: z.string(),
  services: z.array(serviceItemSchema).max(500),
});

export const storySchema = z.object({
  sectionLabel: z.string(),
  headline: z.string().min(1),
  accentText: z.string(),
  statement: z.string().min(1),
  paragraphs: z.array(z.string().max(20000)).max(200),
  stats: z.array(z.object({ value: z.string(), label: z.string() })).max(50),
  quote: z.string(),
  quoteAttribution: z.string(),
  imageUrl: safeImageUrl,
  secondaryImageUrl: safeImageUrl.optional(),
});

export const testimonialItemSchema = z.object({
  id: z.string().min(1),
  quote: z.string().min(1),
  author: z.string(),
  location: z.string(),
});

export const testimonialsSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string(),
  testimonials: z.array(testimonialItemSchema).max(500),
});

export const eventItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  date: z.string(),
  time: z.string(),
  location: z.string(),
  description: z.string(),
  hosted_by: z.string(),
  external_link: safeUrl,
  image_url: safeImageUrl.optional().default(""),
});

export const eventsSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string(),
  events: z.array(eventItemSchema).max(500),
});

export const providerItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string(),
  service: z.string(),
  why_i_recommend: z.string(),
  booking_link: safeUrl,
  phone: z.string(),
  photo_url: safeImageUrl,
});

export const providersSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string(),
  description: z.string(),
  providers: z.array(providerItemSchema).max(200),
});

export const faqItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const faqSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string(),
  description: z.string(),
  faqs: z.array(faqItemSchema).max(200),
});

export const shopItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: z.string(),
  price: z.string(),
  external_link: safeUrl,
  image_url: safeImageUrl,
});

export const shopSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string(),
  description: z.string(),
  items: z.array(shopItemSchema).max(500),
});

export const contactSchema = z.object({
  headline: z.string().optional().default(""),
  description: z.string().optional().default(""),
  email: z.string().email(),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  hours: z.string().optional().default(""),
  locationTitle: z.string(),
  locationDescription: z.string(),
  instagramUrl: safeUrl,
  facebookUrl: safeUrl,
  googleMapsUrl: safeUrl.optional().default(""),
});

export const productItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  ingredients: z.string(),
  imageUrl: safeImageUrl,
  badge: z.string(),
  featured: z.boolean(),
  price: z.string(),
  stripePaymentLink: safeUrl,
  comingSoon: z.boolean(),
});

export const productsSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string().min(1),
  description: z.string(),
  products: z.array(productItemSchema).max(500),
  bottomNote: z.string(),
});

export const siteSettingsSchema = z.object({
  siteName: z.string().min(1),
  siteTagline: z.string(),
  siteDescription: z.string(),
  siteKeywords: z.string().optional().default(""),
  ownerName: z.string().optional().default(""),
  ownerTitle: z.string().optional().default(""),
  footerTagline: z.string(),
  copyrightText: z.string(),
  bookingUrl: safeUrl.optional().default(""),
  instagramHandle: z.string().optional().default(""),
  vagaro_embed_id: z.string().regex(/^[A-Za-z0-9/_-]*$/, "Invalid embed id").optional().default(""),
  logoUrl: safeImageUrl.optional().default(""),
  marqueeText: z.string().optional().default(""),
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
        start: z.string().regex(HHMM, "Invalid time"),
        end: z.string().regex(HHMM, "Invalid time"),
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
  label: z.string(),
  href: safeUrl,
});

export const navigationSchema = z.object({
  menuItems: z.array(navMenuItemSchema).max(50),
  ctaLabel: z.string(),
  ctaHref: safeUrl,
});

export const footerColumnLinkSchema = z.object({
  label: z.string(),
  href: safeUrl,
});

export const footerColumnSchema = z.object({
  heading: z.string(),
  links: z.array(footerColumnLinkSchema),
});

export const footerSchema = z.object({
  tagline: z.string(),
  columns: z.array(footerColumnSchema),
  socialLinks: z.array(z.object({ label: z.string(), href: safeUrl })),
  copyrightText: z.string(),
});

export const seoMetaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
});

export const pageSectionConfigBaseSchema = z.object({
  type: z.string(),
  visible: z.boolean(),
  order: z.number(),
  props: z.record(z.string(), z.unknown()).optional(),
  variant: z.string().optional(),
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

export const sitePageConfigSchema = z.record(z.string(), pageConfigSchema);

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
  variants: z.array(z.string()),
  editableFields: z.array(z.string()),
  styleProps: z.array(z.string()),
  allowedActions: z.array(z.enum(["read", "draft", "publish", "request_custom"])).optional(),
});

export const customComponentCapabilitySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  adminOnly: z.boolean(),
  exposure: z.enum(["inline", "custom_request"]).optional(),
  supportedProps: z.array(z.string()).optional(),
  requestableChanges: z.array(z.string()).optional(),
});

export const siteCapabilityManifestSchema = z.object({
  contractVersion: z.string(),
  sections: z.record(z.string(), sectionCapabilitySchema),
  designTokens: z.array(designTokenScopeSchema),
  supportsPageConfig: z.boolean(),
  supportsNavigationConfig: z.boolean(),
  supportsFooterConfig: z.boolean(),
  supportsDraftPreview: z.boolean(),
  supportsInlineEditing: z.boolean(),
  customOnlyFeatures: z.array(z.string()),
  customRequestEndpoint: z.string().optional(),
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
