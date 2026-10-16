/**
 * Fictional visitor-side fixtures for the xs-visitor previews (October 16).
 * Harbor Dental (Dr. Amy Lin, 1180 Elmwood Ave, Buffalo) run by North Studio
 * (Maya Okafor). Never imported by a sender, a route outside /preview, or a test
 * that writes. Every URL is a preview path; nothing here posts anywhere real.
 */
import type { SiteDocument } from "@/products/websites/client";
import type { ManageBookingState, ManagedBookingView } from "@/platform/bookings/manage";
import type { VisitorConfirmationView } from "@/experience/bookings/BookingConfirmation";
import type { InquiryBookingOffer } from "@/platform/bookings/inquiry-offers";
import type { InquiryReceipt } from "@/products/scheduling/contracts";
import type { PublicFacts } from "@/products/connected-sites/contracts";
import type { PublicBlogPost } from "@/lib/cms/blog-public";
import type { SiteLinkItem } from "@/components/public/SiteLinks";
import type { StoreBooking } from "@/platform/bookings/store";
import type { EmailOptions } from "@/platform/infra/email/layout";
import { XA_HARBOR, XA_NORTH } from "./xa-day";
import { visitorBrandFromRecord, visitorBrandFromSiteDocument, type VisitorBrand } from "@/products/websites/client";

export const HARBOR = { name: XA_HARBOR.name, doctor: XA_HARBOR.owner, street: XA_HARBOR.address, city: "Buffalo", region: "NY", phone: "(716) 555-0142", email: "hello@harbordental.example.test", zone: "America/New_York" } as const;
export const PREVIEW_NOW = Date.parse("2026-11-20T14:05:00Z");

/* ---------- The native website ---------- */

export const harborSite: SiteDocument = {
  version: 2, siteName: HARBOR.name, theme: { palette: "ocean", typeScale: "standard", accent: "#1f4e6b" },
  pages: [
    { path: "/", title: XA_HARBOR.name, description: "Cleanings, exams and first visits at 1180 Elmwood Ave, Buffalo.", root: "home" },
    { path: "/about", title: "About Dr. Lin", description: "Dr. Amy Lin and the Harbor Dental team.", root: "about" },
  ],
  nodes: {
    home: { id: "home", type: "Section", variant: "container", props: {}, children: ["header", "hero", "services", "faq", "footer"], factIds: [] },
    about: { id: "about", type: "Section", variant: "container", props: {}, children: ["header", "story", "footer"], factIds: [] },
    header: { id: "header", type: "Header", variant: "logo-left", props: { brand: HARBOR.name, links: [{ label: "Services", href: "/#services" }, { label: "About", href: "/about" }, { label: HARBOR.phone, href: "tel:+17165550142" }], cta: { label: "Book a visit", href: "/book" } }, children: [], factIds: [] },
    hero: { id: "hero", type: "Hero", variant: "split", props: { eyebrow: "Family dentistry in Elmwood Village", title: "See Dr. Lin on Elmwood.", body: "Cleanings, exams and first visits at 1180 Elmwood Avenue, Buffalo. New patients are welcome most weeks.", cta: { label: "Book a visit", href: "/book" }, secondaryCta: { label: "Call (716) 555-0142", href: "tel:+17165550142" } }, children: ["hours"], factIds: [] },
    hours: { id: "hours", type: "Hours", variant: "table", props: { title: "Hours", rows: [{ day: "Monday to Friday", hours: "8 AM–5 PM" }, { day: "Saturday", hours: "9 AM–1 PM" }, { day: "Sunday", hours: "Closed" }, { day: "Nov 26–27", hours: "Closed for Thanksgiving" }] }, children: [], factIds: [] },
    services: { id: "services", type: "ServiceGrid", variant: "list", props: { title: "What we do", items: [
      { title: "New-patient exam", body: "60 minutes with Dr. Lin: X-rays, a full exam and a plan you can take home. $180, or covered by most PPO plans.", href: "/book?service=exam" },
      { title: "Cleaning", body: "45 minutes with a hygienist, every six months. $120.", href: "/book?service=cleaning" },
      { title: "Emergency visit", body: "Call before 10 AM and most weekdays we can see you the same day.", href: "tel:+17165550142" },
    ] }, children: [], factIds: [] },
    faq: { id: "faq", type: "Faq", variant: "accordion", props: { title: "Before your visit", items: [
      { question: "Do you take my insurance?", answer: "Most PPO plans. Call and we will check before you come in." },
      { question: "Where do I park?", answer: "There is free parking behind the building, off Bryant Street." },
    ] }, children: [], factIds: [] },
    story: { id: "story", type: "Story", variant: "long-form", props: { title: XA_HARBOR.owner, body: "Dr. Lin opened Harbor Dental on Elmwood in 2014. She trained at the University at Buffalo and still teaches there one afternoon a week." }, children: [], factIds: [] },
    footer: { id: "footer", type: "Footer", variant: "simple", props: { text: "Harbor Dental · 1180 Elmwood Ave, Buffalo, NY 14222 · (716) 555-0142", links: [{ label: "About", href: "/about" }] }, children: [], factIds: [] },
  },
  facts: {}, assets: {}, redirects: [], provenance: { sourceUrl: "https://harbordental.example.test", composer: "rules" },
};

