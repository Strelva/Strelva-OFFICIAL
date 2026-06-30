import type { WeeklyBriefStats } from "./types";
import type { DailyMetric } from "./storage";

/** The metrics we render plain-English verdicts for. */
export type MetricKey = "visitors" | "bookings" | "reviews";

export interface MetricVerdict {
  key: MetricKey;
  label: string;
  value: number;
  delta?: number;
  /** "What this number means for your business" — the retention payload. */
  verdict: string;
  tone: "good" | "neutral" | "attention";
}

/**
 * Turn the raw weekly numbers into plain-English verdicts an owner can act on.
 * Deterministic (no AI call, no cost) so the report is instant and never blank.
 * The wording leads with the business meaning, not the metric name.
 */
export function metricVerdicts(stats: WeeklyBriefStats): MetricVerdict[] {
  const out: MetricVerdict[] = [];
  const { pageViews, bookingClicks, reviewsReceived } = stats;
  const viewsDelta = stats.pageViewsDelta ?? 0;

  // Visitors — the "are people finding you" signal.
  out.push({
    key: "visitors",
    label: "People found you",
    value: pageViews,
    delta: viewsDelta,
    ...(pageViews === 0
      ? {
          verdict:
            "No one found your site this week. Getting found is job one — connect Google Business and keep the site fresh so you start showing up.",
          tone: "attention" as const,
        }
      : viewsDelta > 0
        ? {
            verdict: `${viewsDelta} more people than last week. Whatever changed is working — keep the site active to hold the momentum.`,
            tone: "good" as const,
          }
        : viewsDelta < 0
          ? {
              verdict: `${Math.abs(viewsDelta)} fewer than last week. A fresh post or a small update usually pulls visitors back within a few days.`,
              tone: "attention" as const,
            }
          : {
              verdict: "Steady traffic. A timely offer or a new post is the fastest way to nudge it up.",
              tone: "neutral" as const,
            }),
  });

  // Bookings — the "did traffic turn into action" signal. Read as conversion.
  if (pageViews > 0) {
    // Floor to 1% when there were any clicks — "About 0% clicked" reads wrong.
    const rate = bookingClicks > 0 ? Math.max(1, Math.round((bookingClicks / pageViews) * 100)) : 0;
    out.push({
      key: "bookings",
      label: "Clicked to book",
      value: bookingClicks,
      delta: stats.bookingClicksDelta,
      ...(bookingClicks > 0
        ? {
            verdict: `About ${rate}% of your visitors clicked to book — that's the action that turns traffic into paying customers.`,
            tone: "good" as const,
          }
        : {
            verdict:
              "People visited but no one clicked to book. Make your booking or call button impossible to miss — that's usually the gap.",
            tone: "attention" as const,
          }),
    });
  }

  // Reviews — the "trust" signal local customers weigh most.
  out.push({
    key: "reviews",
    label: "New reviews",
    value: reviewsReceived,
    ...(reviewsReceived > 0
      ? {
          verdict: `${reviewsReceived} new review${reviewsReceived === 1 ? "" : "s"} — fresh reviews are the single biggest trust signal for local customers searching for you.`,
          tone: "good" as const,
        }
      : {
          verdict:
            "No new reviews this week. A quick ask right after a visit is the easiest way to get more — and they compound.",
          tone: "neutral" as const,
        }),
  });

  return out;
}

/** A minimal activity shape — just what proof correlation needs. */
export interface ProofActivity {
  text: string;
  time: string;
  actor?: "user" | "ai" | "admin";
}

export interface ProofCard {
  /** The change that preceded the lift, in the owner's words. */
  change: string;
  /** ISO date of the change. */
  changedAt: string;
  beforeAvg: number;
  afterAvg: number;
  deltaPct: number;
  /** "Traffic +20% after we refreshed your homepage" */
  headline: string;
}

const PROOF_WINDOW_DAYS = 7;
/** Min lift to count as proof — below this is noise, not a story. */
const PROOF_MIN_DELTA_PCT = 15;

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function shortenChange(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 70 ? `${t.slice(0, 67)}…` : t;
}

/**
 * Correlate AI site changes with the traffic that followed: for each change,
 * compare the {window} days BEFORE it to the {window} days AFTER. A meaningful
 * lift becomes a "before/after" proof card. Deliberately says "after", not
 * "because" — it's honest directional proof, not a causal claim, and that's
 * exactly the dopamine that keeps an owner subscribed.
 */
export function buildProofCards(
  activity: ProofActivity[],
  dailyMetrics: DailyMetric[],
): ProofCard[] {
  if (dailyMetrics.length < PROOF_WINDOW_DAYS * 2) return [];

  // Index daily page-views by YYYY-MM-DD for O(1) window lookups.
  const byDay = new Map<string, number>();
  for (const m of dailyMetrics) byDay.set(m.date, m.pageViews);
  const sortedDays = [...byDay.keys()].sort();
  const earliest = sortedDays[0];
  const latest = sortedDays[sortedDays.length - 1];

  const windowSum = (centerDay: string, dir: -1 | 1): number[] => {
    const vals: number[] = [];
    const center = new Date(centerDay + "T00:00:00Z");
    for (let i = 1; i <= PROOF_WINDOW_DAYS; i++) {
      const d = new Date(center);
      d.setUTCDate(center.getUTCDate() + dir * i);
      const key = d.toISOString().split("T")[0];
      if (byDay.has(key)) vals.push(byDay.get(key)!);
    }
    return vals;
  };

  const cards: ProofCard[] = [];
  const seen = new Set<string>();

  for (const entry of activity) {
    if (entry.actor !== "ai") continue;
    const day = entry.time.split("T")[0];
    // Need full windows on both sides within the metrics range.
    if (day <= earliest || day >= latest) continue;
    if (seen.has(day)) continue; // one card per change-day, strongest wins later

    const before = windowSum(day, -1);
    const after = windowSum(day, 1);
    if (before.length < PROOF_WINDOW_DAYS || after.length < PROOF_WINDOW_DAYS) continue;

    const beforeAvg = avg(before);
    const afterAvg = avg(after);
    if (beforeAvg <= 0) continue; // can't express a % lift off zero
    const deltaPct = Math.round(((afterAvg - beforeAvg) / beforeAvg) * 100);
    if (deltaPct < PROOF_MIN_DELTA_PCT) continue;

    seen.add(day);
    cards.push({
      change: shortenChange(entry.text),
      changedAt: entry.time,
      beforeAvg: Math.round(beforeAvg * 10) / 10,
      afterAvg: Math.round(afterAvg * 10) / 10,
      deltaPct,
      headline: `Traffic +${deltaPct}% after ${lowerFirst(shortenChange(entry.text))}`,
    });
  }

  // Strongest lifts first; an owner only needs the best one or two.
  return cards.sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 2);
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
