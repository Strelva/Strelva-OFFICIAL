import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { promises as fs } from "fs";
import path from "path";
import { detectStaleSections } from "./reports";
import { sanitizePromptValue } from "./capabilities";
import { addEvent, getEvents, resolveEvent } from "./events";
import { getSectionTimestamps, getClickCounts, getContent, getSearchData, getDailyMetrics } from "./storage";
import { getProducts } from "./products";
import { getAllTenants, getTenantConfig } from "./tenants";
import type { ContentSection } from "./types";
import { dataSourceIsPostgres } from "./db/source-flags";
import { getSupabase, type Row, type Insert } from "./db/client";

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

// --- Postgres dual-path helpers (self-contained; do not move to repositories.ts) ---
//
// The `suggestions` table maps 1:1 to the Suggestion interface (camelCase ->
// snake_case). `tenant_id` FKs tenants(id) (uuid) and is passed straight through
// — tenant ids in this codebase are real uuids, unlike the Clerk-era user ids.
// Every query is wrapped so it never throws; a failure degrades to the dev path
// the caller already falls through to.

function suggestionToInsert(s: Suggestion): Insert<"suggestions"> {
  return {
    id: s.id,
    tenant_id: s.tenantId,
    type: s.type,
    title: s.title,
    description: s.description,
    action: s.action,
    section: s.section ?? null,
    status: s.status,
    created_at: s.createdAt,
  };
}

function mapPgSuggestionRow(row: Row<"suggestions">): Suggestion {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type as Suggestion["type"],
    title: row.title,
    description: row.description,
    action: row.action,
    section: row.section ?? undefined,
    createdAt: row.created_at,
    status: row.status as Suggestion["status"],
  };
}

