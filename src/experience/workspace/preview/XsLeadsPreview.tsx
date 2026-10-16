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
import { identityColor } from "@/platform/presentation/identity-color";
import { XA_CLIENTS, XA_DAY, xaDayAt, xaDaysAgo, xaOwnerPinned, XA_HARBOR, XA_HARBOR_VISITS, XA_NORTH, XA_SYSTEM_HREFS } from "./xa-day";
import type { ResultsChange } from "@/experience/places/WorkspaceResults";

export type XsScreen = "leads" | "reviews" | "recaps" | "results" | "prospects" | "business-picker" | "business";

const BASE = "/preview/strelva/xa/xs-leads";
const BUSINESS = "5e000000-0000-4000-8000-0000000000d1";
const AGENCY = "5e000000-0000-4000-8000-0000000000a1";
const MAYA = "5e000000-0000-4000-8000-0000000000e1";
const CLIENT_COLORS = { harbor: "#2f5236", north: "#9c522c", lakeview: "#4f7590", fieldwork: "#6b6f68" } as const;
/** Fixed "now" so day phrases ("yesterday") read the same in every capture. */
const NOW = new Date("2026-10-16T15:00:00Z");
const noop = () => undefined;
const NORTH_STUDIO = { agencyId: AGENCY, name: XA_NORTH.name, logoUrl: null, accentColor: "#2f5236", replyTo: null, credit: "runs_on_strelva" as const };
type Chrome = Partial<Omit<ComponentProps<typeof StrelvaShell>, "children">>;

function ownerChrome(mode: "light" | "dark", current: string): Chrome {
  const pinned: StrelvaPinnedItem[] = [
    ...xaOwnerPinned({ current: current === "results" ? "website" : undefined }),
    { id: "listing", kind: "listing", title: "Google listing", href: `${BASE}/reviews`, current: current === "reviews", ...(current === "reviews" ? { state: "waits" as const } : { detail: "4.8" }) },
  ];
  return { appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode, workspaceName: XA_HARBOR.name, accountName: XA_HARBOR.owner, pinned, agency: { name: XA_NORTH.name, person: XA_NORTH.first, color: CLIENT_COLORS.harbor }, ownerBrand: NORTH_STUDIO, onNavigate: noop };
}
function agencyChrome(mode: "light" | "dark", place: "leads" | "prospects"): Chrome {
  // North Studio's clients in this fiction. Harbor Dental and Lakeview Mediation are asking for work, so they are not clients yet.
  const clients: StrelvaClientLink[] = AGENCY_CLIENTS.map(client => ({ ...client, href: `${BASE}/leads` }));
  return { appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode, workspaceId: AGENCY, workspaceName: XA_NORTH.name, accountName: XA_NORTH.person, ownerBrand: NORTH_STUDIO,
    agencyNavigation: { leadsAvailable: true, leadsCurrent: place === "leads", queueCount: 3, clients, hrefs: { home: `${BASE}/prospects`, queue: `${BASE}/prospects`, library: `${BASE}/prospects`, minutes: `${BASE}/prospects`, leads: `${BASE}/leads` } } };
}

// North Studio's four clients, the same as every agency preview (xa-day.ts).
const AGENCY_CLIENTS = XA_CLIENTS.map(client => ({ id: client.key, name: client.name, detail: client.owner.split(" ")[0]!, color: (CLIENT_COLORS as Record<string, string>)[client.key] }));
const KNOWN_CLIENTS = AGENCY_CLIENTS.map(({ id, name }) => ({ id, name, href: `${BASE}/leads` }));

