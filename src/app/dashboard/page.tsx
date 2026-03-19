import {
  MessageCircle,
  Globe,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { getActivity, getClickCounts, getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { defaults } from "@/lib/defaults";
import { timeAgo } from "@/lib/utils";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK_ACTIONS = [
  { label: "Chat with AI", href: "/dashboard/chat", icon: MessageCircle },
  { label: "View my site", href: "/dashboard/site", icon: Globe },
  { label: "Update hours", href: "/dashboard/chat", icon: Clock },
];

// Calculate how complete/rich the site content is
function computeSiteScore(sections: {
  hero: { headline: string; tagline: string; backgroundImageUrl: string };
  services: { services: unknown[] };
  story: { headline: string; paragraphs: string[] };
  testimonials: { testimonials: unknown[] };
  events: { events: unknown[] };
  providers: { providers: unknown[] };
  contact: { phone: string; email: string; address: string; hours: string };
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

// Generate smart suggestions based on content state
function getSuggestions(
  siteScore: { items: { label: string; done: boolean }[] },
  timestamps: Record<string, string>,
  bookingClicks: { total: number; thisWeek: number },
): string[] {
  const suggestions: string[] = [];

  // Missing content
  const missing = siteScore.items.filter((i) => !i.done);
  if (missing.length > 0) {
    suggestions.push(`Add your ${missing[0].label.toLowerCase()} to complete your site`);
  }

  // Stale content — sections not updated in 14+ days
  const twoWeeksAgo = Date.now() - 14 * 86400 * 1000;
  const staleSections = Object.entries(timestamps)
    .filter(([, ts]) => new Date(ts).getTime() < twoWeeksAgo)
    .map(([section]) => section);
  if (staleSections.length > 0) {
    suggestions.push(`Your ${staleSections[0]} section hasn't been updated in 2+ weeks`);
  }

  // No booking clicks yet
  if (bookingClicks.total === 0) {
    suggestions.push("Share your site link to start getting booking clicks");
  }

  // Engagement tips
  if (suggestions.length === 0) {
    suggestions.push("Try adding a new event to keep your site fresh");
  }

  return suggestions.slice(0, 2);
}

const EMPTY_CLICKS = { total: 0, today: 0, thisWeek: 0 };

async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export default async function DashboardOverview() {
  const tenant = await getTenantFromHeaders();
  const [activity, pageViews, bookingClicks, referralClicks, eventClicks, hero, services, story, testimonials, events, providers, contact, settings, timestamps] =
    await Promise.all([
      safeFetch(() => getActivity(tenant), []),
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

  const siteScore = computeSiteScore({ hero, services, story, testimonials, events, providers, contact, settings });
  const suggestions = getSuggestions(siteScore, timestamps, bookingClicks);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Site status bar */}
      <div className="flex items-center gap-1.5 mb-6">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs font-mono text-zinc-400">Live</span>
      </div>

      {/* Data-led headline */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white" suppressHydrationWarning>
          {pageViews.thisWeek > 0
            ? `${pageViews.thisWeek} people found you this week`
            : `${getGreeting()}, ${settings.ownerName || "there"}`}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          {pageViews.thisWeek > 0
            ? `${bookingClicks.thisWeek} clicked Book Now · Site ${siteScore.score}% complete`
            : "Here\u2019s what\u2019s happening with your site."}
        </p>
      </div>

      {/* Hero metrics — real data */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {/* People who found you */}
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] hover:-translate-y-px transition-all duration-150 animate-fade-in-up" style={{ animationDelay: "0ms" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              PEOPLE WHO FOUND YOU
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-zinc-600" />
          </div>
          <p className="text-3xl font-semibold font-mono tabular-nums text-white transition-all duration-700">
            {pageViews.total > 0 ? pageViews.total : "\u2014"}
          </p>
          <p className="text-xs font-mono text-zinc-600 mt-1">
            {pageViews.total > 0
              ? `${pageViews.thisWeek} this week`
              : "Visitors tracked when your site is live"}
          </p>
        </div>

        {/* Booking clicks */}
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] hover:-translate-y-px transition-all duration-150 animate-fade-in-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              BOOKING CLICKS
            </span>
          </div>
          <p className="text-3xl font-semibold font-mono tabular-nums text-white transition-all duration-700">
            {bookingClicks.total > 0 ? bookingClicks.total : "\u2014"}
          </p>
          <p className="text-xs font-mono text-zinc-600 mt-1">
            {bookingClicks.total > 0
              ? `${bookingClicks.thisWeek} this week`
              : "Every Book on Vagaro click tracked"}
          </p>
        </div>

        {/* Site completeness */}
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] hover:-translate-y-px transition-all duration-150 animate-fade-in-up" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              SITE COMPLETENESS
            </span>
            <Sparkles className="w-3.5 h-3.5 text-zinc-600" />
          </div>
          <p className="text-3xl font-semibold font-mono tabular-nums text-white transition-all duration-700">
            {siteScore.score}%
          </p>
          <p className="text-xs font-mono text-zinc-600 mt-1">
            {siteScore.items.filter(i => i.done).length} of {siteScore.items.length} sections filled
          </p>
          {/* Progress bar */}
          <div className="mt-3 h-1 bg-[#262626] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${siteScore.score}%`,
                background: siteScore.score === 100 ? "#10b981" : "#7c3aed",
              }}
            />
          </div>
        </div>

      </div>

      {/* Smart suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-violet-600/5 border border-violet-600/20 rounded-lg px-5 py-4 mb-6">
          <h2 className="text-xs uppercase tracking-wider text-violet-400 mb-2.5">
            SUGGESTIONS
          </h2>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <Link
                key={i}
                href="/dashboard/chat"
                className="flex items-center gap-3 text-sm text-zinc-300 hover:text-white transition-colors duration-150 group"
              >
                <div className="w-1 h-1 rounded-full bg-violet-500 shrink-0" />
                <span className="flex-1">{s}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-violet-400 group-hover:rotate-45 transition-all duration-150" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Visual site map */}
      <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 mb-6 animate-fade-in-up" style={{ animationDelay: "240ms" }}>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
          YOUR SITE
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { name: "Hero", status: hero.headline ? "live" : "empty", detail: hero.headline ? "Headline set" : "Needs headline" },
            { name: "Services", status: services.services.length >= 3 ? "live" : services.services.length > 0 ? "partial" : "empty", detail: `${services.services.length} listed` },
            { name: "About", status: story.paragraphs?.length >= 2 ? "live" : "partial", detail: story.headline || "Your story" },
            { name: "Reviews", status: testimonials.testimonials.length >= 3 ? "live" : testimonials.testimonials.length > 0 ? "partial" : "empty", detail: `${testimonials.testimonials.length} reviews` },
            { name: "Events", status: events.events.length > 0 ? "live" : "empty", detail: events.events.length > 0 ? `${events.events.length} upcoming` : "None yet" },
            { name: "Providers", status: providers.providers.length >= 3 ? "live" : providers.providers.length > 0 ? "partial" : "empty", detail: `${providers.providers.length} listed` },
            { name: "Contact", status: contact.phone && contact.email ? "live" : "partial", detail: contact.phone ? "Phone + email" : "Needs info" },
            { name: "Booking", status: "live", detail: `${bookingClicks.total} clicks` },
          ].map((section) => (
            <Link
              key={section.name}
              href="/dashboard/content"
              className="group flex items-start gap-3 p-3 rounded-lg border border-transparent hover:border-[#333] hover:bg-[#1a1a1a] transition-all duration-150"
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                section.status === "live" ? "bg-emerald-500" :
                section.status === "partial" ? "bg-amber-500" :
                "bg-zinc-600"
              }`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">{section.name}</p>
                <p className="text-[11px] text-zinc-500 truncate">{section.detail}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Status rows */}
      <div className="bg-[#141414] border border-[#262626] rounded-lg divide-y divide-[#262626] mb-6">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              SITE HEALTH
            </span>
          </div>
          <span className="text-sm font-mono text-zinc-200">
            {siteScore.score === 100
              ? "Everything looks perfect"
              : siteScore.score >= 80
                ? "Looking great — a few things to add"
                : "Good start — keep filling in your content"}
          </span>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              SEO
            </span>
          </div>
          <span className="text-sm font-mono text-zinc-200">
            Google can find your site
          </span>
        </div>
      </div>

      {/* Two-column: Activity + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-[#141414] border border-[#262626] rounded-lg p-5">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
            RECENT ACTIVITY
          </h2>
          {activity.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">
              No activity yet — updates will appear here when you use the AI chat.
            </p>
          ) : (
            <div className="space-y-0">
              {activity.slice(0, 10).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-3 border-b border-[#1c1c1c] last:border-0 animate-fade-in-up"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      item.type === "ai" ? "bg-violet-500" : "bg-emerald-500"
                    }`}
                  />
                  <p className="text-sm text-zinc-200 flex-1">{item.text}</p>
                  <span className="text-xs font-mono text-zinc-500 shrink-0">
                    {timeAgo(item.time)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
            QUICK ACTIONS
          </h2>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-transparent hover:border-l-2 hover:border-l-violet-600 hover:bg-[#1c1c1c] text-sm text-zinc-300 hover:text-white transition-colors duration-150 group"
              >
                <span className="flex items-center gap-2.5">
                  <action.icon className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors duration-150" />
                  {action.label}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 group-hover:rotate-45 transition-all duration-150" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
