/**
 * The 90-day "prove it" milestone — a structured before/after recap of what has
 * actually changed since a client started with Strelva.
 *
 * Research finding this exists to answer: local-business clients who aren't shown
 * a concrete win within ~90 days churn at a high rate. This turns the history we
 * already store (site-health scans, reviews, traffic) into a plain then -> now
 * recap the owner can read in five seconds.
 *
 * Honesty rails (non-negotiable — never fabricate a win):
 *  - Every number is measured from real stored history. We never invent a "then".
 *  - A metric with no earlier baseline shows "tracking since {date}", not a fake
 *    delta. (e.g. a rating with zero reviews at the start has no baseline.)
 *  - A flat or negative move is shown neutrally, never spun. Only genuinely
 *    positive moves become headline clauses.
 *  - Owner-facing only, matching the review split: the client sees good numbers as
 *    good numbers. There is no negative-sentiment or issues signal in here — those
 *    stay admin-side (getAdminReviewIntelligence).
 *  - The panel only claims a recap once there's enough history to be meaningful.
 *    Before that, it shows a forward-looking "your recap builds here" state.
 */

import type { ReviewItem } from "./types";
import type { ScanHistoryPoint } from "./scan-store";
import type { DailyMetric } from "./storage/analytics-store";
import { getScanHistory } from "./scan-store";
import { getReviews } from "./reviews";
import { getDailyMetrics } from "./storage";
import { getTenantConfig } from "./tenants";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The prove-it window. Copy leads with "first 90 days" once a tenant is this old. */
export const MILESTONE_WINDOW_DAYS = 90;
/** Below this age (or with nothing measured yet) we show the forward-looking state. */
export const MILESTONE_MIN_DAYS = 14;

export interface MilestoneMetric {
  key: "visitors" | "reviews" | "rating" | "health";
  label: string;
  /** "total" = a cumulative-since-start number (e.g. visitors). "change" = then -> now. */
  kind: "total" | "change";
  /** Formatted current value (or the running total for a "total" metric). */
  now: string;
  /** Formatted "then" value for a change metric; null when there is no baseline yet. */
  then: string | null;
  /** Honest direction. "new" = went from no baseline to a first real value. */
  direction: "up" | "down" | "flat" | "none" | "new";
  /** Present only when a change metric has no baseline: the date we began tracking it. */
  trackingSince: string | null;
  /** Owner-plain one-line caption under the value. */
  caption: string;
}

export interface Milestone {
  /** "ready" = enough history to show the recap. "building" = forward-looking state. */
  state: "ready" | "building";
  /** ISO date used as the start of the window (tenant createdAt, or earliest data). */
  startDate: string;
  daysSinceStart: number;
  /** "first 90 days" once old enough, else "first {n} days". */
  periodLabel: string;
  /** Verdict-first, plain, warm. Only genuinely positive moves appear here. */
  headline: string;
  metrics: MilestoneMetric[];
  /** Forward-looking copy shown when state === "building". */
  buildingNote: string;
}

export interface MilestoneInput {
  /** The tenant's start date (createdAt). Null falls back to the earliest data point. */
  startDate: string | null;
  now: number;
  scanHistory: ScanHistoryPoint[];
  reviews: ReviewItem[];
  dailyMetrics: DailyMetric[];
}

