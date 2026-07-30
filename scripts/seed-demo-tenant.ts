/**
 * Seed a full, ALIVE sales-demo tenant — a coherent 90-day story for one
 * well-run local business — across every dashboard store, so a prospect who
 * opens the demo dashboard sees the value of the managed service in 10 seconds.
 *
 * The business: Summit Heating & Cooling, a family-owned HVAC company in
 * Buffalo, NY (summithvacwny.com). Everything below is consistent with that one
 * story: real HVAC content, believable Western New York review text, a growing
 * traffic trend, a week of "what Strelva did for you" work, real leads, a few
 * things "Needs you", an AI-visibility scorecard, and an improving health grade.
 *
 * Where seed-demo-engagement.ts fills the OPERATIONAL stores for an existing
 * tenant, this script PROVISIONS the tenant first (via provisionTenant) and then
 * seeds a richer, longer (90-day) story tuned for the milestone + scorecard +
 * activity-feed surfaces — using the app's own lib writers, never raw stores
 * except where a store has no writer to clear it for a clean re-run.
 *
 * Usage:
 *   pnpm tsx scripts/seed-demo-tenant.ts [tenant-id]   # default: summit
 *
 * Re-runnable: it CLEARS the demo tenant's operational data first (reviews,
 * activity, metrics, inbox, events, leads, scan history) so re-running gives
 * clean, exact numbers and never duplicates. Content + the tenant record are
 * upserts, so provisioning simply resumes.
 *
 * Where it writes:
 *   - With prod env (`.env.local`: CONTENT/TENANTS/DATA_SOURCE=postgres + Upstash
 *     + Supabase) it writes the demo tenant straight to prod Postgres/Redis —
 *     i.e. it seeds a real, showable demo account. Isolated by tenant id, so it
 *     never touches a paying client. This is the intended way to build the demo.
 *   - Without those creds it degrades to the local dev-file / no-Redis paths (the
 *     Redis-backed stores no-op cleanly), so it always runs clean.
 */

import { existsSync, readFileSync } from "node:fs";

// Load .env.local / .env before any storage module reads process.env to decide
// its backend (Postgres vs Sanity vs dev-file).
for (const path of [".env.local", ".env"]) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key) continue;
    if (process.env[key]) continue;
    process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
  }
}

import type {
  HeroContent,
  ServicesContent,
  StoryContent,
  TestimonialsContent,
  ContactContent,
  SiteSettings,
  FaqContent,
  ReviewItem,
} from "../src/lib/types";
import type { VisibilitySnapshot } from "../src/lib/visibility/snapshots";
import type { AiAnswerResult } from "../src/lib/visibility/ai-answers";
import type { SerpResult } from "../src/lib/visibility/serp";
import type { ScanSummary, ScanHistoryPoint } from "../src/lib/scan-store";

const TENANT = process.argv[2] || "summit";
const SITE_NAME = "Summit Heating & Cooling";
const DOMAIN = "summithvacwny.com";
const OWNER_NAME = "Dave Prentice";
const OWNER_EMAIL = `owner@${DOMAIN}`;

/** ISO YYYY-MM-DD `daysAgo` days before today (UTC, stable). */
function dayKey(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** ISO timestamp `daysAgo` days before now (local mid-morning for realism). */
function tsAgo(daysAgo: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, (daysAgo * 7) % 60, 0, 0);
  return d.toISOString();
}