export const harborLinks: SiteLinkItem[] = [
  { title: "Book a visit", url: "https://harbordental.example.test/book", icon: "booking", featured: true, external: true },
  { title: "Free whitening night, Dec 4", url: "https://harbordental.example.test/events", icon: "calendar", featured: false, external: true },
  { title: "Follow on Instagram", url: "https://instagram.com/harbordental.example", icon: "instagram", featured: false, external: true },
  { title: HARBOR.email, url: `mailto:${HARBOR.email}`, icon: "email", featured: false, external: true },
  { title: HARBOR.phone, url: "tel:+17165550142", icon: "phone", featured: false, external: true },
];

export const harborPosts: PublicBlogPost[] = [
  { id: "p3", slug: "thanksgiving-hours", title: "We're closed Thanksgiving, Nov 26 and 27", excerpt: "Back Saturday, Nov 28, 9 to 1. If something hurts before then, call and leave a message; Dr. Lin checks them.", content: "Back Saturday, Nov 28, from 9 to 1.\n\nIf something hurts before then, call (716) 555-0142 and leave a message. Dr. Lin checks them twice a day over the holiday.", author: HARBOR.doctor, tags: ["Hours"], publishedAt: "2026-11-10T14:00:00Z" },
  { id: "p2", slug: "first-visit", title: "What happens at your first visit", excerpt: "Sixty minutes, X-rays, and a plan you can take home. Here is the whole hour, step by step.", content: "## Before you come\n\nFill in the patient form online so you're not doing it on a clipboard.\n\n## The hour\n\n1. X-rays, about ten minutes\n2. The exam with Dr. Lin\n3. A plan, in writing, with what each step costs\n\nYou'll leave knowing what comes next, and nothing is booked without your say.", author: HARBOR.doctor, tags: ["New patients"], publishedAt: "2026-10-02T14:00:00Z" },
  { id: "p1", slug: "parking", title: "Where to park on Elmwood", excerpt: "There is free parking behind the building, off Bryant Street.", content: "There is free parking behind the building, off Bryant Street.", author: XA_HARBOR.name, tags: [], publishedAt: "2026-09-12T14:00:00Z" },
];


/**
 * Harbor Dental's own look on its visitor pages, read from its website the
 * way /b, /book-inquiry and /inquiry-booking read a real business's published
 * site. Its only photo is 300 px wide, under MIN_VISITOR_PHOTO_WIDTH, so the
 * pages leave it out rather than show it soft (the same rule the live read
 * applies to a site's hero image).
 * ?brand=none on a preview shows the unbranded fallback.
 */
