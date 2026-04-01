import { redirect } from "next/navigation";
import { getClickCounts, getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { defaults } from "@/lib/defaults";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";
import { HubPage } from "@/components/dashboard/HubPage";
import type { SectionData } from "@/components/dashboard/ContentBrowser";

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len).trimEnd() + "...";
}

async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

const EMPTY_CLICKS = { total: 0, today: 0, thisWeek: 0 };

// Compute site completeness score
function computeSiteScore(sections: {
  hero: { headline: string; tagline: string; backgroundImageUrl: string };
  services: { services: unknown[] };
  story: { headline: string; paragraphs: string[] };
  testimonials: { testimonials: unknown[] };
  events: { events: unknown[] };
  providers: { providers: unknown[] };
  contact: { phone?: string; email: string; address?: string; hours?: string };
  settings: { siteName: string; siteDescription: string };
}): { score: number; items: { label: string; done: boolean }[] } {
  const items = [
    { label: "Business name set", done: !!sections.settings.siteName },
    { label: "Site description", done: (sections.settings.siteDescription?.length || 0) > 20 },
    { label: "Hero headline", done: !!sections.hero.headline },
    { label: "Hero tagline", done: !!sections.hero.tagline },
    { label: "Services listed", done: sections.services.services.length >= 3 },
    { label: "Your story written", done: (sections.story.paragraphs?.length || 0) >= 2 },
    { label: "Client reviews", done: sections.testimonials.testimonials.length >= 3 },
    { label: "Upcoming events", done: sections.events.events.length >= 1 },
    { label: "Provider directory", done: sections.providers.providers.length >= 3 },
    { label: "Phone number", done: !!sections.contact.phone },
    { label: "Email address", done: !!sections.contact.email },
    { label: "Business address", done: !!sections.contact.address },
    { label: "Business hours", done: !!sections.contact.hours },
  ];
  const done = items.filter((i) => i.done).length;
  return { score: Math.round((done / items.length) * 100), items };
}

function getSuggestions(
  siteScore: { items: { label: string; done: boolean }[] },
  timestamps: Record<string, string>,
  bookingClicks: { total: number; thisWeek: number },
): string[] {
  const suggestions: string[] = [];
  const missing = siteScore.items.filter((i) => !i.done);
  if (missing.length > 0) {
    suggestions.push(`Add your ${missing[0].label.toLowerCase()} to complete your site`);
  }
  const twoWeeksAgo = Date.now() - 14 * 86400 * 1000;
  const staleSections = Object.entries(timestamps)
    .filter(([, ts]) => new Date(ts).getTime() < twoWeeksAgo)
    .map(([section]) => section);
  if (staleSections.length > 0) {
    suggestions.push(`Your ${staleSections[0]} section hasn't been updated in 2+ weeks`);
  }
  if (bookingClicks.total === 0) {
    suggestions.push("Share your site link to start getting booking clicks");
  }
  if (suggestions.length === 0) {
    suggestions.push("Try adding a new event to keep your site fresh");
  }
  return suggestions.slice(0, 2);
}

