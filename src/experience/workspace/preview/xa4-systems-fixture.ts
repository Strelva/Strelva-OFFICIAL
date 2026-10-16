/**
 * XA-4 · Systems up close: fictional fixtures for the local preview only
 * (Harbor Dental, Dr. Amy Lin, 1180 Elmwood Ave; North Studio, Maya Okafor).
 * Built through the same view types and detail merge the server uses. No
 * real business, site, inbox or calendar is read or written.
 */
import type { SystemView } from "@/experience/systems/model";
import { buildWebsiteSystemDetail, type WebsiteDetailInputs, type WebsiteSystemDetail } from "@/experience/systems/website-detail";
import type { BookingRow, WorkspaceBookings } from "@/products/bookings/server";
import type { InquirySystemDetail, WorkspaceLeads } from "@/products/inquiries";

export const XA4_SCREENS = ["website", "bookings", "inbox", "form", "possibility", "history"] as const;
export const XA4_STATES = ["ready", "empty", "loading", "error", "waiting", "done"] as const;
export type Xa4Screen = typeof XA4_SCREENS[number];
export type Xa4State = typeof XA4_STATES[number];

export const XA4_WORKSPACE = "4a000000-0000-4000-8000-000000000001";
export const XA4_SITE = "4a000000-0000-4000-8000-000000000002";
export const XA4_FORM = "4a000000-0000-4000-8000-000000000003";
export const XA4_POSSIBILITY = "4a000000-0000-4000-8000-000000000004";
export const XA4_INBOX = "4a000000-0000-4000-8000-000000000005";
export const XA4_BOOKING_REQUEST = "4a000000-0000-4000-8000-0000000000b6";
const BASE = "/preview/strelva/xa/xa4-systems";

const MAYA = { kind: "agency" as const, displayName: "Maya at North Studio" };
const AMY = { kind: "person" as const, displayName: "Dr. Amy Lin" };
const STRELVA = { kind: "platform" as const };

/* ---------- S1 · Website ---------- */

export function harborWebsite(state: "ready" | "waiting" | "error" | "empty" | "done"): SystemView {
  const broken = state === "error";
  return {
    id: XA4_SITE, kind: "website", name: "harbordental.com", detail: "Harbor Dental", lifecycle: "live",
    health: broken
      ? { state: "degraded", summary: "The contact form stopped reaching your inbox at 6:40. Pebble is holding new messages.", lastVerifiedAt: "2026-10-15T10:40:00Z", signals: ["Loads on a phone: 1.2 s", "Links work: 41 of 41", "Forms reach your inbox: Stopped at 6:40", "Hours match your record: Match"], failing: ["Forms reach your inbox: Stopped at 6:40"] }
      : state === "empty" ? { state: "unknown", summary: "Nothing has checked this yet." }
        : { state: "healthy", summary: "Every check passed at 7:02.", lastVerifiedAt: "2026-10-15T11:02:00Z", signals: ["Loads on a phone: 1.2 s", "Links work: 41 of 41", "Forms reach your inbox: 4 s", "Hours match your record: Match"] },
    surface: state === "empty"
      ? { kind: "website", domain: "harbordental.com", previewLabel: "harbordental.com", editing: "request" }
      : { kind: "website", domain: "harbordental.com", liveUrl: "https://harbordental.com", previewSrc: `${BASE}/site?v=live&preview=true`, previewLabel: "harbordental.com, as patients see it", editing: "request" },
    operatedBy: "North Studio",
    connections: state === "empty" ? [] : [
      { id: "c-hours", kind: "read", target: "Hours", sentence: "Reads your hours from your business record.", status: "connected" },
      { id: "c-phone", kind: "read", target: "Phone", sentence: "Reads your phone number from your business record.", status: "connected" },
      { id: "c-address", kind: "read", target: "Address", sentence: "Reads 1180 Elmwood Ave from your business record.", status: "connected" },
    ],
    versions: [],
    possibilities: state === "waiting" ? [harborPossibility()] : [],
    history: state === "done" ? [{ id: "done-booking-top", sentence: "Put booking at the top of the home page", at: "2026-10-15T13:12:00Z", actor: AMY }] : undefined,
  };
}

export function harborPossibility(stale = false) {
  return {
    id: XA4_POSSIBILITY, title: "Put booking at the top of your home page.", summary: "Book a visit moves above the photo, with the next opening.",
    status: stale ? "exploring" as const : "ready" as const, executionAvailability: "live" as const, affects: [XA4_SITE],
    evidence: "64% of visits come from phones, where Book a visit sits below the fold today.",
    actor: MAYA, proposedAt: "2026-10-13T16:12:00Z",
    previewSrc: `${BASE}/site?v=proposed&preview=true`,
    ...(stale ? { staleReason: "harbordental.com changed since Maya made this." } : {}),
  };
}

