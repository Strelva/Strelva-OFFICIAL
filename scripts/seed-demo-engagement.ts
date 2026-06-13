/**
 * Seed a tenant's OPERATIONAL data so the owner dashboard demos like the live
 * product: visits, booking clicks, per-service interest, reviews, search terms,
 * recent activity, verified changes — and a real weekly receipt generated from
 * all of it.
 *
 * Why this exists: `seed-tenant.ts` seeds CONTENT (Sanity sections) so the demo
 * SITE looks real. But the dashboard's value story — "47 people found you this
 * week", the Monday receipt, top services, reviews — comes from operational data
 * in the analytics/reviews/search/events stores, which nothing seeds. Without
 * this, a prospect logging into the demo sees a polished site with an EMPTY
 * dashboard and a blank receipt. The wow is invisible. This fills it in.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-engagement.ts [tenant-id]   # default: demo
 *
 * Scope + safety:
 *   - Writes ONLY to the given tenant's namespaced keys. Default `demo` is
 *     isolated from real tenants. Re-running overwrites the demo's seeded
 *     counts/search (idempotent); reviews/activity/events append, so re-run on a
 *     clean demo tenant if you want exact numbers.
 *   - With prod env (`.env.local`, scope scaffold-web) it writes to prod Sanity/
 *     Redis for `demo`. Without creds it writes to the local dev store. Either
 *     way it never touches a paying tenant.
 *   - Prerequisite: run `npx tsx scripts/seed-tenant.ts demo` first so the demo
 *     CONTENT (services etc.) exists — this script reads the real service ids so
 *     "top services" maps to real names.
 */

import { existsSync, readFileSync } from "node:fs";

// Load .env.local / .env the same way seed-tenant.ts does, before any storage
// module reads process.env to decide Sanity-vs-dev.
for (const path of [".env.local", ".env"]) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
  }
}

const TENANT = process.argv[2] || "demo";

/** YYYY-MM-DD for `daysAgo` days before today (local). */
function dayKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * A believable 21-day ramp of daily counts. The last 7 days carry most of the
 * volume so the receipt's "this week" headline lands, while older days make the
 * "since launch" total exceed it (a real-looking trend, not a flat block).
 * Returns { "YYYY-MM-DD": count } plus the implied total.
 */
function rampDaily(thisWeekTotal: number, priorWeeksTotal: number): {
  daily: Record<string, number>;
  total: number;
} {
  const daily: Record<string, number> = {};
  // Distribute this-week volume across days 0..6 with a gentle weekday shape.
  const weekShape = [0.10, 0.18, 0.16, 0.15, 0.17, 0.14, 0.10]; // today..6d ago
  let allocated = 0;
  for (let i = 0; i < 7; i++) {
    const n = Math.max(1, Math.round(thisWeekTotal * weekShape[i]));
    daily[dayKey(i)] = n;
    allocated += n;
  }
  // Correct rounding drift onto today so the week sums exactly.
  daily[dayKey(0)] += thisWeekTotal - allocated;
  if (daily[dayKey(0)] < 0) daily[dayKey(0)] = 0;

  // Spread prior volume across days 7..20.
  let priorLeft = priorWeeksTotal;
  for (let i = 7; i < 21 && priorLeft > 0; i++) {
    const n = Math.max(1, Math.round(priorWeeksTotal / 14));
    const put = Math.min(n, priorLeft);
    daily[dayKey(i)] = put;
    priorLeft -= put;
  }

  const total = Object.values(daily).reduce((a, b) => a + b, 0);
  return { daily, total };
}

/**
 * Write a click event's daily history directly in the store shape `trackClick`
 * uses, for the active backend. `trackClick` only ever writes "today", so there
 * is no public API to backfill a trend — this mirrors its key shapes:
 *   - Sanity: doc `clicks-{tenant}`, field `clicks`, keys `{event}_{date}` + `{event}_total`
 *   - dev:    store.__clicks, keys `{event}:{date}` + `{event}:total`
 */
