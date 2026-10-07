import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readInquiryProposalOptions, ownerCanProposeBookingTimes } from "@/products/bookings/inquiry-proposals";
import { ProposeBookingTimes } from "@/experience/bookings/ProposeBookingTimes";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { readWorkspaceLeads, type LeadDependencies } from "@/products/inquiries/linked-leads";
import type { InquiryProposalOptions } from "@/products/bookings/inquiry-proposal-contracts";
import { setBookingStoreDb } from "@/platform/bookings/store";
import type { BookingContext } from "@/platform/bookings/store";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const WS = "cf000000-0000-4000-8000-000000000001";
const ACTOR = { userId: "cf000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const LEAD = { id: "fixture-inquiry", name: "Dana Reed", email: "dana@example.test", message: "Consultation please.", createdAt: "2026-11-01T00:00:00Z" };
const OPTIONS: InquiryProposalOptions = { services: [{ id: "consult", name: "Consultation", durationMinutes: 30 }], serviceId: "consult", customer: { name: LEAD.name, email: LEAD.email }, timeZone: "America/New_York", paused: false,
  slots: ["2026-11-06T15:00:00Z", "2026-11-06T17:00:00Z"].map((start) => ({ start, end: new Date(Date.parse(start) + 1800000).toISOString() })) };
const CONTEXT: BookingContext = { tenantStableId: WS, workspaceId: WS, systemId: null, paused: false, phone: null, hours: null, services: [], settings: null };
function ports() {
  return { manage: vi.fn(async () => {}), context: vi.fn(async () => CONTEXT), inquiry: vi.fn(async () => LEAD),
    services: vi.fn(async () => ({ timeZone: OPTIONS.timeZone, paused: false, services: OPTIONS.services.map((s) => ({ ...s, mode: "request" as const, bufferMinutes: 15 })) })),
    slots: vi.fn(async () => ({ timeZone: OPTIONS.timeZone, paused: false, version: 1, slots: OPTIONS.slots.map((slot) => ({ ...slot, id: slot.start, calendarChecked: true })) })), now: new Date("2026-11-01T00:00:00Z") };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); setBookingStoreDb(undefined); });