const day = (iso: string) => iso;

export function harborWebsiteDetail(mode: "full" | "empty" | "waiting"): WebsiteSystemDetail {
  const base: WebsiteDetailInputs = {
    systemId: XA4_SITE, actorId: "preview", workspaceId: XA4_WORKSPACE, workId: null,
    domains: [{ hostname: "harbordental.com", state: "verified", label: "Verified", lastCheckedAt: "2026-10-15T11:02:00Z", whoCanChange: "Dr. Lin decides; North Studio prepares the records." }],
    decisions: mode === "waiting" ? [{ id: "booking-top", title: "Put booking at the top of your home page", detail: "Maya at North Studio made this. It goes live when you say yes.", openedAt: "2026-10-13T16:12:00Z", openHref: null }] : [],
    draftSections: [], siteReview: null, serviceRequests: [], documentRevisions: [], linkedPublications: [], unavailable: [],
    changeRequests: mode === "empty" ? [] : [
      { requestId: "team-photo", title: "New team photo on About", kind: "custom_request", status: "shipped", createdAt: day("2026-10-09T14:00:00Z"), resolvedAt: day("2026-10-09T15:30:00Z"), actor: MAYA },
      { requestId: "about-page", title: "Rewrote the About page", kind: "custom_request", status: "shipped", createdAt: day("2026-10-03T14:00:00Z"), resolvedAt: day("2026-10-03T16:40:00Z"), actor: MAYA },
      { requestId: "insurance-page", title: "Added an insurance page", kind: "custom_request", status: "shipped", createdAt: day("2026-09-30T14:00:00Z"), resolvedAt: day("2026-09-30T18:05:00Z"), actor: MAYA },
      { requestId: "fees", title: "Add a page with cleaning prices", kind: "custom_request", status: "in_progress", createdAt: day("2026-10-14T13:00:00Z"), actor: AMY },
    ],
    contentVersions: mode === "empty" ? [] : [
      { id: "cv-insurance-link", section: "insurance", author: "ai", timestamp: day("2026-10-11T11:02:00Z"), status: "live", actor: STRELVA },
      { id: "cv-footer-phone", section: "footer", author: "user", timestamp: day("2026-09-29T15:20:00Z"), status: "live", actor: AMY },
    ],
    snapshots: mode === "empty" ? [] : [{ id: "snap-sep28", label: "The site as it came to Strelva", reason: "import", author: "system", createdAt: day("2026-09-28T09:00:00Z"), status: "available", actor: STRELVA }],
    // The newest change was deployed and its live page read back, so S6 can say it was checked.
    repoDeployments: mode === "empty" ? [] : [{ id: "dep-sat-hours", requestId: "sat-hours", title: "Saturday hours are now 9 to 1", commitSha: "fixture", deploymentUrl: "https://harbordental.com", readBack: "confirmed", recordedAt: day("2026-10-12T20:18:00Z"), actor: MAYA }],
  };
  return buildWebsiteSystemDetail(base);
}

/** The fictional practice's own home page, framed as patients see it. Plain HTML, no scripts. */
export function harborSitePage(variant: "live" | "proposed"): string {
  const book = variant === "proposed"
    ? `<div class="book"><div><strong>Book a visit</strong><span>Next opening today at 2:30</span></div><a>Pick a time</a></div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harbor Dental</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Georgia,"Times New Roman",serif;color:#16324a;background:#fff}
.wrap{padding:22px 28px 32px;max-width:980px;margin:0 auto}nav{display:flex;align-items:center;gap:22px;font:15px/1.2 system-ui,sans-serif}
nav b{font:600 17px system-ui,sans-serif;margin-right:auto;color:#1e4b6e}nav a{color:#2b3a45}nav .cta{background:#1e4b6e;color:#fff;border-radius:999px;padding:9px 16px}
.book{display:flex;align-items:center;gap:12px;margin:22px 0 0;padding:14px 16px;border:1.5px solid #2f5236;border-radius:14px;font:15px/1.3 system-ui,sans-serif;background:#f3f7f2}
.book div{display:flex;flex-direction:column;margin-right:auto}.book span{color:#4b5b52;font-size:13px}.book a{background:#1e4b6e;color:#fff;border-radius:999px;padding:9px 14px;font-weight:600}
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:28px;align-items:center;padding:26px 0 18px}
h1{font-size:40px;line-height:1.08;margin:0 0 14px;letter-spacing:-.5px}p{font:16px/1.5 system-ui,sans-serif;color:#41505b;margin:0}
.photo{aspect-ratio:4/5;border-radius:16px;background:#a9bfcc url(/xa/fixture-harbor-photo.webp) center/cover no-repeat}
.facts{display:flex;gap:40px;margin-top:22px;font:15px/1.4 system-ui,sans-serif}.facts small{display:block;color:#7b8790;font-size:12px}
.strip{border-top:1px solid #e5e8ea;margin-top:22px;padding-top:16px;font:14px system-ui,sans-serif;color:#41505b}
@media (max-width:640px){.hero{grid-template-columns:1fr}h1{font-size:30px}nav a:not(.cta){display:none}}
</style></head><body><div class="wrap">
<nav><b>Harbor Dental</b><a>Services</a><a>Insurance</a><a>About</a><a class="cta">Book a visit</a></nav>
${book}
<section class="hero"><div><h1>Gentle family dentistry on Elmwood.</h1><p>Cleanings, checkups and same-week emergency visits for kids and adults.</p>
<div class="facts"><div><small>Hours</small>Mon to Fri 8 to 5 · Sat 9 to 1</div><div><small>Visit</small>1180 Elmwood Ave, Buffalo</div></div></div>
<div class="photo" role="img" aria-label="Dr. Lin with a patient"></div></section>
<div class="strip">Insurance we accept: Delta Dental · Cigna · MetLife</div>
</div></body></html>`;
}

