/**
 * Shared Content Types for Strelva Client Sites
 *
 * This file defines the canonical content schemas used by Strelva and client sites.
 * Client sites should either:
 * 1. Copy this file to their src/lib/shared-types.ts
 * 2. Import from a published @reb/types package (when available)
 *
 * When updating these types, ensure backwards compatibility or coordinate
 * updates across all client sites to prevent runtime errors.
 *
 * Last synced: 2026-04-28
 */

// =============================================================================
// Core Content Types (shared across all client sites)
// =============================================================================

export interface HeroContent {
  headline: string;
  subheadline: string;
  tagline: string;
  ctaText: string;
  ctaLink: string;
  backgroundImageUrl: string;
  logoUrl?: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  duration: string;
  price: string;
  featured: boolean;
  who_its_for: string;
  booking_link: string;
  comingSoon: boolean;
  image_url: string;
}

export interface ServicesContent {
  sectionLabel: string;
  headline: string;
  description: string;
  services: ServiceItem[];
}

export interface StoryContent {
  sectionLabel: string;
  headline: string;
  accentText: string;
  statement: string;
  paragraphs: string[];
  stats: Array<{ value: string; label: string }>;
  quote: string;
  quoteAttribution: string;
  imageUrl: string;
  secondaryImageUrl?: string;
}

export interface TestimonialItem {
  id: string;
  quote: string;
  author: string;
  location: string;
}

export interface TestimonialsContent {
  sectionLabel: string;
  headline: string;
  testimonials: TestimonialItem[];
}

export interface EventItem {
  id: string;
  title: string;
  date: string; // ISO date
  time: string;
  location: string;
  description: string;
  hosted_by: string; // Use string for flexibility; client sites may narrow to union
  external_link: string;
  image_url: string;
}

export interface EventsContent {
  sectionLabel: string;
  headline: string;
  events: EventItem[];
}

export interface ProviderItem {
  id: string;
  name: string;
  category: string; // Use string for flexibility; client sites may narrow to union
  service: string;
  why_i_recommend: string;
  booking_link: string;
  phone: string;
  photo_url: string;
}

export interface ProvidersContent {
  sectionLabel: string;
  headline: string;
  description: string;
  providers: ProviderItem[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqContent {
  sectionLabel: string;
  headline: string;
  description: string;
  faqs: FaqItem[];
}

export interface ContactContent {
  email: string;
  phone?: string;
  address?: string;
  hours?: string;
  locationTitle: string;
  locationDescription: string;
  instagramUrl: string;
  facebookUrl: string;
  googleMapsUrl?: string;
}

export interface SiteSettings {
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  siteKeywords?: string;
  ownerName?: string;
  ownerTitle?: string;
  footerTagline: string;
  copyrightText: string;
  bookingUrl?: string;
  instagramHandle?: string;
  vagaro_embed_id?: string;
  logoUrl?: string;
  marqueeText?: string;
}

// =============================================================================
// Core ContentSection and ContentMap
// These are the minimal sections every client site should support.
// =============================================================================

export type CoreContentSection =
  | "hero"
  | "services"
  | "story"
  | "testimonials"
  | "events"
  | "providers"
  | "contact"
  | "settings"
  | "faq";

export type CoreContentMap = {
  hero: HeroContent;
  services: ServicesContent;
  story: StoryContent;
  testimonials: TestimonialsContent;
  events: EventsContent;
  providers: ProvidersContent;
  contact: ContactContent;
  settings: SiteSettings;
  faq: FaqContent;
};

// =============================================================================
// Extended Types (Strelva platform features, may not be needed by all client sites)
// =============================================================================

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: string;
  external_link: string;
  image_url: string;
}

export interface ShopContent {
  sectionLabel: string;
  headline: string;
  description: string;
  items: ShopItem[];
}

export interface ProductItem {
  id: string;
  name: string;
  description: string;
  ingredients: string;
  imageUrl: string;
  badge: string;
  featured: boolean;
  price: string;
  stripePaymentLink: string;
  comingSoon: boolean;
}

export interface ProductsContent {
  sectionLabel: string;
  headline: string;
  description: string;
  products: ProductItem[];
  bottomNote: string;
}

export interface RewardsConfigContent {
  starsPerBag: number;
  starsToRedeem: number;
  redemptionValue: number;
  newsletterBonus: number;
  subscriptionBonus: number;
  tierThresholdSuper: number;
}

export interface NavMenuItem {
  label: string;
  href: string;
}

export interface NavigationContent {
  menuItems: NavMenuItem[];
  ctaLabel: string;
  ctaHref: string;
}

export interface FooterColumnLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: FooterColumnLink[];
}

export interface FooterContent {
  tagline: string;
  columns: FooterColumn[];
  socialLinks: { label: string; href: string }[];
  copyrightText: string;
}

export interface ThemeContent {
  colors: {
    cream: string;
    creamDark: string;
    creamMid: string;
    sage: string;
    sageLight: string;
    sageDark: string;
    bark: string;
    barkLight: string;
    barkFaded: string;
    wheat: string;
    wheatLight: string;
    terra: string;
    terraLight: string;
  };
  fontDisplay: string;
  fontBody: string;
}

// =============================================================================
// Full ContentSection and ContentMap (Strelva platform)
// =============================================================================

export type ContentSection =
  | "hero"
  | "services"
  | "story"
  | "testimonials"
  | "events"
  | "providers"
  | "contact"
  | "settings"
  | "faq"
  | "shop"
  | "products"
  | "theme"
  | "rewardsConfig"
  | "navigation"
  | "footer";

export type ContentMap = {
  hero: HeroContent;
  services: ServicesContent;
  story: StoryContent;
  testimonials: TestimonialsContent;
  events: EventsContent;
  providers: ProvidersContent;
  contact: ContactContent;
  settings: SiteSettings;
  faq: FaqContent;
  shop: ShopContent;
  products: ProductsContent;
  theme: ThemeContent;
  rewardsConfig: RewardsConfigContent;
  navigation: NavigationContent;
  footer: FooterContent;
};
