import { promises as fs } from "fs";
import path from "path";
import { detectStaleSections } from "./reports";
import { getSectionTimestamps, getClickCounts, getContent, getSearchData } from "./storage";
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
  return entry;
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

  const [timestamps, bookingClicks, settings, testimonials, events, services] =
    await Promise.all([
      getSectionTimestamps(tenantId),
      getClickCounts("booking-click", tenantId),
      getContent("settings", tenantId),
      getContent("testimonials", tenantId),
      getContent("events", tenantId),
      getContent("services", tenantId),
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
        action: `prompt:Optimize my site for the search term "${q.query}"`,
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
        action: `prompt:Add content about "${q.query}" to my site`,
      }));
    }
  }

  return created;
}

export async function generateSuggestionsForAll(): Promise<void> {
  const tenants = await getAllTenants();
  for (const tenant of tenants.filter((t) => t.active)) {
    await generateSuggestionsForTenant(tenant.id);
  }
}
