import type { SectionData } from "@/components/dashboard/ContentBrowser";
import { truncate, getFreshness } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Builds the sectionData record consumed by ContentBrowser / ContentWorkspace.
 * Shared between /dashboard and /dashboard/content to avoid duplication.
 */
export function buildSectionData(
  sections: {
    hero: any;
    services: any;
    story: any;
    testimonials: any;
    events: any;
    providers: any;
    contact: any;
    settings: any;
  },
  timestamps: Record<string, string>,
): Record<string, SectionData> {
  const { hero, services, story, testimonials, events, providers, contact, settings } = sections;

  return {
    hero: {
      preview: truncate(hero.headline.replace(/\n/g, " "), 50),
      status: hero.headline ? "live" : "empty",
      chatPrompt: "Update my hero headline",
      freshness: getFreshness("hero", timestamps),
      items: [
        { label: hero.headline.replace(/\n/g, " "), detail: "headline" },
        { label: hero.subheadline || "(no subheadline)", detail: "subheadline" },
        { label: hero.ctaText || "Book a Session", detail: "CTA" },
      ].filter((item) => item.label),
    },
    services: {
      preview: services.services
        .slice(0, 3)
        .map((s: { name: string }) => s.name)
        .join(", "),
      status: services.services.length > 0 ? "live" : "empty",
      count: `${services.services.length}`,
      chatPrompt: "Update my services",
      freshness: getFreshness("services", timestamps),
      items: services.services.map(
        (s: { name: string; price: string; duration: string }) => ({
          label: s.name,
          detail: `$${s.price} · ${s.duration}`,
        }),
      ),
    },
    story: {
      preview: truncate(hero.tagline || "Your story", 50),
      status: "live",
      chatPrompt: "Update my about section",
      freshness: getFreshness("story", timestamps),
      items:
        story.paragraphs?.length > 0
          ? story.paragraphs.map((p: string, i: number) => ({
              label: truncate(p, 60),
              detail: `paragraph ${i + 1}`,
            }))
          : [{ label: hero.tagline || "Your story", detail: "tagline" }],
    },
    testimonials: {
      preview:
        testimonials.testimonials.length > 0
          ? truncate(testimonials.testimonials[0].quote, 50)
          : "No reviews yet",
      status: testimonials.testimonials.length > 0 ? "live" : "empty",
      count: `${testimonials.testimonials.length}`,
      chatPrompt: "Add a new testimonial",
      freshness: getFreshness("testimonials", timestamps),
      items: testimonials.testimonials.map(
        (t: { author: string; quote: string }) => ({
          label: `"${truncate(t.quote, 40)}"`,
          detail: t.author,
        }),
      ),
    },
    events: {
      preview:
        events.events.length > 0
          ? events.events[0].title
          : "No upcoming events",
      status: events.events.length > 0 ? "live" : "empty",
      count: `${events.events.length}`,
      chatPrompt: "Add a new event",
      freshness: getFreshness("events", timestamps),
      items: events.events.map((e: { title: string; date: string }) => ({
        label: e.title,
        detail: e.date,
      })),
    },
    providers: {
      preview: providers.providers
        .slice(0, 3)
        .map((p: { name: string }) => p.name)
        .join(", "),
      status: providers.providers.length > 0 ? "live" : "empty",
      count: `${providers.providers.length}`,
      chatPrompt: "Update my providers list",
      freshness: getFreshness("providers", timestamps),
      items: providers.providers.map(
        (p: { name: string; service: string }) => ({
          label: p.name,
          detail: p.service,
        }),
      ),
    },
    contact: {
      preview: [contact.phone, contact.email].filter(Boolean).join(" · "),
      status: contact.phone ? "live" : "empty",
      chatPrompt: "Update my contact information",
      freshness: getFreshness("contact", timestamps),
      items: [
        contact.phone && { label: contact.phone, detail: "phone" },
        contact.email && { label: contact.email, detail: "email" },
        contact.address && { label: contact.address, detail: "address" },
        contact.hours && { label: truncate(contact.hours, 40), detail: "hours" },
      ].filter(Boolean) as { label: string; detail: string }[],
    },
    settings: {
      preview: settings.siteName,
      status: "configured",
      chatPrompt: "Update my site settings",
      freshness: getFreshness("settings", timestamps),
      items: [
        { label: settings.siteName || "(not set)", detail: "site name" },
        { label: settings.ownerName || "(not set)", detail: "owner" },
        settings.siteTagline && { label: settings.siteTagline, detail: "tagline" },
        settings.siteDescription && {
          label: truncate(settings.siteDescription, 40),
          detail: "SEO desc",
        },
      ].filter(Boolean) as { label: string; detail: string }[],
    },
  };
}
