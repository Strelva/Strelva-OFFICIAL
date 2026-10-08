import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingAgentVisibilityEnabled, resetBookingFlagCache } from "@/platform/bookings/flags";
import { bookingAgentLabel } from "@/platform/bookings/agent-source";
import { agentBookingOutcomesLine, agentRequestProofLine, readAgentBookingOutcomes, readAgentRequestProof, recordAgentBusinessDiscoveries } from "@/platform/bookings/agent-proof";
import { readAgentBookingAvailability } from "@/platform/agent-channel/public-tools";
import { bookingRequestAdapter, bookingRequestItem } from "@/platform/bookings/needs-you-adapter";
import { parseStoreBooking, setBookingStoreDb, type StoreBooking } from "@/platform/bookings/store";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { handledFromStore } from "@/platform/needs-you/handled";
import { needsYouMemoryStore } from "./support/needs-you-memory";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { WorkspaceBookings } from "@/experience/bookings/WorkspaceBookings";
import { readWorkspaceBookings, type BookingDependencies } from "@/products/bookings/server";
import { readProviderBookings } from "@/products/bookings/provider";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const WS = "7f000000-0000-4000-8000-000000000020";
const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const booking: StoreBooking = { id: "b1", calendarKey: WS, tenantStableId: null, tenantId: null, workspaceId: WS, systemId: "system",
  status: "requested", origin: "agent", agentName: "Claude", serviceRef: "consult", businessServiceId: null, serviceName: "Consultation",
  start: "2026-11-06T14:00:00Z", end: "2026-11-06T14:30:00Z", bufferMinutes: 0, timeZone: "UTC", localDate: "2026-11-06", localStart: "14:00", localEnd: "14:30",
  customer: { name: "Dana", email: "dana@example.test" }, contactId: null, intakeAnswers: {}, inquiryId: null, legacyId: null,
  publicReservationId: null, externalSource: null, externalRef: null, recordedVia: "native", createdAt: "2026-11-02T00:00:00Z", cancelledAt: null };
const deps: BookingDependencies = { config: vi.fn(), bookings: vi.fn(), siteName: vi.fn(), readSource: async () => "postgres",
  context: async () => ({ tenantStableId: null, workspaceId: WS, systemId: "system", paused: false, hours: null, phone: null, services: [], settings: null }),
  evidence: async () => ({ calendarHealth: "not_connected", truncated: false, bookings: [{ booking, history: [], historyTruncated: false, calendar: null }] }) };
afterEach(() => { vi.unstubAllEnvs(); setBookingStoreDb(null); setReleaseFlagsDb(null); resetBookingFlagCache(); });

