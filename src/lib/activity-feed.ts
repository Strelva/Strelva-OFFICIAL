/**
 * Owner-facing activity feed — the "what Strelva did for you" timeline.
 *
 * Turns the raw AI activity log (ActivityEntry[], already fetched on Today) into
 * warm, past-tense, owner-plain lines grouped by recency. This is the anti-churn
 * proof surface: local-business owners churn when they can't SEE the managed work,
 * not on price.
 *
 * Rules that keep it honest (NEVER fabricate):
 *  - Only genuinely-DONE work is shown. Pending drafts, saved-but-unpublished
 *    entries, and "dashboard only" reply drafts are skipped — they aren't live yet.
 *  - Internal/noisy events (cache invalidation) never reach the owner.
 *  - Every line maps to a real logged action; nothing is invented.
 */

import type { ActivityEntry } from "./storage/activity-store";

export type ActivityFeedKind =
  | "site"
  | "post"
  | "review"
  | "testimonial"
  | "look";

export interface ActivityFeedItem {
  /** Stable-ish key for React lists (time + label). */
  id: string;
  /** Warm, past-tense, owner-plain headline. */
  label: string;
  /** Optional supporting detail (e.g. a post title). */
  detail?: string;
  /** Drives the icon chosen by the component. */
  kind: ActivityFeedKind;
  /** ISO timestamp of the underlying action. */
  time: string;
}

export type ActivityFeedGroupLabel = "Today" | "This week" | "Earlier";

export interface ActivityFeedGroup {
  label: ActivityFeedGroupLabel;
  items: ActivityFeedItem[];
}

/** Owner-plain headline for each site section Strelva can update. */
const SECTION_LINES: Record<string, { label: string; kind: ActivityFeedKind }> = {
  hero: { label: "Refreshed your homepage", kind: "site" },
  services: { label: "Updated your services", kind: "site" },
  story: { label: "Refreshed your story", kind: "site" },
  testimonials: { label: "Added a customer review to your site", kind: "testimonial" },
  events: { label: "Updated your upcoming events", kind: "site" },
  providers: { label: "Updated your team", kind: "site" },
  contact: { label: "Updated your contact details", kind: "site" },
  settings: { label: "Updated your business info", kind: "site" },
  faq: { label: "Updated your FAQ", kind: "site" },
  shop: { label: "Refreshed your shop", kind: "site" },
  products: { label: "Updated your products", kind: "site" },
  theme: { label: "Refreshed how your site looks", kind: "look" },
  navigation: { label: "Updated your site menu", kind: "site" },
  footer: { label: "Updated your site footer", kind: "site" },
  rewardsConfig: { label: "Updated your rewards", kind: "site" },
};

/** Collection label (as logged) → owner-plain published line. */
const COLLECTION_LINES: Record<string, { label: string; kind: ActivityFeedKind }> = {
  blog: { label: "Published a new blog post", kind: "post" },
  video: { label: "Added a new video", kind: "post" },
  products: { label: "Added a new product", kind: "post" },
  product: { label: "Added a new product", kind: "post" },
};

/** Pull the first quoted string out of a log line (the entry title). */
function quotedTitle(text: string): string | undefined {
  const match = text.match(/"([^"]+)"/);
  return match?.[1]?.trim() || undefined;
}