export const harborBrand: VisitorBrand = visitorBrandFromSiteDocument(harborSite, "https://harbordental.example.test");

/**
 * A second fictional business for logo and type coverage: Hertel Barbers, an
 * older-model site whose theme records Fraunces headings, Work Sans body and a
 * rust accent, with its wordmark logo. ?brand=hertel on a preview.
 */
export const HERTEL = { name: "Hertel Barbers", phone: "(716) 555-0199", service: "Haircut and beard trim", length: "45 min", website: "https://hertelbarbers.example.test" } as const;
export const hertelBrand: VisitorBrand = {
  ...visitorBrandFromRecord({ accent: "#8a3b1c", type: { display: "Fraunces", body: "Work_Sans" }, website: HERTEL.website })!,
  logo: { url: "/xa/fixture-logo-hertel.png", alt: HERTEL.name },
};
export const previewBrand = (brand?: string): VisitorBrand | null => brand === "none" ? null : brand === "hertel" ? hertelBrand : harborBrand;
/** Who a preview speaks for: Harbor Dental, or Hertel Barbers with ?brand=hertel. */
export const previewBusiness = (brand?: string) => brand === "hertel"
  ? { name: HERTEL.name, phone: HERTEL.phone, service: HERTEL.service, length: HERTEL.length }
  : { name: HARBOR.name, phone: HARBOR.phone, service: "New-patient exam with Dr. Lin", length: "60 min" };

/* ---------- The business page (/biz) ---------- */

export const harborFacts: PublicFacts = {
  name: HARBOR.name,
  description: "Family dentistry with Dr. Amy Lin. Cleanings, exams and first visits, with same-day emergency visits most weekdays.",
  phone: HARBOR.phone, email: HARBOR.email,
  address: { street: HARBOR.street, locality: HARBOR.city, region: HARBOR.region, postalCode: "14222", country: "US" },
  booking_url: "https://harbordental.example.test/book",
  hours: [
    { day: "mon", opens: "08:00", closes: "17:00" }, { day: "tue", opens: "08:00", closes: "17:00" }, { day: "wed", opens: "08:00", closes: "17:00" },
    { day: "thu", opens: "08:00", closes: "17:00" }, { day: "fri", opens: "08:00", closes: "17:00" }, { day: "sat", opens: "09:00", closes: "13:00" }, { day: "sun", closed: true },
  ],
  services: [
    { name: "New-patient exam", description: "60 minutes with X-rays", priceText: "$180, or covered by most PPO plans" },
    { name: "Cleaning", description: "45 minutes with a hygienist", priceText: "$120" },
    { name: "Emergency visit", description: "Same day when you call before 10 AM" },
  ],
  service_area: ["Elmwood Village", "North Buffalo", "Kenmore"],
  social_links: ["https://instagram.com/harbordental.example"],
  policies: { deposit: { value: { required: false }, source: "owner", updatedAt: "2026-10-09T00:00:00Z" } } as PublicFacts["policies"],
  verification: {
    domain: { verified: true, url: "harbordental.example.test", confirmedAt: "2026-10-03T12:00:00Z" },
    googleBusinessProfile: { linked: true, verified: true, url: null },
    ownerConfirmedFactCount: 9, lastConfirmedAt: "2026-10-12T12:00:00Z",
    operatingAgencies: [{ name: XA_NORTH.name }],
  } as PublicFacts["verification"],
};

/* ---------- Manage link (/b/[token]) ---------- */

