/**
 * Tenant content fixtures for the benchmark.
 *
 * Each fixture is a snapshot of the tenant's content sections at the moment a
 * case begins. The runner writes the fixture to `dev-content-benchmark.json`
 * before each case and removes it after.
 *
 * Fixtures intentionally start in a recognisable, well-formed state so that
 * the evaluator can detect drift (fields changing, sections being cleared)
 * without false positives.
 */

import {
  defaultContact,
  defaultEvents,
  defaultFaq,
  defaultFooter,
  defaultHero,
  defaultNavigation,
  defaultProducts,
  defaultProviders,
  defaultRewardsConfig,
  defaultServices,
  defaultSettings,
  defaultShop,
  defaultStory,
  defaultTestimonials,
  defaultTheme,
} from "../src/lib/defaults";
import type { ContentMap } from "../src/lib/types";

export type FixtureName =
  | "wellness-default"
  | "wellness-with-testimonials"
  | "wellness-with-reviews";

function baseWellness(): ContentMap {
  return {
    hero: {
      ...defaultHero,
      headline: "Move Better.\nFeel Better.",
      subheadline: "Sunrise Wellness Studio",
      tagline: "A small studio in Buffalo for movement, breath, and recovery.",
      ctaText: "Book a Class",
      ctaLink: "#services",
    },
    services: {
      ...defaultServices,
      headline: "Classes",
      description: "Drop-in or weekly. Bring water and comfortable clothes.",
      services: [
        {
          id: "morning-flow",
          name: "Morning Flow",
          description: "A 45-minute movement reset.",
          duration: "45 min",
          price: "30",
          featured: false,
          who_its_for: "All levels",
          booking_link: "",
          comingSoon: false,
          image_url: "",
        },
        {
          id: "evening-yin",
          name: "Evening Yin",
          description: "Slow, deep stretches and breathwork.",
          duration: "60 min",
          price: "35",
          featured: false,
          who_its_for: "Beginner-friendly",
          booking_link: "",
          comingSoon: false,
          image_url: "",
        },
      ],
    },
    story: { ...defaultStory },
    testimonials: { ...defaultTestimonials },
    events: { ...defaultEvents },
    providers: { ...defaultProviders },
    contact: {
      ...defaultContact,
      email: "hello@sunrise.example",
      phone: "555-0100",
      address: "10 Main Street, Buffalo NY 14202",
      hours: "Mon-Fri 7am-7pm, Sat 8am-2pm",
      locationTitle: "Visit the studio",
      locationDescription: "Two blocks from the bus stop. Street parking out front.",
    },
    settings: {
      ...defaultSettings,
      siteName: "Sunrise Wellness Studio",
      ownerName: "Alex",
      ownerTitle: "Founder",
      bookingUrl: "https://app.acuityscheduling.com/schedule/example",
    },
    faq: { ...defaultFaq },
    shop: { ...defaultShop },
    products: { ...defaultProducts },
    theme: { ...defaultTheme },
    rewardsConfig: { ...defaultRewardsConfig },
    navigation: { ...defaultNavigation },
    footer: { ...defaultFooter },
  };
}

function withTestimonials(): ContentMap {
  const base = baseWellness();
  return {
    ...base,
    testimonials: {
      ...defaultTestimonials,
      headline: "What clients say",
      testimonials: [
        {
          id: "t-1",
          author: "Maya R.",
          quote: "Best 45 minutes of my week.",
          location: "Buffalo, NY",
        },
        {
          id: "t-2",
          author: "Devon K.",
          quote: "The breathwork made a real difference for my recovery.",
          location: "Amherst, NY",
        },
        {
          id: "t-3",
          author: "Sam P.",
          quote: "Tiny studio, big heart.",
          location: "Tonawanda, NY",
        },
        {
          id: "t-4",
          author: "Jordan L.",
          quote: "I like that they actually remember my name.",
          location: "Kenmore, NY",
        },
      ],
    },
  };
}

const FIXTURES: Record<FixtureName, () => ContentMap> = {
  "wellness-default": baseWellness,
  "wellness-with-testimonials": withTestimonials,
  // wellness-with-reviews is a placeholder for the pending review-related
  // cases; the runner will skip cases referring to fixtures it can't load.
  "wellness-with-reviews": baseWellness,
};

export function buildFixture(name: FixtureName): ContentMap {
  return FIXTURES[name]();
}
