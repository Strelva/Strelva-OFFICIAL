"use client";
/**
 * Preview harness for lane xs-leads (Leads, Reviews, Recaps, Results,
 * Prospects, the business picker and the inquiry bridge). The REAL
 * components render inside the real StrelvaShell with fictional fixtures:
 * Harbor Dental (Dr. Amy Lin, 1180 Elmwood Ave) and North Studio (Maya
 * Okafor). Requests are answered in memory; nothing reaches a server, a
 * business or an inbox.
 */
import type { ComponentProps } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink, StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import { AgencyLeads } from "@/experience/workspace/leads/AgencyLeads";
import { WorkspaceReviewsView } from "@/experience/places/WorkspaceReviews";
import { WorkspaceRecaps, type WorkspaceRecapsState } from "@/experience/recaps/WorkspaceRecaps";
import { WorkspaceResultsView, type WorkspaceResultsState } from "@/experience/places/WorkspaceResults";
import { AgencyProspectsView } from "@/experience/workspace/agency/AgencyProspectsView";
import { BusinessPicker } from "@/experience/inquiries/BusinessPicker";
import { ServerStatus } from "@/experience/inquiries/InquiryServerExperience";
import { PREVIEW_OWNER_REPORTS } from "@/experience/care-reports/preview-fixture";
import type { PublishingState } from "@/experience/publishing/PublishingPage";
import type { WorkspaceReviews, ReviewView, SiteReviews } from "@/products/google-listing/client";
import type { RecapView } from "@/products/recaps/server";
import type { SiteResults } from "@/products/websites/client";
import type { AgencyProspect } from "@/platform/agency-prospecting/server";
import { resolveRange, type RangeKey } from "@/platform/infra/analytics/range";

export type XsScreen = "leads" | "reviews" | "recaps" | "results" | "prospects" | "business-picker" | "business";

const BASE = "/preview/strelva/xa/xs-leads";
const BUSINESS = "5e000000-0000-4000-8000-0000000000d1";
const AGENCY = "5e000000-0000-4000-8000-0000000000a1";
const MAYA = "5e000000-0000-4000-8000-0000000000e1";
const CLIENT_COLORS = { harbor: "#2f5236", north: "#9c522c", lakeview: "#4f7590", fieldwork: "#6b6f68" } as const;
const noop = () => undefined;
const NORTH_STUDIO = { agencyId: AGENCY, name: "North Studio", logoUrl: null, accentColor: "#2f5236", replyTo: null, credit: "runs_on_strelva" as const };
type Chrome = Partial<Omit<ComponentProps<typeof StrelvaShell>, "children">>;

function ownerChrome(mode: "light" | "dark", current: string): Chrome {
  const pinned: StrelvaPinnedItem[] = [
    { id: "website", kind: "website", title: "Website", href: `${BASE}/results`, detail: "Live", current: current === "results" },
    { id: "bookings", kind: "bookings", title: "Bookings", href: `${BASE}/recaps`, detail: "31 this week" },
    { id: "inbox", kind: "inquiries", title: "Inbox", href: `${BASE}/business`, detail: "3 new" },
    { id: "listing", kind: "listing", title: "Google listing", href: `${BASE}/reviews`, current: current === "reviews", ...(current === "reviews" ? { state: "waits" as const } : { detail: "4.8" }) },
  ];
  return { appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode, workspaceName: "Harbor Dental", accountName: "Dr. Amy Lin", pinned, agency: { name: "North Studio", person: "Maya", color: CLIENT_COLORS.harbor }, ownerBrand: NORTH_STUDIO, onNavigate: noop };
}
function agencyChrome(mode: "light" | "dark", place: "leads" | "prospects"): Chrome {
  const clients: StrelvaClientLink[] = [
    { id: "harbor", name: "Harbor Dental", href: `${BASE}/reviews`, detail: "Dr. Lin", color: CLIENT_COLORS.harbor },
    { id: "north", name: "North Coast Realty", href: `${BASE}/leads`, detail: "Dana", color: CLIENT_COLORS.north },
    { id: "lakeview", name: "Lakeview Mediation", href: `${BASE}/leads`, detail: "Ruth", color: CLIENT_COLORS.lakeview },
    { id: "fieldwork", name: "Fieldwork Studio", href: `${BASE}/leads`, detail: "Ana", color: CLIENT_COLORS.fieldwork },
  ];
  return { appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode, workspaceName: "North Studio", accountName: "Maya Okafor", ownerBrand: NORTH_STUDIO,
    agencyNavigation: { leadsAvailable: true, leadsCurrent: place === "leads", queueCount: 3, clients, hrefs: { home: `${BASE}/leads`, queue: `${BASE}/leads`, library: `${BASE}/leads`, minutes: `${BASE}/leads` } } };
}