/* ---------- Leads ---------- */
const token = (n: number) => `${n}`.repeat(36).slice(0, 36).replace(/[^a-f0-9]/g, "a");
type FixtureLead = { lead: Record<string, unknown> & { businessName: string; statusToken: string; deliveryStatus: string }; workflow: Record<string, unknown> & { token: string; status: string; note: string | null }; legacyOwnership: boolean };
const LEADS: FixtureLead[] = [
  { lead: { businessName: XA_HARBOR.name, email: "dr.lin@harbordental.com", phone: "(716) 555-0142", location: "1180 Elmwood Ave, Buffalo", description: "We need online booking for cleanings and a new-patient form. Our current site can't take either, and the front desk answers the same three questions all day.", currentWebsite: XA_HARBOR.domain, statusToken: token(1), deliveryStatus: "received", submittedAt: "2026-10-15T14:12:00Z", statusUpdatedAt: "2026-10-15T14:12:00Z" }, workflow: { token: token(1), status: "new", updatedAt: null, note: null }, legacyOwnership: false },
  { lead: { businessName: "Hertel Avenue Florist", email: "ana@hertelflorist.com", phone: "(716) 555-0190", location: "Buffalo", description: "Wedding season orders keep getting lost in email. Could you set up an order form that sends us one list?", currentWebsite: null, statusToken: token(2), deliveryStatus: "received", submittedAt: "2026-10-14T09:30:00Z", statusUpdatedAt: "2026-10-14T09:30:00Z" }, workflow: { token: token(2), status: "new", updatedAt: null, note: null }, legacyOwnership: false },
  { lead: { businessName: "Lakeview Mediation", email: "ruth@lakeviewmediation.com", phone: null, location: "Amherst", description: "Spanish version of our intake form.", currentWebsite: "lakeviewmediation.com", statusToken: token(3), deliveryStatus: "reviewing", submittedAt: "2026-10-09T16:05:00Z", statusUpdatedAt: "2026-10-10T10:00:00Z" }, workflow: { token: token(3), status: "contacted", updatedAt: "2026-10-10T10:00:00Z", note: "Maya called Ruth on Oct 10. She wants a quote by Friday." }, legacyOwnership: false },
  { lead: { businessName: "Fieldwork Studio", email: "ana@fieldwork.studio", phone: null, location: "Buffalo", description: "A print price list customers can order from.", currentWebsite: "fieldwork.studio", statusToken: token(4), deliveryStatus: "launched", submittedAt: "2026-09-28T12:00:00Z", statusUpdatedAt: "2026-10-02T12:00:00Z" }, workflow: { token: token(4), status: "converted", updatedAt: "2026-10-02T12:00:00Z", note: "Added as a client on Oct 2." }, legacyOwnership: false },
];

