/**
 * XA-3 preview fixtures: Harbor Dental (Dr. Amy Lin, 1180 Elmwood Ave) with
 * North Studio (Maya Okafor) as its agency. Fictional records in the exact
 * shapes the server returns (OwnerDecision, HandledReceipt, SystemView,
 * BusinessRequestRow, ResponsibilityProofData). Preview only; never sent.
 */
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import type { SystemView } from "@/experience/systems/model";
import type { BusinessRequestRow } from "../WorkspaceRequests";
import type { ResponsibilityProofData } from "@/experience/operations/ResponsibilityProof";

export const XA3_SCREENS = ["o1", "o2", "o3", "o4", "o5", "o6"] as const;
export type Xa3Screen = (typeof XA3_SCREENS)[number];
export const XA3_STATES = ["ready", "empty", "loading", "error", "member", "many", "down", "failed", "undone", "done", "offer"] as const;
export type Xa3State = (typeof XA3_STATES)[number];

export const HARBOR = { id: "a0000000-0000-4000-8000-0000000000aa", name: "Harbor Dental", owner: "Dr. Lin", address: "1180 Elmwood Ave" } as const;
export const NORTH_STUDIO = { id: "a0000000-0000-4000-8000-0000000000bb", name: "North Studio", person: "Maya" } as const;
/** 8:14 am on Monday, November 23, 2026: the board's morning. */
export const PREVIEW_NOW = Date.parse("2026-11-23T08:14:00-05:00");
const at = (hoursAgo: number) => new Date(PREVIEW_NOW - hoursAgo * 3_600_000).toISOString();

function system(id: string, kind: SystemView["kind"], name: string, detail: string, lifecycle: SystemView["lifecycle"], health: SystemView["health"]): SystemView {
  return { id, kind, name, detail, lifecycle, health, surface: { kind: "work", workId: id, productId: "applications" }, connections: [], possibilities: [], versions: [] };
}

export function harborSystems(options: { bookingsDown?: boolean } = {}): SystemView[] {
  const checked = at(1.2);
  return [
    system("c0000000-0000-4000-8000-000000000001", "website", "Website", "harbordental.com", "live", { state: "healthy", summary: "Every page loads.", lastVerifiedAt: checked }),
    system("c0000000-0000-4000-8000-000000000002", "bookings", "Bookings", "31 this week", "live", options.bookingsDown
      ? { state: "degraded", summary: "The booking page stopped loading at 6:40. Pebble is on it.", lastVerifiedAt: at(1.6) }
      : { state: "healthy", summary: "Taking bookings.", lastVerifiedAt: checked }),
    system("c0000000-0000-4000-8000-000000000003", "inquiries", "Inbox", "3 new", "live", { state: "healthy", summary: "Inquiries arrive.", lastVerifiedAt: checked }),
    system("c0000000-0000-4000-8000-000000000004", "listing", "Google listing", "Hours and photos", "draft", { state: "unknown", summary: "Not live yet." }),
  ];
}

export const THANKSGIVING_ID = "d0000000-0000-4000-8000-0000000000a1";

export function decision(over: Partial<OwnerDecision> = {}): OwnerDecision {
  return {
    id: THANKSGIVING_ID, workspaceId: HARBOR.id, systemId: "c0000000-0000-4000-8000-000000000002", kind: "system.change_live", route: "owner_decides",
    title: "Close online booking for Thanksgiving", detail: null,
    approveEffect: "Patients see no online times on Thursday and Friday, Nov 26 and 27. Saturday stays 9 to 1.",
    notYetEffect: "Online booking stays open both days. North Studio keeps the change ready.",
    sourceLifecycle: "booking_settings", sourceId: "booking-settings:thanksgiving", revisionHash: "b".repeat(64), urgent: false, signInRequired: false, adminMayDecide: false,
    openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "suppressed", operatorNote: null,
    actor: { kind: "agency", displayName: NORTH_STUDIO.name },
    openedAt: at(16), expiresAt: new Date(PREVIEW_NOW + 13 * 86_400_000).toISOString(), reminded1At: null, reminded2At: null, deliveries: [],
    review: ["Thursday, Nov 26: no online times", "Friday, Nov 27: no online times", "Saturday, Nov 28: 9 to 1, as now", "No one is booked on those two days"],
    ...over,
  };
}

export const SECOND_DECISION = decision({
  id: "d0000000-0000-4000-8000-0000000000a2", kind: "copy.marketing", sourceLifecycle: "website_change", systemId: "c0000000-0000-4000-8000-000000000001",
  title: "Add Delta Dental to the insurance list", approveEffect: "harbordental.com/insurance lists Delta Dental with the others.", notYetEffect: "The insurance page stays as it is.",
  review: ["Insurance we take: Cigna, MetLife, Delta Dental (new)"], openedAt: at(3),
});

