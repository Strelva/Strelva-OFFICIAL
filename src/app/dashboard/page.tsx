import { redirect } from "next/navigation";
import { getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { defaults } from "@/lib/defaults";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";
import type { SectionData } from "@/components/dashboard/ContentBrowser";

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len).trimEnd() + "...";
}

async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export default async function DashboardPage() {
  const tenant = await getTenantFromHeaders();

  // Verify current user has access to this tenant
  const allowed = await hasTenantAccess(tenant);
  if (!allowed) redirect("/");

  const [hero, services, story, testimonials, events, providers, contact, settings, timestamps] =
    await Promise.all([
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

  return (
    <DashboardWorkspace
      ownerName={settings.ownerName || "there"}
      sectionData={sectionData}
      timestamps={timestamps}
    />
  );
}
