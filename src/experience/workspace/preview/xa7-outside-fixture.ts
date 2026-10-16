/**
 * XA-7 · Outside the app. Fictional fixtures only (Harbor Dental, Dr. Amy Lin,
 * 1180 Elmwood Ave; North Studio, Maya Okafor). Never imported by a sender,
 * a route that serves a real business, or a test of real authority.
 */
import type { RecordedActor } from "@/platform/presentation/actor";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
import type { SystemView } from "@/experience/systems/model";
import type { InquiryBookingChoice } from "@/products/inquiries";
import { parseStoreBooking } from "@/platform/bookings/store";
import { publicIntakeForm, type PublicIntakeForm } from "@/products/vertical-intake/contracts";
import { DENTAL_INTAKE } from "@/products/vertical-intake/contracts";
import { mondayEmail, waitsForYouEmail, type XaMail } from "@/platform/infra/email/xa-mail";
import { XA_HARBOR, XA_SYSTEM_HREFS, XA_SYSTEMS } from "./xa-day";

export const XA7_BASE = "/preview/strelva/xa/xa7-outside";
export const HARBOR = { business: XA_HARBOR.name, owner: XA_HARBOR.ownerShort, ownerFull: XA_HARBOR.owner, site: XA_HARBOR.domain, address: XA_HARBOR.address, phone: "(716) 555-0142", timeZone: "America/New_York" } as const;
export const MAYA: RecordedActor = { kind: "agency", displayName: "Maya at North Studio" };

/* ---------- E1 · waits for you (template only) ---------- */

export function e1Mail(state: string): XaMail {
  return waitsForYouEmail({
    business: HARBOR.business, logoUrl: null, agencyName: "North Studio",
    subject: "Close Harbor Dental for Thanksgiving?", question: "Close for Thanksgiving, Nov\u00a026–27?", actor: MAYA,
    page: { address: `${HARBOR.site}/hours`, title: "Thanksgiving hours", change: "Closed Thursday and Friday, Nov 26–27. Back Saturday, Nov 28, 9–1.", note: "Replaces your usual hours for that week" },
    review: `${XA7_BASE}/phone-yes?state=confirm`,
    signInRequired: state === "sign-in",
    undoNote: state === "no-undo" ? undefined : "You can undo it any time from Home.",
    settingsUrl: `${XA7_BASE}/waits-email?state=settings`,
  });
}

/* ---------- E3 · Monday email (template only) ---------- */

/** The Monday of the one fixture day (Nov 23) reports the week before it. Thanksgiving still waits on Dr. Lin, so it is not a change yet. */
export function e3Mail(state: string): XaMail {
  return mondayEmail({
    business: HARBOR.business, agencyName: "North Studio", period: "Nov 16–22", weekOf: "Week of Nov 16",
    figure: { value: 14, label: "visits booked online", detail: "3 new patients · 11 returning" },
    changes: state === "quiet" ? [] : [
      { date: "Nov 20", text: "Moved the Book a visit button to the top of the home page", who: "Maya at North Studio" },
      { date: "Nov 18", text: "Fixed the map link on the contact page", who: "Strelva" },
      { date: "Nov 19", text: "Added Delta Dental PPO to the insurance list", who: "Maya at North Studio" },
    ],
    checks: `Every check on ${HARBOR.site} passed. Your Services page was the slowest at 1.4 seconds.`,
    // The sender builds this from the mattered change's systemId (systemHref); a change with no System sends null.
    seeUrl: state === "quiet" ? null : XA_SYSTEM_HREFS.website,
    open: { label: "Open Harbor Dental", url: `${XA7_BASE}/today-phone` },
    settingsUrl: `${XA7_BASE}/monday-email?state=settings`,
  });
}

/* ---------- E4 · public booking page ---------- */

/** Thanksgiving in Harbor Dental's hours record, the same closure E2 asks about. */
export const E4_CLOSURES = [{ date: "2026-11-26", label: "Thanksgiving" }, { date: "2026-11-27", label: "Thanksgiving" }];
const at = (day: number, time: string) => `2026-11-${String(day).padStart(2, "0")}T${time}:00-05:00`;
export const SLOT_STARTS = [at(23, "08:00"), at(23, "10:30"), at(23, "14:00"), at(24, "09:15"), at(24, "13:30"), at(24, "15:45"), at(25, "08:30"), at(25, "11:00"), at(25, "14:15"), at(28, "09:00"), at(28, "11:00")];

/**
 * `slot` is the index the visitor posted (the preview's act route carries it
 * back), so the held page says back the time that was picked. The hold starts
 * at the fixture's now (Fri Nov 20, 9:05 AM) and runs 15 minutes, to 9:20 AM;
 * the times themselves are offered until Sunday, Nov 22 at 8:00 PM.
 */
