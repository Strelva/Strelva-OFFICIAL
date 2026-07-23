/**
 * Analytics storage - click tracking, page views, section timestamps.
 *
 * When DATA_SOURCE=postgres, click-tracking reads/writes the Postgres
 * `site_metrics` table (per-day, per-metric counter: PK (tenant_id, metric, day));
 * otherwise it uses the dev-file store.
 *
 * NOTE: `site_metrics` is a numeric per-day counter, so it models the click data
 * cleanly (metric = event name, day = date, count = count; totals/weeks are
 * derived by summing rows — no synthetic `_total` row). Section-update timestamps
 * (recordSectionUpdate / getSectionTimestamps) are ISO-string values, not counts,
 * and have NO column in site_metrics — that path is Postgres-derived (content
 * updated_at) / dev-file.
 */

import { DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase } from "../db/client";

// --- Postgres (site_metrics) helpers — self-contained, never throw ---

/** UTC YYYY-MM-DD for a day-offset from now, matching the existing key scheme. */
function isoDay(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Increment the (tenant, metric, today) counter by 1. Best-effort; never throws. */
async function pgIncrementMetric(tenant: string, metric: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const day = isoDay();
  try {
    const { error } = await db.rpc("increment_site_metric", {
      p_tenant_id: tenant,
      p_metric: metric,
      p_day: day,
    });
    if (error) throw error;
  } catch {
    // tracking is fire-and-forget; swallow
  }
}

/** (day,count) rows for a metric in a tenant, optionally bounded to `day >=
 *  sinceDay`. Returns [] on any failure. Callers that only need a recent window
 *  MUST pass sinceDay — an unbounded read silently truncates at PostgREST's
 *  1,000-row cap (audit #4). */
async function pgMetricRows(
  tenant: string,
  metric: string,
  sinceDay?: string
): Promise<Array<{ day: string; count: number }>> {
  const db = getSupabase();
  if (!db) return [];
  try {
    let q = db
      .from("site_metrics")
      .select("day, count")
      .eq("tenant_id", tenant)
      .eq("metric", metric);
    if (sinceDay) q = q.gte("day", sinceDay);
    const { data } = await q;
    return (data ?? []) as Array<{ day: string; count: number }>;
  } catch {
    return [];
  }
}

type MetricSummary = { total: number; today: number; last7: number; prev7: number };

/**
 * Per-metric aggregates (all-time total + today / this-week / prior-week) for a
 * tenant, computed SERVER-SIDE via the site_metric_summary RPC — one row per
 * metric, so it can never hit the 1,000-row cap the raw scan did (audit #4). If
 * the RPC isn't deployed yet it falls back to the client-side scan (correctness
 * matches under the cap; the RPC is the fix above it) — deploy-before-migrate safe.
 */
async function pgMetricSummary(tenant: string): Promise<Map<string, MetricSummary>> {
  const db = getSupabase();
  const out = new Map<string, MetricSummary>();
  if (!db) return out;
  const today = isoDay();
  try {
    // site_metric_summary isn't in the generated RPC types yet (new migration),
    // so call through a narrow cast; the row shape is asserted below.
    type SummaryRow = { metric: string; total: number; today: number; last7: number; prev7: number };
    const rpc = db.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: SummaryRow[] | null; error: unknown }>;
    const { data, error } = await rpc("site_metric_summary", { p_tenant_id: tenant, p_today: today });
    if (error) throw error;
    for (const r of (data ?? []) as SummaryRow[]) {
      out.set(r.metric, {
        total: Number(r.total) || 0,
        today: Number(r.today) || 0,
        last7: Number(r.last7) || 0,
        prev7: Number(r.prev7) || 0,
      });
    }
    return out;
  } catch {
    const rows = await pgAllRows(tenant);
    const week = new Set<string>();
    for (let i = 0; i < 7; i++) week.add(isoDay(i));
    const prevWeek = new Set<string>();
    for (let i = 7; i < 14; i++) prevWeek.add(isoDay(i));
    for (const r of rows) {
      const s = out.get(r.metric) ?? { total: 0, today: 0, last7: 0, prev7: 0 };
      s.total += r.count;
      if (r.day === today) s.today += r.count;
      if (week.has(r.day)) s.last7 += r.count;
      if (prevWeek.has(r.day)) s.prev7 += r.count;
      out.set(r.metric, s);
    }
    return out;
  }
}

