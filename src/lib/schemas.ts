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
  services: z.array(serviceItemSchema),
});

export const storySchema = z.object({
  sectionLabel: z.string(),
  headline: z.string().min(1),
  accentText: z.string(),
  statement: z.string().min(1),
  paragraphs: z.array(z.string()),
  stats: z.array(z.object({ value: z.string(), label: z.string() })),
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
  testimonials: z.array(testimonialItemSchema),
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
  events: z.array(eventItemSchema),
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
  providers: z.array(providerItemSchema),
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
  faqs: z.array(faqItemSchema),
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
  items: z.array(shopItemSchema),
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
  products: z.array(productItemSchema),
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
  vagaro_embed_id: z.string().optional().default(""),
  logoUrl: safeImageUrl.optional().default(""),
  marqueeText: z.string().optional().default(""),
});

export const themeSchema = z.object({
  colors: z.object({
    cream: z.string(),
    creamDark: z.string(),
    creamMid: z.string(),
    sage: z.string(),
    sageLight: z.string(),
    sageDark: z.string(),
    bark: z.string(),
    barkLight: z.string(),
    barkFaded: z.string(),
    wheat: z.string(),
    wheatLight: z.string(),
    terra: z.string(),
    terraLight: z.string(),
  }),
  fontDisplay: z.string(),
  fontBody: z.string(),
});

export const rewardsConfigSchema = z.object({
  starsPerBag: z.number(),
  starsToRedeem: z.number(),
  redemptionValue: z.number(),
  newsletterBonus: z.number(),
  subscriptionBonus: z.number(),
  tierThresholdSuper: z.number(),
});

export const navMenuItemSchema = z.object({
  label: z.string(),
  href: z.string(),
});

export const navigationSchema = z.object({
  menuItems: z.array(navMenuItemSchema),
  ctaLabel: z.string(),
  ctaHref: z.string(),
});

export const footerColumnLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

export const footerColumnSchema = z.object({
  heading: z.string(),
  links: z.array(footerColumnLinkSchema),
});

export const footerSchema = z.object({
  tagline: z.string(),
  columns: z.array(footerColumnSchema),
  socialLinks: z.array(z.object({ label: z.string(), href: z.string() })),
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
