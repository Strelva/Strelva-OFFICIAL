import type { ContentMap } from "./types";
import { defaultFaq, defaultShop, defaultTheme, defaultRewardsConfig, defaultNavigation, defaultFooter } from "./defaults";

export const gldfContentDefaults: ContentMap = {
  hero: {
    headline: "Great Lakes\nDried Fruit",
    subheadline: "NYS Grown & Certified",
    tagline:
      "Dried apple snaps with 2 natural ingredients. No preservatives, no sulfates, no added sugar.",
    ctaText: "See Our Products",
    ctaLink: "#products",
    backgroundImageUrl: "",
    logoUrl: "/images/logo.webp",
  },
  services: {
    sectionLabel: "Services",
    headline: "Wholesale & Events",
    description: "Retail-ready dried fruit for farm markets, cafes, gift boxes, and community events.",
    services: [],
  },
  story: {
    sectionLabel: "Our Story",
    headline: "Responsible.\nSustainable.",
    accentText: "Clarence, New York",
    statement:
      "NYS-grown apple snacks made with simple natural ingredients.",
    paragraphs: [
      "Great Lakes Dried Fruit makes shelf-stable Apple Snaps from New York State apples.",
      "Product copy should stay focused on verified ingredients, New York sourcing, and direct contact details until a fuller founder story is approved.",
    ],
    stats: [
      { value: "100%", label: "NYS-Sourced" },
      { value: "0", label: "Preservatives" },
    ],
    quote: "No preservatives. No sulfates. No added sugar.",
    quoteAttribution: "Great Lakes Dried Fruit",
    imageUrl: "",
    secondaryImageUrl: "",
  },
  testimonials: {
    sectionLabel: "Testimonials",
    headline: "What People Are Saying",
    testimonials: [],
  },
  events: {
    sectionLabel: "Events",
    headline: "Find Us Around Western New York",
    events: [],
  },
  providers: {
    sectionLabel: "Partners",
    headline: "Stockists & Partners",
    description: "Local partners carrying or featuring Great Lakes Dried Fruit.",
    providers: [],
  },
  contact: {
    email: "amy@greatlakesdriedfruit.com",
    phone: "",
    address: "Western New York",
    hours: "",
    locationTitle: "Western\nNew York",
    locationDescription:
      "NYS-grown dried apple snaps. School partnerships, nutrition education, local traceability.",
    instagramUrl: "",
    facebookUrl: "",
    googleMapsUrl: "",
  },
  settings: {
    siteName: "Great Lakes Dried Fruit",
    siteTagline: "Dried Apple Snaps - 2 Natural Ingredients",
    siteDescription:
      "NYS-grown dried apple snaps. No preservatives, no sulfates, no added sugar. Shelf-stable, 12 allergen free.",
    siteKeywords:
      "dried apples, apple snacks, New York apples, no added sugar snacks, dried fruit, Great Lakes Dried Fruit",
    ownerName: "Great Lakes Dried Fruit",
    ownerTitle: "Small-batch snack maker",
    logoUrl: "/images/logo.webp",
    footerTagline: "NYS Grown & Certified. 2 natural ingredients.",
    copyrightText: "Great Lakes Dried Fruit",
    bookingUrl: "#products",
    instagramHandle: "",
    vagaro_embed_id: "",
    marqueeText: "NYS GROWN - NO PRESERVATIVES - NO ADDED SUGAR - NO SULFATES - 12 ALLERGEN FREE -",
  },
  faq: {
    ...defaultFaq,
    headline: "Snack Questions",
    description: "What to know about Apple Snaps.",
    faqs: [
      {
        id: "ingredients",
        question: "What is in Apple Snaps?",
        answer: "Just apples and cinnamon. There is no added sugar, no sulfites, and no preservatives.",
      },
      {
        id: "source",
        question: "Where are the apples from?",
        answer: "We use New York apples and keep sourcing focused on Great Lakes orchard country whenever possible.",
      },
      {
        id: "wholesale",
        question: "Do you offer wholesale?",
        answer: "Yes. Contact us for retail, cafe, farm market, gift box, and event opportunities.",
      },
    ],
  },
  shop: defaultShop,
  products: {
    sectionLabel: "Products",
    headline: "What We Make",
    description:
      "New York apples, slow-dried. Two or three natural ingredients per bag. No preservatives, no sulfates, no added sugar.",
    products: [
      {
        id: "cinnamon-sweet",
        name: "Apple Snaps with Cinnamon",
        description:
          "NYS sweet apples, slow-dried with real cinnamon. Two ingredients, nothing else.",
        ingredients: "Dried Apples, Cinnamon",
        imageUrl: "/images/kraft-bag.png",
        badge: "SWEET",
        featured: true,
        price: "5.99",
        stripePaymentLink: "",
        comingSoon: false,
      },
      {
        id: "cinnamon-tart",
        name: "Tart Apple Snaps with Cinnamon",
        description:
          "NYS tart apples with a sharper bite, slow-dried with real cinnamon. Two ingredients.",
        ingredients: "Dried Tart Apples, Cinnamon",
        imageUrl: "/images/product-bag.jpg",
        badge: "TART",
        featured: false,
        price: "5.99",
        stripePaymentLink: "",
        comingSoon: false,
      },
      {
        id: "maple-sweet",
        name: "Apple Snaps with Maple Syrup",
        description:
          "NYS sweet apples glazed with real maple syrup before drying. Three natural ingredients.",
        ingredients: "Dried Apples, Maple Syrup, Cinnamon",
        imageUrl: "/images/product-bag-lifestyle.jpg",
        badge: "SWEET",
        featured: false,
        price: "5.99",
        stripePaymentLink: "",
        comingSoon: false,
      },
      {
        id: "maple-tart",
        name: "Tart Apple Snaps with Maple Syrup",
        description:
          "NYS tart apples with real maple syrup and cinnamon. Three natural ingredients.",
        ingredients: "Dried Tart Apples, Maple Syrup, Cinnamon",
        imageUrl: "/images/product.jpg",
        badge: "TART",
        featured: false,
        price: "5.99",
        stripePaymentLink: "",
        comingSoon: false,
      },
    ],
    bottomNote: "",
  },
  theme: defaultTheme,
  rewardsConfig: defaultRewardsConfig,
  navigation: {
    ...defaultNavigation,
    menuItems: [
      { label: "Shop", href: "#products" },
      { label: "Why Us", href: "#comparison" },
      { label: "Contact", href: "#contact" },
    ],
    ctaLabel: "",
    ctaHref: "",
  },
  footer: {
    ...defaultFooter,
    tagline: "NYS Grown & Certified. 2 natural ingredients.",
    columns: [
      {
        heading: "Navigate",
        links: [
          { label: "Products", href: "#products" },
          { label: "Why Us", href: "#comparison" },
        ],
      },
      {
        heading: "Connect",
        links: [{ label: "amy@greatlakesdriedfruit.com", href: "mailto:amy@greatlakesdriedfruit.com" }],
      },
    ],
    socialLinks: [],
    copyrightText: "Great Lakes Dried Fruit",
  },
};