it("is default off and normalizes only a recorded agent origin", () => {
  expect(bookingAgentVisibilityEnabled({})).toBe(false);
  expect(bookingAgentVisibilityEnabled({ STRELVA_BOOKING_AGENT_VISIBILITY: "true" })).toBe(false);
  expect(bookingAgentVisibilityEnabled({ STRELVA_BOOKING_AGENT_VISIBILITY: "1" })).toBe(true);
  expect(bookingAgentLabel({ origin: "agent", agentName: " Claude\n Assistant " })).toBe("Booked through Claude Assistant");
  expect(bookingAgentLabel({ origin: "site", agentName: "Claude" })).toBeNull();
  expect(bookingAgentLabel({ origin: "agent" })).toBe("Booked through an unnamed agent");
  expect(parseStoreBooking(booking)?.agentName).toBe("Claude");
});
it("adds owner attribution only when enabled and preserves all rows for source filtering", async () => {
  setReleaseFlagsDb({ rpc: async () => ({ data: [], error: null }) });
  const off = await readWorkspaceBookings(ACTOR, WS, { view: "week", date: "2026-11-06", source: "agent" }, { ...deps, agentVisibility: () => false });
  expect(off.agentVisibility).toBeUndefined(); expect(off.sites[0]?.bookings[0]?.agentName).toBeUndefined();
  const on = await readWorkspaceBookings(ACTOR, WS, { view: "week", date: "2026-11-06", source: "agent" }, { ...deps, agentVisibility: () => true });
  expect(on).toMatchObject({ agentVisibility: true, source: "agent", sites: [{ bookings: [{ agentName: "Claude", status: "requested" }] }] });
});
it("only falls back to the scoped provider reader with flag on and postgres reads", async () => {
  setReleaseFlagsDb({ rpc: async () => ({ data: null, error: { message: "workspace_access_denied" } }) });
  const provider = vi.fn(async () => ({ view: "week" as const, from: "2026-11-02", to: "2026-11-08", sites: [], readOnly: true }));
  await expect(readWorkspaceBookings(ACTOR, WS, { view: "week" }, { ...deps, provider, agentVisibility: () => false })).rejects.toBeInstanceOf(WorkspaceAccessError);
  await expect(readWorkspaceBookings(ACTOR, WS, { view: "week" }, { ...deps, provider, agentVisibility: () => true, readSource: async () => "legacy" })).rejects.toBeInstanceOf(WorkspaceAccessError);
  expect(provider).not.toHaveBeenCalled();
  expect(await readWorkspaceBookings(ACTOR, WS, { view: "week" }, { ...deps, provider, agentVisibility: () => true })).toMatchObject({ readOnly: true });
});
it("binds the provider read to actor and business, fails closed and has no controls", async () => {
  const rpc = vi.fn(async () => ({ data: { today: "2026-11-06", truncated: false, bookings: [booking] }, error: null })); setBookingStoreDb({ rpc });
  const result = await readProviderBookings(ACTOR, WS, { view: "week", date: "2026-11-06" });
  expect(result).toMatchObject({ readOnly: true, agentVisibility: true, sites: [{ bookings: [{ agentName: "Claude" }] }] });
  expect(rpc).toHaveBeenCalledWith("read_provider_booking_evidence", { p_workspace_id: WS, p_user_id: ACTOR.userId, p_verified_email: ACTOR.verifiedEmail, p_date: "2026-11-06", p_view: "week" });
  setBookingStoreDb({ rpc: async () => ({ data: { today: "2026-11-06", truncated: false, bookings: [{ ...booking, workspaceId: "other" }] }, error: null }) });
  await expect(readProviderBookings(ACTOR, WS, { view: "week" })).rejects.toThrow();
  setBookingStoreDb({ rpc: async () => ({ data: null, error: { message: "business_record_access_denied" } }) });
  await expect(readProviderBookings(ACTOR, WS, { view: "week" })).rejects.toBeInstanceOf(WorkspaceAccessError);
});
it("uses the existing owner-only approval and receipts, including a recipient with no account, without new mail", async () => {
  vi.stubEnv("STRELVA_BOOKING_AGENT_VISIBILITY", "1"); vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE", "0");
  const clock = { now: Date.parse("2026-11-02T00:00:00Z") };
  const mem = needsYouMemoryStore({ clock });
  const decide = vi.fn(async () => ({ status: "decided" as const, booking: { ...booking, status: "confirmed" as const } }));
  const adapter = bookingRequestAdapter({ requests: async () => [booking, { ...booking, workspaceId: "other" }, { ...booking, status: "held" }], decide });
  const sendEmail = vi.fn();
  const svc = createNeedsYouService({ store: mem.store, adapters: [adapter], sendEmail, now: () => clock.now, appOrigin: "https://app.example.test" });
  await svc.sync({ workspaceId: WS });
  const item = [...mem.items.values()][0]!;
  expect(mem.items.size).toBe(1); expect(item).toMatchObject({ adminMayDecide: false, signInRequired: false, sourceLifecycle: "booking_request" });
  expect(item.title).toContain("Booked through Claude");
  expect(await mem.store.ownerActor(WS, "owner@example.test")).toBeNull();
  const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
  expect(result.status).toBe("done"); expect(decide).toHaveBeenCalledWith(WS, booking.id, "approve", "owner");
  const receipt = handledFromStore({ ...result.item, id: item.id, store: "owner_decisions", at: new Date(clock.now).toISOString() });
  expect(receipt?.sentence).toContain("Booked through Claude");
  expect(receipt?.changed).toContain("Booked through Claude");
  await svc.chase(); expect(sendEmail).not.toHaveBeenCalled();
  expect((await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } })).status).toBe("already_handled");
  expect(decide).toHaveBeenCalledTimes(1);
});
it("leaves existing approval text unchanged off and reports failed source reads as incomplete", async () => {
  vi.stubEnv("STRELVA_BOOKING_AGENT_VISIBILITY", "0");
  expect(bookingRequestItem(booking, WS)?.title).not.toContain("Claude");
  expect(await bookingRequestAdapter({ requests: async () => { throw new Error("down"); }, decide: vi.fn() }).propose({ workspaceId: WS })).toEqual({ items: [], complete: false });
});
it("keeps weekly requests distinct from bookings and does no reads while disabled", async () => {
  const rpc = vi.fn(); setBookingStoreDb({ rpc }); vi.stubEnv("STRELVA_BOOKING_AGENT_VISIBILITY", "0");
  expect(await readAgentRequestProof("fixture", "2026-11-02", "2026-11-08")).toBeNull(); expect(rpc).not.toHaveBeenCalled();
  expect(agentRequestProofLine(3)).toBe("3 agent requests"); expect(agentRequestProofLine(1)).toBe("1 agent request"); expect(agentRequestProofLine(null)).toBeNull();
});

