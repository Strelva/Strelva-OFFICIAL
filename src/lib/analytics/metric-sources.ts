import { getActivity } from "@/lib/storage";

/**
 * Metric-source registry — the extensible spine for recaps. Each source knows how
 * to summarize its own contribution for a time window, so adding a new signal
 * (GBP, and later per-service, reviews-detail, etc.) means dropping one entry in
 * METRIC_SOURCES — it then flows into every recap (weekly + monthly) automatically.
 *
 * Today sources contribute owner-facing highlight lines (which feed both the
 * recap highlight list and the LLM narrative). The interface leaves room to add
 * live-tile / email-row renderers per source without touching the callers.
 */
export interface PeriodMetricContribution {
  /** Owner-facing lines, e.g. "Posted 2 updates to your Google listing". */
  highlights: string[];
}

export interface MetricSource {
  key: string;
  label: string;
  /** Summarize this source's contribution for the window, or null when it has
   *  nothing to say. Must never throw (the caller runs the whole registry). */
  forPeriod(tenant: string, from: Date, to: Date): Promise<PeriodMetricContribution | null>;
}

/**
 * Google Business — what Strelva published to the client's Google listing in the
 * window. Reads the owner-facing activity feed (gbp-* entries are logged only on
 * a SUCCESSFUL approval-write), so it counts genuinely-live work, never drafts.
 */
const gbpSource: MetricSource = {
  key: "gbp",
  label: "Google Business",
  async forPeriod(tenant, from, to) {
    const activity = await getActivity(tenant).catch(() => []);
    const inWindow = (iso: string) => {
      const d = new Date(iso);
      return d >= from && d <= to;
    };
    const gbp = activity.filter((a) => typeof a.type === "string" && a.type.startsWith("gbp-") && inWindow(a.time));
    if (gbp.length === 0) return null;

    const posts = gbp.filter((a) => a.type === "gbp-post").length;
    const hours = gbp.filter((a) => a.type === "gbp-hours").length;
    const photos = gbp.filter((a) => a.type === "gbp-photo").length;

    const highlights: string[] = [];
    if (posts) highlights.push(`Posted ${posts} update${posts > 1 ? "s" : ""} to your Google listing`);
    if (hours) highlights.push("Refreshed your hours on Google");
    if (photos) highlights.push(`Added ${photos} photo${photos > 1 ? "s" : ""} to Google`);
    return highlights.length ? { highlights } : null;
  },
};

/**
 * The registry. Add a source here (e.g. a per-service booking-click breakdown, a
 * GA4 channel source) and it shows up in every recap. Keep sources cheap +
 * fail-soft — a recap must never break because one source hiccuped.
 */
export const METRIC_SOURCES: MetricSource[] = [gbpSource];

/** Run every source for the window and flatten their highlight lines. */
export async function collectPeriodHighlights(tenant: string, from: Date, to: Date): Promise<string[]> {
  const results = await Promise.all(
    METRIC_SOURCES.map((s) => s.forPeriod(tenant, from, to).catch(() => null))
  );
  return results.filter((r): r is PeriodMetricContribution => !!r).flatMap((r) => r.highlights);
}
