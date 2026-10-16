/**
 * XA-3 preview fixtures: Harbor Dental (Dr. Amy Lin, 1180 Elmwood Ave) with
 * North Studio (Maya Okafor) as its agency. Fictional records in the exact
 * shapes the server returns (OwnerDecision, HandledReceipt, SystemView,
 * BusinessDeliveryItem, ResponsibilityProofData). Preview only; never sent.
 *
 * One story holds across the screens, on Monday, November 23, 2026:
 * yesterday at 4:12 pm Maya asked to close online booking for Thanksgiving;
 * this morning it waits for Dr. Lin (O2, O3); she says yes at 8:11 (O4);
 * after that Today, Requests and Running all show it live (O1, O5, O6), with
 * nothing waiting in the sidebar.
 */
import type { DecisionPreview, HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import type { SystemView } from "@/experience/systems/model";
import type { BusinessDeliveryItem } from "../business-delivery-summary";
import type { BusinessRequestRow } from "../WorkspaceRequests";
import type { ResponsibilityProofData } from "@/experience/operations/ResponsibilityProof";
import { XA_DAY, XA_HARBOR, XA_NORTH, XA_SYSTEMS } from "./xa-day";

export const XA3_SCREENS = ["o1", "o2", "o3", "o4", "o5", "o6"] as const;
export type Xa3Screen = (typeof XA3_SCREENS)[number];
export const XA3_STATES = ["ready", "empty", "loading", "error", "member", "many", "down", "failed", "undone", "done", "offer", "waits"] as const;
export type Xa3State = (typeof XA3_STATES)[number];

/** `accountName` is the account's recorded name; Today greets with greetingName(accountName), as the real route does. */
export const HARBOR = { id: "a0000000-0000-4000-8000-0000000000aa", name: XA_HARBOR.name, accountName: XA_HARBOR.owner, address: XA_HARBOR.address } as const;
export const NORTH_STUDIO = { id: "a0000000-0000-4000-8000-0000000000bb", name: XA_NORTH.name, person: XA_NORTH.first, personName: XA_NORTH.person } as const;
const MAYA = { kind: "agency", displayName: NORTH_STUDIO.name, personName: NORTH_STUDIO.personName } as const;
const OWNER = { kind: "person", displayName: HARBOR.accountName } as const;

/** 8:14 am on Monday, November 23, 2026: the board's morning. */
export const PREVIEW_NOW = XA_DAY.now;
/** Dr. Lin's yes, and Strelva's read-back of the booking page. */
export const YES_AT = Date.parse("2026-11-23T08:11:00-05:00");
const at = (hoursAgo: number) => new Date(PREVIEW_NOW - hoursAgo * 3_600_000).toISOString();
const daysAgo = (days: number, hour = 10) => new Date(Date.parse(`2026-11-23T${String(hour).padStart(2, "0")}:00:00-05:00`) - days * 86_400_000).toISOString();

function system(id: string, kind: SystemView["kind"], name: string, detail: string, lifecycle: SystemView["lifecycle"], health: SystemView["health"]): SystemView {
  return { id, kind, name, detail, lifecycle, health, surface: { kind: "work", workId: id, productId: "applications" }, connections: [], possibilities: [], versions: [] };
}

export const SYSTEM_IDS = { website: "c0000000-0000-4000-8000-000000000001", bookings: "c0000000-0000-4000-8000-000000000002", inbox: "c0000000-0000-4000-8000-000000000003", listing: "c0000000-0000-4000-8000-000000000004", form: "c0000000-0000-4000-8000-000000000005" } as const;

export function harborSystems(options: { bookingsDown?: boolean } = {}): SystemView[] {
  const checked = new Date(Date.parse(XA_DAY.checkedAt)).toISOString();
  return [
    system(SYSTEM_IDS.website, "website", XA_SYSTEMS.website.name, XA_SYSTEMS.website.detail, "live", { state: "healthy", summary: "Every page loads.", lastVerifiedAt: checked }),
    system(SYSTEM_IDS.bookings, "bookings", XA_SYSTEMS.bookings.name, XA_SYSTEMS.bookings.detail, "live", options.bookingsDown
      ? { state: "degraded", summary: "The booking page stopped loading at 6:40. Patients see an error instead of times.", lastVerifiedAt: new Date(Date.parse("2026-11-23T06:40:00-05:00")).toISOString() }
      : { state: "healthy", summary: "Taking bookings.", lastVerifiedAt: checked }),
    system(SYSTEM_IDS.inbox, "inquiries", XA_SYSTEMS.inquiries.name, XA_SYSTEMS.inquiries.detail, "live", { state: "healthy", summary: "Inquiries arrive.", lastVerifiedAt: checked }),
    system(SYSTEM_IDS.form, "app", XA_SYSTEMS.form.name, "Forms patients fill in before a first visit", "draft", { state: "unknown", summary: "Not live yet." }),
  ];
}

export const THANKSGIVING_ID = "d0000000-0000-4000-8000-0000000000a1";
const REQUEST = { thanksgiving: "e1000000-0000-4000-8000-000000000001", form: "e1000000-0000-4000-8000-000000000002", spanish: "e1000000-0000-4000-8000-000000000003", texts: "e1000000-0000-4000-8000-000000000004", delta: "e1000000-0000-4000-8000-000000000005" } as const;

const WEEK: DecisionPreview = {
  kind: "bookings_week", audience: "patients", address: "harbordental.com/book", title: "Book a visit", note: "Week of Nov 23 · Closed Thu–Fri for Thanksgiving",
  days: [
    { weekday: "Mon", date: "2026-11-23", closed: false, times: ["8:00", "10:30", "2:00"] },
    { weekday: "Tue", date: "2026-11-24", closed: false, times: ["9:15", "1:30", "3:45"] },
    { weekday: "Wed", date: "2026-11-25", closed: false, times: ["8:30", "11:00", "2:15"] },
    { weekday: "Thu", date: "2026-11-26", closed: true, times: [] },
    { weekday: "Fri", date: "2026-11-27", closed: true, times: [] },
    { weekday: "Sat", date: "2026-11-28", closed: false, times: ["9:00", "11:00"] },
  ],
};

export function decision(over: Partial<OwnerDecision> = {}): OwnerDecision {
  return {
    id: THANKSGIVING_ID, workspaceId: HARBOR.id, systemId: SYSTEM_IDS.bookings, kind: "system.change_live", route: "owner_decides",
    title: "Close online booking for Thanksgiving", detail: null,
    approveEffect: "Patients see no online times on Thursday and Friday, Nov 26 and 27. Saturday stays 9 to 1.",
    notYetEffect: "Online booking stays open both days. Maya keeps the change ready.",
    // The request Maya delivered: its decision is how Requests finds the receipt and its Undo.
    sourceLifecycle: "service_request", sourceId: `${REQUEST.thanksgiving}:ready_for_review`, revisionHash: "b".repeat(64), urgent: false, signInRequired: false, adminMayDecide: false,
    openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "suppressed", operatorNote: null,
    actor: MAYA,
    openedAt: new Date(Date.parse("2026-11-22T16:12:00-05:00")).toISOString(), expiresAt: new Date(PREVIEW_NOW + 13 * 86_400_000).toISOString(), reminded1At: null, reminded2At: null, deliveries: [],
    review: ["Thursday, Nov 26: no online times", "Friday, Nov 27: no online times", "Saturday, Nov 28: 9 to 1, as now", "No one is booked on those two days"],
    preview: WEEK,
    ...over,
  };
}

export const SECOND_DECISION = decision({
  id: "d0000000-0000-4000-8000-0000000000a2", kind: "copy.marketing", sourceLifecycle: "website_change", sourceId: "website-change:insurance", systemId: SYSTEM_IDS.website,
  title: "Add Delta Dental to the insurance list", approveEffect: "harbordental.com/insurance lists Delta Dental with the others.", notYetEffect: "The insurance page stays as it is.",
  review: ["Insurance we take: Cigna, MetLife, Delta Dental (new)"], preview: null, openedAt: at(3),
});

/** What changed before the yes: newest first on Today. */
export const SINCE: HandledReceipt[] = [
  { id: "tenant_event:41", store: "tenant_events", systemId: null, actor: MAYA, sentence: "Maya at North Studio started on Thanksgiving hours. It comes to you when it's ready", at: new Date(Date.parse("2026-11-22T16:12:00-05:00")).toISOString(), changed: null, evidence: null, undo: { state: "not_undoable", reason: "Nothing changed yet." } },
  { id: "tenant_event:42", store: "tenant_events", systemId: null, actor: { kind: "platform" }, sentence: "4 people booked online overnight. First up: Ana R., cleaning at 10:30", at: new Date(Date.parse("2026-11-23T06:12:00-05:00")).toISOString(), changed: null, evidence: null, undo: { state: "not_undoable", reason: "Bookings are the patients' own." } },
  { id: "tenant_event:43", store: "tenant_events", systemId: null, actor: { kind: "platform" }, sentence: "Strelva renewed the security certificate for harbordental.com", at: new Date(Date.parse("2026-11-23T06:40:00-05:00")).toISOString(), changed: null, evidence: { providerAccepted: true, readBack: "verified" }, undo: { state: "not_undoable", reason: "A lapsed certificate would take the site down." } },
];

/** The receipt Strelva records once the yes lands (`decision:<id>`), read back at `when`. */
export function yesReceipt(state: "undo" | "undone" = "undo", when = YES_AT): HandledReceipt {
  return {
    id: `decision:${THANKSGIVING_ID}`, store: "owner_decisions", systemId: SYSTEM_IDS.bookings, actor: MAYA,
    sentence: "Maya at North Studio finished it after your yes: Close online booking for Thanksgiving.", at: new Date(when).toISOString(),
    changed: "Thursday and Friday show Closed on harbordental.com/book. No open times on Nov 26 and 27. Saturday stays 9 to 1.",
    evidence: { providerAccepted: true, readBack: "verified" }, undo: state === "undo" ? { state: "undo" } : { state: "undone" },
    source: { lifecycle: "service_request", id: `${REQUEST.thanksgiving}:ready_for_review` },
  };
}

/** Requests as the server reads them (businessDeliveryItems), so the preview runs the real row words. */
export function harborDeliveries(options: { thanksgivingWaits?: boolean } = {}): BusinessDeliveryItem[] {
  const agency = { kind: "agency" as const, agencyWorkspaceId: NORTH_STUDIO.id };
  const item = (id: string, title: string, stage: BusinessDeliveryItem["stage"], systemId: string, askedBy: BusinessDeliveryItem["askedBy"], createdAt: string, updatedAt: string, dueAt: string | null = null): BusinessDeliveryItem => ({
    id, title, detail: "", href: `#request-${id.slice(-1)}`, attention: stage === "needs_you" || stage === "ready_for_review", handling: stage === "in_progress", stage,
    provider: agency, servingAgencyName: NORTH_STUDIO.name, dueAt, updatedAt, systemId, askedBy, createdAt, deliveryId: null,
  });
  return [
    item(REQUEST.thanksgiving, "Close online booking for Thanksgiving", options.thanksgivingWaits ? "ready_for_review" : "done", SYSTEM_IDS.bookings, MAYA, daysAgo(1, 16), options.thanksgivingWaits ? daysAgo(1, 16) : new Date(YES_AT).toISOString()),
    item(REQUEST.form, "New-patient form asks for a photo of the insurance card", "in_progress", SYSTEM_IDS.form, MAYA, daysAgo(11), daysAgo(2), daysAgo(-4)),
    item(REQUEST.spanish, "Spanish version of the homepage", "in_progress", SYSTEM_IDS.website, OWNER, daysAgo(14), daysAgo(3), daysAgo(-6)),
    item(REQUEST.texts, "Text patients a reminder the day before", "asked", SYSTEM_IDS.bookings, OWNER, daysAgo(36), daysAgo(36)),
    item(REQUEST.delta, "Add Delta Dental to the insurance list", "done", SYSTEM_IDS.website, OWNER, daysAgo(21), daysAgo(20)),
  ];
}

/** A finite job Strelva runs itself (saved operations work), as businessRequestRows makes it. */
export const STRELVA_JOB_ROW: BusinessRequestRow = {
  id: "work-w4", title: "Check each morning that every page opens", stage: "in_progress", detail: "Strelva runs it · started Nov 14", workId: "w4", sortAt: daysAgo(9), provider: "strelva-run",
};

/** Thirty days of checks, Oct 25 to Nov 23, with one slip on Nov 3 (a new-patient form bounced). */
export function runningProof(options: { slip?: boolean; empty?: boolean } = {}): ResponsibilityProofData {
  const from = daysAgo(29, 0), to = new Date(PREVIEW_NOW).toISOString();
  const allDays = Array.from({ length: 30 }, (_, index) => daysAgo(29 - index).slice(0, 10));
  const nextAt = new Date(Date.parse("2026-11-23T13:00:00-05:00")).toISOString();
  const today = (time: string) => new Date(Date.parse(`2026-11-23T${time}:00-05:00`)).toISOString();
  const card = (id: string, title: string, value: string, checkedAt: string, extra: Partial<ResponsibilityProofData["proof"]["cards"][number]> = {}) => ({
    responsibilityId: id, title, from, to, status: "verified" as const, did: "Checked on schedule.", verified: value, receiptRefs: [], openHref: `#check-${id}`, undoHref: null,
    checkedAt, value, nextAt, checkDays: allDays, slipDays: [] as string[], lastSlipAt: null as string | null, ...extra,
  });
  const formSlip = { slipDays: ["2026-11-03"], lastSlipAt: new Date(Date.parse("2026-11-03T09:20:00-05:00")).toISOString() };
  return {
    proof: {
      verdict: "Recorded checks for Harbor Dental.",
      cards: options.empty ? [] : [
        card("k1", "harbordental.com opens in under 2 seconds", "1.1 s", today("07:02")),
        card("k2", "Hours on the website match the booking page", "Match", today("07:02")),
        card("k3", "The booking page only offers times you're open", "Closed Nov 26–27", new Date(YES_AT).toISOString()),
        options.slip
          ? card("k4", "New-patient forms reach hello@harbordental.com", "Bounced", today("06:00"), { status: "failed", slipDays: ["2026-11-03", "2026-11-23"], lastSlipAt: today("06:00") })
          : card("k4", "New-patient forms reach hello@harbordental.com", "Arrived in 4 s", today("06:00"), formSlip),
        card("k5", "Every page patients can reach loads", "41 of 41", today("07:02")),
        card("k6", "The phone number is the same everywhere", "Match", today("07:02")),
        card("k7", "The security certificate is current", "Renewed today", today("06:40")),
      ],
    },
    state: { businessId: HARBOR.id, providerWorkspaceId: NORTH_STUDIO.id, canSetCadence: true, cadence: "weekly", mandates: [] },
  };
}

export const NEXT_CHECK_MANDATE = { serviceRequestId: "e0000000-0000-4000-8000-000000000001", providerWorkspaceId: NORTH_STUDIO.id, investigations: {}, everySeconds: 86_400, nextAt: new Date(PREVIEW_NOW + 17 * 3_600_000).toISOString(), idempotencyKey: "mandate:harbor" };