/** The business's inbox as its own System, so S1 can point at held messages. */
export function harborInbox(): SystemView {
  return {
    id: XA4_INBOX, kind: "inquiries", name: "Inquiries", detail: "Everyone who wrote in", lifecycle: "live",
    health: { state: "healthy", summary: "New messages arrive here." },
    surface: { kind: "inquiries", tenantId: `workspace:${XA4_WORKSPACE}` },
    connections: [], versions: [], possibilities: [],
  } as SystemView;
}

/** A Needs you item for the one booking request, in the shape GET /api/workspace/needs-you returns. */
export function harborBookingRequestDecision() {
  return {
    id: "4a000000-0000-4000-8000-0000000000d6", workspaceId: XA4_WORKSPACE, systemId: null, kind: "customer.commitment", route: "owner_decides",
    title: "Booking request: Dana Reed, Thu Oct 15 2:30 PM", detail: "Checkup", approveEffect: "The booking is confirmed for this time.", notYetEffect: "The time is released and the booking is not confirmed.",
    sourceLifecycle: "booking_request", sourceId: XA4_BOOKING_REQUEST, revisionHash: "a".repeat(64), urgent: true, signInRequired: false, adminMayDecide: false,
    openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "not_sent", operatorNote: null,
    actor: { kind: "person", displayName: "Dana Reed" }, openedAt: "2026-10-15T12:00:00.000Z", expiresAt: "2026-10-18T12:00:00.000Z", reminded1At: null, reminded2At: null, deliveries: [],
  };
}

/* ---------- S2 · Bookings ---------- */

const visit = (id: string, date: string, start: string, end: string, clientName: string, serviceName: string, status: BookingRow["status"] = "confirmed", extra: Partial<BookingRow> = {}): BookingRow =>
  ({ id, date, startTime: start, endTime: end, clientName, clientEmail: `${clientName.split(" ")[0]!.toLowerCase()}@example.test`, clientPhone: "", serviceName, status, ...extra });

export function harborBookings(state: "ready" | "waiting" | "done" | "empty"): WorkspaceBookings {
  const hours = { record: [1, 2, 3, 4, 5].flatMap(d => [{ day: d, opens: "08:00", closes: "17:00" }]).concat([{ day: 6, opens: "09:00", closes: "13:00" }]), bookable: [1, 2, 3, 4, 5].flatMap(d => [{ day: d, opens: "08:00", closes: "12:00" }, { day: d, opens: "13:00", closes: "17:00" }]).concat([{ day: 6, opens: "09:00", closes: "13:00" }]) };
  const bookings: BookingRow[] = state === "empty" ? [] : [
    visit("b1", "2026-10-12", "08:00", "09:00", "Tom Okafor", "Cleaning", "completed"),
    visit("b2", "2026-10-12", "10:30", "11:00", "Lena Park", "Checkup", "completed"),
    visit("b3", "2026-10-13", "09:15", "10:15", "Marcus Bell", "Cleaning", "completed"),
    visit("b4", "2026-10-14", "14:15", "14:45", "Rachel Kim", "Emergency visit", "no_show"),
    visit("b5", "2026-10-15", "08:30", "09:30", "Priya Shah", "Cleaning", state === "done" ? "completed" : "confirmed", { notes: "Daughter, age 9. First visit." }),
    visit(XA4_BOOKING_REQUEST, "2026-10-15", "14:30", "15:00", "Dana Reed", "Checkup", state === "waiting" ? "requested" : "confirmed"),
    visit("b7", "2026-10-17", "09:00", "10:00", "Sam Ortiz", "Cleaning"),
  ];
  return { view: "week", from: "2026-10-12", to: "2026-10-18", native: true, sites: [{ tenantId: `workspace:${XA4_WORKSPACE}`, siteName: "Harbor Dental", timezone: "America/New_York", today: "2026-10-15", bookings, unavailable: false, hours, evidence: { calendarHealth: "connected", truncated: false, paused: false } }] };
}

