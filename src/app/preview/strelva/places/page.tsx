import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { WorkspaceReviewsView } from "@/experience/places/WorkspaceReviews";
import { WorkspaceResultsView } from "@/experience/places/WorkspaceResults";
import { WorkspaceBusinessDetails } from "@/experience/places/WorkspaceBusinessDetails";
import { resolveRange, type PeriodStats } from "@/lib/analytics/period";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import type { DetailsSaveOutcome } from "@/platform/business-record/details-save";
import type { PlaceState } from "@/platform/owner-entry/place-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Workspace places preview", robots: { index: false, follow: false } };

const WORKSPACE = "5e000000-0000-4000-8000-000000000010";
const STABLE = "5e000000-0000-4000-8000-0000000000b2";
const SITE = { tenantId: "juniper", tenantStableId: STABLE, siteName: "Juniper Bakery" };
const DENIED = [{ tenantId: "juniper-east", tenantStableId: STABLE, siteName: "Juniper East" }];

/** Fictional data for a fictional bakery. `place` picks the page, `state` the case. */
function frame<T>(state: string | undefined, ready: T, empty: T, unavailable: T, denied: T): PlaceState<T> {
  if (state === "permission") return { kind: "permission" };
  if (state === "error") return { kind: "error" };
  return { kind: "ready", data: state === "empty" ? empty : state === "unavailable" ? unavailable : state === "denied" ? denied : ready };
}

function stats(): PeriodStats {
  const series = Array.from({ length: 7 }, (_, day) => ({ date: `2026-10-0${day + 1}`, pageViews: 50 + day * 6, bookingClicks: day % 3, phoneClicks: day % 2 }));
  return { range: resolveRange("live"), pageViews: 486, pageViewsPrior: 426, pageViewsDelta: 14, actions: 23, actionsPrior: 19, actionsDelta: 21, bookingClicks: 15, bookingClicksPrior: 12, phoneClicks: 8, phoneClicksPrior: 7, series, hasData: true };
}

function record(access: BusinessRecord["access"]): BusinessRecord {
  const at = "2026-10-01T12:00:00Z";
  const by = "5e000000-0000-4000-8000-000000000002";
  return {
    workspaceId: WORKSPACE, access, revision: 7, lastSequence: 7, updatedAt: at,
    facts: {
      display_name: { value: "Juniper Bakery", source: "owner", verified: true, updatedAt: at, updatedBy: by },
      phone: { value: "(716) 555-0142", source: "tenant_import", verified: false, updatedAt: at, updatedBy: by },
      email: { value: "hello@juniper.example", source: "tenant_import", verified: false, updatedAt: at, updatedBy: by },
      description: { value: "A neighborhood bakery on Elmwood. Sourdough, seasonal pies and custom cakes.", source: "tenant_import", verified: false, updatedAt: at, updatedBy: by },
      owner_recipient: { value: { email: "maria@juniper.example", name: "Maria" }, source: "tenant_import", verified: false, updatedAt: at, updatedBy: by },
    },
    services: [
      { id: "5e000000-0000-4000-8000-0000000000c1", name: "Custom cakes", description: null, durationMinutes: null, priceText: "From $45", active: true, position: 0, externalRef: null, source: "tenant_import", verified: false, updatedAt: at },
      { id: "5e000000-0000-4000-8000-0000000000c2", name: "Catering trays", description: null, durationMinutes: null, priceText: null, active: true, position: 1, externalRef: null, source: "tenant_import", verified: false, updatedAt: at },
    ],
    people: [{ id: "5e000000-0000-4000-8000-0000000000d1", name: "Maria Lopez", roleTitle: "Owner", email: null, phone: null, userId: null, active: true, source: "tenant_import", verified: false, updatedAt: at }],
    contactCount: 312,
  };
}