describe("owner inquiry proposal discovery", () => {
  it("does no store discovery when proposals are off or the old store serves", async () => {
    const rpc = vi.fn(); setBookingStoreDb({ rpc });
    vi.stubEnv("STRELVA_BOOKING_INQUIRY_OFFERS", "0");
    expect(await ownerCanProposeBookingTimes(ACTOR, WS)).toBe(false); expect(rpc).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_BOOKING_INQUIRY_OFFERS", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_READ", "compare");
    expect(await ownerCanProposeBookingTimes(ACTOR, WS)).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });
  it("reads real request-mode slots after owner authority and inquiry identity", async () => {
    const dependencies = ports();
    expect(await readInquiryProposalOptions(ACTOR, { workspaceId: WS, tenantId: "fixture", inquiryId: LEAD.id }, dependencies)).toEqual(OPTIONS);
    expect(dependencies.manage).toHaveBeenCalledWith(ACTOR, WS);
    expect(dependencies.inquiry).toHaveBeenCalledWith("fixture", LEAD.id);
    expect(dependencies.slots).toHaveBeenCalledWith("fixture", "consult", "2026-11-01T00:00:00.000Z", "2026-12-31T00:00:00.000Z");
  });
  it("refuses another site's identity, members, removed services and inquiries without an email", async () => {
    const input = { workspaceId: WS, tenantId: "fixture", inquiryId: LEAD.id };
    const dependencies = ports();
    dependencies.context.mockResolvedValue({ ...CONTEXT, workspaceId: "other" });
    await expect(readInquiryProposalOptions(ACTOR, input, dependencies)).rejects.toMatchObject({ code: "not_found" });
    expect(dependencies.inquiry).not.toHaveBeenCalled(); expect(dependencies.slots).not.toHaveBeenCalled();
    const denied = ports(); denied.manage.mockRejectedValue(new WorkspaceAccessError());
    await expect(readInquiryProposalOptions(ACTOR, input, denied)).rejects.toBeInstanceOf(WorkspaceAccessError); expect(denied.context).not.toHaveBeenCalled();
    await expect(readInquiryProposalOptions(ACTOR, { ...input, serviceId: "removed" }, ports())).rejects.toMatchObject({ code: "not_found" });
    const missing = ports(); missing.inquiry.mockResolvedValue({ ...LEAD, email: "" });
    await expect(readInquiryProposalOptions(ACTOR, input, missing)).rejects.toMatchObject({ code: "not_found" }); expect(missing.slots).not.toHaveBeenCalled();
  });
  it("returns empty truthful setup and pause states without reading slots", async () => {
    const dependencies = ports(); dependencies.services.mockResolvedValue({ timeZone: OPTIONS.timeZone, paused: true, services: [] });
    expect(await readInquiryProposalOptions(ACTOR, { workspaceId: WS, tenantId: "fixture", inquiryId: LEAD.id }, dependencies)).toMatchObject({ paused: true, services: [], slots: [] });
    expect(dependencies.slots).not.toHaveBeenCalled();
  });
  it("hides the owner reply extension when its gate is off, and adds it only to a managed inbox", async () => {
    const deps: LeadDependencies = { sites: async () => ({ sites: [{ tenantId: "fixture", siteName: "Fixture", tenantStableId: WS }], denied: [] }), storeReady: () => true, leads: async () => [LEAD], now: () => Date.now(), canProposeBookings: async () => false };
    const before = await readWorkspaceLeads(ACTOR, WS, deps);
    const render = (data: Awaited<ReturnType<typeof readWorkspaceLeads>>) => renderToStaticMarkup(createElement(WorkspaceInquiries, { workspaceId: WS, state: { kind: "ready", data } }));
    expect(before.sites[0]).not.toHaveProperty("bookingProposals"); expect(render(before)).not.toContain("Propose booking times");
    const after = await readWorkspaceLeads(ACTOR, WS, { ...deps, canProposeBookings: async () => true });
    expect(after.sites[0]?.bookingProposals).toBe(true); expect(render(after)).toContain("Propose booking times");
  });
});
describe("owner proposal states", () => {
  const render = (initial?: Parameters<typeof ProposeBookingTimes>[0]["initial"]) => renderToStaticMarkup(createElement(ProposeBookingTimes, { workspaceId: WS, tenantId: "fixture", inquiryId: LEAD.id, customerName: LEAD.name, initial }));
  it("shows verified times, exact recipient, selection bound and explicit send review", () => {
    const html = render({ phase: "ready", options: OPTIONS, selected: [OPTIONS.slots[0]!.start] });
    expect(html).toContain("0 of 3 selected".replace("0", "1")); expect(html).toContain("Fri, Nov 6, 10:00 AM EST"); expect(html).toContain("dana@example.test"); expect(html).toContain("Send suggested times"); expect(html).toContain('type="checkbox"');
  });
  it.each(["loading", "permission", "error", "accepted", "suppressed", "unavailable"] as const)("keeps %s truthful", (phase) => {
    const html = render({ phase, options: OPTIONS, selected: [OPTIONS.slots[0]!.start], error: phase === "error" ? "Storage unavailable" : undefined });
    expect(html).toContain(phase === "loading" ? "Reading current services" : phase === "permission" ? "owner or an admin" : phase === "error" ? "Storage unavailable" : phase === "accepted" ? "Customer delivery is not yet verified" : phase === "suppressed" ? "customer has not been notified" : "email delivery could not be confirmed");
    if (["accepted", "suppressed", "unavailable", "permission"].includes(phase)) expect(html).not.toContain("Send suggested times");
  });
  it("shows no-service, no-time and paused states", () => {
    expect(render({ phase: "ready", options: { ...OPTIONS, services: [] } })).toContain("No request-mode booking service");
    expect(render({ phase: "ready", options: { ...OPTIONS, slots: [] } })).toContain("No open times are available");
    expect(render({ phase: "ready", options: { ...OPTIONS, paused: true } })).toContain("Bookings are paused");
  });
});