/** All (metric,day,count) rows for a tenant. Returns [] on any failure. */
async function pgAllRows(
  tenant: string
): Promise<Array<{ metric: string; day: string; count: number }>> {
  const db = getSupabase();
  if (!db) return [];
  try {
    const { data } = await db
      .from("site_metrics")
      .select("metric, day, count")
      .eq("tenant_id", tenant);
    return (data ?? []) as Array<{ metric: string; day: string; count: number }>;
  } catch {
    return [];
  }
}

// --- Click tracking ---

export async function trackClick(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  if (dataSourceIsPostgres()) {
    await pgIncrementMetric(tenant, event);
  } else {
    const store = await readDevContent(tenant);
    const clicks = (store.__clicks as Record<string, number>) ?? {};
    clicks[`${event}:${today}`] = (clicks[`${event}:${today}`] || 0) + 1;
    clicks[`${event}:total`] = (clicks[`${event}:total`] || 0) + 1;
    store.__clicks = clicks;
    await writeDevContent(store, tenant);
  }
}

export async function getClickCounts(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<{ total: number; today: number; thisWeek: number; lastWeek: number }> {
  const today = new Date().toISOString().slice(0, 10);

  if (dataSourceIsPostgres()) {
    const s = (await pgMetricSummary(tenant)).get(event);
    return {
      total: s?.total ?? 0,
      today: s?.today ?? 0,
      thisWeek: s?.last7 ?? 0,
      lastWeek: s?.prev7 ?? 0,
    };
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};
  const total = clicks[`${event}:total`] || 0;
  const todayCount = clicks[`${event}:${today}`] || 0;
  let weekCount = 0;
  let lastWeekCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    weekCount += clicks[`${event}:${key}`] || 0;
  }
  for (let i = 7; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    lastWeekCount += clicks[`${event}:${key}`] || 0;
  }
  return { total, today: todayCount, thisWeek: weekCount, lastWeek: lastWeekCount };
}

function newestIsoDate(keys: string[], event: string, separator: "_" | ":"): string | null {
  let newest: string | null = null;
  const prefix = `${event}${separator}`;
  for (const key of keys) {
    if (!key.startsWith(prefix) || key.endsWith(`${separator}total`)) continue;
    const date = key.slice(prefix.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!newest || date > newest) newest = date;
  }
  return newest;
}