/* ---------- Leads ---------- */
const token = (n: number) => `${n}`.repeat(36).slice(0, 36).replace(/[^a-f0-9]/g, "a");
type FixtureLead = { lead: Record<string, unknown> & { businessName: string; statusToken: string; deliveryStatus: string }; workflow: Record<string, unknown> & { token: string; status: string; note: string | null }; legacyOwnership: boolean };
const LEADS: FixtureLead[] = [
  { lead: { businessName: "Harbor Dental", email: "dr.lin@harbordental.com", phone: "(716) 555-0142", location: "1180 Elmwood Ave, Buffalo", description: "We need online booking for cleanings and a new-patient form. Our current site can't take either, and the front desk answers the same three questions all day.", currentWebsite: "harbordental.com", statusToken: token(1), deliveryStatus: "received", submittedAt: "2026-10-15T14:12:00Z", statusUpdatedAt: "2026-10-15T14:12:00Z" }, workflow: { token: token(1), status: "new", updatedAt: null, note: null }, legacyOwnership: false },
  { lead: { businessName: "Hertel Avenue Florist", email: "ana@hertelflorist.com", phone: "(716) 555-0190", location: "Buffalo", description: "Wedding season orders keep getting lost in email. Could you set up an order form that sends us one list?", currentWebsite: null, statusToken: token(2), deliveryStatus: "received", submittedAt: "2026-10-14T09:30:00Z", statusUpdatedAt: "2026-10-14T09:30:00Z" }, workflow: { token: token(2), status: "new", updatedAt: null, note: null }, legacyOwnership: false },
  { lead: { businessName: "Lakeview Mediation", email: "ruth@lakeviewmediation.com", phone: null, location: "Amherst", description: "Spanish version of our intake form.", currentWebsite: "lakeviewmediation.com", statusToken: token(3), deliveryStatus: "reviewing", submittedAt: "2026-10-09T16:05:00Z", statusUpdatedAt: "2026-10-10T10:00:00Z" }, workflow: { token: token(3), status: "contacted", updatedAt: "2026-10-10T10:00:00Z", note: "Maya called Ruth on Oct 10. She wants a quote by Friday." }, legacyOwnership: false },
  { lead: { businessName: "Fieldwork Studio", email: "ana@fieldwork.studio", phone: null, location: "Buffalo", description: "A print price list customers can order from.", currentWebsite: "fieldwork.studio", statusToken: token(4), deliveryStatus: "launched", submittedAt: "2026-09-28T12:00:00Z", statusUpdatedAt: "2026-10-02T12:00:00Z" }, workflow: { token: token(4), status: "converted", updatedAt: "2026-10-02T12:00:00Z", note: "Added as a client on Oct 2." }, legacyOwnership: false },
];

function leadsRequest(state: string): typeof fetch {
  let leads: FixtureLead[] = state === "converting" ? LEADS.map((row, index) => index === 0 ? { ...row, lead: { ...row.lead, deliveryStatus: "drafting" }, workflow: { ...row.workflow, status: "converting" } } : row) : LEADS;
  const snapshot = () => ({ agency: { id: AGENCY, name: "North Studio", role: "owner" }, currentActorId: MAYA, leads: state === "empty" ? [] : leads, conversionAvailable: state !== "unavailable" });
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (state === "loading") return new Promise<Response>(() => undefined);
    if (state === "error") return Response.json({ error: "Leads could not be read just now." }, { status: 503 });
    if (init?.method !== "POST") return Response.json(snapshot());
    const body = JSON.parse(String(init.body));
    const row = leads.find(item => item.lead.statusToken === body.token)!;
    const status = body.action === "convert" ? "converting" : body.action === "status" ? body.status : row.workflow.status;
    const deliveryStatus = status === "converting" ? "drafting" : status === "contacted" ? "reviewing" : status === "dismissed" ? "paused" : status === "new" ? "received" : row.lead.deliveryStatus;
    const note = body.action === "note" ? [row.workflow.note, body.note].filter(Boolean).join("\n") : row.workflow.note;
    const saved = { ...row, lead: { ...row.lead, deliveryStatus }, workflow: { ...row.workflow, status, note, ...(body.action === "note" ? { notes: [{ id: body.idempotencyKey, text: body.note, createdBy: MAYA, createdAt: new Date().toISOString() }] } : {}) } };
    leads = leads.map(item => item.lead.statusToken === body.token ? saved : item);
    return Response.json({ ...saved, idempotencyKey: body.idempotencyKey, ...(body.action === "convert" ? { href: `/workspace/agency/clients/new?workspaceId=${encodeURIComponent(AGENCY)}&leadToken=${encodeURIComponent(body.token)}` } : {}) });
  }) as typeof fetch;
}