export default async function PlacesPreviewPage({ searchParams }: { searchParams: Promise<{ place?: string; state?: string; result?: string; held?: string; reply?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const { place, state, result } = params;

  if (place === "reviews") {
    const site = { tenantId: "juniper", siteName: "Juniper Bakery", googleConnected: true, googlePlaceId: "ChIJ-fictional-juniper", replyMode: "auto" as const, unavailable: false, reviews: [
      { id: "r3", source: "google" as const, author: "Dana K.", rating: 5, text: "The cardamom buns are the best in Buffalo. Friendly staff too.", date: "2026-10-04", reply: null, repliedAt: null, draft: { reply: "Thank you, Dana! We'll save you a cardamom bun next Saturday.", autoPostAt: "2026-10-05T21:00:00Z" } },
      { id: "r2", source: "google" as const, author: "Sam P.", rating: 2, text: "Waited 20 minutes for a cake order I had paid for.", date: "2026-10-01", reply: null, repliedAt: null, draft: null },
      { id: "r1", source: "yelp" as const, author: "Lee", rating: 4, text: "Great bread.", date: "2026-09-20", reply: "Thanks, Lee!", repliedAt: "2026-09-21", draft: null },
    ] };
    return <WorkspaceReviewsView workspaceId={WORKSPACE} state={frame(state, { sites: [site], denied: [] }, { sites: [{ ...site, reviews: [], googleConnected: false }], denied: [] }, { sites: [{ ...site, reviews: [], unavailable: true }], denied: [] }, { sites: [site], denied: DENIED })} />;
  }

  if (place === "results") {
    const site = { ...SITE, stats: stats(), anomaly: null, visitorSeries: [40, 44, 51, 48, 60, 66, 70], searchPerf: null, gaPerf: null, milestone: null, aiVisibility: null,
      health: { url: "https://juniper.example", scannedAt: "2026-10-05T06:00:00Z", overallScore: 84, grade: "B" as const, categories: [], prioritizedIssues: [{ message: "Two images on the menu page have no description", category: "accessibility", priority: "medium" as const }] } };
    return <WorkspaceResultsView workspaceId={WORKSPACE} range="live" state={frame(state, { sites: [site], denied: [] }, { sites: [], denied: [] }, { sites: [{ ...site, stats: null, health: null }], denied: [] }, { sites: [site], denied: DENIED })} />;
  }

  if (place === "business-details") {
    const outcome = (["saved", "unchanged", "conflict", "invalid", "denied", "failed"] as const).find((item) => item === result) as DetailsSaveOutcome | undefined;
    const action = async () => { "use server"; };
    const data = { record: record(state === "member" ? "member" : "owner"), operator: false, sites: [SITE], denied: [] };
    return <WorkspaceBusinessDetails workspaceId={WORKSPACE} result={outcome ?? null} field={outcome === "invalid" ? "phone" : null} action={action}
      state={frame(state === "member" ? undefined : state, data, { ...data, record: { ...record("owner"), facts: {}, services: [], people: [] }, sites: [] }, data, { ...data, denied: DENIED })} />;
  }

  const leads = [
    { id: "l3", name: "Priya S.", email: "priya@example.test", message: "Could you do a 3-tier cake for 60 people on Nov 14?", source: "contact-form", fields: [["Event date", "2026-11-14"], ["Guests", "60"]] as Array<[string, string]>, createdAt: "2026-10-05T14:10:00Z" },
    // Released from held messages (STRELVA_INQUIRY_RECORDS): can be put back.
    { id: "lead_spam_x", releasedRowId: "5e000000-0000-4000-8000-0000000000d3", name: "Marta K.", email: "marta@example.test", message: "Wholesale bread for our café, 40 loaves a week?", source: "contact-form", fields: [], createdAt: "2026-10-04T07:15:00Z" },
    { id: "l2", name: "Tom R.", email: "tom@example.test", message: "Do you deliver catering trays to offices downtown?", source: "quote", fields: [], createdAt: "2026-10-03T09:30:00Z" },
    { id: "l1", name: "Someone", email: null, message: "Are you open on Thanksgiving?", source: null, fields: [], createdAt: "2026-08-20T09:30:00Z" },
  ];
  if (params.reply === "1") Object.assign(leads[0]!, { rowId: "5e000000-0000-4000-8000-0000000000d4" });
  const site = { key: "juniper", tenantId: "juniper", siteName: "Juniper Bakery", leads, lastThirtyDays: 2, unavailable: false };
  // A site the business connected itself (any builder): its form inquiries come in beside the managed site's.
  const connected = { key: "connected:juniper-pop-up", tenantId: null, connected: true as const, siteName: "juniperpopup.example", lastThirtyDays: 1, unavailable: false,
    leads: [{ id: "c1", name: "Ana M.", email: "ana@example.test", message: "Is the pop-up open Saturday morning?", source: "Your site's form", fields: [], createdAt: "2026-10-06T08:15:00Z" }] };
  // Held spam for review: `held=1` shows two items, `held=error` a list that failed.
  const held = params.held === "1"
    ? { items: [
      { rowId: "5e000000-0000-4000-8000-0000000000d1", tenantId: "juniper", name: "SEO Experts Pro", email: "rank@example.test", message: "We can get you to #1 on Google in 7 days, reply for pricing!!!", reason: "canned-message,email-name-mismatch", createdAt: "2026-10-05T03:12:00Z" },
      { rowId: "5e000000-0000-4000-8000-0000000000d2", tenantId: "juniper", name: "Ana", email: "ana@example.test", message: "hi do u do gluten free", reason: "content-score", createdAt: "2026-10-04T22:40:00Z" },
    ], unavailable: false }
    : params.held === "error" ? { items: [], unavailable: true } : undefined;
  const withHeld = <T extends object>(data: T) => ({ ...data, ...(held ? { held } : {}), ...(params.reply === "1" ? { workspaceReplies: true, durable: true } : {}) });
  return <WorkspaceInquiries workspaceId={WORKSPACE} state={frame(state, withHeld({ sites: [site, connected], denied: [] as typeof DENIED }), withHeld({ sites: [{ ...site, leads: [], lastThirtyDays: 0 }, { ...connected, leads: [], lastThirtyDays: 0 }], denied: [] as typeof DENIED }), { sites: [{ ...site, leads: [], unavailable: true }, { ...connected, leads: [], unavailable: true }], denied: [] as typeof DENIED }, { sites: [site], denied: DENIED })} />;
}