export default async function DashboardPage() {
  const tenant = await getTenantFromHeaders();

  // Verify current user has access to this tenant
  const allowed = await hasTenantAccess(tenant);
  if (!allowed) redirect("/");

  const [pageViews, bookingClicks, referralClicks, eventClicks, hero, services, story, testimonials, events, providers, contact, settings, timestamps] =
    await Promise.all([
      safeFetch(() => getClickCounts("page-view", tenant), EMPTY_CLICKS),
      safeFetch(() => getClickCounts("booking-click", tenant), EMPTY_CLICKS),
      safeFetch(() => getClickCounts("provider-referral-click", tenant), EMPTY_CLICKS),
      safeFetch(() => getClickCounts("event-click", tenant), EMPTY_CLICKS),
      safeFetch(() => getContent("hero", tenant), defaults.hero),
      safeFetch(() => getContent("services", tenant), defaults.services),
      safeFetch(() => getContent("story", tenant), defaults.story),
      safeFetch(() => getContent("testimonials", tenant), defaults.testimonials),
      safeFetch(() => getContent("events", tenant), defaults.events),
      safeFetch(() => getContent("providers", tenant), defaults.providers),
      safeFetch(() => getContent("contact", tenant), defaults.contact),
      safeFetch(() => getContent("settings", tenant), defaults.settings),
      safeFetch(() => getSectionTimestamps(tenant), {}),
    ]);

  // Compute freshness from timestamps
  function getFreshness(sectionId: string): "fresh" | "aging" | "stale" | "unknown" {
    const ts = timestamps[sectionId];
    if (!ts) return "unknown";
    const age = Date.now() - new Date(ts).getTime();
    const days = age / (86400 * 1000);
    if (days < 7) return "fresh";
    if (days < 14) return "aging";
    return "stale";
  }

  // Build section data for ContentBrowser with rich inline previews
  const sectionData: Record<string, SectionData> = {
    hero: {
      preview: truncate(hero.headline.replace(/\n/g, " "), 50),
      status: hero.headline ? "live" : "empty",
      chatPrompt: "Update my hero headline",
      freshness: getFreshness("hero"),
      items: [
        { label: hero.headline.replace(/\n/g, " "), detail: "headline" },
        { label: hero.subheadline || "(no subheadline)", detail: "subheadline" },
        { label: hero.ctaText || "Book a Session", detail: "CTA" },
      ].filter(item => item.label),
    },
    services: {
      preview: services.services.slice(0, 3).map((s: { name: string }) => s.name).join(", "),
      status: services.services.length > 0 ? "live" : "empty",
      count: `${services.services.length}`,
      chatPrompt: "Update my services",
      freshness: getFreshness("services"),
      items: services.services.map((s: { name: string; price: string; duration: string }) => ({
        label: s.name,
        detail: `$${s.price} · ${s.duration}`,
      })),
    },
    story: {
      preview: truncate(hero.tagline || "Your story", 50),
      status: "live",
      chatPrompt: "Update my about section",
      freshness: getFreshness("story"),
      items: story.paragraphs?.length > 0
        ? story.paragraphs.map((p: string, i: number) => ({
            label: truncate(p, 60),
            detail: `paragraph ${i + 1}`,
          }))
        : [{ label: hero.tagline || "Your story", detail: "tagline" }],
    },
    testimonials: {
      preview: testimonials.testimonials.length > 0
        ? truncate(testimonials.testimonials[0].quote, 50)
        : "No reviews yet",
      status: testimonials.testimonials.length > 0 ? "live" : "empty",
      count: `${testimonials.testimonials.length}`,
      chatPrompt: "Add a new testimonial",
      freshness: getFreshness("testimonials"),
      items: testimonials.testimonials.map((t: { author: string; quote: string }) => ({
        label: `"${truncate(t.quote, 40)}"`,
        detail: t.author,
      })),
    },
    events: {
      preview: events.events.length > 0
        ? events.events[0].title
        : "No upcoming events",
      status: events.events.length > 0 ? "live" : "empty",
      count: `${events.events.length}`,
      chatPrompt: "Add a new event",
      freshness: getFreshness("events"),
      items: events.events.map((e: { title: string; date: string }) => ({
        label: e.title,
        detail: e.date,
      })),
    },
    providers: {
      preview: providers.providers.slice(0, 3).map((p: { name: string }) => p.name).join(", "),
      status: providers.providers.length > 0 ? "live" : "empty",
      count: `${providers.providers.length}`,
      chatPrompt: "Update my providers list",
      freshness: getFreshness("providers"),
      items: providers.providers.map((p: { name: string; service: string }) => ({
        label: p.name,
        detail: p.service,
      })),
    },
    contact: {
      preview: [contact.phone, contact.email].filter(Boolean).join(" · "),
      status: contact.phone ? "live" : "empty",
      chatPrompt: "Update my contact information",
      freshness: getFreshness("contact"),
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
      freshness: getFreshness("settings"),
      items: [
        { label: settings.siteName || "(not set)", detail: "site name" },
        { label: settings.ownerName || "(not set)", detail: "owner" },
        settings.siteTagline && { label: settings.siteTagline, detail: "tagline" },
        settings.siteDescription && { label: truncate(settings.siteDescription, 40), detail: "SEO desc" },
      ].filter(Boolean) as { label: string; detail: string }[],
    },
  };

  const siteScore = computeSiteScore({ hero, services, story, testimonials, events, providers, contact, settings });
  const suggestions = getSuggestions(siteScore, timestamps, bookingClicks);

  const overviewContent = (
    <HubPage
      ownerName={settings.ownerName || "there"}
      pageViews={pageViews}
      bookingClicks={bookingClicks}
      siteScore={siteScore}
      suggestions={suggestions}
      sectionData={sectionData}
    />
  );

  return (
    <DashboardWorkspace
      siteName={settings.siteName || "Your Business"}
      ownerName={settings.ownerName || "there"}
      sectionData={sectionData}
      timestamps={timestamps}
      overviewContent={overviewContent}
    />
  );
}
