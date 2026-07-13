/**
 * Analytics storage - click tracking, page views, section timestamps.
 *
 * Migration: when DATA_SOURCE=postgres, click-tracking reads/writes the Postgres
 * `site_metrics` table (per-day, per-metric counter: PK (tenant_id, metric, day)).
 * Sanity fallback on read; writes go to Postgres AND Sanity while both are
 * configured so the transition is reversible. Default off (Sanity path).
 *
 * NOTE: `site_metrics` is a numeric per-day counter, so it models the click data
 * cleanly (metric = event name, day = date, count = count; totals/weeks are
 * derived by summing rows — no synthetic `_total` row). Section-update timestamps
 * (recordSectionUpdate / getSectionTimestamps) are ISO-string values, not counts,
 * and have NO column in site_metrics — that path stays on Sanity (_updatedAt) /
 * dev-file unchanged. See columnMismatch note in the migration handoff.
 */

import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { SECTION_TO_TYPE } from "./content-store";
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

/** All (day,count) rows for a metric in a tenant. Returns [] on any failure. */
async function pgMetricRows(
  tenant: string,
  metric: string
): Promise<Array<{ day: string; count: number }>> {
  const db = getSupabase();
  if (!db) return [];
  try {
    const { data } = await db
      .from("site_metrics")
      .select("day, count")
      .eq("tenant_id", tenant)
      .eq("metric", metric);
    return (data ?? []) as Array<{ day: string; count: number }>;
  } catch {
    return [];
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

function sanityClickPath(key: string): string {
  return `clicks['${key.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}']`;
}

export async function trackClick(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  if (dataSourceIsPostgres()) {
    await pgIncrementMetric(tenant, event);
  }

  if (hasSanity) {
    // Use a single tracking document per tenant, increment counters
    const docId = `clicks-${tenant}`;
    const dailyKey = `${event}_${today}`;
    const totalKey = `${event}_total`;
    const dailyPath = sanityClickPath(dailyKey);
    const totalPath = sanityClickPath(totalKey);
    const client = getSanityClient();
    await client.createIfNotExists({
      _id: docId,
      _type: "activityLog",
      tenant,
      text: "click-tracking",
      activityType: "system",
      time: new Date().toISOString(),
      clicks: {},
    });
    await client
      .patch(docId)
      .setIfMissing({ clicks: {}, [dailyPath]: 0, [totalPath]: 0 })
      .inc({ [dailyPath]: 1, [totalPath]: 1 })
      .commit({ autoGenerateArrayKeys: true });
    return;
  }

  if (!dataSourceIsPostgres()) {
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
    const rows = await pgMetricRows(tenant, event);
    if (rows.length > 0 || !hasSanity) {
      const byDay = new Map<string, number>();
      let total = 0;
      for (const r of rows) {
        byDay.set(r.day, (byDay.get(r.day) || 0) + r.count);
        total += r.count;
      }
      const todayCount = byDay.get(today) || 0;
      let weekCount = 0;
      let lastWeekCount = 0;
      for (let i = 0; i < 7; i++) weekCount += byDay.get(isoDay(i)) || 0;
      for (let i = 7; i < 14; i++) lastWeekCount += byDay.get(isoDay(i)) || 0;
      return { total, today: todayCount, thisWeek: weekCount, lastWeek: lastWeekCount };
    }
    // fall through to Sanity only if Postgres empty and Sanity still configured
  }

  if (hasSanity) {
    const docId = `clicks-${tenant}`;
    const doc = await getSanityClient().fetch(`*[_id == $docId][0].clicks`, { docId });
    const clicks = (doc || {}) as Record<string, number>;

    const total = clicks[`${event}_total`] || 0;
    const todayCount = clicks[`${event}_${today}`] || 0;
    let weekCount = 0;
    let lastWeekCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      weekCount += clicks[`${event}_${key}`] || 0;
    }
    for (let i = 7; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      lastWeekCount += clicks[`${event}_${key}`] || 0;
    }
    return { total, today: todayCount, thisWeek: weekCount, lastWeek: lastWeekCount };
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
    const rows = await pgMetricRows(tenant, event);
    if (rows.length > 0 || !hasSanity) {
      let newest: string | null = null;
      for (const r of rows) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.day)) continue;
        if (!newest || r.day > newest) newest = r.day;
      }
      return newest;
    }
    // fall through to Sanity only if Postgres empty and Sanity still configured
  }

  if (hasSanity) {
    const docId = `clicks-${tenant}`;
    const doc = await getSanityClient().fetch(`*[_id == $docId][0].clicks`, { docId });
    const clicks = (doc || {}) as Record<string, number>;
    return newestIsoDate(Object.keys(clicks), event, "_");
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};
  return newestIsoDate(Object.keys(clicks), event, ":");
}

