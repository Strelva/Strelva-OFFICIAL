import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { promises as fs } from "fs";
import path from "path";
import { detectStaleSections } from "./reports";
import { sanitizePromptValue } from "./capabilities";
import { addEvent } from "./events";
import { getSectionTimestamps, getClickCounts, getContent, getSearchData, getDailyMetrics } from "./storage";
import { getAllTenants } from "./tenants";
import type { ContentSection } from "./types";

const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;

export interface Suggestion {
  id: string;
  tenantId: string;
  type: "stale" | "missing" | "growth" | "engagement";
  title: string;
  description: string;
  action: string;
  section?: string;
  createdAt: string;
  status: "pending" | "accepted" | "dismissed";
}

// --- Dev file fallback ---

const DEV_SUGGESTIONS_PATH = path.join(process.cwd(), "dev-suggestions.json");

async function readSuggestions(): Promise<Record<string, Suggestion[]>> {
  try {
    const raw = await fs.readFile(DEV_SUGGESTIONS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeSuggestions(data: Record<string, Suggestion[]>): Promise<void> {
  await fs.writeFile(DEV_SUGGESTIONS_PATH, JSON.stringify(data, null, 2));
}

// --- CRUD ---

export async function getSuggestions(tenantId: string): Promise<Suggestion[]> {
  if (hasSanity) {
    const { getSanityClient } = await import("./sanity");
    const docs = await getSanityClient().fetch(
      `*[_type == "suggestion" && tenantId == $tenantId && status == "pending"] | order(createdAt desc)`,
      { tenantId },
    );
    return (docs || []).map(sanityToSuggestion);
  }

  const store = await readSuggestions();
  return (store[tenantId] || []).filter((s) => s.status === "pending");
}

export async function addSuggestion(suggestion: Omit<Suggestion, "id" | "createdAt" | "status">): Promise<Suggestion> {
  const entry: Suggestion = {
    ...suggestion,
    id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  if (hasSanity) {
    const { getSanityClient } = await import("./sanity");
    // Dedupe check
    const existing = await getSanityClient().fetch(
      `*[_type == "suggestion" && tenantId == $tenantId && status == "pending" && suggestionType == $type && section == $section][0]`,
      { tenantId: suggestion.tenantId, type: suggestion.type, section: suggestion.section || "" },
    );
    if (existing) return sanityToSuggestion(existing);

    await getSanityClient().create({
      _type: "suggestion",
      ...entry,
      suggestionType: entry.type,
    });
    await addSuggestionEvent(entry);
    return entry;
  }

  const store = await readSuggestions();
  const tenantSuggestions = store[suggestion.tenantId] || [];

  // Dedupe
  const existing = tenantSuggestions.find(
    (s) => s.status === "pending" && s.type === suggestion.type && s.section === suggestion.section,
  );
  if (existing) return existing;

  tenantSuggestions.push(entry);
  store[suggestion.tenantId] = tenantSuggestions;
  await writeSuggestions(store);
  await addSuggestionEvent(entry);
  return entry;
}

async function addSuggestionEvent(suggestion: Suggestion): Promise<void> {
  await addEvent({
    tenantId: suggestion.tenantId,
    source: "ai",
    type: "suggestion",
    title: suggestion.title,
    body: suggestion.description,
    status: "pending",
    metadata: {
      suggestionId: suggestion.id,
      action: suggestion.action,
      actionPrompt: suggestion.action.startsWith("prompt:")
        ? suggestion.action.slice("prompt:".length)
        : suggestion.action,
      section: suggestion.section,
    },
  });
}

export async function updateSuggestion(
  tenantId: string,
  suggestionId: string,
  status: "accepted" | "dismissed",
): Promise<Suggestion | null> {
  if (hasSanity) {
    const { getSanityClient } = await import("./sanity");
    const doc = await getSanityClient().fetch(
      `*[_type == "suggestion" && tenantId == $tenantId && id == $id][0]._id`,
      { tenantId, id: suggestionId },
    );
    if (!doc) return null;
    await getSanityClient().patch(doc).set({ status }).commit();
    const updated = await getSanityClient().fetch(
      `*[_type == "suggestion" && tenantId == $tenantId && id == $id][0]`,
      { tenantId, id: suggestionId },
    );
    return updated ? sanityToSuggestion(updated) : null;
  }

  const store = await readSuggestions();
  const suggestions = store[tenantId] || [];
  const idx = suggestions.findIndex((s) => s.id === suggestionId);
  if (idx === -1) return null;

  suggestions[idx].status = status;
  store[tenantId] = suggestions;
  await writeSuggestions(store);
  return suggestions[idx];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanityToSuggestion(doc: any): Suggestion {
  const { _id, _rev, _type, _createdAt, _updatedAt, suggestionType, ...rest } = doc;
  return { ...rest, type: suggestionType || rest.type } as Suggestion;
}

// --- Generation ---

export async function generateSuggestionsForTenant(tenantId: string): Promise<Suggestion[]> {
  const contentSections: ContentSection[] = [
    "hero", "services", "story", "testimonials", "events",
    "providers", "contact", "settings", "faq",
  ];

  const [timestamps, bookingClicks, settings, testimonials, events, services, dailyMetrics] =
    await Promise.all([
      getSectionTimestamps(tenantId),
      getClickCounts("booking-click", tenantId),
      getContent("settings", tenantId),
      getContent("testimonials", tenantId),
      getContent("events", tenantId),
      getContent("services", tenantId),
      getDailyMetrics(tenantId, 14),
    ]);

  const created: Suggestion[] = [];

  // Stale section suggestions
  const stale = detectStaleSections(timestamps, contentSections);
  for (const { section, daysSinceUpdate } of stale.slice(0, 2)) {
    created.push(await addSuggestion({
      tenantId,
      type: "stale",
      title: `Freshen up your ${section}`,
      description: `Your ${section} section hasn't been updated in ${daysSinceUpdate} days. Fresh content helps people trust your business.`,
      action: `update_section:${section}`,
      section,
    }));
  }

  const unknownFreshness = contentSections.filter((section) => !timestamps[section]);
  for (const section of unknownFreshness.slice(0, 1)) {
    created.push(await addSuggestion({
      tenantId,
      type: "stale",
      title: `Check your ${section} section`,
      description: `I don't have a recent update recorded for ${section}. Want me to review it and bring it current?`,
      action: `prompt:Review my ${section} section and suggest updates based on the current business.`,
      section,
    }));
  }

  if (testimonials.testimonials.length < 3) {
    created.push(await addSuggestion({
      tenantId,
      type: "missing",
      title: "Add more client reviews",
      description: `You have ${testimonials.testimonials.length} reviews. Businesses with 3+ reviews get more bookings.`,
      action: "prompt:Can you help me add a new testimonial?",
    }));
  }

  if (events.events.length === 0) {
    created.push(await addSuggestion({
      tenantId,
      type: "missing",
      title: "Add an upcoming event",
      description: "Events give people a reason to visit your site and book.",
      action: "prompt:Help me create an event for this month",
      section: "events",
    }));
  }

  if (!settings.siteDescription || settings.siteDescription.length < 20) {
    created.push(await addSuggestion({
      tenantId,
      type: "missing",
      title: "Write your site description",
      description: "A good description helps people find you on Google.",
      action: "prompt:Can you write a site description for my business?",
      section: "settings",
    }));
  }

  if (bookingClicks.thisWeek === 0 && bookingClicks.total > 0) {
    created.push(await addSuggestion({
      tenantId,
      type: "engagement",
      title: "No booking clicks this week",
      description: "Share your site link on social media or send a newsletter to bring people back.",
      action: "prompt:Help me write a newsletter to bring people back to my site",
    }));
  }

  const lastWeekViews = dailyMetrics.slice(0, 7).reduce((sum, day) => sum + day.pageViews, 0);
  const thisWeekViews = dailyMetrics.slice(7).reduce((sum, day) => sum + day.pageViews, 0);
  if (lastWeekViews > 10 && thisWeekViews < lastWeekViews * 0.5) {
    created.push(await addSuggestion({
      tenantId,
      type: "growth",
      title: "Traffic dropped this week",
      description: `${thisWeekViews} people found you this week, down from ${lastWeekViews} last week. Want me to draft a quick post or email to bring people back?`,
      action: "prompt:Help me bring website traffic back after this week's drop.",
    }));
  }

  const today = new Date();
  const expiredEvents = (events.events || []).filter((event: { date?: string }) => {
    if (!event.date) return false;
    return new Date(event.date) < today;
  });
  if (expiredEvents.length > 0) {
    created.push(await addSuggestion({
      tenantId,
      type: "stale",
      title: "Clean up past events",
      description: `You have ${expiredEvents.length} past event${expiredEvents.length === 1 ? "" : "s"} still showing. Want me to archive old events and keep the page current?`,
      action: "prompt:Clean up past events on my site and keep upcoming events visible.",
      section: "events",
    }));
  }

  // Search-based suggestions
  const searchData = await getSearchData(tenantId);
  if (searchData && searchData.queries.length > 0) {
    const serviceNames = services.services.map((s) => s.name.toLowerCase());

    // High impressions, low clicks = content optimization opportunity
    const underperforming = searchData.queries
      .filter((q) => q.impressions >= 10 && q.clicks === 0)
      .slice(0, 2);

    for (const q of underperforming) {
      created.push(await addSuggestion({
        tenantId,
        type: "growth",
        title: `People search "${q.query}" but don't click`,
        description: `${q.impressions} people searched "${q.query}" and saw your site, but none clicked. Want me to optimize your page title and description for this search?`,
        action: `prompt:Optimize my site for the search term "${sanitizePromptValue(q.query)}"`,
      }));
    }

    // Queries that don't match any service name = content gap
    const unmatched = searchData.queries
      .filter((q) => q.clicks > 0 && !serviceNames.some((name) => q.query.toLowerCase().includes(name)))
      .slice(0, 2);

    for (const q of unmatched) {
      created.push(await addSuggestion({
        tenantId,
        type: "growth",
        title: `People are searching "${q.query}"`,
        description: `${q.clicks} people found you searching "${q.query}" — but your site doesn't highlight this topic. Want me to add content about it?`,
        action: `prompt:Add content about "${sanitizePromptValue(q.query)}" to my site`,
      }));
    }
  }

  const pending = await getSuggestions(tenantId);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const hasRecentLlmSuggestion = pending.some(
    (suggestion) =>
      suggestion.title === "Recommended site improvement" &&
      new Date(suggestion.createdAt).getTime() >= weekAgo
  );
  if (!hasRecentLlmSuggestion) {
    const llmSuggestion = await generateLlmSuggestion({
      tenantId,
      settings,
      services,
      staleSections: stale,
      bookingClicks,
      searchQueries: searchData?.queries || [],
      thisWeekViews,
      lastWeekViews,
    });
    if (llmSuggestion) {
      created.push(await addSuggestion(llmSuggestion));
    }
  }

  return created;
}

async function generateLlmSuggestion(data: {
  tenantId: string;
  settings: { siteName?: string; siteDescription?: string };
  services: { services?: Array<{ name: string }> };
  staleSections: Array<{ section: string; daysSinceUpdate: number }>;
  bookingClicks: { total: number; thisWeek: number };
  searchQueries: Array<{ query: string; clicks: number; impressions: number }>;
  thisWeekViews: number;
  lastWeekViews: number;
}): Promise<Omit<Suggestion, "id" | "createdAt" | "status"> | null> {
  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `What is the single most impactful proactive improvement for this local business website?

Business: ${data.settings.siteName || "Unknown"}
Description: ${data.settings.siteDescription || "Not set"}
Services: ${(data.services.services || []).map((service) => service.name).join(", ") || "None listed"}
Booking clicks this week: ${data.bookingClicks.thisWeek}
Page views this week: ${data.thisWeekViews}
Page views last week: ${data.lastWeekViews}
Stale sections: ${data.staleSections.map((section) => `${section.section} (${section.daysSinceUpdate} days)`).join(", ") || "none"}
Search queries: ${data.searchQueries.map((query) => `${query.query} (${query.clicks} clicks, ${query.impressions} impressions)`).join(", ") || "none"}

Return strict JSON with:
{
  "title": "short action title",
  "description": "one sentence explaining why it matters",
  "prompt": "owner-approved instruction for the AI to execute"
}

No markdown. No extra text.`,
    });
    const parsed = JSON.parse(text.trim()) as { title?: string; description?: string; prompt?: string };
    if (!parsed.title || !parsed.description || !parsed.prompt) return null;
    return {
      tenantId: data.tenantId,
      type: "growth",
      title: "Recommended site improvement",
      description: `${parsed.title}: ${parsed.description}`,
      action: `prompt:${parsed.prompt}`,
    };
  } catch {
    return null;
  }
}

export async function generateSuggestionsForAll(): Promise<void> {
  const tenants = await getAllTenants();
  for (const tenant of tenants.filter((t) => t.active)) {
    await generateSuggestionsForTenant(tenant.id);
  }
}