const booking: ManagedBookingView = { siteName: HARBOR.name, title: "New-patient exam with Dr. Lin", day: "Tuesday, November 24", time: "9:15 AM", timeZoneLabel: "Eastern Time", status: "confirmed" };
const days = [
  { day: "Wednesday, Nov 25", slots: [{ id: "s1", time: "8:30 AM" }, { id: "s2", time: "11:00 AM" }, { id: "s3", time: "2:15 PM" }] },
  { day: "Saturday, Nov 28", slots: [{ id: "s4", time: "9:00 AM" }, { id: "s5", time: "11:00 AM" }] },
  { day: "Monday, Nov 30", slots: [{ id: "s6", time: "8:00 AM" }, { id: "s7", time: "10:30 AM" }, { id: "s8", time: "2:00 PM" }, { id: "s9", time: "3:45 PM" }] },
];
export const MANAGE_STATES = ["confirmed", "pending", "held", "rescheduled", "cancelled", "changes-closed", "slots-unavailable", "no-slots", "error-notice", "agent", "ended", "not-found", "load-error"] as const;
/** The slot a reschedule picked, as its day and time ("Saturday, November 28", "9:00 AM"). */
function pickedSlot(slotId?: string): { day: string; time: string; id: string } | null {
  for (const d of days) for (const slot of d.slots) if (slot.id === slotId) return { day: d.day.replace(/Nov\b/, "November"), time: slot.time, id: slot.id };
  return null;
}
export function manageState(state: string, opts: { slot?: string; brand?: string } = {}): ManageBookingState {
  const biz = previewBusiness(opts.brand);
  const named = { ...booking, siteName: biz.name, title: biz.service };
  const view = manageStateFor(state, named, opts.slot);
  return view;
}
function manageStateFor(state: string, booking: ManagedBookingView, slot?: string): ManageBookingState {
  const ready = { kind: "ready" as const, booking, days, slotsUnavailable: false, changesClosed: false };
  switch (state) {
    case "pending": return { ...ready, booking: { ...booking, status: "pending" }, notice: "pending" };
    case "held": return { ...ready, booking: { ...booking, status: "held", confirmationRequired: true } };
    case "rescheduled": {
      // The time the visitor picked becomes the booking; the time it left is open again, so Undo can go back to it.
      const moved = pickedSlot(slot) ?? { day: "Saturday, November 28", time: "9:00 AM", id: "s4" };
      const freed = [{ day: "Tuesday, Nov 24", slots: [{ id: "s0", time: "9:15 AM" }] }, ...days].map(d => ({ ...d, slots: d.slots.filter(item => item.id !== moved.id) })).filter(d => d.slots.length);
      return { ...ready, booking: { ...booking, day: moved.day, time: moved.time }, days: freed, notice: "rescheduled", undo: { slotId: "s0", label: "Tue, Nov 24, 9:15 AM" } };
    }
    case "cancelled": return { ...ready, booking: { ...booking, status: "cancelled" }, notice: "cancelled" };
    case "changes-closed": return { ...ready, changesClosed: true };
    case "slots-unavailable": return { ...ready, days: [], slotsUnavailable: true };
    case "no-slots": return { ...ready, days: [] };
    case "error-notice": return { ...ready, error: "That time was just taken. Your booking is unchanged; pick another time." };
    case "agent": return { ...ready, booking: { ...booking, agentSource: "an assistant (ChatGPT)" } };
    case "ended": return { kind: "ended", booking: { ...booking, day: "Tuesday, November 3" } };
    case "not-found": return { kind: "not_found" };
    case "load-error": return { kind: "error" };
    default: return ready;
  }
}

/* ---------- Email confirmation (/booking-confirm/[token]) ---------- */

export const CONFIRM_STATES = ["held", "confirming", "requested", "confirmed", "cancelled", "failed", "rate"] as const;
export function confirmState(state: string, brand?: string): { identity: VisitorConfirmationView | null; error: string | null } {
  const identity: VisitorConfirmationView = { businessName: previewBusiness(brand).name, start: "2026-11-24T14:15:00Z", end: "2026-11-24T15:15:00Z", state: "held", bookingStatus: null, timeZone: HARBOR.zone, expiresAt: "2026-11-20T14:20:00Z" };
  switch (state) {
    case "confirming": return { identity: { ...identity, state: "confirming" }, error: null };
    case "requested": return { identity: { ...identity, state: "placed", bookingStatus: "requested" }, error: null };
    case "confirmed": return { identity: { ...identity, state: "placed", bookingStatus: "confirmed" }, error: null };
    case "cancelled": return { identity: { ...identity, state: "placed", bookingStatus: "declined" }, error: null };
    case "failed": return { identity: null, error: null };
    case "rate": return { identity, error: "rate" };
    default: return { identity, error: null };
  }
}