export interface DailyMetric {
  date: string;
  pageViews: number;
  bookingClicks: number;
}

export async function getDailyMetrics(
  tenant: string = DEFAULT_TENANT,
  days: number = 30
): Promise<DailyMetric[]> {
  const result: DailyMetric[] = [];

  if (dataSourceIsPostgres()) {
    const pageRows = await pgMetricRows(tenant, "page-view");
    const bookingRows = await pgMetricRows(tenant, "booking-click");
    if (pageRows.length > 0 || bookingRows.length > 0 || !hasSanity) {
      const pageByDay = new Map<string, number>();
      const bookByDay = new Map<string, number>();
      for (const r of pageRows) pageByDay.set(r.day, (pageByDay.get(r.day) || 0) + r.count);
      for (const r of bookingRows) bookByDay.set(r.day, (bookByDay.get(r.day) || 0) + r.count);
      for (let i = days - 1; i >= 0; i--) {
        const key = isoDay(i);
        result.push({
          date: key,
          pageViews: pageByDay.get(key) || 0,
          bookingClicks: bookByDay.get(key) || 0,
        });
      }
      return result;
    }
    // fall through to Sanity only if Postgres empty and Sanity still configured
  }

  if (hasSanity) {
    const docId = `clicks-${tenant}`;
    const doc = await getSanityClient().fetch(`*[_id == $docId][0].clicks`, { docId });
    const clicks = (doc || {}) as Record<string, number>;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({
        date: key,
        pageViews: clicks[`page-view_${key}`] || 0,
        bookingClicks: clicks[`booking-click_${key}`] || 0,
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
    const rows = await pgAllRows(tenant);
    if (rows.length > 0 || !hasSanity) {
      const week = new Set<string>();
      for (let i = 0; i < 7; i++) week.add(isoDay(i));
      for (const r of rows) {
        if (!r.metric.startsWith(prefix)) continue;
        const bucket = (result[r.metric] ??= { total: 0, thisWeek: 0 });
        bucket.total += r.count;
        if (week.has(r.day)) bucket.thisWeek += r.count;
      }
      return result;
    }
    // fall through to Sanity only if Postgres empty and Sanity still configured
  }

  if (hasSanity) {
    const docId = `clicks-${tenant}`;
    const doc = await getSanityClient().fetch(`*[_id == $docId][0].clicks`, { docId });
    const clicks = (doc || {}) as Record<string, number>;

    // Collect unique event names matching prefix (from _total keys)
    for (const key of Object.keys(clicks)) {
      if (key.startsWith(prefix) && key.endsWith("_total")) {
        const event = key.slice(0, -"_total".length);
        let weekCount = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          weekCount += clicks[`${event}_${d.toISOString().slice(0, 10)}`] || 0;
        }
        result[event] = { total: clicks[key] || 0, thisWeek: weekCount };
      }
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
  // With Sanity, _updatedAt is automatic - no manual tracking needed
  if (hasSanity) return;

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
    // fall through to Sanity/dev if Postgres is empty or errored
  }

  if (hasSanity) {
    const types = Object.values(SECTION_TO_TYPE);
    const rows = await getSanityReadClient().fetch<Array<{ _type: string; _updatedAt: string }>>(
      `*[_type in $types && tenant == $tenant]{ _type, _updatedAt }`,
      { types, tenant }
    );
    const typeToSection = Object.fromEntries(
      Object.entries(SECTION_TO_TYPE).map(([section, type]) => [type, section])
    );
    const timestamps: Record<string, string> = {};
    for (const row of rows || []) {
      const section = typeToSection[row._type];
      if (section && row._updatedAt) timestamps[section] = row._updatedAt;
    }
    return timestamps;
  }

  const store = await readDevContent(tenant);
  return (store.__sectionTimestamps as Record<string, string>) ?? {};
}