/* ---------- Reviews ---------- */
const review = (patch: Partial<ReviewView> & Pick<ReviewView, "id" | "author" | "rating" | "text" | "date">): ReviewView => ({ source: "google", externalId: `g-${patch.id}`, reply: null, repliedAt: null, draft: null, ...patch });
const REVIEW_SITE: SiteReviews = { tenantId: "harbor", siteName: "Harbor Dental", googleConnected: true, googlePlaceId: "ChIJ-harbor-dental", replyMode: "approve", autoPostHeld: null, unavailable: false, reviews: [
  review({ id: "r1", author: "Priya Shah", rating: 5, date: "2026-10-15", text: "Dr. Lin got my daughter in before school started back. Gentle, quick, and they took our Delta Dental PPO without any back and forth.", draft: { reply: "Thank you, Priya. We're glad we could fit your daughter in before school. See you both at the next cleaning.", autoPostAt: null } }),
  review({ id: "r2", author: "Tom Okafor", rating: 4, date: "2026-10-13", text: "Great cleaning. Parking on Elmwood is tough at 5pm, so give yourself a few minutes." }),
  review({ id: "r3", author: "Rachel Kim", rating: 5, date: "2026-10-08", text: "Kind with my 3-year-old. She asked to go back.", reply: "Thank you, Rachel. Tell her the dinosaur chair is waiting.", repliedAt: "2026-10-08" }),
  review({ id: "r4", author: "Marcus Bell", rating: 2, date: "2026-09-30", text: "Waited 25 minutes past my appointment time.", reply: "Marcus, you're right, and we're sorry. We've added a second hygienist on Tuesdays so it doesn't happen again.", repliedAt: "2026-10-01" }),
] };

function reviewsState(state: string): PublishingState<WorkspaceReviews> {
  if (state === "loading") return { kind: "loading" };
  if (state === "error") return { kind: "error" };
  if (state === "permission") return { kind: "permission" };
  if (state === "empty") return { kind: "ready", data: { sites: [{ ...REVIEW_SITE, reviews: [] }], denied: [] } };
  if (state === "no-site") return { kind: "ready", data: { sites: [], denied: [] } };
  if (state === "done") return { kind: "ready", data: { sites: [{ ...REVIEW_SITE, reviews: REVIEW_SITE.reviews.filter(item => item.reply) }], denied: [] } };
  if (state === "held") return { kind: "ready", data: { sites: [{ ...REVIEW_SITE, replyMode: "auto", autoPostHeld: { by: "agency", name: "Maya at North Studio" } }], denied: [] } };
  return { kind: "ready", data: { sites: [REVIEW_SITE], denied: [] } };
}
const replyRequest = (async (_url: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  await new Promise(resolve => setTimeout(resolve, 600));
  return Response.json({ published: true, review: { reply: body.reply } });
}) as typeof fetch;

/* ---------- Recaps ---------- */
const RECAPS: RecapView[] = [
  { id: "w41", period: "week", start: "2026-10-05", end: "2026-10-11", summary: "Fourteen people booked online, and three of them were new patients who found you on Google Maps.", highlights: ["Maya at North Studio closed online booking for Thanksgiving, Nov 26 and 27, after you said yes", "Strelva fixed the map link on the contact page", "The new-patient form now asks for the insurance member ID"], visits: 412, visitsDelta: 12, customerActions: 31,
    inquiryOutcome: { status: "available", inquiries: 9, answered: 9, withinDay: 8, unanswered: 0, averageReplySeconds: null, medianReplySeconds: null, evidence: "Saved proof" }, newReviews: 2, nextAction: { title: "List the insurance you take", description: "Four people asked about Delta Dental this week. One line on the services page would answer them before they write." } },
  { id: "m09", period: "month", start: "2026-09-01", end: "2026-09-30", summary: "September was the busiest month since spring.", highlights: ["1,612 visits", "Cleanings is now the most visited page"], visits: 1612, visitsDelta: 18, customerActions: 104, newReviews: 6, nextAction: null },
  { id: "w40", period: "week", start: "2026-09-28", end: "2026-10-04", summary: "A steady week.", highlights: [], visits: 368, visitsDelta: -4, customerActions: 22, newReviews: 1, nextAction: null },
];
function recapsState(state: string): WorkspaceRecapsState {
  const site = { tenantId: "harbor", siteName: "harbordental.com", unavailable: false, recaps: RECAPS };
  if (state === "loading") return { kind: "loading" };
  if (state === "error") return { kind: "error" };
  if (state === "permission") return { kind: "permission" };
  if (state === "empty") return { kind: "ready", sites: [{ ...site, recaps: [] }] };
  if (state === "no-site") return { kind: "ready", sites: [] };
  if (state === "unavailable") return { kind: "ready", sites: [{ ...site, recaps: [], unavailable: true }] };
  return { kind: "ready", sites: [site] };
}