/** Pull an N-star rating out of a review-reply log line. */
function reviewRating(text: string): number | undefined {
  const match = text.match(/(\d+)-star/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Translate one raw activity entry into an owner-facing line, or null if it
 * isn't done, isn't owner-meaningful, or is internal noise.
 */
export function translateActivityEntry(entry: ActivityEntry): ActivityFeedItem | null {
  const { type, section, text, eventStatus, time } = entry;

  // Not-yet-live work never counts as "what Strelva did".
  if (eventStatus === "pending") return null;
  if (typeof text === "string" && text.toLowerCase().includes("(pending")) return null;

  // Internal plumbing the owner should never see.
  if (type === "cache-invalidation") return null;

  const mk = (label: string, kind: ActivityFeedKind, detail?: string): ActivityFeedItem => ({
    id: `${time}-${label}`,
    label,
    kind,
    detail,
    time,
  });

  // Blog / video / product entries (collections). Only *published* is done —
  // AI-saved drafts and deletions are not owner-facing wins.
  if (type === "content") {
    const verb = text?.trim().toLowerCase().split(" ")[0];
    if (verb !== "published") return null;
    const collectionKey = Object.keys(COLLECTION_LINES).find((key) =>
      text.toLowerCase().includes(` ${key} entry`)
    );
    const line = collectionKey ? COLLECTION_LINES[collectionKey]! : { label: "Published a site update", kind: "post" as const };
    return mk(line.label, line.kind, quotedTitle(text));
  }

  // Google Business Profile actions Strelva published on the owner's approval.
  // These are only logged after a SUCCESSFUL live write (event-actions.ts), so
  // reaching here means the update is genuinely live on Google.
  if (type === "gbp-post") {
    return mk("Posted an update to your Google listing", "post", text?.trim() || undefined);
  }
  if (type === "gbp-hours") {
    return mk("Updated your hours on Google", "site");
  }
  if (type === "gbp-photo") {
    return mk("Added a photo to your Google listing", "look");
  }

  // Review replies. In this feed they arrive as AI-saved drafts ("dashboard
  // only") — not posted publicly yet, so skip them. A genuinely-posted reply
  // (no "dashboard only" marker) is a real win worth showing.
  if (type === "review-reply") {
    if (text?.toLowerCase().includes("dashboard only")) return null;
    const rating = reviewRating(text ?? "");
    return mk(
      rating ? `Replied to a new ${rating}-star review` : "Replied to a new review",
      "review"
    );
  }

  // AI content updates carry the section they touched.
  if (type === "ai" || section) {
    const line = section ? SECTION_LINES[section] : undefined;
    if (line) return mk(line.label, line.kind);
    return mk("Made an update to your site", "site");
  }

  return null;
}

/**
 * From the full activity log, the entries that represent STRELVA's own work —
 * the managed service the owner is paying for. That's Strelva's AI updates
 * (`actor:"ai"`), the Strelva team's done-for-you changes (`actor:"admin"` —
 * from the client's side there's no AI-vs-human line, it's all "Strelva managed
 * my site"), and posted review replies (drafted by Strelva, published on the
 * owner's approval, so logged `actor:"user"`). It deliberately EXCLUDES the
 * owner's OWN manual edits — a bare `actor:"user"` entry that isn't a review
 * reply — because translating those would claim the owner's work as ours, which
 * the feed must never do.
 */
export function selectStrelvaWork(entries: ActivityEntry[]): ActivityEntry[] {
  return entries.filter(
    (e) =>
      e.actor === "ai" ||
      e.actor === "admin" ||
      e.type === "review-reply" ||
      e.type.startsWith("gbp-")
  );
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Build the grouped owner-facing feed from the raw AI activity log.
 * Empty groups are dropped; an all-empty result signals the empty state.
 *
 * Performance: entries are translated and filtered eagerly until `maxItems`
 * translated items are collected, then the remainder of the list is skipped.
 * This avoids translating + sorting the full log (up to the caller's fetch
 * limit) when only a handful of items will be shown.
 */
export function buildActivityFeed(
  entries: ActivityEntry[],
  opts: { now?: Date; maxItems?: number } = {}
): ActivityFeedGroup[] {
  const now = opts.now ?? new Date();
  const maxItems = opts.maxItems ?? 8;

  // Translate entries in order (entries arrive newest-first from the store) and
  // stop once we have collected enough translated items. A stable sort is still
  // applied on the collected window so any out-of-order entries within it are
  // correctly sequenced.
  const items: ActivityFeedItem[] = [];
  for (const entry of entries) {
    if (items.length >= maxItems) break;
    const item = translateActivityEntry(entry);
    if (item !== null) items.push(item);
  }
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const todayStart = startOfDay(now);
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

  const groups: Record<ActivityFeedGroupLabel, ActivityFeedItem[]> = {
    Today: [],
    "This week": [],
    Earlier: [],
  };

  for (const item of items) {
    const t = new Date(item.time).getTime();
    if (t >= todayStart) groups.Today.push(item);
    else if (t >= weekStart) groups["This week"].push(item);
    else groups.Earlier.push(item);
  }

  return (["Today", "This week", "Earlier"] as ActivityFeedGroupLabel[])
    .map((label) => ({ label, items: groups[label] }))
    .filter((group) => group.items.length > 0);
}
