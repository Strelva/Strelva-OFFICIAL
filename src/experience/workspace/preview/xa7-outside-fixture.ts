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
import { DENTAL_INTAKE } from "@/products/vertical-intake/definitions/dental";
import { mondayEmail, waitsForYouEmail, type XaMail } from "@/platform/infra/email/xa-mail";

export const XA7_BASE = "/preview/strelva/xa/xa7-outside";
export const HARBOR = { business: "Harbor Dental", owner: "Dr. Lin", ownerFull: "Dr. Amy Lin", site: "harbordental.com", address: "1180 Elmwood Ave", phone: "(716) 555-0142", timeZone: "America/New_York" } as const;
export const MAYA: RecordedActor = { kind: "agency", displayName: "Maya at North Studio" };

/* ---------- E1 · waits for you (template only) ---------- */

export function e1Mail(state: string): XaMail {
  return waitsForYouEmail({
    business: HARBOR.business, logoUrl: null, agencyName: "North Studio",
    subject: "Close Harbor Dental for Thanksgiving?", question: "Close for Thanksgiving, Nov 26–27?", actor: MAYA,
    page: { address: `${HARBOR.site}/hours`, title: "Thanksgiving hours", change: "Closed Thursday and Friday, Nov 26–27. Back Saturday, Nov 28, 9–1.", note: "Replaces your usual hours for that week" },
    review: `${XA7_BASE}/phone-yes?state=confirm`,
    signInRequired: state === "sign-in",
    undoNote: state === "no-undo" ? undefined : "You can undo it any time from Today.",
    settingsUrl: `${XA7_BASE}/waits-email?state=settings`,
  });
}

/* ---------- E3 · Monday email (template only) ---------- */

export function e3Mail(state: string, origin: string): XaMail {
  return mondayEmail({
    business: HARBOR.business, agencyName: "North Studio", period: "Nov 9–15", weekOf: "Week of Nov 9",
    figure: { value: 14, label: "visits booked online", detail: "3 new patients · 11 returning · nothing went down" },
    changes: state === "quiet" ? [] : [
      { date: "Nov 10", text: "Closed for Thanksgiving, Nov 26–27", who: "You said yes" },
      { date: "Nov 12", text: "Fixed the map link on the contact page", who: "Strelva" },
      { date: "Nov 13", text: "New-patient form asks for the insurance member ID", who: "You said yes" },
    ],
    checks: `${HARBOR.site} passed all 2,016 checks. Slowest page: /services at 1.4 s.`,
    artUrl: `${origin}/xa/pose-lineup.webp`,
    open: { label: "Open Harbor Dental", url: `${XA7_BASE}/today-phone` },
    settingsUrl: `${XA7_BASE}/monday-email?state=settings`,
  });
}

/* ---------- E4 · public booking page ---------- */

const at = (day: number, time: string) => `2026-11-${String(day).padStart(2, "0")}T${time}:00-05:00`;
const SLOT_STARTS = [at(23, "08:00"), at(23, "10:30"), at(23, "14:00"), at(24, "09:15"), at(24, "13:30"), at(24, "15:45"), at(25, "08:30"), at(25, "11:00"), at(25, "14:15"), at(28, "09:00"), at(28, "11:00")];

export function e4Choice(state: string): InquiryBookingChoice | null {
  if (state === "expired-link" || state === "error") return null;
  const slots = state === "empty" ? [] : SLOT_STARTS.map(start => ({ start, end: new Date(Date.parse(start) + 3_600_000).toISOString(), label: start, chooseUrl: "#" }));
  const offer = { serviceId: "exam", services: [{ id: "exam", name: "New-patient exam", durationMinutes: 60 }], serviceName: "New-patient exam · 60 min", timeZone: HARBOR.timeZone, chooseUrl: "#", expiresAt: at(22, "20:00"), slots };
  const status = state === "held" || state === "requested" || state === "confirmed" ? state : null;
  const booking = status ? parseStoreBooking({ id: "fixture", status, serviceName: "New-patient exam", start: at(25, "10:30"), end: at(25, "11:30"), timeZone: HARBOR.timeZone, createdAt: "2026-11-20T14:00:00Z" }) : null;
  return { businessName: HARBOR.business, offer, booking };
}

/* ---------- E5 · patient form ---------- */

export function e5Form(): PublicIntakeForm {
  return publicIntakeForm(DENTAL_INTAKE, 3, { bookingServiceId: "exam", collectMemberId: true, pageUrl: `https://${HARBOR.site}/new-patients`, formLabel: "Send" }, {
    display_name: HARBOR.business, phone: HARBOR.phone, insurance_accepted: { carriers: ["Delta Dental PPO", "Cigna", "MetLife"] },
  }, { sensitiveAvailable: true, now: new Date("2026-11-20T15:00:00Z") });
}

export const E5_FILLED: Record<string, string> = {
  name: "Priya Raman", phone: "(716) 555-0187", patient_status: "new", reason: "exam", insurance_carrier: "p_delta_dental_ppo",
  insurance_member_id: "DDN 4471 2093", preferred_days: "tue,wed", preferred_times: "morning", note: "My lower left side is sensitive to cold.",
};

/* ---------- E6 · Today on the phone ---------- */

const WS = "5e000000-0000-4000-8000-0000000000e6";
export function e6Decision(): OwnerDecision {
  return {
    id: "5e000000-0000-4000-8000-0000000000d1", workspaceId: WS, systemId: null, kind: "system.change_live", route: "owner_decides",
    title: "Close for Thanksgiving, Nov 26–27?", detail: null, approveEffect: "Thanksgiving hours go live on harbordental.com.", notYetEffect: "Nothing changes.",
    sourceLifecycle: "website_document", sourceId: "fixture", revisionHash: "a".repeat(64), urgent: false, signInRequired: false, adminMayDecide: false,
    openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "sent",
    operatorNote: null, actor: MAYA, openedAt: "2026-11-10T14:14:00Z", expiresAt: "2026-11-24T14:14:00Z", reminded1At: null, reminded2At: null, deliveries: [],
  };
}

export function e6Systems(): SystemView[] {
  const base = { lifecycle: "live", health: { state: "healthy", summary: "Checks passed" }, surface: "managed", connections: [], possibilities: [], versions: [] } as unknown as Omit<SystemView, "id" | "kind" | "name" | "detail">;
  return [
    { ...base, id: "web", kind: "website", name: "Website", detail: HARBOR.site },
    { ...base, id: "book", kind: "bookings", name: "Bookings", detail: "New-patient exam, cleanings" },
    { ...base, id: "form", kind: "onboarding", name: "New-patient form", detail: "Dental intake" },
  ] as SystemView[];
}
export const E6_FACTS = { web: "Checks passed at 7:02", book: "2 booked today", form: "1 filled in today" } as const;