function toTime(value: string | undefined | null): number {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** "Jun 5" — deterministic (UTC) so the copy is stable across environments. */
function fmtDate(iso: string): string {
  const t = toTime(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function averageRating(reviews: ReviewItem[]): number {
  const rated = reviews.filter((r) => r.rating > 0);
  if (rated.length === 0) return 0;
  const sum = rated.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

/**
 * Resolve the window start. Prefer the tenant's real start date; fall back to the
 * earliest real data point we hold, so an older tenant with a missing createdAt
 * still gets an honest window rather than "0 days".
 */
function resolveStart(input: MilestoneInput): number {
  const explicit = toTime(input.startDate);
  if (Number.isFinite(explicit)) return explicit;

  const candidates: number[] = [];
  for (const p of input.scanHistory) {
    const t = toTime(p.scannedAt);
    if (Number.isFinite(t)) candidates.push(t);
  }
  for (const r of input.reviews) {
    const t = toTime(r.date);
    if (Number.isFinite(t)) candidates.push(t);
  }
  for (const d of input.dailyMetrics) {
    if (d.pageViews > 0 || d.bookingClicks > 0) {
      const t = toTime(d.date);
      if (Number.isFinite(t)) candidates.push(t);
    }
  }
  if (candidates.length > 0) return Math.min(...candidates);
  return input.now;
}

function firstReviewDate(reviews: ReviewItem[]): string | null {
  let earliest: number = NaN;
  let earliestIso: string | null = null;
  for (const r of reviews) {
    const t = toTime(r.date);
    if (!Number.isFinite(t)) continue;
    if (!Number.isFinite(earliest) || t < earliest) {
      earliest = t;
      earliestIso = r.date;
    }
  }
  return earliestIso;
}

function buildVisitors(input: MilestoneInput, startTime: number): MilestoneMetric | null {
  // Count the first-90-days window from the start (capped at now). For the tenant
  // this feature targets (14-90 days in), that's simply start -> now.
  const windowEnd = Math.min(input.now, startTime + MILESTONE_WINDOW_DAYS * DAY_MS);
  const startDay = dayKey(startTime);
  const endDay = dayKey(windowEnd);

  let total = 0;
  for (const d of input.dailyMetrics) {
    if (d.date >= startDay && d.date <= endDay) total += d.pageViews;
  }
  if (total <= 0) return null;

  return {
    key: "visitors",
    label: "People who found you",
    kind: "total",
    now: String(total),
    then: null,
    direction: "none",
    trackingSince: null,
    caption: `${total === 1 ? "person" : "people"} found you since you started`,
  };
}

function buildReviewsCount(
  reviews: ReviewItem[],
  baselineCount: number
): MilestoneMetric | null {
  const nowCount = reviews.length;
  if (nowCount <= 0) return null;

  const gained = nowCount - baselineCount;
  const direction = gained > 0 ? "up" : gained < 0 ? "down" : "flat";
  const caption =
    direction === "up"
      ? `${gained} new since you started`
      : direction === "flat"
        ? "same as when you started"
        : "since you started";

  return {
    key: "reviews",
    label: "Reviews",
    kind: "change",
    then: String(baselineCount),
    now: String(nowCount),
    direction,
    trackingSince: null,
    caption,
  };
}

function buildRating(
  reviews: ReviewItem[],
  baseline: ReviewItem[]
): MilestoneMetric | null {
  const nowRating = averageRating(reviews);
  if (nowRating <= 0) return null;

  const baselineRated = baseline.filter((r) => r.rating > 0);

  // No reviews at the start = no honest baseline. Show current, not a fake delta.
  if (baselineRated.length === 0) {
    return {
      key: "rating",
      label: "Your rating",
      kind: "change",
      then: null,
      now: nowRating.toFixed(1),
      direction: "new",
      trackingSince: fmtDate(firstReviewDate(reviews) ?? ""),
      caption: "since your first review",
    };
  }

  const thenRating = averageRating(baselineRated);
  const diff = nowRating - thenRating;
  const direction = diff >= 0.1 ? "up" : diff <= -0.1 ? "down" : "flat";
  const caption =
    direction === "up"
      ? "customers rate you higher"
      : direction === "flat"
        ? "steady since you started"
        : "since you started";

  return {
    key: "rating",
    label: "Your rating",
    kind: "change",
    then: thenRating.toFixed(1),
    now: nowRating.toFixed(1),
    direction,
    trackingSince: null,
    caption,
  };
}

function buildHealth(scanHistory: ScanHistoryPoint[]): MilestoneMetric | null {
  if (scanHistory.length === 0) return null;

  // getScanHistory returns oldest -> newest.
  const latest = scanHistory[scanHistory.length - 1];
  const latestValue = `${latest.grade} · ${latest.overallScore}`;

  // One point = we know where you are now, but there's no earlier baseline to
  // compare against yet. Honest "tracking since", not a fabricated move.
  if (scanHistory.length === 1) {
    return {
      key: "health",
      label: "Site health",
      kind: "change",
      then: null,
      now: latestValue,
      direction: "new",
      trackingSince: fmtDate(latest.scannedAt),
      caption: "site speed, security, SEO, accessibility",
    };
  }

  const earliest = scanHistory[0];
  const diff = latest.overallScore - earliest.overallScore;
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const caption =
    direction === "up"
      ? "your site got healthier"
      : direction === "flat"
        ? "holding steady"
        : "site speed, security, SEO, accessibility";

  return {
    key: "health",
    label: "Site health",
    kind: "change",
    then: `${earliest.grade} · ${earliest.overallScore}`,
    now: latestValue,
    direction,
    trackingSince: null,
    caption,
  };
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Verdict-first, warm, owner-plain. Built ONLY from genuinely positive moves so we
 * never spin a flat or down metric. When nothing is up, the headline is a neutral,
 * honest "here's where things stand" — still a verdict, never a fake win.
 */
function buildHeadline(metrics: MilestoneMetric[], periodLabel: string): string {
  const clauses: string[] = [];

  const visitors = metrics.find((m) => m.key === "visitors");
  if (visitors) {
    const n = visitors.now;
    clauses.push(`${n} ${n === "1" ? "person" : "people"} found you`);
  }

  const rating = metrics.find((m) => m.key === "rating");
  if (rating) {
    if (rating.direction === "up") {
      clauses.push(`your rating climbed to ${rating.now}★`);
    } else if (rating.direction === "new" && Number(rating.now) >= 4) {
      clauses.push(`you're holding a ${rating.now}★ rating`);
    }
  }

  const reviews = metrics.find((m) => m.key === "reviews");
  if (reviews && reviews.direction === "up" && clauses.length < 2) {
    const gained = Number(reviews.now) - Number(reviews.then);
    if (gained > 0) clauses.push(`you picked up ${gained} review${gained === 1 ? "" : "s"}`);
  }

  const health = metrics.find((m) => m.key === "health");
  if (health && health.direction === "up" && clauses.length < 2) {
    const grade = health.now.split("·")[0].trim();
    clauses.push(`your site health rose to ${grade}`);
  }

  const picked = clauses.slice(0, 2);
  if (picked.length === 0) {
    return `Here's what's changed since you started, ${periodLabel} in.`;
  }
  const joined = picked.length === 2 ? `${picked[0]} and ${picked[1]}` : picked[0];
  return `In your ${periodLabel}, ${capitalize(joined)}.`;
}

/**
 * Pure milestone computation. Given real stored history, produce the before/after
 * recap. Never fetches, never fabricates. This is the tested core.
 */
export function computeMilestone(input: MilestoneInput): Milestone {
  const startTime = resolveStart(input);
  const startDate = dayKey(startTime);
  const daysSinceStart = Math.max(0, Math.floor((input.now - startTime) / DAY_MS));
  const periodLabel =
    daysSinceStart >= MILESTONE_WINDOW_DAYS
      ? "first 90 days"
      : `first ${daysSinceStart} day${daysSinceStart === 1 ? "" : "s"}`;

  // Reviews that already existed at the start are the honest baseline; anything
  // newer is a real gain since the client came on.
  const baselineReviews = input.reviews.filter((r) => {
    const t = toTime(r.date);
    return Number.isFinite(t) && t <= startTime;
  });

  const metrics = [
    buildVisitors(input, startTime),
    buildRating(input.reviews, baselineReviews),
    buildReviewsCount(input.reviews, baselineReviews.length),
    buildHealth(input.scanHistory),
  ].filter((m): m is MilestoneMetric => m !== null);

  const state: Milestone["state"] =
    daysSinceStart >= MILESTONE_MIN_DAYS && metrics.length >= 1 ? "ready" : "building";

  return {
    state,
    startDate,
    daysSinceStart,
    periodLabel,
    headline: buildHeadline(metrics, periodLabel),
    metrics,
    buildingNote:
      "Once we've tracked a few weeks, this shows exactly what's changed since you started, then and now: who's finding you, your reviews, and your site health.",
  };
}

/**
 * Fetch the real stored history for a tenant and build its milestone. Every source
 * is guarded so one blip degrades to a partial recap rather than throwing it away.
 */
export async function buildMilestone(tenantId: string): Promise<Milestone> {
  const [tenant, scanHistory, reviews, dailyMetrics] = await Promise.all([
    getTenantConfig(tenantId).catch(() => undefined),
    getScanHistory(tenantId).catch(() => []),
    getReviews(tenantId).catch(() => []),
    getDailyMetrics(tenantId, MILESTONE_WINDOW_DAYS + 31).catch(() => []),
  ]);

  return computeMilestone({
    startDate: tenant?.createdAt ?? null,
    now: Date.now(),
    scanHistory,
    reviews,
    dailyMetrics,
  });
}