/* ---------- Offer made from an inquiry (/book-inquiry/[token]) ---------- */

const slot = (iso: string) => ({ start: iso, end: new Date(Date.parse(iso) + 3_600_000).toISOString() });
export const harborOfferSlots = ["2026-11-23T13:00:00Z", "2026-11-23T15:30:00Z", "2026-11-24T14:15:00Z", "2026-11-24T18:30:00Z", "2026-11-25T13:30:00Z", "2026-11-28T14:00:00Z", "2026-11-28T16:00:00Z"].map(slot);
export const OFFER_STATES = ["choose", "empty", "error", "gone", "unavailable", "held", "requested", "confirmed", "expired", "unknown"] as const;
/**
 * One timeline for every visitor fixture: it is Friday, Nov 20 at 9:05 AM
 * Eastern (PREVIEW_NOW). The offered times are open until Sunday, Nov 22 at
 * 8:00 PM (the same deadline as E4); a time requested now is held for 15
 * minutes, so it must be confirmed by 9:20 AM today.
 */
export const OFFER_EXPIRES = "2026-11-23T01:00:00Z";
export const HOLD_UNTIL = "2026-11-20T14:20:00Z";
export function offerState(state: string, opts: { start?: string; brand?: string } = {}): { offer: InquiryBookingOffer | null; receipt: InquiryReceipt | null; error: boolean; unavailable: boolean } {
  const biz = previewBusiness(opts.brand);
  const picked = opts.start && harborOfferSlots.some(item => Date.parse(item.start) === Date.parse(opts.start!)) ? new Date(opts.start).toISOString() : "2026-11-24T14:15:00Z";
  const offer = { businessName: biz.name, id: "fixture", serviceId: "exam", serviceName: `${biz.service.replace(/ with Dr\. Lin$/, "")} · ${biz.length}`, timeZone: HARBOR.zone, slots: harborOfferSlots, expiresAt: OFFER_EXPIRES, url: "#", token: "fixture", booked: false, closedDays: [{ date: "2026-11-26", label: "Thanksgiving" }, { date: "2026-11-27", label: "Thanksgiving" }] } as unknown as InquiryBookingOffer;
  const receipt = (status: InquiryReceipt["status"], confirmUntil: string | null = null): InquiryReceipt => ({ status, start: picked, timeZone: HARBOR.zone, confirmUntil });
  switch (state) {
    case "empty": return { offer: { ...offer, slots: [] }, receipt: null, error: false, unavailable: false };
    case "error": return { offer, receipt: null, error: true, unavailable: false };
    case "gone": return { offer: null, receipt: null, error: false, unavailable: false };
    case "unavailable": return { offer: null, receipt: null, error: false, unavailable: true };
    case "held": return { offer: { ...offer, booked: true }, receipt: receipt("held", HOLD_UNTIL), error: false, unavailable: false };
    case "expired": return { offer: { ...offer, booked: true }, receipt: receipt("held", "2026-11-20T13:50:00Z"), error: false, unavailable: false };
    case "requested": return { offer: { ...offer, booked: true }, receipt: receipt("requested"), error: false, unavailable: false };
    case "confirmed": return { offer: { ...offer, booked: true }, receipt: receipt("confirmed"), error: false, unavailable: false };
    case "unknown": return { offer: { ...offer, booked: true }, receipt: null, error: false, unavailable: false };
    default: return { offer, receipt: null, error: false, unavailable: false };
  }
}

