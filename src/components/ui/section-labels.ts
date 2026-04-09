import {
  Sparkles,
  Layers,
  BookOpen,
  Star,
  Calendar,
  Users,
  Phone,
  Settings,
  Instagram,
  CalendarCheck,
  ShoppingBag,
  BarChart3,
  Mail,
  Type,
  Bell,
  Megaphone,
  HelpCircle,
  Palette,
  Gift,
  Menu,
  PanelBottom,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for section display names.
 * Customer-friendly language — not developer names.
 */
export const SECTION_LABELS: Record<string, string> = {
  hero: "First Impression",
  services: "What You Offer",
  story: "About You",
  testimonials: "What Customers Say",
  events: "Upcoming Events",
  providers: "Your Network",
  contact: "How to Reach You",
  settings: "Site Settings",
  faq: "Common Questions",
  shop: "Your Shop",
  "trust-strip": "Trust Strip",
  "testimonial-quote": "Featured Quote",
  cta: "Call to Action",
  "page-header": "Page Header",
  "booking-widget": "Booking Widget",
  "instagram-feed": "Instagram Feed",
  "vagaro-booking": "Vagaro Booking",
  products: "Your Products",
  comparison: "Why You're Different",
  notify: "Email Signup",
  "email-popup": "Email Popup",
  "typographic-break": "Divider",
  newsletter: "Newsletter",
  theme: "Brand Theme",
  rewardsConfig: "Rewards",
  navigation: "Navigation",
  footer: "Footer",
};

/**
 * Icons for each section type.
 */
export const SECTION_ICONS: Record<string, LucideIcon> = {
  hero: Sparkles,
  services: Layers,
  story: BookOpen,
  testimonials: Star,
  events: Calendar,
  providers: Users,
  contact: Phone,
  settings: Settings,
  faq: HelpCircle,
  shop: ShoppingBag,
  "trust-strip": Sparkles,
  "testimonial-quote": Star,
  cta: Sparkles,
  "page-header": BookOpen,
  "booking-widget": Calendar,
  "instagram-feed": Instagram,
  "vagaro-booking": CalendarCheck,
  products: ShoppingBag,
  comparison: BarChart3,
  notify: Bell,
  "email-popup": Mail,
  "typographic-break": Type,
  newsletter: Megaphone,
  theme: Palette,
  rewardsConfig: Gift,
  navigation: Menu,
  footer: PanelBottom,
};

/**
 * Composite/layout sections that clients don't directly edit.
 * These pull content from other sections on the public site.
 */
export const COMPOSITE_SECTIONS = new Set([
  "trust-strip",
  "testimonial-quote",
  "cta",
  "page-header",
  "booking-widget",
  "instagram-feed",
  "vagaro-booking",
  "newsletter",
  "typographic-break",
  "email-popup",
]);

/**
 * All available section types for the add-section menu.
 */
export const ALL_SECTION_TYPES = [
  "hero", "services", "story", "testimonials", "events", "providers",
  "contact", "faq", "shop", "trust-strip", "testimonial-quote",
  "cta", "page-header", "booking-widget", "instagram-feed", "vagaro-booking",
  "products", "comparison", "notify", "email-popup", "typographic-break", "newsletter",
];
