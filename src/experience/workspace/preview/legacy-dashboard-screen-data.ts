/**
 * Screen fixtures for the legacy dashboard preview (Harbor Dental). Typed
 * against the real domain types; fictional values only.
 */
import type { Booking, BookingConfig, DateOverride, ReviewItem, WeeklyBrief } from "@/lib/types";
import type { LeadRecord } from "@/lib/leads";
import type { Member } from "@/lib/rewards/types";
import type { OrderRecord, OrderSummary } from "@/lib/orders";
import type { Product } from "@/lib/products";
import type { ReplyVoice } from "@/lib/reviews/reply-voice";
import type { GbpState } from "@/lib/gbp-management";
import type { DailyMetric } from "@/lib/storage/analytics-store";
import type { SiteSnapshotSummary } from "@/lib/storage";
import type { ScanHistoryPoint, ScanSummary } from "@/lib/scan-store";
import type { PeriodStats } from "@/lib/analytics/period";
import { resolveRange } from "@/lib/analytics/period";
import type { SearchPerf, GaPerf } from "@/lib/analytics";
import type { Milestone } from "@/lib/milestone";
import type { AiVisibilityScorecard } from "@/lib/ai-visibility-scorecard";
import type { TrafficAnomaly } from "@/lib/anomaly";
import type { ProofCard } from "@/lib/proof";
import type { CompetitorBenchmark } from "@/lib/competitor-benchmark";
import type { Goal } from "@/lib/goals";
import type { UnifiedEvent } from "@/lib/types";
import type { LegacyState } from "./legacy-dashboard-fixtures";
import { LEGACY_TENANT, ago } from "./legacy-dashboard-fixtures";

const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
export const LEGACY_TODAY = day(0);

export function series(days: number, base = 40): DailyMetric[] {
  return Array.from({ length: days }, (_, i) => {
    const wave = Math.round(base + 14 * Math.sin(i / 2.4) + i * 0.9 + (i % 7 === 5 ? 18 : 0));
    return { date: day(i - days + 1), pageViews: Math.max(0, wave), bookingClicks: Math.round(wave / 9), phoneClicks: Math.round(wave / 14) } as DailyMetric;
  });
}

export function periodStats(state: LegacyState): PeriodStats {
  const range = resolveRange("live");
  const rows = state === "empty" ? series(7, 0).map((m) => ({ ...m, pageViews: 0, bookingClicks: 0, phoneClicks: 0 })) : series(7, 46);
  const pageViews = rows.reduce((s, r) => s + r.pageViews, 0);
  return {
    range, pageViews, pageViewsPrior: Math.round(pageViews * 0.85), pageViewsDelta: state === "empty" ? 0 : Math.round(pageViews * 0.15),
    actions: state === "empty" ? 0 : 41, actionsPrior: 34, actionsDelta: state === "empty" ? 0 : 7, bookingClicks: state === "empty" ? 0 : 29, bookingClicksPrior: 25,
    phoneClicks: state === "empty" ? 0 : 12, phoneClicksPrior: 9, series: rows, hasData: state !== "empty",
  };
}

export const SEARCH_PERF: SearchPerf = { status: "ok", clicks: 212, impressions: 4120, ctr: 0.05, position: 6, topQueries: [
  { query: "dentist elmwood buffalo", clicks: 64, impressions: 880, position: 3 },
  { query: "family dentist buffalo", clicks: 41, impressions: 1210, position: 7 },
  { query: "emergency dentist near me", clicks: 33, impressions: 940, position: 5 },
  { query: "kids dentist buffalo ny", clicks: 21, impressions: 510, position: 6 },
] };
export const GA_PERF: GaPerf = { status: "ok", users: 1540, sessions: 2010, pageviews: 3860,
  topPages: [{ path: "/", views: 1420 }, { path: "/new-patients", views: 610 }, { path: "/insurance", views: 402 }, { path: "/book", views: 377 }],
  topSources: [{ source: "google", sessions: 1120 }, { source: "(direct)", sessions: 470 }, { source: "maps.google.com", sessions: 260 }, { source: "facebook.com", sessions: 90 }] };
export const UNCONNECTED_SEARCH: SearchPerf = { status: "unconfigured", clicks: 0, impressions: 0, ctr: 0, position: 0, topQueries: [] };
export const UNCONNECTED_GA: GaPerf = { status: "unconfigured", users: 0, sessions: 0, pageviews: 0, topPages: [], topSources: [] };

