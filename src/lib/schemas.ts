import { z } from "zod";
import type { ContentSection } from "./types";

export const heroSchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string(),
  tagline: z.string(),
  ctaText: z.string().min(1),
  ctaLink: z.string(),
  backgroundImageUrl: z.string(),
});

export const serviceItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  duration: z.string(),
  price: z.string(),
  featured: z.boolean(),
  who_its_for: z.string(),
  vagaro_link: z.string(),
  comingSoon: z.boolean(),
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
  imageUrl: z.string(),
  secondaryImageUrl: z.string(),
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
  hosted_by: z.enum(["chelsea", "partner", "community"]),
  external_link: z.string(),
});

export const eventsSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string(),
  events: z.array(eventItemSchema),
});

export const providerItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["massage", "chiropractic", "yoga", "fitness", "specialty"]),
  service: z.string(),
  why_i_recommend: z.string(),
  booking_link: z.string(),
  phone: z.string(),
  photo_url: z.string(),
});

export const providersSchema = z.object({
  sectionLabel: z.string(),
  headline: z.string(),
  description: z.string(),
  providers: z.array(providerItemSchema),
});

export const contactSchema = z.object({
  email: z.string().email(),
  phone: z.string(),
  address: z.string(),
  hours: z.string(),
  locationTitle: z.string(),
  locationDescription: z.string(),
  instagramUrl: z.string(),
  facebookUrl: z.string(),
  googleMapsUrl: z.string(),
});

export const siteSettingsSchema = z.object({
  siteName: z.string().min(1),
  siteTagline: z.string(),
  siteDescription: z.string(),
  footerTagline: z.string(),
  copyrightText: z.string(),
  vagaroUrl: z.string(),
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
};
