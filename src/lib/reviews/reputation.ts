/**
 * Reputation summary — the client-facing reputation header on the Reviews
 * surface. Composes the positive `getClientReviewSummary` (rating, counts,
 * reply coverage, praise themes) with a review-velocity trend, and frames every
 * number the honest, owner-plain way:
 *
 *   • Good numbers read as good numbers (verdict-first headline).
 *   • A low response rate is an OPPORTUNITY ("reply to N waiting reviews"),
 *     never shame.
 *   • Few reviews is "let's get more", never a red number.
 *
 * Built ONLY on the client-safe summary — no admin intelligence (concerns,
 * needs-a-reply queue, at-risk) ever enters this path. Synchronous, no model
 * call, so it runs inside the dashboard render.
 */

import type { ReviewItem } from "../types";
import {
  getClientReviewSummary,
  type ClientReviewSummary,
  type ThemeCount,
} from "./intelligence";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Below this many reviews we don't make confident claims — we invite more. */
const LOW_DATA_THRESHOLD = 4;
/** At/above this reply coverage the owner is "replying to most". */
const STRONG_COVERAGE = 70;

export interface VelocityMonth {
  /** `YYYY-MM` bucket key. */
  key: string;
  /** Short month label, e.g. "May". */
  label: string;
  count: number;
}

export interface ReviewVelocity {
  /** Trailing calendar months, oldest → newest. */
  months: VelocityMonth[];
  /** Most-recent 30-day window vs the 30 days before it. */
  trend: "up" | "down" | "flat";
  /** New reviews in the trailing 30 days. */
  recent: number;
  /** New reviews in the 30 days before that. */
  prior: number;
}

export interface ReputationSummary {
  summary: ClientReviewSummary;
  velocity: ReviewVelocity;
  /** Reviews with no owner reply yet — a count, never *which* (client-safe). */
  waitingReplies: number;
  /** Verdict-first headline, e.g. "Your reputation is strong — 4.9★ across 40 reviews…". */
  verdict: string;
  /** Owner-plain framing of the response rate — opportunity when low, never shame. */
  responseNote: string;
  /** True when there are too few reviews to make confident claims. */
  lowData: boolean;
  /** Positive praise themes (echoed from the client summary for the header chips). */
  lovedFor: ThemeCount[];
}

/**
 * Canonical Google "write a review" deep link from a Place ID — the SAME link
 * the order-review-request cron emails owners. Returns null when no Place ID is
 * configured, so the surface shows an honest "connect your listing" state
 * instead of inventing a URL. More reviews is the #1 reputation lever, so this
 * powers the one-tap "get more reviews" action on the reputation view.
 */
export function buildGoogleReviewLink(placeId: string | undefined | null): string | null {
  const id = placeId?.trim();
  if (!id) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}`;
}

/** A warm, ready-to-send message an owner can paste to a happy customer. */
export function buildReviewShareMessage(link: string): string {
  return `Loved working with us? A quick review helps: ${link}`;
}

function monthKey(time: number): string {
  const d = new Date(time);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** New-reviews-per-month for the trailing `count` calendar months + a 30-day trend. */
export function computeReviewVelocity(
  reviews: ReviewItem[],
  months = 6,
  now: number = Date.now(),
): ReviewVelocity {
  const times = reviews
    .map((r) => new Date(r.date).getTime())
    .filter((t) => Number.isFinite(t) && t > 0);

  const perMonth = new Map<string, number>();
  for (const t of times) {
    const key = monthKey(t);
    perMonth.set(key, (perMonth.get(key) || 0) + 1);
  }

  const anchor = new Date(now);
  const buckets: VelocityMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      count: perMonth.get(key) || 0,
    });
  }

  const recent = times.filter((t) => t >= now - 30 * DAY_MS).length;
  const prior = times.filter((t) => t >= now - 60 * DAY_MS && t < now - 30 * DAY_MS).length;
  let trend: ReviewVelocity["trend"] = "flat";
  if (recent > prior) trend = "up";
  else if (recent < prior) trend = "down";

  return { months: buckets, trend, recent, prior };
}

export function buildReputationSummary(
  reviews: ReviewItem[],
  now: number = Date.now(),
): ReputationSummary {
  const summary = getClientReviewSummary(reviews, 30, now);
  const velocity = computeReviewVelocity(reviews, 6, now);
  const waitingReplies = reviews.filter((r) => !r.reply).length;
  const total = summary.totalReviews;
  const avg = summary.averageRating;
  const coverage = summary.replyCoverage;
  const lowData = total < LOW_DATA_THRESHOLD;
  const plural = total === 1 ? "review" : "reviews";

  let verdict: string;
  if (total === 0) {
    verdict = "Let's get your first reviews in";
  } else if (avg >= 4.5) {
    verdict =
      coverage >= STRONG_COVERAGE
        ? `Your reputation is strong — ${avg.toFixed(1)}★ across ${total} ${plural}, and you reply to most of them`
        : `Your reputation is strong — ${avg.toFixed(1)}★ across ${total} ${plural}`;
  } else if (avg >= 4) {
    verdict = `People rate you well — ${avg.toFixed(1)}★ across ${total} ${plural}`;
  } else if (avg > 0) {
    verdict = `${avg.toFixed(1)}★ across ${total} ${plural} — every reply you add builds trust`;
  } else {
    verdict = `${total} ${plural} so far`;
  }

  let responseNote: string;
  if (total === 0) {
    responseNote = "Replies build trust";
  } else if (coverage >= 80) {
    responseNote = "You reply to most reviews";
  } else if (waitingReplies > 0) {
    responseNote = `Reply to ${waitingReplies} waiting ${waitingReplies === 1 ? "review" : "reviews"}`;
  } else {
    responseNote = "Replies build trust";
  }

  return {
    summary,
    velocity,
    waitingReplies,
    verdict,
    responseNote,
    lowData,
    lovedFor: summary.lovedFor,
  };
}
