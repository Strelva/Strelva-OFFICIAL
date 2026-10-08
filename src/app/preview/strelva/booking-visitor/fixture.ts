import { renderGeneratedPage, type GeneratedSite } from "../../../../../custom-repo-starter/website-generation/renderer";

export type VisitorBookingFixtureState = "ready" | "loading" | "error" | "empty" | "pending" | "reserve-error" | "saving" | "conflict" | "intake" | "intake-saving" | "intake-error" | "intake-empty";

export function visitorBookingFixtureState(value: string | null): VisitorBookingFixtureState {
  return ["loading", "error", "empty", "pending", "reserve-error", "saving", "conflict", "intake", "intake-saving", "intake-error", "intake-empty"].includes(value ?? "")
    ? value as VisitorBookingFixtureState : "ready";
}

/** Native mode adds business-authority metadata; no real release flag is changed. */
export function visitorBookingFixtureHtml(origin: string, state: VisitorBookingFixtureState, mode: "off" | "on"): string {
  const site: GeneratedSite = {
    version: 1, siteName: "Fictional consultation studio", theme: {},
    content: { settings: { siteName: "Fictional consultation studio", footerTagline: "Local interface fixture. Every request stays in this browser; no booking or email is sent." } },
    pages: { home: { seo: { title: "Visitor booking fixture" }, sections: [] } },
    publishedCapabilities: {
      baseUrl: `${origin}/preview/strelva/booking-visitor/mock`, tenant: "fixture-native",
      booking: { capabilityId: "consultations", version: 1, range: { from: "2026-11-05", to: "2026-11-06" } },
    },
  };
  const asset = `/preview/strelva/booking-visitor?asset=runtime&state=${state}&mode=${mode}`;
  return renderGeneratedPage(site, "home").replace("/website-generation/capability-runtime.mjs", asset);
}

/**
 * Precedes the unmodified exported runtime. All fetches are intercepted: there
 * is no original-fetch fallback. CSP also forbids network connections and form
 * navigation, so neither fixture actions nor a missing handler can reach APIs.
 */
export function visitorBookingFixtureTransport(state: VisitorBookingFixtureState, mode: "off" | "on"): string {
  return `
const fixtureState = ${JSON.stringify(state)};
const fixtureMode = ${JSON.stringify(mode)};
const slots = [
  { id: "fixture-slot-one", start: "2026-11-05T15:00:00Z", end: "2026-11-05T15:30:00Z" },
  { id: "fixture-slot-two", start: "2026-11-06T16:00:00Z", end: "2026-11-06T16:30:00Z" }
];
const schedule = { schemaVersion: 1, capabilityId: "consultations", version: 1, name: "Consultation", provider: "outlook", timeZone: "America/New_York", slots };
if (fixtureMode === "on") schedule.bookingAuthority = "business";
if (fixtureState.startsWith("intake")) schedule.intake = [{ id: "goal", label: "What would you like to discuss?", type: "textarea", required: true }, { id: "company", label: "Company", type: "text", required: false }];
let receipt = { schemaVersion: 1, reservationId: "fictional-reservation", managementToken: "fictional-management-token", capabilityId: "consultations", version: 1, provider: "outlook", status: fixtureState === "pending" ? "pending" : "confirmed", title: "Consultation", start: slots[0].start, end: slots[0].end, timeZone: "America/New_York" };
globalThis.__strelvaBookingFixtureRequests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.href);
  const method = String(init.method || "GET").toUpperCase();
  globalThis.__strelvaBookingFixtureRequests.push({ path: url.pathname, method, mode: fixtureMode, intercepted: true });
  if (!url.pathname.startsWith("/preview/strelva/booking-visitor/mock/api/v1/bookings/fixture-native")) throw new Error("This fixture blocks all outside requests.");
  if (method === "POST") {
    const visitor = JSON.parse(String(init.body || "{}")).visitor;
    const capture = globalThis.__strelvaBookingFixtureRequests.at(-1);
    capture.visitorPhoneProvided = typeof visitor?.phone === "string";
    capture.visitorPhoneMatchesFixture = visitor?.phone === "716-555-0118";
  }
  if (fixtureState === "loading" && method === "GET" || ["saving", "intake-saving"].includes(fixtureState) && method === "POST") return new Promise(() => {});
  if (fixtureState === "error" && method === "GET") throw new Error("Booking availability is unavailable. Please try again.");
  if (["reserve-error", "intake-error"].includes(fixtureState) && method === "POST") return new Response(JSON.stringify({ error: "That time could not be reserved. Please choose another time." }), { status: 409, headers: { "Content-Type": "application/json" } });
  if (fixtureState === "conflict" && method === "POST") return new Response(JSON.stringify({ error: "That time is no longer available.", timeZone: schedule.timeZone, nextSlots: [slots[1]] }), { status: 409, headers: { "Content-Type": "application/json" } });
  if (method === "GET") return new Response(JSON.stringify({ ...schedule, slots: ["empty", "intake-empty"].includes(fixtureState) ? [] : slots }), { headers: { "Content-Type": "application/json" } });
  const body = JSON.parse(String(init.body || "{}"));
  if (method === "DELETE") receipt = { ...receipt, status: "cancelled" };
  else if (url.pathname.endsWith("/readback")) receipt = { ...receipt, status: "confirmed" };
  else {
    const slot = slots.find(item => item.id === body.slotId) || slots[0];
    receipt = { ...receipt, start: slot.start, end: slot.end };
  }
  return new Response(JSON.stringify({ receipt }), { headers: { "Content-Type": "application/json" } });
};
`;
}