describe("owner and provider presentation", () => {
 const site = { tenantId: "fixture", siteName: "Fixture", timezone: "UTC", today: "2026-11-06", unavailable: false,
 bookings: [{ id: "agent", date: "2026-11-06", startTime: "10:00", endTime: "10:30", clientName: "Agent customer", clientEmail: "", clientPhone: "", serviceName: "Consultation", status: "confirmed" as const, agentName: "Claude <script>" },
 { id: "site", date: "2026-11-06", startTime: "11:00", endTime: "11:30", clientName: "Site customer", clientEmail: "", clientPhone: "", serviceName: "Consultation", status: "confirmed" as const }] };
 const render = (readOnly = false, source: "all" | "agent" = "all") => renderToStaticMarkup(createElement(WorkspaceBookings, { workspaceId: WS, view: "week", state: { kind: "ready", bookings: { view: "week", from: "2026-11-02", to: "2026-11-08", agentVisibility: true, readOnly, source, sites: [site] } } }));
 it("escapes attribution, filters agents and preserves source/date in navigation", () => {
   const html = render(false, "agent"); expect(html).toContain("Booked through Claude &lt;script&gt;"); expect(html).not.toContain("Site customer");
   expect(html).toContain("1 agent request for this week"); expect(html).toContain("source=agent"); expect(html).toContain("date=2026-10-26");
 });
 it("provider detail names the source and removes every mutation", () => {
   const html = render(true); expect(html).toContain("Booking details"); expect(html).toContain("Agent names are supplied at booking");
   expect(html).not.toContain(">Cancel<"); expect(html).not.toContain("Check in"); expect(html).toContain("The owner decides booking requests");
 });
 it("preserves filtered sign-in return and rejects unknown or duplicate source", () => {
   const href = `/workspace/bookings?workspaceId=${WS}&view=week&date=2026-11-06&source=agent`;
   expect(workspaceReturnTarget(href)).toBe(href); expect(workspaceReturnTarget(href + "&source=all")).toBeNull(); expect(workspaceReturnTarget(href.replace("source=agent", "source=anything"))).toBeNull();
 });
});

