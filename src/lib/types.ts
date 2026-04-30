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
  hosted_by: string;
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
  category: string;
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

// --- Page Config Types ---

export interface PageSectionConfig {
  type: string;
  visible: boolean;
  order: number;
  props?: Record<string, unknown>;
}

export interface SeoMeta {
  title?: string;
  description?: string;
  ogImage?: string;
}

export interface PageConfig {
  sections: PageSectionConfig[];
  seo?: SeoMeta;
}

export type SitePageConfig = Record<string, PageConfig>;

// --- Review Types ---

export interface ReviewItem {
  id: string;
  source: "google" | "yelp" | "manual";
  author: string;
  rating: number;
  text: string;
  date: string;
  reply?: string;
  repliedAt?: string;
}

// --- Booking Types ---

export interface BookingConfig {
  timezone: string;
  weeklySchedule: WeeklySlot[];
  slotDuration: number;
  bufferTime: number;
  bookingLeadTime: number;
  maxAdvanceBooking: number;
  requirePayment: boolean;
}

export interface WeeklySlot {
  day: number;
  start: string;
  end: string;
  enabled: boolean;
}

export interface DateOverride {
  date: string;
  available: boolean;
  start?: string;
  end?: string;
  reason?: string;
}

export interface Booking {
  id: string;
  serviceId: string;
  serviceName: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  notes?: string;
  status: "confirmed" | "cancelled" | "completed";
  createdAt: string;
  cancelledAt?: string;
}

// --- Search Console Types ---

export interface SearchQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface SearchData {
  queries: SearchQuery[];
  totalClicks: number;
  totalImpressions: number;
  fetchedAt: string;
}

// --- Template Types ---

// --- Blog Types ---

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  publishedAt: string;
  status: "draft" | "published";
  tags: string[];
}

export type TemplateId = "wellness" | "food-brand" | "restaurant" | "trades" | "professional" | (string & {});

export type TenantFeature = "commerce" | "booking" | "newsletter";

// --- Social Media Types ---

export interface SocialPost {
  id: string;
  platform: "instagram" | "facebook" | "x";
  content: string;
  imageUrl?: string;
  status: "draft" | "scheduled" | "published";
  scheduledFor?: string;
  publishedAt?: string;
  createdAt: string;
}

// --- Tenant Types ---

export interface TenantConfig {
  id: string;
  subdomain: string;
  siteName: string;
  ownerName: string;
  ownerEmail?: string;
  industry: string;
  active: boolean;
  createdAt: string;
  template: TemplateId;
  features?: TenantFeature[];
  customDomains?: string[];
  /** Primary production domain (e.g., "yourbusiness.com") */
  productionDomain?: string;
  /** Admin dashboard domain (e.g., "admin.yourbusiness.com"). Derived from productionDomain if not set. */
  adminDomain?: string;
  stripeCustomerId?: string;
  subscriptionStatus?: "active" | "past_due" | "cancelled" | "none";
  bookingProvider?: string;
  bookingUrl?: string;
  resendDomain?: string;
  siteUrl?: string;
  ownerPhone?: string;
  referredBy?: string;
  /** When false, AI agent writes to drafts instead of publishing directly. Defaults to true. */
  autoPublish?: boolean;
  /** Behold.so feed ID — stable identifier, no token refresh needed. Per-tenant. */
  beholdFeedId?: string;
  /** Social media platform configuration (post-launch integration). */
  socialConfig?: { connectedPlatforms?: string[] };
  /** Review platform IDs (post-launch integration). */
  reviewsConfig?: { googlePlaceId?: string; yelpBusinessId?: string };
  /** Free-text persistent instructions the AI follows on every interaction */
  businessRules?: string;
  /** Tone/voice descriptor for AI responses (e.g. "warm and casual", "professional") */
  personality?: string;
  /** Structured business hours the AI uses to answer questions and update the site */
  businessHours?: BusinessHours;
  /** Client's Slack webhook for AI change notifications */
  slackWebhookUrl?: string;
  /** Client's Twilio config for SMS notifications */
  twilioConfig?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  /** Client's Google Search Console service account key (JSON string) */
  googleSearchConsoleKey?: string;
  /** Client's Instagram access token (if not using Behold.so) */
  instagramAccessToken?: string;
  /** URL to POST to when content changes (e.g., https://clientsite.com/api/revalidate) */
  revalidateUrl?: string;
  /** Per-tenant secret for revalidation webhook auth */
  revalidationSecret?: string;
}

export interface BusinessHoursDay {
  day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  open: string; // "09:00"
  close: string; // "17:00"
  closed: boolean;
}

export interface BusinessHoliday {
  date: string; // ISO date
  label: string;
}

export interface BusinessHours {
  schedule: BusinessHoursDay[];
  holidays?: BusinessHoliday[];
  timezone?: string;
}