export const ANOMALY: TrafficAnomaly = { type: "spike", deltaPct: 38, recentAvg: 62, baselineAvg: 45, headline: "Visits jumped 38% this week.", why: "Most of the new visits came from Google Maps after your hours changed.", suggestion: "Keep Saturday hours on your listing through December." } as TrafficAnomaly;

export const MILESTONE: Milestone = {
  state: "ready", startDate: day(-120), daysSinceStart: 120, periodLabel: "first 90 days",
  headline: "Since you started, visits more than doubled and your rating held at 4.9.",
  metrics: [
    { key: "visitors", label: "Visits", kind: "total", now: "5,820", then: null, direction: "up", trackingSince: null, caption: "people found you since launch" },
    { key: "reviews", label: "Reviews", kind: "change", now: "48", then: "31", direction: "up", trackingSince: null, caption: "on Google" },
    { key: "rating", label: "Rating", kind: "change", now: "4.9", then: "4.9", direction: "flat", trackingSince: null, caption: "steady" },
  ],
  buildingNote: "",
};

export const AI_VISIBILITY: AiVisibilityScorecard = { service: "dentist", mentionedCount: 3, total: 5, mentionedQueries: ["best family dentist in Buffalo", "dentist on Elmwood Ave", "same-week dental cleaning Buffalo"], newlyAppeared: ["same-week dental cleaning Buffalo"], hasData: true, checkedAt: ago(30) };

export function weeklyBrief(): WeeklyBrief {
  return {
    id: "brief-1", tenantId: LEGACY_TENANT, period: "week", weekStart: day(-7), weekEnd: day(-1),
    summary: "A strong week. 412 people found Harbor Dental, mostly from Google Maps after the new Saturday hours went up, and 29 of them clicked to book. Strelva refreshed the homepage and added Delta Dental to the insurance list. Two new five-star reviews mention how gentle Dr. Lin is with kids.",
    stats: { pageViews: 412, bookingClicks: 29, reviewsReceived: 2, contentUpdates: 3, pageViewsDelta: 54, bookingClicksDelta: 6, phoneClicks: 12, phoneClicksDelta: 2 },
    highlights: ["Saturday hours are now on your site and your Google listing.", "Two new five-star reviews this week.", "The new-patients page is your second most visited page."],
    nextAction: { title: "Add a page for same-week emergency visits", description: "People search for it on Sundays and you already offer it." },
    topServices: [{ name: "Cleanings", clicks: 14 } as WeeklyBrief["topServices"][number]],
    topSearchQueries: [{ query: "dentist elmwood buffalo", clicks: 64, impressions: 880, position: 3 } as WeeklyBrief["topSearchQueries"][number]],
    staleSections: [{ section: "faq", daysSinceUpdate: 64 } as WeeklyBrief["staleSections"][number]],
    createdAt: ago(20),
  };
}
export function briefHistory(): WeeklyBrief[] {
  const first = weeklyBrief();
  return [first, { ...first, id: "brief-0", weekStart: day(-14), weekEnd: day(-8), summary: "A steady week. 358 people found you and 23 clicked to book. Strelva replied to a review and refreshed your FAQ." }];
}
export const PROOF_CARDS: ProofCard[] = [{ change: "refreshed your homepage", changedAt: day(-12), beforeAvg: 41, afterAvg: 56, deltaPct: 37, headline: "Visits up 37% after the homepage refresh" } as ProofCard];
export const GOAL: Goal = { metric: "bookings", target: 30, setAt: ago(400) } as unknown as Goal;
export const BENCHMARK: CompetitorBenchmark = {
  headline: "You lead on two of three searches people use.",
  rows: [
    { query: "dentist elmwood buffalo", yourRank: 2, yourInPack: true, youLead: true, aiAnswerMentioned: true, competitors: [{ name: "Elmwood Family Dental", rank: 4, inPack: true }] },
    { query: "family dentist buffalo", yourRank: 6, yourInPack: false, youLead: false, aiAnswerMentioned: false, competitors: [{ name: "Buffalo Smiles", rank: 1, inPack: true }] },
  ],
} as unknown as CompetitorBenchmark;

