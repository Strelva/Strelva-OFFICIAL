import { redirect } from "next/navigation";
import { getActivity, getClickCounts, getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getTemplateForTenant } from "@/components/templates/registry";
import { hasTenantAccess } from "@/lib/auth";
import { defaults } from "@/lib/defaults";
import { safeFetch } from "@/lib/utils";
import { buildSectionData } from "@/lib/buildSectionData";
import { HubPage } from "@/components/dashboard/HubPage";
import type { ContentSection } from "@/lib/types";

const EMPTY_CLICKS = { total: 0, today: 0, thisWeek: 0 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeSiteScore(sections: Record<string, any>, templateSections: string[]): { score: number; items: { label: string; done: boolean }[] } {
  const items: { label: string; done: boolean }[] = [];
  const s = sections.settings || {};
  const h = sections.hero || {};
  const c = sections.contact || {};

  // Universal checks
  items.push({ label: "Business name set", done: !!s.siteName });
  items.push({ label: "Site description", done: (s.siteDescription?.length || 0) > 20 });
  items.push({ label: "Hero headline", done: !!h.headline });
  items.push({ label: "Email address", done: !!c.email });

  // Template-specific checks
  if (templateSections.includes("services") && sections.services) {
    items.push({ label: "Services listed", done: (sections.services.services?.length || 0) >= 3 });
  }
  if (templateSections.includes("products") && sections.products) {
    items.push({ label: "Products listed", done: (sections.products.products?.length || 0) >= 1 });
  }
  if (templateSections.includes("story") && sections.story) {
    items.push({ label: "Your story written", done: (sections.story.paragraphs?.length || 0) >= 2 });
  }
  if (templateSections.includes("testimonials") && sections.testimonials) {
    items.push({ label: "Client reviews", done: (sections.testimonials.testimonials?.length || 0) >= 1 });
  }
  if (templateSections.includes("events") && sections.events) {
    items.push({ label: "Upcoming events", done: (sections.events.events?.length || 0) >= 1 });
  }
  if (templateSections.includes("providers") && sections.providers) {
    items.push({ label: "Provider directory", done: (sections.providers.providers?.length || 0) >= 3 });
  }
  if (c.phone) items.push({ label: "Phone number", done: true });
  if (c.address) items.push({ label: "Business address", done: true });

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
    suggestions.push("Share your site link to start getting visitors");
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

  const allowed = await hasTenantAccess(tenant);
  if (!allowed) redirect("/");

  const template = await getTemplateForTenant(tenant);
  const templateSections = template.contentSections;

  // Fetch only sections this template uses
  const sectionEntries = await Promise.all(
    templateSections.map(async (section) => {
      const data = await safeFetch(
        () => getContent(section as ContentSection, tenant),
        (defaults as Record<string, unknown>)[section] || {},
      );
      return [section, data] as const;
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: Record<string, any> = Object.fromEntries(sectionEntries);

  const [pageViews, bookingClicks, timestamps] = await Promise.all([
    safeFetch(() => getClickCounts("page-view", tenant), EMPTY_CLICKS),
    safeFetch(() => getClickCounts("booking-click", tenant), EMPTY_CLICKS),
    safeFetch(() => getSectionTimestamps(tenant), {}),
  ]);

  const sectionData = buildSectionData(sections, timestamps);
  const siteScore = computeSiteScore(sections, templateSections);
  const suggestions = getSuggestions(siteScore, timestamps, bookingClicks);

  const settings = sections.settings || {};

  const recentActivity = isInvited
    ? (await safeFetch(() => getActivity(tenant), []))
        .slice(0, 5)
        .map((a: { text: string; time: string }) => ({ text: a.text, time: a.time }))
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