export const SINCE: HandledReceipt[] = [
  { id: "tenant_event:41", store: "tenant_events", systemId: null, actor: { kind: "agency", displayName: NORTH_STUDIO.name }, sentence: "North Studio started on Thanksgiving hours. It comes to you when it's ready", at: at(16), changed: null, evidence: null, undo: { state: "not_undoable", reason: "Nothing changed yet." } },
  { id: "tenant_event:42", store: "tenant_events", systemId: null, actor: { kind: "platform" }, sentence: "4 people booked online overnight. First up: Ana R., cleaning at 10:30", at: at(2), changed: null, evidence: null, undo: { state: "not_undoable", reason: "Bookings are the patients' own." } },
  { id: "tenant_event:43", store: "tenant_events", systemId: null, actor: { kind: "platform" }, sentence: "Strelva renewed the security certificate for harbordental.com", at: at(1.6), changed: null, evidence: { providerAccepted: true, readBack: "verified" }, undo: { state: "not_undoable", reason: "A lapsed certificate would take the site down." } },
];

/** The receipt Strelva records once the yes lands (`decision:<id>`). */
export function yesReceipt(state: "undo" | "undone" = "undo"): HandledReceipt {
  return {
    id: `decision:${THANKSGIVING_ID}`, store: "owner_decisions", systemId: "c0000000-0000-4000-8000-000000000002", actor: { kind: "agency", displayName: NORTH_STUDIO.name },
    sentence: 'North Studio did "Close online booking for Thanksgiving" as you approved', at: new Date(PREVIEW_NOW + 60_000).toISOString(),
    changed: "Thursday and Friday show Closed on harbordental.com/book. No open times on Nov 26 and 27.",
    evidence: { providerAccepted: true, readBack: "verified" }, undo: state === "undo" ? { state: "undo" } : { state: "undone" },
  };
}

export const REQUEST_ROWS: BusinessRequestRow[] = [
  { id: "delivery-r1", title: "New-patient form asks for a photo of the insurance card", stage: "in_progress", detail: "Being made · due Oct 19 · by North Studio", href: "#request-r1", sortAt: at(200), agencyName: NORTH_STUDIO.name, provider: "agency" },
  { id: "delivery-r2", title: "Spanish version of the homepage", stage: "ready_for_review", detail: "North Studio sent it for your review · due Oct 21", href: "#request-r2", sortAt: at(250), agencyName: NORTH_STUDIO.name, provider: "agency" },
  { id: "delivery-r3", title: "Text patients a reminder the day before", stage: "asked", detail: "Asked · waiting for North Studio to agree scope and deadline", href: "#request-r3", sortAt: at(900), agencyName: NORTH_STUDIO.name, provider: "agency" },
  { id: "work-r4", title: "Check that every page patients can reach loads", stage: "in_progress", detail: "In progress · started Oct 14", workId: "w4", sortAt: at(100), provider: "strelva-run" },
  { id: "delivery-r5", title: "Close online booking for Thanksgiving", stage: "done", detail: "Done · by North Studio", href: "#request-r5", sortAt: at(1), agencyName: NORTH_STUDIO.name, provider: "agency" },
  { id: "delivery-r6", title: "Add Delta Dental to the insurance list", stage: "done", detail: "Done · by North Studio", href: "#request-r6", sortAt: at(700), agencyName: NORTH_STUDIO.name, provider: "agency" },
];

export function runningProof(options: { slip?: boolean; empty?: boolean } = {}): ResponsibilityProofData {
  const card = (id: string, title: string, verified: string, status: "verified" | "partial" | "failed" | "unverified" = "verified") => ({
    responsibilityId: id, title, from: at(24 * 7), to: at(1.2), status, did: "Checked on schedule.", verified, receiptRefs: [], openHref: `#check-${id}`, undoHref: null,
  });
  return {
    proof: {
      verdict: options.empty ? "No checks have run for Harbor Dental yet." : options.slip ? "Full check at 7:02. The new-patient form bounced at 6:00; Strelva is fixing it." : "Full check at 7:02. The booking page was checked again at 8:11, right after your yes.",
      cards: options.empty ? [] : [
        card("k1", "harbordental.com opens in under 2 seconds", "1.1 s at 7:02"),
        card("k2", "Hours on the website match the booking page", "They match"),
        card("k3", "The booking page only offers times you're open", "Closed Nov 26 and 27, checked 8:11"),
        options.slip ? card("k4", "New-patient forms reach hello@harbordental.com", "The 6:00 form bounced. Strelva is resending it.", "failed") : card("k4", "New-patient forms reach hello@harbordental.com", "Arrived in 4 s"),
        card("k5", "Every page patients can reach loads", "41 of 41"),
        card("k6", "The phone number is the same everywhere", "(716) 555-0142 on 6 of 6"),
        card("k7", "The security certificate is current", "Renewed today"),
      ],
    },
    state: { businessId: HARBOR.id, providerWorkspaceId: NORTH_STUDIO.id, canSetCadence: true, cadence: "weekly",
      mandates: [] },
  };
}

export const NEXT_CHECK_MANDATE = { serviceRequestId: "e0000000-0000-4000-8000-000000000001", providerWorkspaceId: NORTH_STUDIO.id, investigations: {}, everySeconds: 86_400, nextAt: new Date(PREVIEW_NOW + 17 * 3_600_000).toISOString(), idempotencyKey: "mandate:harbor" };