export function reviews(state: LegacyState): ReviewItem[] {
  if (state === "empty") return [];
  return [
    { id: "r1", source: "google", externalId: "g-r1", author: "Ana Ruiz", rating: 5, text: "Dr. Lin was so gentle with my son. The front desk fit us in the same week and explained our insurance clearly.", date: day(-1) },
    { id: "r2", source: "google", externalId: "g-r2", author: "Jordan Pierce", rating: 4, text: "Quick cleaning, friendly team. Parking on Elmwood was the only hard part.", date: day(-4), reply: "Thank you, Jordan. There's a small lot behind the building off Lafayette; we'll add that to our directions.", repliedAt: day(-3) },
    { id: "r3", source: "google", externalId: "g-r3", author: "Priya Nair", rating: 5, text: "Best dental visit I've had in years. Calm office and no rush.", date: day(-9), reply: "Thank you, Priya. We're glad it felt calm.", repliedAt: day(-8) },
    { id: "r4", source: "google", externalId: "g-r4", author: "Sam Ortiz", rating: 5, text: "Came in with a chipped tooth on a Friday and left fixed.", date: day(-20), reply: "So glad we could help, Sam.", repliedAt: day(-19) },
  ];
}
export const REPLY_VOICE: ReplyVoice = { mode: "approve", guidance: "Warm and calm. First names. Thank them for something specific.", templates: [], updatedAt: ago(200) };
export const PRE_DRAFTS = { "g-r1": { reply: "Thank you, Ana. It was a pleasure to meet your son, and we're glad the same-week visit worked for your family.", autoPostAt: null } };

export function bookings(state: LegacyState): Booking[] {
  if (state === "empty") return [];
  const b = (id: string, offset: number, start: string, end: string, name: string, service: string, status: Booking["status"] = "confirmed"): Booking => ({ id, serviceId: service.toLowerCase(), serviceName: service, date: day(offset), startTime: start, endTime: end, clientName: name, clientEmail: `${name.split(" ")[0]!.toLowerCase()}@example.com`, clientPhone: "(716) 555-0187", status, createdAt: ago(48) });
  return [
    b("b1", 0, "08:30", "09:15", "Ana Ruiz", "Cleaning", state === "done" ? "completed" : "completed"),
    b("b2", 0, "10:30", "11:15", "Jordan Pierce", "Checkup", state === "done" ? "completed" : "confirmed"),
    b("b3", 0, "13:00", "13:45", "Mia Chen", "Child's first visit", state === "done" ? "completed" : "confirmed"),
    b("b4", 0, "15:15", "16:00", "Sam Ortiz", "Filling", state === "done" ? "completed" : "confirmed"),
    b("b5", 1, "09:00", "09:45", "Priya Nair", "Cleaning"),
    b("b6", 1, "11:00", "11:45", "Leo Grant", "Crown fitting"),
    b("b7", 3, "08:30", "09:15", "Dana Wills", "Cleaning"),
  ];
}
export const BOOKING_CONFIG: BookingConfig = {
  timezone: "America/New_York", slotDuration: 45, bufferTime: 15,
  weeklySchedule: [1, 2, 3, 4, 5].map((d) => ({ day: d, start: "08:00", end: "17:00", enabled: true })).concat([{ day: 6, start: "09:00", end: "13:00", enabled: true }, { day: 0, start: "09:00", end: "13:00", enabled: false }]),
} as unknown as BookingConfig;
export const OVERRIDES: DateOverride[] = [{ date: day(41), available: false, reason: "Thanksgiving" }, { date: day(42), available: false, reason: "Thanksgiving" }] as DateOverride[];

export function leads(state: LegacyState): LeadRecord[] {
  if (state === "empty") return [];
  return [
    { id: "l1", name: "Jordan Pierce", email: "jordan.pierce@example.com", message: "Do you take Cigna for a child's first cleaning? She's four.", source: "contact-form", createdAt: ago(5) },
    { id: "l2", name: "Priya Nair", email: "priya.n@example.com", message: "Looking for a Saturday checkup for two adults, any time before noon.", source: "contact-form", createdAt: ago(28) },
    { id: "l3", name: "Sam Ortiz", message: "Chipped a tooth, can I come in this week? Best to call (716) 555-0110.", source: "quote", createdAt: ago(50) },
  ] as LeadRecord[];
}

export function members(state: LegacyState): Member[] {
  if (state === "empty") return [];
  const m = (email: string, name: string, available: number, lifetime: number, tier: Member["tier"]) => ({ email, displayName: name, starsAvailable: available, starsLifetime: lifetime, tier, tierOverride: null, birthday: null, favoriteFruit: null, badges: [], subscriptionBonusClaimed: false } as unknown as Member);
  return [m("ana@example.com", "Ana Ruiz", 420, 860, "super-snapper"), m("jordan@example.com", "Jordan Pierce", 120, 240, "snapper"), m("mia@example.com", "Mia Chen", 60, 60, "snapper")];
}