async function pgListPendingSuggestions(tenantId: string): Promise<Suggestion[]> {
  try {
    const db = getSupabase();
    if (!db) return [];
    const { data, error } = await db
      .from("suggestions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map(mapPgSuggestionRow);
  } catch {
    return [];
  }
}

async function pgFindPendingDuplicate(
  tenantId: string,
  type: string,
  section: string | null,
): Promise<Suggestion | null> {
  try {
    const db = getSupabase();
    if (!db) return null;
    let query = db
      .from("suggestions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .eq("type", type);
    query = section === null ? query.is("section", null) : query.eq("section", section);
    const { data, error } = await query.limit(1);
    if (error || !data || data.length === 0) return null;
    return mapPgSuggestionRow(data[0]);
  } catch {
    return null;
  }
}

async function pgInsertSuggestion(suggestion: Suggestion): Promise<void> {
  try {
    const db = getSupabase();
    if (!db) return;
    await db.from("suggestions").insert(suggestionToInsert(suggestion));
  } catch {
    // swallow — the dev-file write still happens for reversibility
  }
}

async function pgUpdateSuggestionStatus(
  tenantId: string,
  suggestionId: string,
  status: "accepted" | "dismissed",
): Promise<Suggestion | null> {
  try {
    const db = getSupabase();
    if (!db) return null;
    const { data, error } = await db
      .from("suggestions")
      .update({ status })
      .eq("tenant_id", tenantId)
      .eq("id", suggestionId)
      .select("*")
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return mapPgSuggestionRow(data[0]);
  } catch {
    return null;
  }
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
  if (dataSourceIsPostgres()) {
    const rows = await pgListPendingSuggestions(tenantId);
    return rows;
  }

  const store = await readSuggestions();
  // Newest-first to match the Postgres path (created_at desc) so callers that
  // take [0] get the latest pending suggestion in both modes.
  return (store[tenantId] || [])
    .filter((s) => s.status === "pending")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addSuggestion(suggestion: Omit<Suggestion, "id" | "createdAt" | "status">): Promise<Suggestion> {
  const entry: Suggestion = {
    ...suggestion,
    id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  if (dataSourceIsPostgres()) {
    // Dedupe against Postgres pending suggestions of the same type/section.
    const existing = await pgFindPendingDuplicate(
      suggestion.tenantId,
      suggestion.type,
      suggestion.section ?? null,
    );
    if (existing) return existing;

    await pgInsertSuggestion(entry);

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
  // Backstop dedup: never stack a second pending card for the same suggestion.
  // The suggestion-row dedup above can miss across stores/retries; this guards the
  // queue itself so a re-run can't flood "Needs you" with identical cards.
  const pending = await getEvents(suggestion.tenantId, { status: "pending", limit: 100 }).catch(() => []);
  if (pending.some((e) => e.type === "suggestion" && e.title === suggestion.title)) return;

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

/**
 * Maintenance cleanup for the "Needs you" queue: collapse duplicate pending
 * suggestion cards (keep the newest per title) and dismiss any whose title is no
 * longer valid for this tenant (e.g. blog nudges on a site with no content
 * engine). Only touches `suggestion`-type pending events — never real changes,
 * reviews, or structural requests. Returns the number of cards dismissed.
 */
export async function dedupePendingSuggestionEvents(
  tenant: string,
  opts?: { invalidTitles?: string[] },
): Promise<number> {
  const invalid = new Set(opts?.invalidTitles ?? []);
  const pending = await getEvents(tenant, { status: "pending", limit: 200 }).catch(() => []);
  const suggestions = pending
    .filter((e) => e.type === "suggestion")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const keptTitles = new Set<string>();
  let dismissed = 0;
  for (const event of suggestions) {
    const drop = invalid.has(event.title) || keptTitles.has(event.title);
    if (drop) {
      const { changed } = await resolveEvent(event.id, "dismissed", { actor: "system-cleanup" });
      if (changed) dismissed++;
    } else {
      keptTitles.add(event.title);
    }
  }
  return dismissed;
}

export async function updateSuggestion(
  tenantId: string,
  suggestionId: string,
  status: "accepted" | "dismissed",
): Promise<Suggestion | null> {
  if (dataSourceIsPostgres()) {
    const pgUpdated = await pgUpdateSuggestionStatus(tenantId, suggestionId, status);
    return pgUpdated;
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

// --- Generation ---

export async function generateSuggestionsForTenant(tenantId: string): Promise<Suggestion[]> {
  const contentSections: ContentSection[] = [
    "hero", "services", "story", "testimonials", "events",
    "providers", "contact", "settings", "faq",
  ];

  const [timestamps, bookingClicks, settings, testimonials, events, services, dailyMetrics, products, tenantConfig] =
    await Promise.all([
      getSectionTimestamps(tenantId),
      getClickCounts("booking-click", tenantId),
      getContent("settings", tenantId),
      getContent("testimonials", tenantId),
      getContent("events", tenantId),
      getContent("services", tenantId),
      getDailyMetrics(tenantId, 14),
      getProducts(tenantId).catch(() => []),
      getTenantConfig(tenantId).catch(() => null),
    ]);

  // What the site already has, so we never recommend "enabling" something that's
  // already live (e.g. telling a store owner with 4 products to "enable e-commerce").
  const capabilities = {
    hasStore: products.length > 0,
    productCount: products.length,
    hasBlog: new Set(tenantConfig?.features ?? []).has("blog"),
  };

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
      // Deliberately numberless: this suggestion is stored and read days later,
      // so a baked-in "N this week vs M last week" goes stale and contradicts the
      // live headline/anomaly. The trigger math above still gates on the real dip.
      description: "Traffic dipped this week. Want me to draft a quick post or email to bring people back?",
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
      capabilities,
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

export interface TenantCapabilities {
  hasStore: boolean;
  productCount: number;
  hasBlog: boolean;
}

// Recommendations that ask the owner to "add a store / sell online" only make
// sense if they DON'T already have one. GLDF has 4 products live, so a "set up
// online sales" nudge reads as the AI not knowing the business. Gate on the real
// capability rather than trusting the model to notice.
const STORE_RECOMMENDATION_PATTERN =
  /\b(e-?commerce|online store|online shop|sell(ing)? (online|products)|online sales|shopping cart|storefront|set up (a )?(shop|store)|checkout)\b/i;

/** True when a generated recommendation should be dropped because the site
 *  already has the capability it's proposing (avoids "enable what exists"). */
export function recommendationConflictsWithCapabilities(
  reco: { title: string; description: string },
  capabilities: TenantCapabilities,
): boolean {
  const text = `${reco.title} ${reco.description}`;
  if (capabilities.hasStore && STORE_RECOMMENDATION_PATTERN.test(text)) return true;
  return false;
}

async function generateLlmSuggestion(data: {
  tenantId: string;
  settings: { siteName?: string; siteDescription?: string };
  services: { services?: Array<{ name: string }> };
  capabilities: TenantCapabilities;
  staleSections: Array<{ section: string; daysSinceUpdate: number }>;
  bookingClicks: { total: number; thisWeek: number };
  searchQueries: Array<{ query: string; clicks: number; impressions: number }>;
  thisWeekViews: number;
  lastWeekViews: number;
}): Promise<Omit<Suggestion, "id" | "createdAt" | "status"> | null> {
  try {
    const alreadyHas = [
      data.capabilities.hasStore
        ? `an online store with ${data.capabilities.productCount} product${data.capabilities.productCount === 1 ? "" : "s"} already for sale`
        : null,
      data.capabilities.hasBlog ? "a blog / content section" : null,
      (data.services.services || []).length ? "a services section" : null,
    ].filter(Boolean);

    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `You help a local business owner get more customers from their website. Suggest the single most useful next thing for them to do.

Business: ${data.settings.siteName || "this business"}
What they sell / do: ${data.settings.siteDescription || "not set"}
Services listed: ${(data.services.services || []).map((service) => service.name).join(", ") || "none listed"}
What the site ALREADY has: ${alreadyHas.length ? alreadyHas.join("; ") : "a basic site"}
Booking/CTA clicks this week: ${data.bookingClicks.thisWeek}
Visitors this week: ${data.thisWeekViews} (last week: ${data.lastWeekViews})
Sections needing a refresh: ${data.staleSections.map((section) => `${section.section} (${section.daysSinceUpdate} days)`).join(", ") || "none"}
What people search to find them: ${data.searchQueries.map((query) => `${query.query} (${query.clicks} clicks, ${query.impressions} impressions)`).join(", ") || "none"}

Write it the way you'd text the owner — plain, warm, and specific to their business. Rules:
- Talk about their actual products/customers, e.g. "Show off your best-selling apple snaps", not "optimize conversions".
- NEVER use tech, marketing, or feature-spec words: no "enable", "implement", "functionality", "integrate", "leverage", "utilize", "e-commerce", "solution", "seamless", "robust", "streamline", "empower", "unlock", "elevate", "cutting-edge", or "in today's". No em dashes.
- NEVER suggest adding something they already have (see "What the site ALREADY has"). If they already sell online, help them sell MORE, don't tell them to set up a store.

Return strict JSON:
{
  "title": "short, plain action in the owner's world",
  "description": "one warm sentence on why it helps them get more customers",
  "prompt": "the instruction for the AI to carry out once the owner approves"
}

No markdown. No extra text.`,
    });
    const parsed = JSON.parse(text.trim()) as { title?: string; description?: string; prompt?: string };
    if (!parsed.title || !parsed.description || !parsed.prompt) return null;

    // Post-filter guard: even with the prompt guidance, suppress any recommendation
    // that proposes a capability the site already has.
    if (recommendationConflictsWithCapabilities({ title: parsed.title, description: parsed.description }, data.capabilities)) {
      return null;
    }

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
