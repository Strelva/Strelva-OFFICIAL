export interface HeroContent {
  headline: string;
  subheadline: string;
  tagline: string;
  ctaText: string;
  ctaLink: string;
  backgroundImageUrl: string;
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
  hosted_by: "owner" | "partner" | "community";
  external_link: string;
}

export interface EventsContent {
  sectionLabel: string;
  headline: string;
  events: EventItem[];
}

export interface ProviderItem {
  id: string;
  name: string;
  category: "massage" | "chiropractic" | "yoga" | "fitness" | "specialty";
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
  category: "recommended" | "merch" | "tools";
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
  phone: string;
  address: string;
  hours: string;
  locationTitle: string;
  locationDescription: string;
  instagramUrl: string;
  facebookUrl: string;
  googleMapsUrl: string;
}

export interface SiteSettings {
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  siteKeywords: string;
  ownerName: string;
  ownerTitle: string;
  footerTagline: string;
  copyrightText: string;
  bookingUrl: string;
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
  | "shop";

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
};

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

// --- Tenant Types ---

export interface TenantConfig {
  id: string;
  subdomain: string;
  siteName: string;
  ownerName: string;
  industry: string;
  active: boolean;
  createdAt: string;
}