/** Deterministic 0..1 from a string so every re-run produces identical numbers. */
function hashFloat(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// ---------------------------------------------------------------------------
// 0. Clear — no store exposes a "wipe tenant" writer, so we clear the few
//    append-only stores directly for a clean, duplicate-free re-run. Postgres
//    rows are deleted by tenant; the Redis event/lead/scan keys use the same
//    stable key shapes the stores define (documented in each store file).
// ---------------------------------------------------------------------------

async function clearDemoData(tenant: string): Promise<void> {
  const { dataSourceIsPostgres } = await import("../src/lib/db/source-flags");
  const cleared: string[] = [];

  if (dataSourceIsPostgres()) {
    const { getSupabase } = await import("../src/lib/db/client");
    const db = getSupabase();
    if (db) {
      for (const table of [
        "reviews",
        "activity_log",
        "site_metrics",
        "inbox_items",
        "unified_events",
      ] as const) {
        try {
          await db.from(table).delete().eq("tenant_id", tenant);
          cleared.push(table);
        } catch (err) {
          console.warn(`  ! could not clear ${table}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  const { getRedis } = await import("../src/lib/redis");
  const redis = getRedis();
  if (redis) {
    try {
      // Events (also holds visibility snapshots): drop each body, then the index.
      const eventIds = await redis.zrange<string[]>(`events:${tenant}`, 0, -1);
      for (const id of eventIds) await redis.del(`event:${id}`);
      await redis.del(`events:${tenant}`);
      // Leads: drop each record, the index, and the short-lived dedup locks —
      // without the last, a re-run inside the 5-minute window silently no-ops.
      const leadIds = await redis.zrange<string[]>(`leads:${tenant}`, 0, -1);
      for (const id of leadIds) await redis.del(`lead:${tenant}:${id}`);
      await redis.del(`leads:${tenant}`);
      const dedupKeys = await redis.keys(`lead-dedup:${tenant}:*`);
      for (const k of dedupKeys) await redis.del(k);
      // Scan store: latest + history ring buffer.
      await redis.del(`reb:scan:${tenant}`);
      await redis.del(`reb:scan:hist:${tenant}`);
      cleared.push("redis:events", "redis:leads", "redis:scan");
    } catch (err) {
      console.warn(`  ! could not clear Redis keys: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`  ✓ cleared: ${cleared.length ? cleared.join(", ") : "nothing (no backend configured)"}`);
}

// ---------------------------------------------------------------------------
// 1. Provision + content
// ---------------------------------------------------------------------------

const hero: HeroContent = {
  headline: "Buffalo winters are brutal.\nYour furnace shouldn't be a gamble.",
  subheadline: "Summit Heating & Cooling · Family-owned in WNY since 2009",
  tagline:
    "Fast, honest heating and cooling for Buffalo and the Southtowns. Same-day AC and furnace repair, straight pricing before we start, and techs who leave your home cleaner than they found it.",
  ctaText: "Call (716) 555-0142",
  ctaLink: "tel:+17165550142",
  backgroundImageUrl:
    "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=2400&h=1600&fit=crop&q=90",
};

const services: ServicesContent = {
  sectionLabel: "What We Do",
  headline: "One call for heating, cooling, and everything in between.",
  description:
    "Whether it's 4 degrees in January or a heatwave in July, we get to you fast, tell you what it actually needs, and fix it right the first time. No surprise fees, no upselling a system you don't need.",
  services: [
    {
      id: "ac-repair",
      name: "AC Repair",
      description:
        "Not cooling? We diagnose it same-day and give you a flat price before we touch a thing. Most repairs are done in one visit — refrigerant, capacitors, compressors, thermostats, drainage, all of it.",
      duration: "Same-day service",
      price: "89 diagnostic",
      featured: true,
      who_its_for: "Homeowners whose AC quit in the heat and need it back today",
      booking_link: "tel:+17165550142",
      comingSoon: false,
      image_url:
        "https://images.unsplash.com/photo-1631545806609-c2b999c2b70b?w=1200&h=900&fit=crop&q=85",
    },
    {
      id: "furnace-repair",
      name: "Furnace Repair & Replacement",
      description:
        "From a furnace that won't light to a full high-efficiency replacement before winter, we handle it. We'll always try to repair before we recommend replacing — and if it's time for a new system, you get honest options at three price points.",
      duration: "Same-day repair",
      price: "89 diagnostic",
      featured: true,
      who_its_for: "Homeowners with no heat, short-cycling, or an aging furnace",
      booking_link: "tel:+17165550142",
      comingSoon: false,
      image_url:
        "https://images.unsplash.com/photo-1635424710928-0544e8512eae?w=1200&h=900&fit=crop&q=85",
    },
    {
      id: "ac-install",
      name: "AC Installation",
      description:
        "A right-sized, properly installed central air system makes a Buffalo summer bearable and cuts your bills. We size it to your home — not a rule of thumb — and register the manufacturer warranty for you.",
      duration: "1–2 day install",
      price: "Free estimate",
      featured: false,
      who_its_for: "Homeowners adding central air or replacing an old, loud, thirsty unit",
      booking_link: "tel:+17165550142",
      comingSoon: false,
      image_url:
        "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&h=900&fit=crop&q=85",
    },
    {
      id: "maintenance",
      name: "Seasonal Tune-Ups",
      description:
        "Two visits a year — spring for the AC, fall for the furnace — to catch small problems before they become 2 a.m. emergencies. Members get priority scheduling and 15% off any repair.",
      duration: "45–60 min",
      price: "129 / year",
      featured: false,
      who_its_for: "Homeowners who'd rather prevent the breakdown than pay for it",
      booking_link: "tel:+17165550142",
      comingSoon: false,
      image_url:
        "https://images.unsplash.com/photo-1607400201889-565b1ee75f8e?w=1200&h=900&fit=crop&q=85",
    },
  ],
};

const story: StoryContent = {
  sectionLabel: "Our Story",
  headline: "A family business,\nnot a call center.",
  accentText: "Buffalo, NY · Since 2009",
  statement:
    "Dave Prentice started Summit out of a single truck in Cheektowaga after fifteen years wrenching for the big shops. He was tired of watching them upsell his neighbors. That's still the whole idea.",
  paragraphs: [
    "We're a family-owned team of licensed, background-checked techs serving Buffalo, Amherst, Cheektowaga, West Seneca, Orchard Park, and the Southtowns. When you call, you get a person who knows the area — not a national dispatch line.",
    "We show up in the window we promise, wear boot covers in your house, and explain what's wrong in plain English before we do anything. You'll always know the price before the work starts.",
    "Fifteen years in, most of our work comes from neighbors telling neighbors. We'd like to keep it that way.",
  ],
  stats: [
    { value: "15+", label: "Years in WNY" },
    { value: "4.8★", label: "Google Rating" },
    { value: "Same-day", label: "Repairs" },
  ],
  quote:
    "We treat your furnace like it's keeping our own family warm — because your neighbor probably is our family.",
  quoteAttribution: "Dave Prentice, Owner",
  imageUrl:
    "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=1200&h=1600&fit=crop&q=85",
};

const testimonials: TestimonialsContent = {
  sectionLabel: "Neighbors Say",
  headline: "The people we've kept comfortable.",
  testimonials: [
    {
      id: "heatwave",
      quote:
        "Our AC died during that July heatwave with a newborn in the house. Summit had a tech out the same afternoon, had it running in an hour, and the price was exactly what they quoted. Lifesavers.",
      author: "Katie R.",
      location: "Orchard Park, NY",
    },
    {
      id: "honest",
      quote:
        "Another company told me I needed a whole new furnace. Mike from Summit found a cracked igniter, replaced it for a fraction of the cost, and showed me the old part. That kind of honesty earns a customer for life.",
      author: "Tom D.",
      location: "Amherst, NY",
    },
    {
      id: "ontime",
      quote:
        "On time, clean, and they explained everything without talking down to me. Booked them for the yearly tune-up plan on the spot.",
      author: "Angela M.",
      location: "West Seneca, NY",
    },
  ],
};

const contact: ContactContent = {
  headline: "No heat or no cooling? Call us now.",
  description:
    "We answer the phone and we schedule fast. Summer and winter, same-day service across Buffalo and the Southtowns.",
  email: `service@${DOMAIN}`,
  phone: "(716) 555-0142",
  address: "2280 Union Rd, Cheektowaga, NY 14227",
  hours: "Mon–Fri 7 AM–7 PM · Sat 8 AM–4 PM · 24/7 emergency line",
  locationTitle: "Serving Buffalo\n& the Southtowns",
  locationDescription:
    "Cheektowaga, Amherst, West Seneca, Orchard Park, Hamburg, Lancaster, Tonawanda, Kenmore, and Williamsville. If you're in Erie County, we're close.",
  instagramUrl: "",
  facebookUrl: "https://facebook.com/summithvacwny",
  googleMapsUrl: "https://maps.google.com/?q=Summit+Heating+Cooling+Cheektowaga+NY",
};

const settings: SiteSettings = {
  siteName: SITE_NAME,
  siteTagline: "Family-owned HVAC in Buffalo, NY",
  siteDescription:
    "Summit Heating & Cooling — same-day AC and furnace repair, installation, and seasonal tune-ups for Buffalo and the Southtowns. Honest pricing, on-time techs, family-owned since 2009.",
  siteKeywords:
    "AC repair Buffalo, furnace repair Buffalo NY, HVAC Cheektowaga, air conditioning installation Amherst NY, furnace replacement Western New York, heating and cooling Southtowns",
  ownerName: OWNER_NAME,
  ownerTitle: "Owner & Lead Technician",
  footerTagline: "Keeping Western New York comfortable since 2009.",
  copyrightText: "Summit Heating & Cooling",
  bookingUrl: "tel:+17165550142",
  instagramHandle: "",
  // Force the local-trades presence so Google Business + Reviews resolve to `shown`.
  businessModel: "local",
};

const faq: FaqContent = {
  sectionLabel: "Good to Know",
  headline: "Questions we get every week.",
  description: "Straight answers before you pick up the phone.",
  faqs: [
    {
      id: "same-day",
      question: "Can you really come out the same day?",
      answer:
        "In peak heat and cold, yes — we hold same-day slots open for no-heat and no-cool calls. Call early and we'll get you on the board. We also run a 24/7 emergency line for true after-hours failures.",
    },
    {
      id: "pricing",
      question: "How does pricing work?",
      answer:
        "There's an $89 diagnostic to find the problem, and that's credited toward the repair if you move forward. You get a flat, all-in price before any work starts — no hourly meter, no surprise line items.",
    },
    {
      id: "repair-vs-replace",
      question: "Will you push me to replace my system?",
      answer:
        "No. We fix what can be fixed. If a system is genuinely at the end of its life, we'll show you the failing part and give you honest repair-vs-replace numbers so you can decide — not a scare tactic.",
    },
    {
      id: "area",
      question: "Do you service my town?",
      answer:
        "We cover Buffalo and Erie County — Cheektowaga, Amherst, West Seneca, Orchard Park, Hamburg, Lancaster, Tonawanda, Kenmore, and Williamsville. Not sure? Give us a call, we'll tell you straight.",
    },
  ],
};

async function provisionAndContent(tenant: string): Promise<void> {
  const { provisionTenant } = await import("../src/lib/provisioning");
  const result = await provisionTenant({
    subdomain: tenant,
    siteName: SITE_NAME,
    ownerName: OWNER_NAME,
    ownerEmail: OWNER_EMAIL,
    industry: "HVAC",
    template: "trades",
    productionDomain: DOMAIN,
  });
  const provisioned = result.steps.filter((s) => s.status === "ok").map((s) => s.key);
  console.log(`  ✓ provisioned (${provisioned.join(", ") || "resumed existing"})`);

  const { setContent } = await import("../src/lib/storage");
  await setContent("hero", hero, tenant);
  await setContent("services", services, tenant);
  await setContent("story", story, tenant);
  await setContent("testimonials", testimonials, tenant);
  await setContent("contact", contact, tenant);
  await setContent("settings", settings, tenant);
  await setContent("faq", faq, tenant);
  console.log("  ✓ HVAC content set (hero, services, story, testimonials, contact, settings, faq)");

  // Backdate the tenant's createdAt so the 90-day milestone reads as a ~3-month-old
  // account. The milestone gates on daysSinceStart >= 14 from the tenant's createdAt;
  // a freshly-provisioned tenant (createdAt = today) would show "your recap is building"
  // despite the 90 days of seeded traffic/reviews/health below. Spread the full existing
  // config so the row isn't clobbered — only createdAt changes.
  const { getTenantConfig, updateTenant } = await import("../src/lib/tenants");
  const cfg = await getTenantConfig(tenant);
  if (cfg) {
    const started = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await updateTenant(tenant, { ...cfg, createdAt: started });
    console.log(`  ✓ backdated createdAt to ${started} (milestone reads ~95 days)`);
  }
}

/** Generate + store the weekly report from the seeded data so Analytics leads with a
 *  real report, not the "still warming up" empty state. generateWeeklyBrief reads the
 *  seeded traffic/reviews/activity/visibility and has a deterministic claims-safe
 *  fallback summary when Gemini is unavailable, so it always stores a brief. */
async function seedBrief(tenant: string): Promise<void> {
  const { generateWeeklyBrief } = await import("../src/lib/weekly-brief");
  try {
    await generateWeeklyBrief(tenant);
    console.log("  ✓ weekly report generated + stored (Analytics now leads with a real report)");
  } catch (err) {
    console.log(`  ! weekly report generation failed (non-fatal): ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Traffic — a growing 90-day trend written to site_metrics (Postgres) or the
//    dev-file store. trackClick only ever writes "today", so backfilling a trend
//    means writing the store's own daily-counter shape directly (same approach
//    seed-demo-engagement.ts takes; no public backfill API exists).
// ---------------------------------------------------------------------------

interface DayCounts {
  day: string;
  pageViews: number;
  bookingClicks: number;
  phoneClicks: number;
}

function buildTraffic(days = 90): DayCounts[] {
  const out: DayCounts[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = dayKey(d);
    const t = (days - 1 - d) / (days - 1); // 0 oldest .. 1 newest
    const base = 1.3 + t * 6.2; // ramps ~9/wk early to ~48/wk recent
    const dow = new Date(day + "T00:00:00Z").getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.6 : 1.05;
    const noise = 0.75 + hashFloat(day) * 0.6;
    const pageViews = Math.max(1, Math.round(base * weekend * noise));
    const bookingRate = 0.16 + hashFloat("bk" + day) * 0.12;
    const bookingClicks = Math.max(0, Math.round(pageViews * bookingRate));
    // Calls are the #1 HVAC conversion — a touch more common than online booking.
    const phoneRate = 0.2 + hashFloat("ph" + day) * 0.13;
    const phoneClicks = Math.max(0, Math.round(pageViews * phoneRate));
    out.push({ day, pageViews, bookingClicks, phoneClicks });
  }
  return out;
}

async function seedTraffic(tenant: string): Promise<void> {
  const traffic = buildTraffic(90);
  const { dataSourceIsPostgres } = await import("../src/lib/db/source-flags");

  const pvTotal = traffic.reduce((s, r) => s + r.pageViews, 0);
  const bcTotal = traffic.reduce((s, r) => s + r.bookingClicks, 0);
  const pcTotal = traffic.reduce((s, r) => s + r.phoneClicks, 0);
  const pvWeek = traffic.slice(-7).reduce((s, r) => s + r.pageViews, 0);
  const bcWeek = traffic.slice(-7).reduce((s, r) => s + r.bookingClicks, 0);
  const pcWeek = traffic.slice(-7).reduce((s, r) => s + r.phoneClicks, 0);

  if (dataSourceIsPostgres()) {
    const { getSupabase } = await import("../src/lib/db/client");
    const db = getSupabase();
    if (db) {
      const rows: Array<{ tenant_id: string; metric: string; day: string; count: number }> = [];
      for (const r of traffic) {
        rows.push({ tenant_id: tenant, metric: "page-view", day: r.day, count: r.pageViews });
        if (r.bookingClicks > 0)
          rows.push({ tenant_id: tenant, metric: "booking-click", day: r.day, count: r.bookingClicks });
        if (r.phoneClicks > 0)
          rows.push({ tenant_id: tenant, metric: "phone-click", day: r.day, count: r.phoneClicks });
      }
      // Upsert absolute counts (idempotent on re-run) in batches.
      for (let i = 0; i < rows.length; i += 200) {
        await db
          .from("site_metrics")
          .upsert(rows.slice(i, i + 200), { onConflict: "tenant_id,metric,day" });
      }
    } else {
      console.warn("  ! Supabase unavailable — traffic not written");
    }
  } else {
    // Dev-file store shape: store.__clicks["{event}:{date}"] and ":total".
    const { readDevContent, writeDevContent } = await import("../src/lib/storage/core");
    const store = await readDevContent(tenant);
    const clicks = (store.__clicks as Record<string, number>) ?? {};
    for (const r of traffic) {
      clicks[`page-view:${r.day}`] = r.pageViews;
      if (r.bookingClicks > 0) clicks[`booking-click:${r.day}`] = r.bookingClicks;
      if (r.phoneClicks > 0) clicks[`phone-click:${r.day}`] = r.phoneClicks;
    }
    clicks["page-view:total"] = pvTotal;
    clicks["booking-click:total"] = bcTotal;
    clicks["phone-click:total"] = pcTotal;
    store.__clicks = clicks;
    await writeDevContent(store, tenant);
  }

  console.log(
    `  ✓ traffic: ${pvTotal} page-views (${pvWeek} this week), ${bcTotal} booking clicks (${bcWeek} this week), ${pcTotal} calls (${pcWeek} this week) across 90 days`
  );
}

// ---------------------------------------------------------------------------
// 3. Reviews — ~40, ~4.8★, realistic WNY HVAC text, dated across 90 days.
// ---------------------------------------------------------------------------

type SeedReview = {
  source: ReviewItem["source"];
  author: string;
  rating: number;
  text: string;
  daysAgo: number;
  reply?: string;
};

const REVIEWS: SeedReview[] = [
  { source: "google", author: "Katie R.", rating: 5, daysAgo: 2, text: "AC quit during the heatwave with a two-week-old at home. Summit had Mike out the same afternoon, fixed it in under an hour, and charged exactly what they quoted. Cannot thank them enough." },
  { source: "google", author: "Thomas D.", rating: 5, daysAgo: 4, text: "Another shop said I needed a whole new furnace. Summit found a cracked igniter, replaced it for a fraction of the price, and showed me the old part. Honest people." },
  { source: "google", author: "Angela M.", rating: 5, daysAgo: 5, text: "On time, clean, and explained everything without the pressure. Signed up for the yearly tune-up plan right there." },
  { source: "google", author: "Rob S.", rating: 5, daysAgo: 8, text: "Called at 8am with no cooling, tech was in my driveway by 11. Dave's crew is the real deal — fair, fast, and friendly." },
  { source: "yelp", author: "Priya N.", rating: 5, daysAgo: 11, text: "New central air install in our Amherst home. They sized it properly, cleaned up completely, and registered the warranty for us. House has never been this comfortable." },
  { source: "google", author: "Mark H.", rating: 4, daysAgo: 13, text: "Good work and fair price on our furnace repair. Only reason for four stars is the first appointment window slipped a bit, but they called ahead to let me know." },
  { source: "google", author: "Jenna W.", rating: 5, daysAgo: 15, text: "Tony walked me through repair vs replace with actual numbers, no scare tactics. Ended up repairing and it's been running great. Rare to find this kind of honesty." },
  { source: "google", author: "Steve K.", rating: 5, daysAgo: 17, text: "Furnace died on the coldest night of the year. Their emergency line actually picked up and had someone here within two hours. Buffalo winters are no joke — these guys get it." },
  { source: "google", author: "Maria L.", rating: 5, daysAgo: 19, text: "Wore boot covers, laid down a mat, and left my basement cleaner than they found it. Fixed the AC and explained how to keep the filter right. Wonderful crew." },
  { source: "google", author: "Dan P.", rating: 5, daysAgo: 21, text: "Third summer in a row using Summit for the tune-up. They always find the little stuff before it turns into a breakdown. Worth every penny." },
  { source: "yelp", author: "Corey B.", rating: 5, daysAgo: 23, text: "Replaced a 22-year-old furnace with a high-efficiency unit. Quote was clear, no hidden fees, and the install crew was in and out in a day. Bills already dropped." },
  { source: "google", author: "Ashley T.", rating: 5, daysAgo: 25, text: "Mike is fantastic. Diagnosed a refrigerant leak other techs missed, sealed it, and the AC has been perfect since. Ask for him.", reply: "So glad Mike got to the bottom of that leak, Ashley. He is one of the best. Enjoy the cold air and thanks for the shout-out." },
  { source: "google", author: "Greg F.", rating: 4, daysAgo: 27, text: "Solid repair on our West Seneca rental. Reasonable price and they coordinated with my tenant directly, which I appreciated.", reply: "Happy to work directly with your tenant, Greg. Glad the West Seneca repair held up. Call us anytime you need us." },
  { source: "google", author: "Nicole R.", rating: 5, daysAgo: 29, text: "I never leave reviews but these guys earned it. No heat on a Sunday, they came out, no gouging, just fixed it and were kind about it.", reply: "No heat on a Sunday is no fun, Nicole. Glad we could get you warm without the runaround, and thank you for taking the time to write this." },
  { source: "google", author: "Bill M.", rating: 5, daysAgo: 32, text: "Family-owned and it shows. You talk to a real person who knows the area, not some call center three states away. Fixed our furnace right the first time.", reply: "Thanks Bill, that is exactly what we are going for. Grateful for your business and for being a good neighbor." },
  { source: "google", author: "Sandra V.", rating: 5, daysAgo: 34, text: "Prompt, professional, and honest about what our aging AC needed. Didn't try to sell us a whole system. We'll be back.", reply: "Appreciate you, Sandra. We would rather keep your AC running than sell you a system you do not need yet. See you next time." },
  { source: "google", author: "Kevin O.", rating: 5, daysAgo: 36, text: "Orchard Park homeowner here. Summit put in our central air two years ago and just did the spring tune-up. Consistent, dependable, fairly priced.", reply: "Two years and still going strong, Kevin. Thanks for having us back for the tune-up. Orchard Park treats us well." },
  { source: "yelp", author: "Hannah G.", rating: 5, daysAgo: 39, text: "Same-day AC repair in July, which felt like a miracle. Tech was respectful, quick, and the price didn't move from the quote. Highly recommend.", reply: "Same-day in July is the promise, Hannah. So glad we kept the quote steady and got you cool. Thank you." },
  { source: "google", author: "Paul D.", rating: 5, daysAgo: 41, text: "Had them out for a second opinion after a big-box company quoted me $9k. Summit fixed the actual problem for under $400. Enough said.", reply: "Second opinions are free for a reason, Paul. Glad we found the real fix and saved you thousands. Grateful you called us." },
  { source: "google", author: "Renee C.", rating: 4, daysAgo: 44, text: "Good experience overall. Furnace runs great now. Would have liked a little more notice before arrival, but the work was excellent.", reply: "Fair point on the notice, Renee, and we are tightening up our arrival texts. Thank you for trusting us with the furnace." },
  { source: "google", author: "Jim B.", rating: 5, daysAgo: 46, text: "Tony found a venting issue our last company created and fixed it properly. Clearly knows what he's doing. House is warm and safe now.", reply: "Tony takes venting seriously because safety comes first. So glad your home is warm and safe now, Jim. Thank you." },
  { source: "google", author: "Lauren S.", rating: 5, daysAgo: 48, text: "Booked the maintenance membership and it's already paid off — they caught a failing capacitor during the tune-up before it left us without AC in August.", reply: "That is exactly why the membership exists, Lauren. Catching that capacitor before August saved you a rough day. Thank you for signing up." },
  { source: "google", author: "Andrew K.", rating: 5, daysAgo: 51, text: "Cheektowaga local. These are your neighbors and they treat you like it. No heat call handled fast and cheerfully at 6am. Can't beat that.", reply: "6am no-heat calls are what neighbors do for each other, Andrew. Proud to serve Cheektowaga. Stay warm out there." },
  { source: "google", author: "Michelle P.", rating: 5, daysAgo: 53, text: "Clean, courteous, and they texted when the tech was on the way. AC blowing cold again same day. This is how service should be.", reply: "Glad the heads-up text helped, Michelle. Same-day cold air is the goal every time. Thank you for the kind review." },
  { source: "yelp", author: "Derek W.", rating: 5, daysAgo: 56, text: "Got three quotes for a furnace replacement. Summit was fair, explained the efficiency tradeoffs honestly, and didn't upsell. Chose them and no regrets.", reply: "We would rather explain the tradeoffs than upsell you, Derek. Thrilled you chose us for the furnace. Enjoy the savings." },
  { source: "google", author: "Karen H.", rating: 5, daysAgo: 58, text: "They squeezed us in during a cold snap when everyone else was booked a week out. Fixed the furnace and only charged for what they did.", reply: "Cold snaps are all hands on deck here, Karen. Glad we could fit you in and only charge for the work. Thank you." },
  { source: "google", author: "Frank T.", rating: 4, daysAgo: 61, text: "Reliable and honest. Repair held up great. Minor scheduling hiccup on the front end but the tech more than made up for it.", reply: "Thanks for the honesty on the scheduling, Frank, we are working on that. Glad the repair is holding up strong." },
  { source: "google", author: "Diana M.", rating: 5, daysAgo: 63, text: "Mike replaced our thermostat and took ten minutes to teach me how to program it. Little things like that keep me coming back.", reply: "Mike loves teaching the little things, Diana. Glad the new thermostat is treating you well. See you next season." },
  { source: "google", author: "Chris L.", rating: 5, daysAgo: 66, text: "Williamsville install. On time both days, spotless work, and the new system is whisper quiet compared to the old beast. Great crew.", reply: "Williamsville install done right, Chris. Nothing better than a quiet new system. Thank you for having us out." },
  { source: "google", author: "Sara J.", rating: 5, daysAgo: 68, text: "No cooling upstairs for weeks and two other companies couldn't figure it out. Summit found a duct problem in one visit. Finally comfortable.", reply: "Two companies missed it and we are glad we did not, Sara. Comfort upstairs at last. Thank you for your patience." },
  { source: "google", author: "Tony R.", rating: 5, daysAgo: 71, text: "Honest, fast, fair. Called for a furnace that wouldn't stay lit, fixed the flame sensor same day, didn't try to sell me anything extra.", reply: "Flame sensor sorted, no upsell, just the fix, Tony. That is how we like to do it. Thanks for the call." },
  { source: "yelp", author: "Beth A.", rating: 5, daysAgo: 74, text: "The whole team is professional and kind. From the person who answered the phone to the tech who did the work — top notch. Supporting local was easy here.", reply: "That means a lot, Beth. From the phones to the truck, we try to treat you like family. Thank you for supporting local." },
  { source: "google", author: "Nate F.", rating: 4, daysAgo: 77, text: "Quality AC repair at a fair price. Took slightly longer than estimated but they kept me updated the whole time.", reply: "Appreciate your patience when it ran long, Nate, and glad we kept you posted. Thank you for the fair review." },
  { source: "google", author: "Olivia D.", rating: 5, daysAgo: 80, text: "Summit did our seasonal furnace tune-up and found a small carbon monoxide risk we had no idea about. Fixed it on the spot. Genuinely grateful.", reply: "Olivia, safety comes first every time, so we are glad we caught it. Thank you for trusting us with your family's home." },
  { source: "google", author: "Ryan M.", rating: 5, daysAgo: 83, text: "Hamburg homeowner. New AC install went perfectly, and they haul away the old unit and clean up like they were never there. Highly recommend.", reply: "A clean job site is non-negotiable for us, Ryan. Glad the new Hamburg system is treating you right. Thank you." },
  { source: "google", author: "Gina P.", rating: 5, daysAgo: 85, text: "Fair, friendly, and they actually answer the phone. Fixed our AC before the big July heat hit. This is our HVAC company from now on.", reply: "We will always answer the phone, Gina. So glad we beat the July heat for you. Welcome to the family." },
  { source: "google", author: "Walter S.", rating: 5, daysAgo: 87, text: "Been using Summit since Dave had one truck. Fifteen years of honest work. They've never once steered me wrong. That loyalty is earned.", reply: "Fifteen years means the world to us, Walter. Dave still talks about the one-truck days. Thank you for your loyalty." },
  { source: "google", author: "Emily K.", rating: 5, daysAgo: 88, text: "Prompt emergency furnace repair in the dead of winter. Kind, competent, and reasonably priced when they easily could have gouged us. Real ones.", reply: "The dead of winter is no time to gouge anyone, Emily. Glad we got your heat back fast. Thank you for trusting us." },
  { source: "yelp", author: "Marcus J.", rating: 5, daysAgo: 89, text: "Switched to Summit after a bad experience with a national chain. Night and day. Local, honest, and they stand behind their work.", reply: "Welcome aboard, Marcus. Local and honest is the whole idea. Glad the switch paid off, and we will keep earning it." },
  { source: "google", author: "Patricia L.", rating: 5, daysAgo: 90, text: "Tune-up membership is the best money we spend on the house. Two visits a year and we've never had a surprise breakdown since we signed up.", reply: "No surprise breakdowns is exactly the promise, Patricia. Thank you for being a member and for the kind words." },
];

async function seedReviews(tenant: string): Promise<void> {
  const { addReview } = await import("../src/lib/reviews");
  let replied = 0;
  for (let i = 0; i < REVIEWS.length; i++) {
    const r = REVIEWS[i]!;
    const externalId = `seed-summit-${String(i + 1).padStart(2, "0")}`;
    await addReview(tenant, {
      source: r.source,
      author: r.author,
      rating: r.rating,
      text: r.text,
      date: dayKey(r.daysAgo),
      externalId,
      reply: r.reply,
      repliedAt: r.reply ? dayKey(r.daysAgo - 1) : undefined,
    });
    if (r.reply) replied++;
  }
  const avg = REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length;
  const fives = REVIEWS.filter((r) => r.rating === 5).length;
  console.log(
    `  ✓ ${REVIEWS.length} reviews (${fives}×5★, ${REVIEWS.length - fives}×4★, avg ${avg.toFixed(2)}★, ${replied} owner replies)`
  );
}

// ---------------------------------------------------------------------------
// 4. "What Strelva did for you" — recent managed work, actor ai/admin, in the
//    logged shapes translateActivityEntry() turns into owner-facing lines.
// ---------------------------------------------------------------------------

async function seedActivity(tenant: string): Promise<void> {
  const { logActivity } = await import("../src/lib/storage");
  const entries = [
    // Today
    { text: "Refreshed your homepage headline for the summer AC season", type: "ai", section: "hero", actor: "ai" as const, time: tsAgo(0, 9) },
    { text: 'Replied to a new 5-star review from Katie R. (5-star)', type: "review-reply", section: "reviews", actor: "user" as const, time: tsAgo(0, 11) },
    // This week
    { text: 'Published blog entry "5 signs your AC needs service before summer"', type: "content", section: "blog", actor: "ai" as const, time: tsAgo(2, 14) },
    { text: "Updated your hours for the summer schedule", type: "ai", section: "contact", actor: "ai" as const, time: tsAgo(3, 10) },
    { text: 'Replied to a new 5-star review from Angela M. (5-star)', type: "review-reply", section: "reviews", actor: "user" as const, time: tsAgo(4, 15) },
    { text: "Updated your services with same-day AC repair details", type: "ai", section: "services", actor: "admin" as const, time: tsAgo(5, 13) },
    // Earlier
    { text: 'Published blog entry "Repair or replace? An honest guide for Buffalo homeowners"', type: "content", section: "blog", actor: "ai" as const, time: tsAgo(9, 11) },
    { text: "Refreshed your story section with the family-owned history", type: "ai", section: "story", actor: "admin" as const, time: tsAgo(12, 16) },
  ];
  for (const e of entries) {
    await logActivity(
      { text: e.text, time: e.time, type: e.type, section: e.section, actor: e.actor, suppressEvent: true },
      tenant
    );
  }
  console.log(`  ✓ ${entries.length} activity entries (homepage, 2 blog posts, 2 replies, hours, services, story)`);
}

// ---------------------------------------------------------------------------
// 5. Leads — recent "who reached out" with realistic HVAC intent.
// ---------------------------------------------------------------------------

async function seedLeads(tenant: string): Promise<void> {
  const { recordLead } = await import("../src/lib/leads");
  const leads = [
    { name: "Jessica Hartman", email: "jhartman@gmail.com", message: "No cooling upstairs since last night — can someone come out today? We have a baby at home.", source: "contact-form" },
    { name: "Mike Sullivan", email: "msully44@yahoo.com", message: "Looking for a quote on a new high-efficiency furnace before winter. Current one is 20+ years old.", source: "quote" },
    { name: "Dana Whitfield", email: "dana.w@outlook.com", message: "Our AC is running but the house won't get below 78. Can you do a diagnostic this week?", source: "contact-form" },
    { name: "Ray Kowalski", email: "rkowalski@gmail.com", message: "Interested in the maintenance membership for a rental property in West Seneca. What does it cover?", source: "contact-form" },
  ];
  let saved = 0;
  for (const l of leads) {
    const rec = await recordLead(tenant, l);
    if (rec) saved++;
  }
  console.log(
    saved === leads.length
      ? `  ✓ ${saved} leads (same-day AC, furnace quote, weak cooling, membership)`
      : `  ~ ${saved}/${leads.length} leads saved (Redis required for the rest)`
  );
}

// ---------------------------------------------------------------------------
// 6. Needs you — pending approvals in the metadata.kind shapes the app uses.
// ---------------------------------------------------------------------------

async function seedApprovals(tenant: string): Promise<void> {
  const { addEvent } = await import("../src/lib/events");

  await addEvent({
    tenantId: tenant,
    source: "ai",
    type: "review",
    title: "Drafted reply for Rob S.'s 5-star review",
    body:
      "Thanks so much Rob! Getting you cool the same morning is exactly what we aim for — we appreciate you trusting Summit and the kind words about Dave's crew.",
    status: "pending",
    metadata: {
      kind: "review_reply_draft",
      reviewId: "seed-summit-04",
      rating: 5,
      author: "Rob S.",
      draftedReply:
        "Thanks so much Rob! Getting you cool the same morning is exactly what we aim for — we appreciate you trusting Summit and the kind words about Dave's crew.",
      reviewCreatedAt: dayKey(8),
    },
  });

  await addEvent({
    tenantId: tenant,
    source: "ai",
    type: "content_update",
    title: "Google post draft — summer AC tune-up offer",
    body:
      "Beat the July heat: book your AC tune-up now and get priority scheduling before the first heatwave. $129/year membership includes spring AC + fall furnace checks and 15% off repairs. Call (716) 555-0142.",
    status: "pending",
    metadata: {
      kind: "gbp_post_draft",
      summary:
        "Beat the July heat: book your AC tune-up now and get priority scheduling before the first heatwave. $129/year membership includes spring AC + fall furnace checks and 15% off repairs.",
      ctaUrl: "tel:+17165550142",
    },
  });

  await addEvent({
    tenantId: tenant,
    source: "ai",
    type: "content_update",
    title: "Summer hours update draft",
    body: "Extend Saturday hours to 8 AM–4 PM for the busy cooling season.",
    status: "pending",
    metadata: {
      kind: "gbp_hours_draft",
      hours: {
        monday: "7:00 AM – 7:00 PM",
        tuesday: "7:00 AM – 7:00 PM",
        wednesday: "7:00 AM – 7:00 PM",
        thursday: "7:00 AM – 7:00 PM",
        friday: "7:00 AM – 7:00 PM",
        saturday: "8:00 AM – 4:00 PM",
        sunday: "Emergency line only",
      },
    },
  });

  console.log("  ✓ 3 pending approvals (review reply, Google post, summer hours) → Needs you: 3");
}

// ---------------------------------------------------------------------------
// 7. AI-visibility — two snapshots (this week + last) with a positive trend.
// ---------------------------------------------------------------------------

function aiResult(query: string, mentioned: boolean, checkedAt: string): AiAnswerResult {
  return {
    query,
    model: "gemini-2.5-flash",
    probed: true,
    tenantMentioned: mentioned,
    competitors: [
      { name: "WNY Comfort Heating & Air", mentioned: true },
      { name: "Frontier HVAC Services", mentioned: !mentioned },
    ],
    checkedAt,
    methodologyNote:
      "Checked via gemini-2.5-flash at one point in time. AI answers vary by model, location, and session — a directional signal, not a definitive rank.",
  };
}

function serpResult(query: string, position: number | null, inPack: boolean, checkedAt: string): SerpResult {
  return {
    query,
    provider: "serper.dev",
    tenantPosition: position,
    tenantInLocalPack: inPack,
    competitors: [
      { name: "WNY Comfort Heating & Air", position: 2, inLocalPack: true },
      { name: "Frontier HVAC Services", position: 5, inLocalPack: false },
    ],
    checkedAt,
    skipped: false,
  };
}

const VIS_QUERIES = [
  "best AC repair Buffalo",
  "emergency furnace repair near me",
  "HVAC maintenance WNY",
  "furnace replacement Buffalo NY",
  "air conditioning installation Amherst NY",
];

async function seedVisibility(tenant: string): Promise<void> {
  const { saveVisibilitySnapshot } = await import("../src/lib/visibility/snapshots");

  const lastCheckedAt = tsAgo(7, 6);
  const thisCheckedAt = tsAgo(0, 6);

  // Last week: named in 2 of 5 probed answers.
  const lastMentions = [true, false, true, false, false];
  // This week: named in 4 of 5 — newly appearing in queries 1 and 3 (WoW win).
  const thisMentions = [true, true, true, true, false];

  const lastSnapshot: VisibilitySnapshot = {
    tenantId: tenant,
    trade: "HVAC company",
    towns: ["Buffalo", "Cheektowaga", "Amherst"],
    queriesPerWeek: 5,
    provider: "gemini-2.5-flash",
    checkedAt: lastCheckedAt,
    estimatedMonthlyCostUsd: 0.02,
    serpResults: [
      serpResult(VIS_QUERIES[0]!, 6, false, lastCheckedAt),
      serpResult(VIS_QUERIES[2]!, 8, false, lastCheckedAt),
      serpResult(VIS_QUERIES[3]!, null, false, lastCheckedAt),
    ],
    aiResults: VIS_QUERIES.map((q, i) => aiResult(q, lastMentions[i]!, lastCheckedAt)),
  };

  const thisSnapshot: VisibilitySnapshot = {
    tenantId: tenant,
    trade: "HVAC company",
    towns: ["Buffalo", "Cheektowaga", "Amherst"],
    queriesPerWeek: 5,
    provider: "gemini-2.5-flash",
    checkedAt: thisCheckedAt,
    estimatedMonthlyCostUsd: 0.02,
    serpResults: [
      serpResult(VIS_QUERIES[0]!, 3, true, thisCheckedAt),
      serpResult(VIS_QUERIES[2]!, 4, true, thisCheckedAt),
      serpResult(VIS_QUERIES[3]!, 7, false, thisCheckedAt),
    ],
    aiResults: VIS_QUERIES.map((q, i) => aiResult(q, thisMentions[i]!, thisCheckedAt)),
  };

  // Add last week's first so this week's is the most-recent snapshot on read.
  await saveVisibilitySnapshot(lastSnapshot);
  await saveVisibilitySnapshot(thisSnapshot);
  console.log("  ✓ 2 visibility snapshots (named in 2→4 of 5 AI answers, +2 new this week)");
}

// ---------------------------------------------------------------------------
// 8. Site health — dated scan history showing a solid C→B improvement.
// ---------------------------------------------------------------------------

async function seedHealth(tenant: string): Promise<void> {
  const { saveScanSummary, pushScanHistory } = await import("../src/lib/scan-store");

  const url = `https://${DOMAIN}`;
  const history: ScanHistoryPoint[] = [
    { scannedAt: dayKey(84), overallScore: 72, grade: "C" },
    { scannedAt: dayKey(56), overallScore: 76, grade: "C" },
    { scannedAt: dayKey(28), overallScore: 83, grade: "B" },
    { scannedAt: dayKey(3), overallScore: 87, grade: "B" },
  ];
  // Push oldest→newest so getScanHistory (which reverses) reads oldest→newest.
  for (const p of history) await pushScanHistory(tenant, p);

  const latest = history[history.length - 1]!;
  const summary: ScanSummary = {
    url,
    scannedAt: latest.scannedAt,
    overallScore: latest.overallScore,
    grade: latest.grade,
    categories: [
      { name: "SEO Foundations", slug: "seo-foundations", score: 90 },
      { name: "Security", slug: "security", score: 92 },
      { name: "AI Readability", slug: "ai-readability", score: 85 },
      { name: "Accessibility", slug: "accessibility", score: 82 },
      { name: "Trust Signals", slug: "trust", score: 88 },
      { name: "Content", slug: "content", score: 84 },
    ],
  };
  await saveScanSummary(tenant, summary);
  console.log("  ✓ site health: 4 dated scans, C·72 → B·87 (improving)");
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Seeding demo tenant "${TENANT}" — ${SITE_NAME} (${DOMAIN})\n`);

  console.log("Clearing prior demo data for a clean re-run...");
  await clearDemoData(TENANT);

  console.log("\nProvisioning + content...");
  await provisionAndContent(TENANT);

  console.log("\nSeeding the 90-day story...");
  await seedTraffic(TENANT);
  await seedReviews(TENANT);
  await seedActivity(TENANT);
  await seedLeads(TENANT);
  await seedApprovals(TENANT);
  await seedVisibility(TENANT);
  await seedHealth(TENANT);
  await seedBrief(TENANT);

  console.log(`\nDone. Open the demo dashboard for "${TENANT}" (admin host) — it should read alive on load.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