/* ---------- Results ---------- */
function resultsState(state: string, rangeKey: RangeKey): WorkspaceResultsState {
  if (state === "loading") return { kind: "loading" };
  if (state === "error") return { kind: "error" };
  if (state === "permission") return { kind: "permission" };
  const window = resolveRange(rangeKey);
  const days = rangeKey === "month" ? 30 : 7;
  const visits = Array.from({ length: days }, (_, index) => 38 + ((index * 17) % 23) + (index === days - 1 ? 14 : 0));
  const total = visits.reduce((sum, value) => sum + value, 0);
  const stats: NonNullable<SiteResults["stats"]> = { range: window, pageViews: total, pageViewsPrior: total - 41, pageViewsDelta: 41, actions: 31, actionsPrior: 26, actionsDelta: 5, bookingClicks: 24, bookingClicksPrior: 20, phoneClicks: 7, phoneClicksPrior: 6, hasData: true,
    series: visits.map((pageViews, index) => ({ date: new Date(window.to.getTime() - (days - index - 1) * 86400000).toISOString().slice(0, 10), pageViews, bookingClicks: 0, phoneClicks: 0 })) };
  const site: SiteResults = { tenantId: "harbor", tenantStableId: "5e000000-0000-4000-8000-0000000000b9", siteName: "harbordental.com", stats, anomaly: null, visitorSeries: visits, milestone: null,
    searchPerf: { status: "ok", clicks: 86, impressions: 1420, ctr: 86 / 1420, position: 3.8, topQueries: [{ query: "dentist elmwood buffalo", clicks: 31, impressions: 400, position: 2.1 }, { query: "harbor dental", clicks: 28, impressions: 120, position: 1 }, { query: "delta dental ppo dentist buffalo", clicks: 12, impressions: 300, position: 6.4 }] },
    gaPerf: { status: "ok", users: 318, sessions: 402, pageviews: 911, topSources: [{ source: "google / organic", sessions: 240 }, { source: "(direct)", sessions: 102 }, { source: "google maps", sessions: 60 }], topPages: [{ path: "/", views: 380 }, { path: "/book", views: 214 }, { path: "/services/cleanings", views: 140 }] },
    aiVisibility: { service: "dentists in Buffalo", mentionedCount: 2, total: 5, mentionedQueries: ["Which dentist on Elmwood takes Delta Dental?", "Gentle dentist for kids in Buffalo"], newlyAppeared: ["Gentle dentist for kids in Buffalo"], hasData: true, checkedAt: "2026-10-14T12:00:00Z" },
    health: state === "issues" ? { url: "https://harbordental.com", scannedAt: "2026-10-15T07:02:00Z", overallScore: 81, grade: "B", categories: [], prioritizedIssues: [{ message: "Two photos on the services page have no description", category: "accessibility", priority: "medium" }, { message: "The booking page takes 3.1 s to load on a phone", category: "performance", priority: "medium" }] }
      : { url: "https://harbordental.com", scannedAt: "2026-10-15T07:02:00Z", overallScore: 96, grade: "A", categories: [], prioritizedIssues: [] },
  };
  if (state === "empty") return { kind: "ready", data: { sites: [], denied: [] } };
  if (state === "disconnected") return { kind: "ready", data: { sites: [{ ...site, searchPerf: null, gaPerf: null, aiVisibility: null, health: null }], denied: [] } };
  if (state === "unavailable") return { kind: "ready", data: { sites: [{ ...site, stats: null, searchPerf: { ...site.searchPerf!, status: "unavailable" }, gaPerf: { ...site.gaPerf!, status: "unavailable" } }], denied: [] } };
  return { kind: "ready", data: { sites: [site], denied: [] } };
}

