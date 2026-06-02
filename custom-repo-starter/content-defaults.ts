/**
 * Content fallback defaults for custom repos.
 *
 * Every custom repo should import these defaults so the site renders
 * meaningful placeholder content when Scaffold Web is unreachable.
 * Each section matches the ContentMap shape from src/lib/types.ts.
 *
 * Usage:
 *   import { defaults, defaultHero, defaultServices } from "./content-defaults";
 *   const hero = await fetchScaffoldContent("hero", defaultHero);
 */

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

export interface TestimonialsContent {
  sectionLabel: string;
  headline: string;
  testimonials: Array<{ id: string; quote: string; author: string; location: string }>;
}

export interface EventsContent {
  sectionLabel: string;
  headline: string;
  events: Array<{
    id: string;
    title: string;
    date: string;
    time: string;
    location: string;
    description: string;
    hosted_by: string;
    external_link: string;
    image_url: string;
  }>;
}

export interface ProvidersContent {
  sectionLabel: string;
  headline: string;
  description: string;
  providers: Array<{
    id: string;
    name: string;
    category: string;
    service: string;
    why_i_recommend: string;
    booking_link: string;
    phone: string;
    photo_url: string;
  }>;
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

export interface FaqContent {
  sectionLabel: string;
  headline: string;
  description: string;
  faqs: Array<{ id: string; question: string; answer: string }>;
}

export interface ShopContent {
  sectionLabel: string;
  headline: string;
  description: string;
  items: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    price: string;
    external_link: string;
    image_url: string;
  }>;
}

export interface ProductsContent {
  sectionLabel: string;
  headline: string;
  description: string;
  products: Array<{
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
  }>;
  bottomNote: string;
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

export interface RewardsConfigContent {
  starsPerBag: number;
  starsToRedeem: number;
  redemptionValue: number;
  newsletterBonus: number;
  subscriptionBonus: number;
  tierThresholdSuper: number;
}

export interface NavigationContent {
  menuItems: Array<{ label: string; href: string }>;
  ctaLabel: string;
  ctaHref: string;
}

export interface FooterContent {
  tagline: string;
  columns: Array<{
    heading: string;
    links: Array<{ label: string; href: string }>;
  }>;
  socialLinks: Array<{ label: string; href: string }>;
  copyrightText: string;
}

export interface ContentMap {
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
}

// ---------------------------------------------------------------------------
// Default values per section
// ---------------------------------------------------------------------------

export const defaultHero: HeroContent = {
  headline: "Welcome to\nYour Business.",
  subheadline: "Your business, in one place",
  tagline: "Tell visitors what you do and how to book.",
  ctaText: "Book Now",
  ctaLink: "",
  backgroundImageUrl: "",
};

export const defaultServices: ServicesContent = {
  sectionLabel: "Services",
  headline: "What We Offer",
  description: "Describe your offerings here.",
  services: [],
};

export const defaultStory: StoryContent = {
  sectionLabel: "About",
  headline: "Our Story",
  accentText: "Owner, founder",
  statement: "A short opening line that tells visitors what you stand for.",
  paragraphs: [
    "Tell your story. Why did you start this? Who do you serve?",
    "Add another paragraph about your approach and what makes you different.",
  ],
  stats: [],
  quote: "",
  quoteAttribution: "",
  imageUrl: "",
};

export const defaultTestimonials: TestimonialsContent = {
  sectionLabel: "Testimonials",
  headline: "What Clients Are Saying",
  testimonials: [],
};

export const defaultEvents: EventsContent = {
  sectionLabel: "Events",
  headline: "Upcoming Events",
  events: [],
};

export const defaultProviders: ProvidersContent = {
  sectionLabel: "Trusted Providers",
  headline: "My Network",
  description: "Practitioners I trust and recommend.",
  providers: [],
};

export const defaultContact: ContactContent = {
  email: "",
  phone: "",
  address: "",
  hours: "",
  locationTitle: "",
  locationDescription: "",
  instagramUrl: "",
  facebookUrl: "",
  googleMapsUrl: "",
};

export const defaultSettings: SiteSettings = {
  siteName: "Your Business",
  siteTagline: "",
  siteDescription: "",
  siteKeywords: "",
  ownerName: "",
  ownerTitle: "",
  footerTagline: "",
  copyrightText: "Your Business",
  bookingUrl: "",
  instagramHandle: "",
  vagaro_embed_id: "",
};

export const defaultFaq: FaqContent = {
  sectionLabel: "FAQ",
  headline: "Frequently Asked Questions",
  description: "Common questions and what visitors should know.",
  faqs: [],
};

export const defaultShop: ShopContent = {
  sectionLabel: "Shop",
  headline: "Picks",
  description: "Products and tools we recommend.",
  items: [],
};

export const defaultProducts: ProductsContent = {
  sectionLabel: "Products",
  headline: "What We Make",
  description: "A short intro to your products.",
  products: [],
  bottomNote: "",
};

export const defaultTheme: ThemeContent = {
  colors: {
    cream: "#faf8f5",
    creamDark: "#f0ece5",
    creamMid: "#e8e2d8",
    sage: "#5a260c",
    sageLight: "#7a3a18",
    sageDark: "#3d1a08",
    bark: "#2c2418",
    barkLight: "#5a4d3e",
    barkFaded: "#8a7d6e",
    wheat: "#c8a96e",
    wheatLight: "#dcc08a",
    terra: "#b5634b",
    terraLight: "#c97a64",
  },
  fontDisplay: "Instrument_Serif",
  fontBody: "Inter",
};

export const defaultRewardsConfig: RewardsConfigContent = {
  starsPerBag: 100,
  starsToRedeem: 100,
  redemptionValue: 5,
  newsletterBonus: 50,
  subscriptionBonus: 30,
  tierThresholdSuper: 500,
};

export const defaultNavigation: NavigationContent = {
  menuItems: [
    { label: "Services", href: "#services" },
    { label: "About", href: "#story" },
    { label: "Contact", href: "#contact" },
  ],
  ctaLabel: "",
  ctaHref: "",
};

export const defaultFooter: FooterContent = {
  tagline: "",
  columns: [
    { heading: "Navigate", links: [] },
    { heading: "Connect", links: [] },
  ],
  socialLinks: [],
  copyrightText: "",
};

export const defaults: ContentMap = {
  hero: defaultHero,
  services: defaultServices,
  story: defaultStory,
  testimonials: defaultTestimonials,
  events: defaultEvents,
  providers: defaultProviders,
  contact: defaultContact,
  settings: defaultSettings,
  faq: defaultFaq,
  shop: defaultShop,
  products: defaultProducts,
  theme: defaultTheme,
  rewardsConfig: defaultRewardsConfig,
  navigation: defaultNavigation,
  footer: defaultFooter,
};