/* ---------- S3 · Inquiries ---------- */

export function harborLeads(state: "ready" | "done" | "empty"): WorkspaceLeads {
  const replied = { status: "delivered" as const, providerMessageId: null, acceptedAt: "2026-10-14T15:00:00Z", retryable: false as const };
  const lead = (id: string, name: string, message: string, createdAt: string, waiting: boolean) => ({
    id, rowId: `4a000000-0000-4000-8000-0000000001${id.padStart(2, "0")}`, name, email: `${name.split(" ")[0]!.toLowerCase()}@example.test`, message, source: "website form", fields: [] as Array<[string, string]>, createdAt,
    ...(waiting && state !== "done" ? {} : { reply: replied }),
  });
  return {
    workspaceReplies: true, durable: true, denied: [],
    sites: [{ key: "harbor", tenantId: `workspace:${XA4_WORKSPACE}`, siteName: "Harbor Dental", unavailable: false, lastThirtyDays: state === "empty" ? 0 : 19, leads: state === "empty" ? [] : [
      lead("1", "Priya Shah", "Do you take Delta Dental PPO? My daughter needs a cleaning before school starts back.", "2026-10-15T13:14:00Z", true),
      lead("2", "Rachel Kim", "Can I bring my 3-year-old into the room during my cleaning?", "2026-10-14T21:02:00Z", true),
      lead("3", "Tom Okafor", "Is there parking near the office?", "2026-10-14T16:40:00Z", false),
      lead("4", "Lena Park", "Do you do whitening?", "2026-10-12T15:10:00Z", false),
      lead("5", "Marcus Bell", "Can I move my Thursday cleaning to Friday?", "2026-10-12T13:30:00Z", false),
    ] }],
  };
}

/* ---------- S4 · A form in Draft ---------- */

export function harborForm(): SystemView {
  return {
    id: XA4_FORM, kind: "inquiries", name: "New-patient form", detail: "Forms patients fill in before a first visit", lifecycle: "draft",
    health: { state: "unknown", summary: "Nothing checks a draft until it is live." },
    surface: { kind: "work", workId: "new-patient-form", productId: "unknown" },
    operatedBy: "North Studio",
    connections: [
      { id: "f-appear", kind: "appear", target: "your booking confirmation", sentence: "Patients get a link in their booking confirmation.", status: "connected" },
      { id: "f-read", kind: "read", target: "your insurance list, already on file", sentence: "Reads the insurance plans you accept.", status: "connected" },
      { id: "f-share", kind: "share", target: "your inbox, one note per patient", sentence: "Each answer arrives as one note per patient.", status: "connected" },
    ],
    versions: [],
    possibilities: [{ id: "form-live", title: "Put the new-patient form live", summary: "Patients get the form in their booking confirmation.", status: "ready", executionAvailability: "live", affects: [XA4_FORM] }],
  };
}

export const harborFormDetail: InquirySystemDetail = {
  site: "harbordental.com/new-patient", lifecycle: "draft", health: "Patients can't see it yet.",
  forms: [{ schemaVersion: 1, capabilityId: "harbor-new-patient", version: 1, name: "New-patient form", form: { component: "form", id: "new-patient", title: "Before your first visit", intro: "About 3 minutes. Dr. Lin reads it before you arrive.", disclosure: "Harbor Dental", fields: [
    { id: "name", label: "Full name", kind: "text", component: "text_field", required: true, placeholder: "First and last" },
    { id: "dob", label: "Date of birth", kind: "date", component: "text_field", required: true },
    { id: "insurance", label: "Insurance", kind: "select", component: "select_field", required: false, options: ["Delta Dental PPO", "Cigna", "MetLife", "No insurance"] },
    { id: "notes", label: "Anything we should know?", kind: "textarea", component: "textarea_field", required: false, placeholder: "Allergies, medications, or if visits make you nervous" },
  ] } }],
  connections: [{ kind: "reads", target: "Business record", sentence: "Reads the insurance plans Harbor Dental accepts." }],
  history: [{ id: "made", sentence: "Made the new-patient form as a draft.", at: "2026-10-12T16:00:00Z", actor: MAYA }],
} as unknown as InquirySystemDetail;