/* ---------- Emails ---------- */

const store = (status: StoreBooking["status"]): StoreBooking => ({
  id: "fixture", status, serviceName: "New-patient exam", start: "2026-11-24T14:15:00Z", end: "2026-11-24T15:15:00Z",
  localDate: "2026-11-24", localStart: "09:15", timeZone: HARBOR.zone, createdAt: "2026-11-20T14:05:00Z",
  customer: { name: "Jordan Reyes", email: "jordan@example.test" },
} as unknown as StoreBooking);
export const previewBooking = store;

const options = (o: EmailOptions): EmailOptions => ({ businessName: HARBOR.name, ...o });
/** Customer emails whose HTML comes from the generic visitor mapping (their options are unchanged). */
export const genericVisitorEmails: Record<string, EmailOptions> = {
  "inquiry-reply": options({ heading: "We received your message", preheader: "We received your message for Harbor Dental", paragraphs: ["Hi Jordan, Harbor Dental received your message. Someone will review it and follow up as soon as they can."], rows: [{ label: "Your message", value: "Do you see new patients on Saturdays? I have a cracked filling." }], footerNote: "This is an automatic reply from Harbor Dental." }),
  // What createInquiryDeliveryMessage builds for a message with suggested times: each time its own link.
  "inquiry-offer": options({ heading: "Pick a time that works", preheader: "Pick a time with Harbor Dental", paragraphs: ["Hi Jordan, Harbor Dental got your message. Tap a time to request it, and Harbor Dental will confirm it or suggest another."], rows: [{ label: "Your message", value: "Do you see new patients on Saturdays?" }], choices: { items: [{ label: "Sat, Nov 28, 9:00 AM Eastern Time", url: "/preview/strelva/xa/xs-visitor/offer?pick=2026-11-28T14:00:00.000Z" }, { label: "Sat, Nov 28, 11:00 AM Eastern Time", url: "/preview/strelva/xa/xs-visitor/offer?pick=2026-11-28T16:00:00.000Z" }] }, button: { label: "See all open times", url: "/preview/strelva/xa/xs-visitor/offer" }, footerNote: "This is an automatic reply from Harbor Dental." }),
  "inquiry-follow": options({ heading: "Checking in", paragraphs: ["Hi Jordan, we are checking in about your message to Harbor Dental. If you still need help, reply to this email and we will take it from there."], footerNote: "This is an automatic follow-up from Harbor Dental." }),
  "authored-reply": options({ heading: "A reply from your business", paragraphs: ["Hi Jordan, yes, Dr. Lin sees new patients on Saturdays from 9 to 1. The 9:00 on Nov 28 is open; pick it from the link we sent and we'll confirm the same day."], footerNote: "Automatic reply · from Harbor Dental" }),
  "confirm-request": options({ heading: "Confirm your booking request with Harbor Dental", rows: [{ label: "Requested time", value: "Tuesday, Nov 24 at 9:15 AM Eastern Time" }, { label: "Confirm by", value: "Friday, Nov 20 at 9:20 AM Eastern Time" }], paragraphs: ["Check your email to confirm. Nothing is booked until you confirm your email. The business may then need to accept your request."], button: { label: "Review and confirm", url: "/preview/strelva/xa/xs-visitor/confirm" } }),
};

export const newsletterIssue = {
  subject: "Closed Thanksgiving, open Saturday",
  html: "<h2>Closed Thursday and Friday, Nov 26 and 27</h2><p>We're back Saturday, Nov 28, from 9 to 1. If something hurts before then, call (716) 555-0142 and leave a message; Dr. Lin checks them twice a day.</p><p>Also new: you can fill in your patient form online before your first visit, so there's no clipboard in the waiting room.</p>",
  text: "Closed Thursday and Friday, Nov 26 and 27. We're back Saturday, Nov 28, from 9 to 1.",
};