it("reads an accurate weekly count and omits unavailable proof without sending", async () => {
 vi.stubEnv("STRELVA_BOOKING_AGENT_VISIBILITY","1"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE","1"); vi.stubEnv("STRELVA_BOOKING_STORE_READ","postgres");
 const rpc=vi.fn(async (name:string) => ({ data:name==="booking_parity_streak" ? {days:7} : 3, error:null })); setBookingStoreDb({rpc}); resetBookingFlagCache();
 expect(await readAgentRequestProof("fixture","2026-11-02T00:00:00Z","2026-11-08T23:59:59Z")).toBe("3 agent requests");
 expect(rpc).toHaveBeenLastCalledWith("read_agent_booking_proof",{p_tenant_id:"fixture",p_from:"2026-11-02T00:00:00Z",p_to:"2026-11-08T23:59:59Z"});
 setBookingStoreDb({rpc:async()=>({data:null,error:{message:"unavailable"}})});
 expect(await readAgentRequestProof("fixture","2026-11-02","2026-11-08")).toBeNull();
});

it("reads bounded business outcomes and labels discovery coverage instead of implying an unmeasured zero", async () => {
 vi.stubEnv("STRELVA_BOOKING_AGENT_VISIBILITY","1"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE","1"); vi.stubEnv("STRELVA_BOOKING_STORE_READ","postgres");
 const outcomes = { businessName: "Fixture Services", discoveryCalls: 2, discoveryCoverage: "partial", discoverySince: "2026-11-05", holds: 3, confirmations: 1, completed: 1 } as const;
 const rpc=vi.fn(async (name:string) => ({ data:name==="booking_parity_streak" ? {days:7} : outcomes, error:null })); setBookingStoreDb({rpc}); resetBookingFlagCache();
 expect(await readAgentBookingOutcomes("fixture","2026-11-02T00:00:00Z","2026-11-09T00:00:00Z")).toEqual(outcomes);
 expect(rpc).toHaveBeenLastCalledWith("read_agent_booking_outcomes",{p_tenant_id:"fixture",p_from:"2026-11-02T00:00:00Z",p_to:"2026-11-09T00:00:00Z"});
 expect(agentBookingOutcomesLine(outcomes)).toContain("at least 2 recorded discovery calls this week; tracking first observed 2026-11-05, and full-period coverage is unknown");
 expect(agentBookingOutcomesLine({ ...outcomes, discoveryCoverage: "unknown", discoveryCalls: 0 })).toContain("discovery count unavailable; tracking was not established");
 setBookingStoreDb({rpc:async (name:string) => ({data:name==="booking_parity_streak" ? {days:7} : { ...outcomes, holds: "3" },error:null})}); resetBookingFlagCache();
 expect(await readAgentBookingOutcomes("fixture","2026-11-02T00:00:00Z","2026-11-09T00:00:00Z")).toBeNull();
});

it("does not claim Strelva booking for an unrelated site that only shares the submitted business name", async () => {
 const availability = await readAgentBookingAvailability({
  list: async () => [{ business: "other", name: "Fixture", industry: null, website: "https://other.example/" }],
  scope: async () => "other",
 }, "Fixture", "https://fixture.example");
 expect(availability.status).toBe("unknown");
 expect(availability.detail).toContain("No matching Strelva business profile");
});

it("keeps explicit website ports in business identity matching", async () => {
 const availability = await readAgentBookingAvailability({
  list: async () => [{ business: "other", name: "Fixture", industry: null, website: "https://fixture.example:8443" }],
  scope: async () => "other",
 }, "Fixture", "https://fixture.example");
 expect(availability.status).toBe("unknown");
 expect(availability.detail).toContain("No matching Strelva business profile");
});

it("records only deduplicated business scopes for discovery evidence", async () => {
 vi.stubEnv("STRELVA_BOOKING_AGENT_VISIBILITY","1");
 const rpc=vi.fn(async () => ({data:1,error:null})); setBookingStoreDb({rpc});
 expect(await recordAgentBusinessDiscoveries(["fixture","fixture"])).toBe(true);
 expect(rpc).toHaveBeenCalledWith("record_agent_business_discovery",{p_scopes:["fixture"]});
 expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/email|customer|token|query/i);
 setBookingStoreDb({rpc:async () => ({data:null,error:{message:"unavailable"}})});
 expect(await recordAgentBusinessDiscoveries(["fixture"])).toBe(false);
});


it("names the source in customer receipts without confusing a request with confirmation", () => {
  const receipt = { siteName: "Fixture", title: "Consultation", day: "Friday", time: "10:00", timeZoneLabel: "UTC", status: "pending" as const, confirmationRequired: true };
  const render = (agentSource?: string) => renderToStaticMarkup(createElement(ManageBooking, { actionUrl: "/b/fixture", state: { kind: "ready", booking: { ...receipt, ...(agentSource ? { agentSource } : {}) }, days: [], slotsUnavailable: false, changesClosed: true } }));
  expect(render("Booked through Claude <script>")).toContain("Booked through Claude &lt;script&gt;");
  expect(render("Booked through Claude")).toContain("Waiting for the business to confirm");
  expect(render()).not.toContain(">Source<");
});