function leadsRequest(state: string): typeof fetch {
  let leads: FixtureLead[] = state === "converting" ? LEADS.map((row, index) => index === 0 ? { ...row, lead: { ...row.lead, deliveryStatus: "drafting" }, workflow: { ...row.workflow, status: "converting" } } : row) : LEADS;
  const snapshot = () => ({ agency: { id: AGENCY, name: XA_NORTH.name, role: "owner" }, currentActorId: MAYA, leads: state === "empty" ? [] : leads, conversionAvailable: state !== "unavailable" });
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
const REVIEW_SITE: SiteReviews = { tenantId: "harbor", siteName: XA_HARBOR.name, googleConnected: true, googlePlaceId: "ChIJ-harbor-dental", replyMode: "approve", autoPostHeld: null, unavailable: false, reviews: [
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
// The one fixture day (xa-day.ts): Monday, Nov 23. The latest weekly recap is the week before it.
// Thanksgiving still waits on Dr. Lin this morning, so no recap claims it changed.
// Visits come from XA_HARBOR_VISITS, the same numbers Results shows for Nov 16 to 22.
const pct = (now: number, before: number) => Math.round(((now - before) / before) * 100);
const RECAPS: RecapView[] = [
  { id: "w47", period: "week", start: xaDaysAgo(7), end: xaDaysAgo(1), summary: "3 people asked for directions from Google Maps.", highlights: ["Maya at North Studio moved the Book a visit button to the top of the home page", "Strelva fixed the map link on the contact page", "Maya at North Studio added Delta Dental PPO to the insurance list"], visits: XA_HARBOR_VISITS.week, visitsDelta: pct(XA_HARBOR_VISITS.week, XA_HARBOR_VISITS.weekBefore), customerActions: XA_HARBOR_VISITS.weekActions,
    inquiryOutcome: { status: "available", inquiries: 9, answered: 9, withinDay: 8, unanswered: 0, averageReplySeconds: null, medianReplySeconds: null, evidence: "Saved proof" }, newReviews: 2, nextAction: { title: "List the insurance you take", description: "Four people asked about Delta Dental this week. One line on the services page would answer them before they write." } },
  { id: "m10", period: "month", start: "2026-10-01", end: "2026-10-31", summary: "October was the busiest month since spring.", highlights: [`${XA_HARBOR_VISITS.october.toLocaleString("en-US")} people visited your site this month`, "Cleanings is now the most visited page"], visits: XA_HARBOR_VISITS.october, visitsDelta: pct(XA_HARBOR_VISITS.october, XA_HARBOR_VISITS.september), customerActions: 104, newReviews: 6, nextAction: null },
  { id: "w46", period: "week", start: xaDaysAgo(14), end: xaDaysAgo(8), summary: "A steady week.", highlights: [], visits: XA_HARBOR_VISITS.weekBefore, visitsDelta: -4, customerActions: XA_HARBOR_VISITS.weekBeforeActions, newReviews: 1, nextAction: null },
];
function recapsState(state: string): WorkspaceRecapsState {
  const site = { tenantId: "harbor", siteName: XA_HARBOR.domain, unavailable: false, recaps: RECAPS };
  if (state === "loading") return { kind: "loading" };
  if (state === "error") return { kind: "error" };
  if (state === "permission") return { kind: "permission" };
  if (state === "empty") return { kind: "ready", sites: [{ ...site, recaps: [] }] };
  if (state === "no-site") return { kind: "ready", sites: [] };
  if (state === "unavailable") return { kind: "ready", sites: [{ ...site, recaps: [], unavailable: true }] };
  return { kind: "ready", sites: [site] };
}

/* ---------- Results ---------- */
/** The newest change in What changed, as `resultsChange` would pick it: Maya's, last Friday. ?state=quiet shows a week with none. */
function resultsLatest(state: string): ResultsChange | null | undefined {
  if (state === "quiet") return null;
  if (state === "changes-unavailable") return undefined;
  return { sentence: "Maya at North Studio moved the Book a visit button to the top of the home page.", at: xaDayAt("15:40", -3), href: XA_SYSTEM_HREFS.website };
}
function resultsState(state: string, rangeKey: RangeKey): WorkspaceResultsState {
  if (state === "loading") return { kind: "loading" };
  if (state === "error") return { kind: "error" };
  if (state === "permission") return { kind: "permission" };
  const window = resolveRange(rangeKey);
  const days = rangeKey === "month" ? 30 : 7;
  const visits = Array.from({ length: days }, (_, index) => 38 + ((index * 17) % 23) + (index === days - 1 ? 14 : 0));
  const total = visits.reduce((sum, value) => sum + value, 0);
  // The Last 7 days are Nov 16 to 22: the same 361 and 320 the weekly recaps show (XA_HARBOR_VISITS).
  const prior = rangeKey === "month" ? total - 41 : XA_HARBOR_VISITS.weekBefore;
  const actions = XA_HARBOR_VISITS.weekActions, actionsPrior = XA_HARBOR_VISITS.weekBeforeActions;
  const stats: NonNullable<SiteResults["stats"]> = { range: window, pageViews: total, pageViewsPrior: prior, pageViewsDelta: total - prior, actions, actionsPrior, actionsDelta: actions - actionsPrior, bookingClicks: 24, bookingClicksPrior: 20, phoneClicks: 7, phoneClicksPrior: 6, hasData: true,
    series: visits.map((pageViews, index) => ({ date: new Date(window.to.getTime() - (days - index - 1) * 86400000).toISOString().slice(0, 10), pageViews, bookingClicks: 0, phoneClicks: 0 })) };
  const site: SiteResults = { tenantId: "harbor", tenantStableId: "5e000000-0000-4000-8000-0000000000b9", siteName: XA_HARBOR.domain, stats, anomaly: null, visitorSeries: visits, milestone: null,
    // Google sources and searches cover the last 4 weeks (Oct 26 to Nov 22): more than the two weeks above added together.
    searchPerf: { status: "ok", clicks: 640, impressions: 9800, ctr: 640 / 9800, position: 3.8, topQueries: [{ query: "dentist elmwood buffalo", clicks: 212, impressions: 2600, position: 2.1 }, { query: "harbor dental", clicks: 190, impressions: 640, position: 1 }, { query: "delta dental ppo dentist buffalo", clicks: 64, impressions: 2100, position: 6.4 }] },
    gaPerf: { status: "ok", users: 1090, sessions: XA_HARBOR_VISITS.fourWeeks, pageviews: 3120, topSources: [{ source: "google / organic", sessions: 820 }, { source: "(direct)", sessions: 352 }, { source: "google maps", sessions: 212 }], topPages: [{ path: "/", views: 1310 }, { path: "/book", views: 736 }, { path: "/services/cleanings", views: 482 }] },
    aiVisibility: { service: "dentists in Buffalo", mentionedCount: 2, total: 5, mentionedQueries: ["Which dentist on Elmwood takes Delta Dental?", "Gentle dentist for kids in Buffalo"], newlyAppeared: ["Gentle dentist for kids in Buffalo"], hasData: true, checkedAt: xaDayAt("12:00", -2) },
    health: state === "issues" ? { url: "https://harbordental.com", scannedAt: XA_DAY.checkedAt, overallScore: 81, grade: "B", categories: [], prioritizedIssues: [{ message: "Two photos on the services page have no description", category: "accessibility", priority: "medium" }, { message: "The booking page takes 3.1 s to load on a phone", category: "performance", priority: "medium" }] }
      : { url: "https://harbordental.com", scannedAt: XA_DAY.checkedAt, overallScore: 96, grade: "A", categories: [], prioritizedIssues: [] },
  };
  if (state === "empty") return { kind: "ready", data: { sites: [], denied: [] } };
  if (state === "disconnected") return { kind: "ready", data: { sites: [{ ...site, searchPerf: null, gaPerf: null, aiVisibility: null, health: null }], denied: [] } };
  if (state === "unavailable") return { kind: "ready", data: { sites: [{ ...site, stats: null, searchPerf: { ...site.searchPerf!, status: "unavailable" }, gaPerf: { ...site.gaPerf!, status: "unavailable" } }], denied: [] } };
  return { kind: "ready", data: { sites: [site], denied: [] } };
}

/* ---------- Prospects ---------- */
const PROSPECTS: AgencyProspect[] = [
  { id: "5e000000-0000-4000-8000-0000000001a1", name: XA_HARBOR.owner, email: "dr.lin@harbordental.com", business: XA_HARBOR.name, url: "https://harbordental.com", source: "audit", result_id: "scan-1", score: 62, grade: "C", created_at: "2026-10-15T13:40:00Z" },
  { id: "5e000000-0000-4000-8000-0000000001a2", name: "Ana Ruiz", email: "ana@hertelflorist.com", business: "Hertel Avenue Florist", url: "https://hertelflorist.com", source: "monitor", result_id: "scan-2", score: 41, grade: "D", created_at: "2026-10-12T10:00:00Z" },
  { id: "5e000000-0000-4000-8000-0000000001a3", name: "Ruth Adler", email: "ruth@lakeviewmediation.com", business: "Lakeview Mediation", url: "https://lakeviewmediation.com", source: "audit", result_id: "scan-3", score: 78, grade: "B", created_at: "2026-10-03T15:00:00Z" },
  { id: "5e000000-0000-4000-8000-0000000001a5", name: "Ana Reyes", email: "ana@fieldwork.studio", business: "Fieldwork Studio", url: "https://fieldwork.studio", source: "audit", result_id: "scan-5", score: 70, grade: "B", created_at: "2026-09-25T09:00:00Z" },
  { id: "5e000000-0000-4000-8000-0000000001a4", name: "Sam Ortiz", email: "sam@elmwoodbikes.com", business: "Elmwood Bikes", url: null, source: "audit", result_id: "scan-4", score: 55, grade: "C", created_at: "2026-09-22T11:00:00Z" },
];

export function XsLeadsPreview({ screen, state, mode, range, period, recap, open, prospect }: { screen: XsScreen; state: string; mode: "light" | "dark"; range?: string; period?: string; recap?: string; open?: boolean; prospect?: string }) {
  if (screen === "leads") return <StrelvaShell {...agencyChrome(mode, "leads")} title="Service requests"><AgencyLeads key={state} agencyWorkspaceId={AGENCY} request={leadsRequest(state)} knownClients={KNOWN_CLIENTS} initialOpen={open} /></StrelvaShell>;
  if (screen === "reviews") return <WorkspaceReviewsView workspaceId={BUSINESS} state={reviewsState(state)} publishing chrome={ownerChrome(mode, "reviews")} request={replyRequest} initialOpen={open} />;
  if (screen === "recaps") return <WorkspaceRecaps workspaceId={BUSINESS} state={recapsState(state)} period={period === "week" || period === "month" ? period : "all"} recapId={recap} hrefBase={`${BASE}/recaps`} releaseLabel={state === "release" ? "Recaps Release 1" : undefined}
    careReports={state === "reports-unavailable" ? { kind: "unavailable" } : { kind: "ready", items: state === "empty" ? [] : PREVIEW_OWNER_REPORTS }} chrome={ownerChrome(mode, "recaps")}
    seeHrefFor={() => `${BASE}/results${mode === "dark" ? "?mode=dark" : ""}`} />;
  if (screen === "results") {
    const key: RangeKey = range === "week" || range === "month" ? range : "live";
    return <WorkspaceResultsView workspaceId={BUSINESS} state={resultsState(state, key)} range={key} chrome={ownerChrome(mode, "results")} latest={resultsLatest(state)} hrefFor={(_id, next) => `${BASE}/results?${new URLSearchParams({ ...(state !== "ready" ? { state } : {}), ...(next !== "live" ? { range: next } : {}), ...(mode === "dark" ? { mode } : {}) })}`} />;
  }
  if (screen === "prospects") {
    const query = (id: string | null) => `${BASE}/prospects?${new URLSearchParams({ ...(state !== "ready" ? { state } : {}), ...(mode === "dark" ? { mode } : {}), ...(id ? { prospect: id } : {}) })}`;
    return <AgencyProspectsView workspaceId={AGENCY} prospects={state === "empty" || state === "loading" || state === "error" ? [] : PROSPECTS} loading={state === "loading"} error={state === "error" ? "Only members of North Studio can see who ran its check links." : null} addClientEnabled={state !== "unreleased"} chrome={agencyChrome(mode, "prospects")}
      knownClients={KNOWN_CLIENTS} selectedId={prospect} hrefFor={query} now={NOW} />;
  }
  if (screen === "business-picker") {
    const facts: Record<string, string> = { "Harbor Dental": "Run by Dr. Amy Lin · harbordental.com", "North Coast Realty": "Run by Dana Whitfield · northcoastrealty.com", "Lakeview Mediation": "Run by Ruth Adler · lakeviewmediation.com", "Fieldwork Studio": "Run by Ana Reyes · fieldwork.studio", "Hertel Avenue Florist": "Run by Ana Ruiz", "Elmwood Bikes": "Run by Sam Ortiz", "Juniper Bakery": "Run by Sam Lee · juniperbakery.com" };
    const names = state === "many" ? Object.keys(facts) : [XA_HARBOR.name, "North Coast Realty", "Lakeview Mediation"];
    return <BusinessPicker mode={mode} accountName={XA_NORTH.person} businesses={state === "empty" ? [] : names.map((name, index) => ({ id: `t${index}-${name}`, name, detail: facts[name], color: identityColor(`t${index}-${name}`) }))} />;
  }
  return <div data-workspace-theme="linen" data-workspace-mode={mode}><ServerStatus businessName={XA_HARBOR.name} error={state === "error" ? "failed" : ""} /></div>;
}
