import { redirect } from "next/navigation";
import {
  Sparkles, ListChecks, User, MessageSquareQuote,
  Calendar, Users, Mail, Settings as SettingsIcon,
} from "lucide-react";
import { getClickCounts, getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { defaults } from "@/lib/defaults";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import type { SectionData } from "@/components/dashboard/ContentBrowser";

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len).trimEnd() + "...";
}

async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const EMPTY_CLICKS = { total: 0, today: 0, thisWeek: 0 };

const SECTION_ICONS: Record<string, React.ElementType> = {
  hero: Sparkles,
  services: ListChecks,
  story: User,
  testimonials: MessageSquareQuote,
  events: Calendar,
  providers: Users,
  contact: Mail,
  settings: SettingsIcon,
};

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

  // Overview content rendered as server component, passed to workspace for overlay
  const overviewContent = (
    <div className="p-5 max-w-xl">
      <div data-ov="accent" className="h-[2px] bg-gradient-to-r from-[#7c9a8e] via-[#96b3a6] to-transparent mb-5 rounded-full" />
      {/* Headline */}
      <div data-ov="headline" className="mb-5">
        <h1 className="text-[20px] font-medium tracking-tight text-[#1a1a1a]" suppressHydrationWarning>
          {pageViews.thisWeek > 0
            ? `${pageViews.thisWeek} people found you this week`
            : `${getGreeting()}, ${settings.ownerName || "there"}`}
        </h1>
        <p className="text-[12px] text-[#999] mt-1">
          {pageViews.thisWeek > 0
            ? `${bookingClicks.thisWeek} clicked Book Now`
            : "Your site is ready \u2014 here\u2019s how it\u2019s doing."}
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div data-ov="metric" className="bg-white border border-[#e8e8e8] rounded-lg p-4 reb-card-glow cursor-pointer">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">PEOPLE WHO FOUND YOU</span>
          <p className="text-[28px] font-semibold font-mono tabular-nums text-[#1a1a1a] mt-2">
            {pageViews.total > 0 ? pageViews.total : "\u2014"}
          </p>
          <p className="text-[10px] font-mono text-[#bbb] mt-0.5">
            {pageViews.total > 0 ? `${pageViews.thisWeek} this week` : "Share your link to start tracking"}
          </p>
        </div>
        <div data-ov="metric" className="bg-white border border-[#e8e8e8] rounded-lg p-4 reb-card-glow cursor-pointer">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">BOOKING CLICKS</span>
          <p className="text-[28px] font-semibold font-mono tabular-nums text-[#1a1a1a] mt-2">
            {bookingClicks.total > 0 ? bookingClicks.total : "\u2014"}
          </p>
          <p className="text-[10px] font-mono text-[#bbb] mt-0.5">
            {bookingClicks.total > 0 ? `${bookingClicks.thisWeek} this week` : "Clicks tracked automatically"}
          </p>
        </div>
        <div data-ov="metric" className="bg-white border border-[#e8e8e8] rounded-lg p-4 reb-card-glow cursor-pointer">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">SITE COMPLETENESS</span>
          <p className="text-[28px] font-semibold font-mono tabular-nums text-[#1a1a1a] mt-2">
            {siteScore.score}%
          </p>
          <p className="text-[10px] font-mono text-[#bbb] mt-0.5">
            {siteScore.items.filter(i => i.done).length} of {siteScore.items.length} sections
          </p>
          <div className="mt-2 h-[3px] bg-[#f5f5f5] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${siteScore.score}%`,
                background: siteScore.score === 100 ? "#10b981" : "#7c9a8e",
              }}
            />
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div data-ov="suggestions" className="bg-[#7c9a8e]/[0.06] border border-[#7c9a8e]/[0.12] rounded-lg px-4 py-3 mb-5">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-[#7c9a8e] mb-2">SUGGESTIONS</h2>
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[12px] text-[#1a1a1a]">
                <div className="w-1 h-1 rounded-full bg-[#7c9a8e] shrink-0" />
                <span className="flex-1">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Site sections visual map */}
      <div data-ov="sitemap" className="bg-white border border-[#e8e8e8] rounded-lg p-4 mb-5 reb-card-glow cursor-pointer">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-[#999] mb-3">YOUR SITE</h3>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(sectionData).map(([key, data]) => (
            <div
              key={key}
              data-ov="icon"
              className="flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg bg-[#faf9f7] border border-transparent hover:border-[#7c9a8e]/20 transition-colors"
            >
              {(() => {
                const Icon = SECTION_ICONS[key];
                const isActive = data.status === "live" || data.status === "configured";
                return Icon ? (
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#7c9a8e]" : "text-[#ccc]"}`} strokeWidth={1.5} />
                ) : (
                  <div className={`w-2 h-2 rounded-full ${isActive ? "bg-[#7c9a8e]" : "bg-[#e8e8e8]"}`} />
                );
              })()}
              <span className="text-[9px] font-medium text-[#999] text-center leading-tight capitalize">
                {key === "settings" ? "Settings" : key}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity timeline (client component with filtering) */}
      <div data-ov="activity" className="bg-white border border-[#e8e8e8] rounded-lg p-4 reb-card-glow">
        <ActivityTimeline />
      </div>
    </div>
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