/* ---------- Prospects ---------- */
const PROSPECTS: AgencyProspect[] = [
  { id: "5e000000-0000-4000-8000-0000000001a1", name: "Dr. Amy Lin", email: "dr.lin@harbordental.com", business: "Harbor Dental", url: "https://harbordental.com", source: "audit", result_id: "r1", score: 62, grade: "C", created_at: "2026-10-15T13:40:00Z" },
  { id: "5e000000-0000-4000-8000-0000000001a2", name: "Ana Ruiz", email: "ana@hertelflorist.com", business: "Hertel Avenue Florist", url: "https://hertelflorist.com", source: "monitor", result_id: "r2", score: 41, grade: "D", created_at: "2026-10-12T10:00:00Z" },
  { id: "5e000000-0000-4000-8000-0000000001a3", name: "Ruth Adler", email: "ruth@lakeviewmediation.com", business: "Lakeview Mediation", url: "https://lakeviewmediation.com", source: "audit", result_id: "r3", score: 78, grade: "B", created_at: "2026-10-03T15:00:00Z" },
  { id: "5e000000-0000-4000-8000-0000000001a4", name: "Sam Ortiz", email: "sam@elmwoodbikes.com", business: "Elmwood Bikes", url: null, source: "audit", result_id: "r4", score: 55, grade: "C", created_at: "2026-09-22T11:00:00Z" },
];

export function XsLeadsPreview({ screen, state, mode, range, period, recap }: { screen: XsScreen; state: string; mode: "light" | "dark"; range?: string; period?: string; recap?: string }) {
  if (screen === "leads") return <StrelvaShell {...agencyChrome(mode, "leads")} title="Leads"><AgencyLeads key={state} agencyWorkspaceId={AGENCY} request={leadsRequest(state)} /></StrelvaShell>;
  if (screen === "reviews") return <WorkspaceReviewsView workspaceId={BUSINESS} state={reviewsState(state)} publishing chrome={ownerChrome(mode, "reviews")} request={replyRequest} />;
  if (screen === "recaps") return <WorkspaceRecaps workspaceId={BUSINESS} state={recapsState(state)} period={period === "week" || period === "month" ? period : "all"} recapId={recap} hrefBase={`${BASE}/recaps`} releaseLabel={state === "release" ? "Recaps Release 1" : undefined}
    careReports={state === "reports-unavailable" ? { kind: "unavailable" } : { kind: "ready", items: state === "empty" ? [] : PREVIEW_OWNER_REPORTS }} chrome={ownerChrome(mode, "recaps")} />;
  if (screen === "results") {
    const key: RangeKey = range === "week" || range === "month" ? range : "live";
    return <WorkspaceResultsView workspaceId={BUSINESS} state={resultsState(state, key)} range={key} chrome={ownerChrome(mode, "results")} hrefFor={(_id, next) => `${BASE}/results?${new URLSearchParams({ ...(state !== "ready" ? { state } : {}), ...(next !== "live" ? { range: next } : {}), ...(mode === "dark" ? { mode } : {}) })}`} />;
  }
  if (screen === "prospects") return <AgencyProspectsView workspaceId={AGENCY} prospects={state === "empty" || state === "loading" || state === "error" ? [] : PROSPECTS} loading={state === "loading"} error={state === "error" ? "Agency membership is required to read prospects." : null} addClientEnabled={state !== "unreleased"} chrome={agencyChrome(mode, "prospects")} />;
  if (screen === "business-picker") return <BusinessPicker mode={mode} accountName="Maya Okafor" businesses={state === "empty" ? [] : state === "many"
    ? ["Harbor Dental", "North Coast Realty", "Lakeview Mediation", "Fieldwork Studio", "Hertel Avenue Florist", "Elmwood Bikes", "Juniper Bakery"].map((name, index) => ({ id: `t${index}`, name }))
    : [{ id: "harbor", name: "Harbor Dental" }, { id: "north", name: "North Coast Realty" }, { id: "lakeview", name: "Lakeview Mediation" }]} />;
  return <div data-workspace-theme="linen" data-workspace-mode={mode}><ServerStatus error={state === "error" ? "Harbor Dental's inquiries could not be read just now." : ""} /></div>;
}