async function setClickHistory(
  tenant: string,
  event: string,
  daily: Record<string, number>,
  total: number,
): Promise<void> {
  const { hasSanity } = await import("../src/lib/storage/core");

  if (hasSanity) {
    const { getSanityClient } = await import("../src/lib/sanity");
    const client = getSanityClient();
    const docId = `clicks-${tenant}`;
    await client.createIfNotExists({
      _id: docId,
      _type: "activityLog",
      tenant,
      text: "click-tracking",
      activityType: "system",
      time: new Date().toISOString(),
      clicks: {},
    });
    // Read existing clicks map so we merge instead of clobbering other events.
    const existing = (await client.fetch(`*[_id == $docId][0].clicks`, { docId })) as
      | Record<string, number>
      | null;
    const clicks: Record<string, number> = { ...(existing || {}) };
    for (const [date, n] of Object.entries(daily)) clicks[`${event}_${date}`] = n;
    clicks[`${event}_total`] = total;
    await client.patch(docId).set({ clicks }).commit();
    return;
  }

  const { readDevContent, writeDevContent } = await import("../src/lib/storage/core");
  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};
  for (const [date, n] of Object.entries(daily)) clicks[`${event}:${date}`] = n;
  clicks[`${event}:total`] = total;
  store.__clicks = clicks;
  await writeDevContent(store, tenant);
}

async function seedClicks(tenant: string): Promise<void> {
  // Headline traffic.
  const pv = rampDaily(83, 240);
  await setClickHistory(tenant, "page-view", pv.daily, pv.total);

  // Total booking clicks (the base counter the receipt reads).
  const bc = rampDaily(19, 41);
  await setClickHistory(tenant, "booking-click", bc.daily, bc.total);
  console.log(`  ✓ page-view: ${pv.total} total (${83} this week)`);
  console.log(`  ✓ booking-click: ${bc.total} total (${19} this week)`);

  // Per-service booking clicks -> drives the "top services" breakdown. Use the
  // demo's REAL service ids so names render. Fall back to nothing if unseeded.
  const { getContent } = await import("../src/lib/storage");
  const services = await getContent("services", tenant);
  const ids = (services?.services || []).map((s) => s.id).slice(0, 3);
  const split = [11, 6, 4]; // this-week clicks per top service
  for (let i = 0; i < ids.length; i++) {
    const tw = split[i] ?? 2;
    const sd = rampDaily(tw, Math.round(tw * 2.2));
    await setClickHistory(tenant, `booking-click:${ids[i]}`, sd.daily, sd.total);
    console.log(`  ✓ booking-click:${ids[i]}: ${sd.total} total (${tw} this week)`);
  }
  if (ids.length === 0) {
    console.warn("  ! No services found — run `seed-tenant.ts demo` first for per-service data.");
  }
}

async function seedReviews(tenant: string): Promise<void> {
  const { addReview } = await import("../src/lib/reviews");
  const reviews: Array<Parameters<typeof addReview>[1]> = [
    {
      source: "google",
      author: "Marcus T.",
      rating: 5,
      text: "Booked in two minutes and the team was ready when I arrived. Site made it dead simple to find hours and services.",
      date: dayKey(3),
    },
    {
      source: "google",
      author: "Priya N.",
      rating: 5,
      text: "Exactly what I needed. Found them on Google, the website answered every question before I even called.",
      date: dayKey(8),
      reply:
        "Thank you Priya — so glad the site made it easy. See you again soon!",
      repliedAt: dayKey(7),
    },
    {
      source: "yelp",
      author: "Dan R.",
      rating: 4,
      text: "Great experience overall. Quick to respond and easy to schedule online.",
      date: dayKey(12),
    },
    {
      source: "google",
      author: "Alyssa M.",
      rating: 5,
      text: "Professional, fast, and the online booking just works. Highly recommend.",
      date: dayKey(18),
    },
  ];
  for (const r of reviews) await addReview(tenant, r);
  console.log(`  ✓ ${reviews.length} reviews (incl. 1 replied)`);
}