export async function getLastClickDate(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<string | null> {
  if (dataSourceIsPostgres()) {
    // Just the latest row (the (tenant_id, day desc) index makes this O(1)), not
    // a full-history scan. audit #4.
    const db = getSupabase();
    if (!db) return null;
    try {
      const { data } = await db
        .from("site_metrics")
        .select("day")
        .eq("tenant_id", tenant)
        .eq("metric", event)
        .order("day", { ascending: false })
        .limit(1);
      const day = (data?.[0] as { day?: string } | undefined)?.day;
      return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
    } catch {
      return null;
    }
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};
  return newestIsoDate(Object.keys(clicks), event, ":");
}

export interface DailyMetric {
  date: string;
  pageViews: number;
  bookingClicks: number;
  /** Phone-link taps, folded into "customer actions" alongside booking clicks.
   *  Optional so existing fixtures/consumers stay valid; getDailyMetrics always
   *  populates it. */
  phoneClicks?: number;
}

export async function getDailyMetrics(
  tenant: string = DEFAULT_TENANT,
  days: number = 30
): Promise<DailyMetric[]> {
  const result: DailyMetric[] = [];

  if (dataSourceIsPostgres()) {
    // The series only needs the last `days` days — bound the read so it never
    // scans full history (and never trips the 1,000-row cap). audit #4.
    const since = isoDay(days - 1);
    const pageRows = await pgMetricRows(tenant, "page-view", since);
    const bookingRows = await pgMetricRows(tenant, "booking-click", since);
    const phoneRows = await pgMetricRows(tenant, "phone-click", since);
    const pageByDay = new Map<string, number>();
    const bookByDay = new Map<string, number>();
    const phoneByDay = new Map<string, number>();
    for (const r of pageRows) pageByDay.set(r.day, (pageByDay.get(r.day) || 0) + r.count);
    for (const r of bookingRows) bookByDay.set(r.day, (bookByDay.get(r.day) || 0) + r.count);
    for (const r of phoneRows) phoneByDay.set(r.day, (phoneByDay.get(r.day) || 0) + r.count);
    for (let i = days - 1; i >= 0; i--) {
      const key = isoDay(i);
      result.push({
        date: key,
        pageViews: pageByDay.get(key) || 0,
        bookingClicks: bookByDay.get(key) || 0,
        phoneClicks: phoneByDay.get(key) || 0,
      });
    }
    return result;
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({
      date: key,
      pageViews: clicks[`page-view:${key}`] || 0,
      bookingClicks: clicks[`booking-click:${key}`] || 0,
      phoneClicks: clicks[`phone-click:${key}`] || 0,
    });
  }
  return result;
}

export async function getClickCountsByPrefix(
  prefix: string,
  tenant: string = DEFAULT_TENANT
): Promise<Record<string, { total: number; thisWeek: number }>> {
  const result: Record<string, { total: number; thisWeek: number }> = {};

  if (dataSourceIsPostgres()) {
    for (const [metric, s] of await pgMetricSummary(tenant)) {
      if (!metric.startsWith(prefix)) continue;
      result[metric] = { total: s.total, thisWeek: s.last7 };
    }
    return result;
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};

  for (const key of Object.keys(clicks)) {
    if (key.startsWith(prefix) && key.endsWith(":total")) {
      const event = key.slice(0, -":total".length);
      let weekCount = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        weekCount += clicks[`${event}:${d.toISOString().slice(0, 10)}`] || 0;
      }
      result[event] = { total: clicks[key] || 0, thisWeek: weekCount };
    }
  }
  return result;
}

// --- Content freshness ---
//
// Section-update timestamps are ISO-string values per section, which have no
// column in the numeric `site_metrics` table (metric/day/count). This path
// therefore stays on Sanity's automatic `_updatedAt` (prod) and the dev-file
// fallback — it is NOT migrated to Postgres. See columnMismatch in the handoff.

export async function recordSectionUpdate(
  section: string,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  // Postgres derives section timestamps from the content table's updated_at,
  // so no manual tracking is needed there — only the dev-file path records them.
  if (dataSourceIsPostgres()) return;

  const now = new Date().toISOString();
  const store = await readDevContent(tenant);
  const timestamps = (store.__sectionTimestamps as Record<string, string>) ?? {};
  timestamps[section] = now;
  store.__sectionTimestamps = timestamps;
  await writeDevContent(store, tenant);
}

export async function getSectionTimestamps(
  tenant: string = DEFAULT_TENANT
): Promise<Record<string, string>> {
  // Postgres equivalent of Sanity's per-doc _updatedAt: the content table carries
  // updated_at per (tenant_id, section), and `section` is already the section name.
  if (dataSourceIsPostgres()) {
    const db = getSupabase();
    if (db) {
      try {
        const { data, error } = await db
          .from("content")
          .select("section, updated_at")
          .eq("tenant_id", tenant);
        if (error) throw error;
        if (data && data.length > 0) {
          const timestamps: Record<string, string> = {};
          for (const row of data) timestamps[row.section] = row.updated_at;
          return timestamps;
        }
      } catch (err) {
        console.error(`[db] getSectionTimestamps ${tenant} failed:`, err instanceof Error ? err.message : err);
      }
    }
    // fall through to dev if Postgres is empty or errored
  }

  const store = await readDevContent(tenant);
  return (store.__sectionTimestamps as Record<string, string>) ?? {};
}
