import type {
  HeroContent,
  ServicesContent,
  StoryContent,
  TestimonialsContent,
  EventsContent,
  ProvidersContent,
  ContactContent,
  SiteSettings,
  FaqContent,
  ShopContent,
  ProductsContent,
  ThemeContent,
  RewardsConfigContent,
  NavigationContent,
  FooterContent,
  ContentMap,
} from "./types";

export const defaultHero: HeroContent = {
  headline: "Move Better.\nFeel Better.\nLive Better.",
  subheadline: "Your business, in one place",
  tagline: "Tell visitors what you do and how to book. The AI keeps this up to date.",
  ctaText: "Book a Session",
  ctaLink: "",
  backgroundImageUrl: "",
};

export const defaultServices: ServicesContent = {
  sectionLabel: "Services",
  headline: "What We Offer",
  description:
    "Describe your offerings here. Each service has a name, price, duration, and booking link.",
  services: [],
};

export const defaultStory: StoryContent = {
  sectionLabel: "About",
  headline: "Your story\ngoes here.",
  accentText: "Owner, founder, your role",
  statement:
    "A short opening line that tells visitors what you stand for.",
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
  description:
    "Practitioners I trust and recommend for complementary care.",
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
    {
      heading: "Navigate",
      links: [],
    },
    {
      heading: "Connect",
      links: [],
    },
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
