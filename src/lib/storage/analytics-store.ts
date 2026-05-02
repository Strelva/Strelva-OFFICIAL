/**
 * Analytics storage - click tracking, page views, section timestamps.
 */

import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { SECTION_TO_TYPE } from "./content-store";

// --- Click tracking ---

export async function trackClick(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  if (hasSanity) {
    // Use a single tracking document per tenant, increment counters
    const docId = `clicks-${tenant}`;
    try {
      await getSanityClient()
        .patch(docId)
        .setIfMissing({ _type: "activityLog", tenant, text: "click-tracking", activityType: "system", time: new Date().toISOString(), clicks: {} })
        .inc({ [`clicks.${event}_${today}`]: 1, [`clicks.${event}_total`]: 1 })
        .commit({ autoGenerateArrayKeys: true });
    } catch {
      // Document doesn't exist yet
      await getSanityClient().createIfNotExists({
        _id: docId,
        _type: "activityLog",
        tenant,
        text: "click-tracking",
        activityType: "system",
        time: new Date().toISOString(),
      });
      await getSanityClient()
        .patch(docId)
        .setIfMissing({ clicks: {} })
        .inc({ [`clicks.${event}_${today}`]: 1, [`clicks.${event}_total`]: 1 })
        .commit({ autoGenerateArrayKeys: true });
    }
    return;
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};
  clicks[`${event}:${today}`] = (clicks[`${event}:${today}`] || 0) + 1;
  clicks[`${event}:total`] = (clicks[`${event}:total`] || 0) + 1;
  store.__clicks = clicks;
  await writeDevContent(store, tenant);
}

export async function getClickCounts(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<{ total: number; today: number; thisWeek: number; lastWeek: number }> {
  const today = new Date().toISOString().slice(0, 10);

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
