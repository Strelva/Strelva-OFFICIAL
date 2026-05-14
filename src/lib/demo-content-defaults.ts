import type { ContentMap } from "./types";
import {
  defaultFooter,
  defaultProducts,
  defaultRewardsConfig,
  defaultShop,
  defaultTheme,
} from "./defaults";

export const demoContentDefaults: ContentMap = {
  hero: {
    headline: "Small Studio.\nFull Schedule.",
    subheadline: "Demo Wellness Studio",
    tagline:
      "A fictional local wellness studio used to show how Scaffold Web helps owners see what is working and tell the AI what to change.",
    ctaText: "Book a Class",
    ctaLink: "#services",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=2400&h=1600&fit=crop&q=90",
  },
  services: {
    sectionLabel: "Classes",
    headline: "A weekly rhythm clients can actually keep.",
    description:
      "This demo tenant shows real service copy, pricing, booking links, FAQs, testimonials, and owner context so marketing demos feel like a live customer account.",
    services: [
      {
        id: "morning-reset",
        name: "Morning Reset Pilates",
        description:
          "A low-impact mat class focused on mobility, breath, and core strength. Built for busy people who want to leave feeling taller, calmer, and ready for the day.",
        duration: "45 min",
        price: "24",
        featured: true,
        who_its_for: "Beginners, returning clients, and anyone who wants a steady weekday practice",
        booking_link: "https://scaffoldweb.com/access-request",
        comingSoon: false,
        image_url:
          "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=1200&h=900&fit=crop&q=85",
      },
      {
        id: "private-session",
        name: "Private Alignment Session",
        description:
          "One-on-one movement coaching with a short intake, simple progress notes, and a take-home plan for the next two weeks.",
        duration: "60 min",
        price: "90",
        featured: false,
        who_its_for: "Clients recovering confidence, rebuilding consistency, or wanting personal attention",
        booking_link: "https://scaffoldweb.com/access-request",
        comingSoon: false,
        image_url:
          "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=1200&h=900&fit=crop&q=85",
      },
      {
        id: "saturday-flow",
        name: "Saturday Flow",
        description:
          "A friendly weekend class that blends Pilates, stretching, and guided cooldowns. The kind of class people bring a friend to.",
        duration: "50 min",
        price: "28",
        featured: false,
        who_its_for: "New clients, regulars, and small groups who want a relaxed weekend reset",
        booking_link: "https://scaffoldweb.com/access-request",
        comingSoon: false,
        image_url:
          "https://images.unsplash.com/photo-1510894347713-fc3ed6fdf539?w=1200&h=900&fit=crop&q=85",
      },
    ],
  },
  story: {
    sectionLabel: "Owner Story",
    headline: "Built for the owners\nwho do everything.",
    accentText: "Fictional demo account",
    statement:
      "Harbor & Pine is a realistic demo business: small team, clear services, steady bookings, and updates that should not require a web developer.",
    paragraphs: [
      "Maya opened Harbor & Pine after years of teaching in shared rooms and community centers. The studio is intentionally small, warm, and practical: classes are easy to understand, easy to book, and easy to return to.",
      "This tenant gives Scaffold Web a marketing-safe story to demonstrate the owner dashboard, AI content updates, booking prompts, weekly reports, and site preview without exposing a real customer's private data.",
      "Use it to show the before-and-after moment: an owner asks for a Saturday class update, the website changes, and the dashboard records the proof.",
    ],
    stats: [
      { value: "47", label: "People Found You" },
      { value: "9", label: "Booking Clicks" },
      { value: "3", label: "AI Updates" },
    ],
    quote:
      "I do not need another dashboard. I need to know what worked and get the website updated before I forget.",
    quoteAttribution: "Demo owner",
    imageUrl:
      "https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=1200&h=1600&fit=crop&q=85",
  },
  testimonials: {
    sectionLabel: "Client Notes",
    headline: "Why people come back",
    testimonials: [
      {
        id: "steady",
        quote:
          "The classes feel calm and specific. I always know what to book next, which makes it easy to keep showing up.",
        author: "Jordan M.",
        location: "Demo client",
      },
      {
        id: "welcoming",
        quote:
          "I was nervous to start Pilates, but the private session gave me a plan I could actually follow.",
        author: "Sam R.",
        location: "Demo client",
      },
      {
        id: "simple",
        quote:
          "The site is clear, the schedule is current, and I can book without hunting around.",
        author: "Priya K.",
        location: "Demo client",
      },
    ],
  },
  events: {
    sectionLabel: "Workshops",
    headline: "Upcoming at the studio",
    events: [
      {
        id: "spring-reset",
        title: "Spring Reset Workshop",
        date: "2026-05-23",
        time: "10:00 AM",
        location: "Harbor & Pine Studio",
        description:
          "A 90-minute mobility and breath workshop for clients who want a guided reset before summer schedules get busy.",
        hosted_by: "Maya",
        external_link: "https://scaffoldweb.com/access-request",
        image_url:
          "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&h=900&fit=crop&q=85",
      },
    ],
  },
  providers: {
    sectionLabel: "Local Network",
    headline: "Trusted demo partners",
    description:
      "A realistic partner section for showing how the AI can keep referrals and community recommendations current.",
    providers: [
      {
        id: "bloom-pt",
        name: "Bloom Physical Therapy",
        category: "Physical Therapy",
        service: "Movement assessments and recovery plans",
        why_i_recommend:
          "Helpful for clients who need clinical support before returning to group classes.",
        booking_link: "https://scaffoldweb.com/access-request",
        phone: "(555) 014-2026",
        photo_url:
          "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=900&h=900&fit=crop&q=85",
      },
    ],
  },
  contact: {
    email: "demo@scaffoldweb.com",
    phone: "(555) 014-1490",
    address: "123 Harbor Street, Buffalo, NY",
    hours: "Mon-Fri 7 AM-6 PM, Sat 9 AM-1 PM",
    locationTitle: "Buffalo\nDemo Studio",
    locationDescription:
      "A fictional local wellness studio used for Scaffold Web marketing, demos, and training flows.",
    instagramUrl: "https://instagram.com/scaffoldweb",
    facebookUrl: "",
    googleMapsUrl: "",
  },
  settings: {
    siteName: "Harbor & Pine Wellness",
    siteTagline: "Pilates, mobility, and calm weekly routines",
    siteDescription:
      "A fictional local wellness studio used for Scaffold Web marketing demos. See what is working and tell the AI what to change.",
    siteKeywords:
      "demo wellness studio, pilates demo, local business website demo, Scaffold Web",
    ownerName: "Maya",
    ownerTitle: "Studio Owner",
    footerTagline: "A marketing-safe demo tenant for Scaffold Web.",
    copyrightText: "Harbor & Pine Wellness",
    bookingUrl: "https://scaffoldweb.com/access-request",
    instagramHandle: "scaffoldweb",
    vagaro_embed_id: "",
  },
  faq: {
    sectionLabel: "FAQ",
    headline: "Simple answers before people book",
    description:
      "Common questions a real small studio would want answered clearly.",
    faqs: [
      {
        id: "new",
        question: "Is this good for beginners?",
        answer:
          "Yes. Morning Reset and Private Alignment are both written for people who are new, returning after a break, or rebuilding consistency.",
      },
      {
        id: "bring",
        question: "What should I bring?",
        answer:
          "Comfortable clothes and water. Mats and props are available at the studio.",
      },
      {
        id: "demo",
        question: "Is Harbor & Pine a real customer?",
        answer:
          "No. This is a fictional demo tenant for showing Scaffold Web's website, dashboard, AI update, and weekly report workflows.",
      },
    ],
  },
  shop: {
    ...defaultShop,
    headline: "Studio Picks",
    description:
      "A lightweight shop section for showing optional add-ons without turning the demo into ecommerce.",
    items: [
      {
        id: "mat-guide",
        name: "At-Home Mat Guide",
        description: "A printable two-week routine for clients between classes.",
        category: "Digital guide",
        price: "12",
        external_link: "https://scaffoldweb.com/access-request",
        image_url:
          "https://images.unsplash.com/photo-1540206395-68808572332f?w=1200&h=900&fit=crop&q=85",
      },
    ],
  },
  products: defaultProducts,
  theme: {
    ...defaultTheme,
    colors: {
      cream: "#fbfaf7",
      creamDark: "#efebe4",
      creamMid: "#ddd5c9",
      sage: "#3f6657",
      sageLight: "#6f917f",
      sageDark: "#244338",
      bark: "#1f2724",
      barkLight: "#4d5b55",
      barkFaded: "#7b8983",
      wheat: "#c8a76a",
      wheatLight: "#dfc990",
      terra: "#b86f56",
      terraLight: "#d39076",
    },
  },
  rewardsConfig: defaultRewardsConfig,
  navigation: {
    menuItems: [
      { label: "Classes", href: "#services" },
      { label: "Story", href: "#story" },
      { label: "FAQ", href: "#faq" },
      { label: "Contact", href: "#contact" },
    ],
    ctaLabel: "Book",
    ctaHref: "#services",
  },
  footer: {
    ...defaultFooter,
    tagline: "A marketing-safe demo tenant for Scaffold Web.",
    columns: [
      {
        heading: "Explore",
        links: [
          { label: "Classes", href: "#services" },
          { label: "Owner Story", href: "#story" },
          { label: "FAQ", href: "#faq" },
        ],
      },
      {
        heading: "Demo",
        links: [
          { label: "demo@scaffoldweb.com", href: "mailto:demo@scaffoldweb.com" },
          { label: "Scaffold Web", href: "https://scaffoldweb.com" },
        ],
      },
    ],
    socialLinks: [{ label: "Instagram", href: "https://instagram.com/scaffoldweb" }],
    copyrightText: "Harbor & Pine Wellness",
  },
};