async function seedSearch(tenant: string): Promise<void> {
  const { setSearchData } = await import("../src/lib/storage");
  const queries = [
    { query: "near me open now", clicks: 14, impressions: 320, position: 3.2 },
    { query: "best in town reviews", clicks: 9, impressions: 210, position: 4.1 },
    { query: "book appointment online", clicks: 7, impressions: 140, position: 2.8 },
    { query: "hours and pricing", clicks: 5, impressions: 96, position: 5.0 },
    { query: "same day availability", clicks: 3, impressions: 71, position: 6.4 },
  ];
  await setSearchData(tenant, {
    queries,
    totalClicks: queries.reduce((s, q) => s + q.clicks, 0),
    totalImpressions: queries.reduce((s, q) => s + q.impressions, 0),
    fetchedAt: new Date().toISOString(),
  });
  console.log(`  ✓ ${queries.length} search queries`);
}

async function seedActivityAndEvents(tenant: string): Promise<void> {
  const { logActivity } = await import("../src/lib/storage");
  const { addEvent } = await import("../src/lib/events");

  const activity = [
    { text: "Updated business hours for the holiday weekend", type: "ai", time: dayKey(1), section: "contact", actor: "ai" as const },
    { text: "Published a new blog post: \"5 questions we get every week\"", type: "ai", time: dayKey(4), section: "blog", actor: "ai" as const },
    { text: "Refreshed the services section copy", type: "user", time: dayKey(6), section: "services", actor: "user" as const },
  ];
  for (const a of activity) await logActivity(a, tenant);

  // Verified changes -> the receipt's "checked live" proof-of-work lines.
  const verified = [
    { section: "hours", daysAgo: 1 },
    { section: "services", daysAgo: 6 },
  ];
  for (const v of verified) {
    await addEvent(
      {
        tenantId: tenant,
        source: "ai",
        type: "change_verified",
        title: `${v.section} updated`,
        body: `Confirmed the ${v.section} change is live on the public site.`,
        status: "approved",
        metadata: { section: v.section, checkedAt: dayKey(v.daysAgo) },
      },
      { requirePersistence: false },
    );
  }
  console.log(`  ✓ ${activity.length} activity entries + ${verified.length} verified changes`);
}

async function main(): Promise<void> {
  const { getTenantConfig } = await import("../src/lib/tenants");
  const config = await getTenantConfig(TENANT);
  if (!config) {
    console.error(`Tenant "${TENANT}" is not registered in src/lib/tenants.ts.`);
    process.exit(1);
  }

  console.log(`Seeding engagement for tenant: ${TENANT} (template: ${config.template})\n`);
  await seedClicks(TENANT);
  await seedReviews(TENANT);
  await seedSearch(TENANT);
  await seedActivityAndEvents(TENANT);

  // Generate the receipt from the seeded data so the dashboard's Reports tab and
  // the Monday email both have a real, plain-English story. Print it so you can
  // eyeball the demo narrative before showing it to anyone.
  console.log("\nGenerating the weekly receipt from seeded data...\n");
  const { generateWeeklyReport } = await import("../src/lib/reports");
  const report = await generateWeeklyReport(TENANT);
  if (!report) {
    console.warn("  ! Report did not generate (tenant inactive?). Data is still seeded.");
  } else {
    console.log("----- WEEKLY RECEIPT (preview) -----");
    console.log(`This week: ${report.pageViews.thisWeek} found you, ${report.bookingClicks.thisWeek} booking clicks`);
    console.log(`Since launch: ${report.pageViews.total} visits, ${report.bookingClicks.total} clicks`);
    console.log("");
    console.log(report.summary);
    console.log("------------------------------------");
  }

  console.log(`\nDone. View it at the demo dashboard (admin host for "${TENANT}") -> Reports.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
