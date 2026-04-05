import { redirect } from "next/navigation";
import { getActivity, getClickCounts, getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { defaults } from "@/lib/defaults";
import { safeFetch } from "@/lib/utils";
import { buildSectionData } from "@/lib/buildSectionData";
import { HubPage } from "@/components/dashboard/HubPage";

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const params = await searchParams;
  const isInvited = params.invited === "true";
  const tenant = await getTenantFromHeaders();

  // Verify current user has access to this tenant
  const allowed = await hasTenantAccess(tenant);
  if (!allowed) redirect("/");

  const [pageViews, bookingClicks, hero, services, story, testimonials, events, providers, contact, settings, timestamps] =
    await Promise.all([
      safeFetch(() => getClickCounts("page-view", tenant), EMPTY_CLICKS),
      safeFetch(() => getClickCounts("booking-click", tenant), EMPTY_CLICKS),
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

  const sectionData = buildSectionData(
    { hero, services, story, testimonials, events, providers, contact, settings },
    timestamps,
  );

  const siteScore = computeSiteScore({ hero, services, story, testimonials, events, providers, contact, settings });
  const suggestions = getSuggestions(siteScore, timestamps, bookingClicks);

  // Fetch recent activity for existing client welcome
  const recentActivity = isInvited
    ? (await safeFetch(() => getActivity(tenant), []))
        .slice(0, 5)
        .map((a) => ({ text: a.text, time: a.time }))
    : undefined;

  return (
    <HubPage
      ownerName={settings.ownerName || "there"}
      siteName={settings.siteName || "Your site"}
      pageViews={pageViews}
      bookingClicks={bookingClicks}
      siteScore={siteScore}
      suggestions={suggestions}
      sectionData={sectionData}
      isInvited={isInvited}
      recentActivity={recentActivity}
    />
  );
}