export function e4Choice(state: string, slot?: string | number, business?: { name: string; phone: string; service: string; length: string }): InquiryBookingChoice | null {
  if (state === "expired-link" || state === "error") return null;
  const index = Number(slot);
  const start = Number.isInteger(index) && SLOT_STARTS[index] ? SLOT_STARTS[index]! : at(24, "09:15");
  const slots = state === "empty" ? [] : SLOT_STARTS.map(start => ({ start, end: new Date(Date.parse(start) + 3_600_000).toISOString(), label: start, chooseUrl: "#" }));
  const serviceName = business ? business.service.replace(/ with Dr\. Lin$/, "") : "New-patient exam";
  const offer = { serviceId: "exam", services: [{ id: "exam", name: serviceName, durationMinutes: 60 }], serviceName: `${serviceName} · ${business?.length ?? "60 min"}`, timeZone: HARBOR.timeZone, chooseUrl: "#", expiresAt: at(22, "20:00"), slots };
  const status = state === "held" || state === "requested" || state === "confirmed" ? state : null;
  const booking = status ? parseStoreBooking({ id: "fixture", status, serviceName, start, end: new Date(Date.parse(start) + 3_600_000).toISOString(), timeZone: HARBOR.timeZone, createdAt: "2026-11-20T14:05:00Z" }) : null;
  return { businessName: business?.name ?? HARBOR.business, offer, booking, businessPhone: business?.phone ?? HARBOR.phone, closures: E4_CLOSURES };
}

/* ---------- E5 · patient form ---------- */

export function e5Form(): PublicIntakeForm {
  return publicIntakeForm(DENTAL_INTAKE, 3, { bookingServiceId: "exam", collectMemberId: true, pageUrl: `https://${HARBOR.site}/new-patients`, formLabel: "Send" }, {
    display_name: HARBOR.business, phone: HARBOR.phone, insurance_accepted: { carriers: ["Delta Dental PPO", "Cigna", "MetLife"] },
  }, { sensitiveAvailable: true, now: new Date("2026-11-20T15:00:00Z") });
}

export const E5_FILLED: Record<string, string> = {
  name: "Priya Raman", phone: "(716) 555-0187", patient_status: "new", reason: "exam", insurance_carrier: "p_delta_dental_ppo",
  insurance_member_id: "DDN 4471 2093", preferred_days: "tue,wed", preferred_times: "morning", note: "Mornings work best, I have a 7-year-old.",
};

/* ---------- E6 · Today on the phone ---------- */

const WS = "5e000000-0000-4000-8000-0000000000e6";
export function e6Decision(): OwnerDecision {
  return {
    id: "5e000000-0000-4000-8000-0000000000d1", workspaceId: WS, systemId: null, kind: "system.change_live", route: "owner_decides",
    title: "Close for Thanksgiving, Nov 26–27?", detail: null, approveEffect: "Thanksgiving hours go live on harbordental.com.", notYetEffect: "Nothing changes.",
    sourceLifecycle: "website_document", sourceId: "fixture", revisionHash: "a".repeat(64), urgent: false, signInRequired: false, adminMayDecide: false,
    openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "sent",
    operatorNote: null, actor: MAYA, openedAt: "2026-11-22T21:12:00Z", expiresAt: "2026-11-25T21:12:00Z", reminded1At: null, reminded2At: null, deliveries: [],
  };
}

export function e6Systems(): SystemView[] {
  const base = { lifecycle: "live", health: { state: "healthy", summary: "Checks passed" }, surface: "managed", connections: [], possibilities: [], versions: [] } as unknown as Omit<SystemView, "id" | "kind" | "name" | "detail">;
  return [
    // The same Systems as every preview (xa-day.ts).
    { ...base, id: "web", kind: "website", name: XA_SYSTEMS.website.name, detail: XA_SYSTEMS.website.detail },
    { ...base, id: "book", kind: "bookings", name: XA_SYSTEMS.bookings.name, detail: XA_SYSTEMS.bookings.detail },
    { ...base, id: "inquiries", kind: "inquiries", name: XA_SYSTEMS.inquiries.name, detail: XA_SYSTEMS.inquiries.detail },
    { ...base, id: "form", kind: "app", name: XA_SYSTEMS.form.name, detail: "Forms patients fill in before a first visit", lifecycle: "draft" },
  ] as SystemView[];
}
export const E6_FACTS = { web: "Checks passed at 7:02", book: "3 booked today", inquiries: XA_SYSTEMS.inquiries.detail, form: "Draft" } as const;