export function store(state: LegacyState): { summary: OrderSummary | null; orders: OrderRecord[]; products: Product[] } {
  const products: Product[] = [
    { name: "Whitening kit", priceCents: 4900, currency: "USD", inStock: true },
    { name: "Kids' brushing set", priceCents: 1800, currency: "USD", inStock: true },
    { name: "Night guard fitting", priceCents: 12500, currency: "USD", inStock: false },
  ];
  if (state === "empty") return { summary: { orderCount: 0, revenueCents: 0, currency: "USD", topProducts: [] }, orders: [], products };
  const orders: OrderRecord[] = Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, verification: "site-signature", amountCents: [4900, 1800, 6700, 4900, 1800, 9800][i]!, currency: "USD", itemCount: [1, 1, 2, 1, 1, 2][i]!, items: [{ name: i % 2 ? "Kids' brushing set" : "Whitening kit", quantity: 1 }], createdAt: ago(20 + i * 30) } as unknown as OrderRecord));
  return { summary: { orderCount: 14, revenueCents: 52300, currency: "USD", topProducts: [{ name: "Whitening kit", quantity: 8 }, { name: "Kids' brushing set", quantity: 5 }] as OrderSummary["topProducts"] }, orders, products };
}

export function gbp(state: LegacyState): GbpState | null {
  if (state === "error") return null;
  return {
    regularHours: { periods: [
      ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map((d) => ({ openDay: d, closeDay: d, openTime: { hours: 8, minutes: 0 }, closeTime: { hours: 17, minutes: 0 } })),
      { openDay: "SATURDAY", closeDay: "SATURDAY", openTime: { hours: 9, minutes: 0 }, closeTime: { hours: 13, minutes: 0 } },
    ] },
    recentPosts: state === "empty" ? [] : [
      { name: "p1", summary: "Saturday hours are back: 9 to 1 every week.", createTime: ago(40) },
      { name: "p2", summary: "New patients welcome, kids and adults, same-week cleanings.", createTime: ago(200) },
    ],
    fetchedAt: ago(1),
  } as unknown as GbpState;
}

export function snapshots(state: LegacyState): SiteSnapshotSummary[] {
  if (state === "empty") return [];
  return [
    { id: "s1", label: "Daily save", createdAt: ago(6), sections: ["hero", "services", "faq", "contact"], status: "saved" },
    { id: "s2", label: "Before Thanksgiving hours", createdAt: ago(30), sections: ["hero", "services", "faq", "contact"], status: "saved" },
    { id: "s3", label: "Daily save", createdAt: ago(54), sections: ["hero", "services", "faq", "contact"], status: "saved" },
  ] as unknown as SiteSnapshotSummary[];
}
export const SCAN_LATEST: ScanSummary = { url: "https://harbordental.com", scannedAt: ago(9), overallScore: 92, grade: "A", categories: [] } as unknown as ScanSummary;
export const SCAN_HISTORY: ScanHistoryPoint[] = [{ scannedAt: ago(9 + 168 * 2), overallScore: 86, grade: "B" }, { scannedAt: ago(9 + 168), overallScore: 90, grade: "A" }, { scannedAt: ago(9), overallScore: 92, grade: "A" }];

export function historyEvents(state: LegacyState): UnifiedEvent[] {
  if (state === "empty") return [];
  return [
    { id: "evt-req-1", tenantId: LEGACY_TENANT, source: "ai", type: "change_request", title: "Add a Spanish version of the homepage", body: "For the families on the west side who ask for it.", status: "pending", createdAt: ago(80), metadata: { kind: "custom_code_or_design_request", workflowStatus: "in_progress", requestedAt: ago(80) } },
    { id: "evt-req-2", tenantId: LEGACY_TENANT, source: "ai", type: "content_update", title: "Thanksgiving hours on your homepage", body: "", status: "pending", createdAt: ago(3), metadata: { section: "hero" } },
    { id: "evt-req-3", tenantId: LEGACY_TENANT, source: "ai", type: "content_update", title: "Delta Dental added to the insurance list", body: "", status: "approved", createdAt: ago(60), resolvedAt: ago(58), metadata: { section: "services" } },
  ] as unknown as UnifiedEvent[];
}
