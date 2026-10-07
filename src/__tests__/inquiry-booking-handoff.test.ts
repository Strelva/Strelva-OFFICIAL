import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseInquiryBookingSlot, inquiryBookingHandoffEnabled, loadInquiryBookingChoice, nextInquiryBookingSlots, prepareInquiryBookingOffer, signInquiryBookingOffer, verifyInquiryBookingOffer, type InquiryBookingDependencies } from "@/products/inquiries/booking-handoff";
import type { BookingContext } from "@/platform/bookings/store";
import { createInquiryDeliveryMessage, renderInquiryMessage, getInquiryDeliveryMessageDigest } from "@/products/inquiries/delivery";
const leadId = "lead_fixture";
const id = "e0000000-0000-4000-8000-000000000001";
const serviceId = "e0000000-0000-4000-8000-000000000002";
const now = new Date("2026-10-07T12:00:00Z");
const context: BookingContext = { tenantStableId: id, workspaceId: id, systemId: id, paused: false, phone: null, hours: { timezone: "America/New_York", weekly: [{ day: 3, opens: "09:00", closes: "12:00" }] }, services: [{ id: serviceId, name: "Consultation", active: true, externalRef: "consult", durationMinutes: 30 }], settings: { mode: "request", bufferMinutes: 0, minNoticeMinutes: 0, maxAdvanceDays: 7, defaultLengthMinutes: 30, maxPerDay: null, timezone: "America/New_York", bookableHours: null, bookableOverrides: null, legacyRequiresPayment: false } };
const saved = { id, serviceId, serviceName: "Consultation", timeZone: "America/New_York", expiresAt: "2026-10-07T13:00:00.000Z", slots: [{ start: "2026-10-07T13:00:00.000Z", end: "2026-10-07T13:30:00.000Z" }] };
function deps(): InquiryBookingDependencies {
  return { enabled: () => true, released: vi.fn(async () => true), rpc: vi.fn(async (name) => name === "read_inquiry_booking_handoff" ? { context, witness: { version: 1 }, offer: null } : saved), bookings: vi.fn(async () => []), busy: vi.fn(async () => ({ connected: false as const })), now: () => now, secret: () => "fictional-secret" };
}
afterEach(() => vi.useRealTimers());
describe("inquiry to requested booking", () => {
  it("defaults off and refuses reads/writes without switches", async () => {
    expect(inquiryBookingHandoffEnabled({})).toBe(false);
    expect(inquiryBookingHandoffEnabled({ STRELVA_INQUIRY_BOOKING_HANDOFF: "1" })).toBe(false);
    const d = deps(); d.enabled = () => false;
    expect(await prepareInquiryBookingOffer({ tenantId: "site", inquiryId: leadId }, d)).toBeNull();
    expect(await loadInquiryBookingChoice("anything", d)).toBeNull();
    await expect(chooseInquiryBookingSlot("anything", 0, d)).rejects.toThrow();
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("signs a bounded purpose and rejects alteration, other secrets and expiry", () => {
    const token = signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret");
    expect(verifyInquiryBookingOffer(token, "fictional-secret", now)).toBe(id);
    expect(verifyInquiryBookingOffer(`${token}x`, "fictional-secret", now)).toBeNull();
    expect(verifyInquiryBookingOffer(token, "other-secret", now)).toBeNull();
    expect(verifyInquiryBookingOffer(token, "fictional-secret", new Date(saved.expiresAt))).toBeNull();
  });
  it("offers next three actual times after held bookings and calendar busy, with local timezone labels", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const d = deps();
    d.bookings = vi.fn(async () => [{ id, status: "requested", origin: "site", customer: { name: "Dana" }, localDate: "2026-10-07", localStart: "09:00", localEnd: "09:30", createdAt: now.toISOString() } as never]);
    d.busy = vi.fn(async () => ({ connected: true as const, checked: true as const, busy: [{ start: "2026-10-07T13:30:00Z", end: "2026-10-07T14:00:00Z" }] }));
    const slots = await nextInquiryBookingSlots("site", context, undefined, d);
    expect(slots?.slots.map((s) => s.start)).toEqual(["2026-10-07T14:00:00.000Z", "2026-10-07T14:30:00.000Z", "2026-10-07T15:00:00.000Z"]);
    expect(await nextInquiryBookingSlots("site", { ...context, paused: true }, undefined, d)).toBeNull();
    expect(await nextInquiryBookingSlots("site", { ...context, services: [{ ...context.services[0]!, active: false }] }, undefined, d)).toBeNull();
    expect(await nextInquiryBookingSlots("site", { ...context, settings: { ...context.settings!, mode: "instant" } }, undefined, d)).toBeNull();
    d.busy = vi.fn(async () => ({ connected: true as const, checked: false as const, reason: "read_unavailable" }));
    expect(await nextInquiryBookingSlots("site", context, undefined, d)).toBeNull();
  });
  it("reuses stable saved offers for email approval, and GET does no selection write", async () => {
    const d = deps(); d.rpc = vi.fn(async () => ({ context, witness: {}, offer: saved }));
    const offer = await prepareInquiryBookingOffer({ tenantId: "site", inquiryId: leadId }, d);
    expect(offer?.slots[0]?.label).toContain("9:00 AM");
    expect(d.rpc).toHaveBeenCalledTimes(1);
    d.rpc = vi.fn(async () => ({ tenantId: "site", context, offer: saved, booking: null }));
    expect((await loadInquiryBookingChoice(signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret"), d))?.offer.chooseUrl).toEqual(offer?.chooseUrl);
    expect(d.rpc).toHaveBeenCalledExactlyOnceWith("read_inquiry_booking_offer", { p_offer_id: id });
  });
  it("rechecks selected time before request and returns existing request without resetting status", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const d = deps();
    const booking = { id, start: saved.slots[0]!.start, end: saved.slots[0]!.end, status: "requested", inquiryId: leadId, origin: "inquiry" };
    d.rpc = vi.fn(async (name) => name === "read_inquiry_booking_offer" ? { tenantId: "site", context, offer: saved, booking: null } : booking);
    expect((await chooseInquiryBookingSlot(signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret"), 0, d)).inquiryId).toBe(leadId);
    expect(d.rpc).toHaveBeenLastCalledWith("choose_inquiry_booking_slot", { p_offer_id: id, p_slot_index: 0 });
    d.rpc = vi.fn(async () => ({ tenantId: "site", context: { ...context, paused: true }, offer: saved, booking: { ...booking, status: "confirmed" } }));
    expect((await chooseInquiryBookingSlot(signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret"), 0, d)).status).toBe("confirmed");
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });
  it("requires #529 email verification before holding a time and issues the confirmation for the held booking", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const d = deps();
    const booking = { id, start: saved.slots[0]!.start, end: saved.slots[0]!.end, status: "requested", inquiryId: leadId, origin: "inquiry" };
    d.rpc = vi.fn(async (name) => name === "read_inquiry_booking_offer" ? { tenantId: "site", context, offer: saved, booking: null } : booking);
    d.requireConfirmation = vi.fn(async () => { throw new Error("Email confirmation is not available."); });
    d.confirm = vi.fn(async () => undefined);
    await expect(chooseInquiryBookingSlot(signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret"), 0, d)).rejects.toThrow("Email confirmation");
    expect(d.requireConfirmation).toHaveBeenCalledWith("site");
    expect(d.rpc).not.toHaveBeenCalledWith("choose_inquiry_booking_slot", expect.anything());
    expect(d.confirm).not.toHaveBeenCalled();
    d.requireConfirmation = vi.fn(async () => undefined);
    await chooseInquiryBookingSlot(signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret"), 0, d);
    expect(d.confirm).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id, origin: "inquiry" }));
  });
  it("recomputes available times when the owner selects a different service", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const d = deps();
    const alternateId = "e0000000-0000-4000-8000-000000000003";
    const alternate = { id: alternateId, name: "Planning session", active: true, externalRef: "planning", durationMinutes: 60 };
    d.rpc = vi.fn(async (name) => name === "read_inquiry_booking_handoff"
      ? { context: { ...context, services: [...context.services, alternate] }, witness: {}, offer: saved }
      : { ...saved, serviceId: alternateId, serviceName: alternate.name });
    const offer = await prepareInquiryBookingOffer({ tenantId: "site", inquiryId: leadId, selection: { workspaceId: id, rowId: id, serviceId: alternateId } }, d);
    expect(offer?.serviceId).toBe(alternateId);
    expect(d.rpc).toHaveBeenLastCalledWith("prepare_inquiry_booking_offer", expect.objectContaining({ p_service_id: alternateId, p_slots: expect.arrayContaining([{ start: "2026-10-07T13:00:00.000Z", end: "2026-10-07T14:00:00.000Z" }]) }), expect.any(Function));
  });
  it("fails closed for revoked releases, changed availability, missing storage and malformed selections", async () => {
    const token = signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret");
    const d = deps(); d.rpc = vi.fn(async () => ({ tenantId: "site", context: { ...context, paused: true }, offer: saved, booking: null }));
    await expect(chooseInquiryBookingSlot(token, 0, d)).rejects.toThrow("no longer available");
    d.released = async () => false;
    await expect(chooseInquiryBookingSlot(token, 0, d)).rejects.toThrow("no longer available");
    await expect(chooseInquiryBookingSlot(token, 3, d)).rejects.toThrow("Choose");
    d.rpc = vi.fn(async () => { throw new Error("storage unavailable"); });
    await expect(loadInquiryBookingChoice(token, d)).rejects.toThrow("storage");
  });
  it("prepares and selects a standalone workspace request without a tenant or website purchase", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const d = deps();
    d.workspaceReleased = vi.fn(async () => true);
    d.nativeBookings = vi.fn(async () => []);
    const nativeContext = { ...context, tenantStableId: null };
    d.rpc = vi.fn(async (name) => name === "read_inquiry_booking_handoff" ? { context: nativeContext, witness: { workspaceId: id }, offer: null } : saved);
    const offer = await prepareInquiryBookingOffer({ tenantId: null, workspaceId: id, inquiryId: id }, d);
    expect(offer?.serviceName).toBe("Consultation");
    expect(d.released).not.toHaveBeenCalled();
    expect(d.workspaceReleased).toHaveBeenCalledWith(id);
    expect(d.bookings).not.toHaveBeenCalled();
    expect(d.nativeBookings).toHaveBeenCalledWith(id, expect.objectContaining({ from: "2026-10-07" }));
    d.rpc = vi.fn(async (name) => name === "read_inquiry_booking_offer" ? { tenantId: null, workspaceId: id, context: nativeContext, offer: saved, booking: null } : { id, start: saved.slots[0]!.start, end: saved.slots[0]!.end, status: "requested", inquiryId: id, origin: "inquiry", workspaceId: id });
    expect((await chooseInquiryBookingSlot(signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret"), 0, d)).workspaceId).toBe(id);
    expect(d.rpc).toHaveBeenLastCalledWith("choose_inquiry_booking_slot", { p_offer_id: id, p_slot_index: 0 });
    d.workspaceReleased = async () => false;
    await expect(chooseInquiryBookingSlot(signInquiryBookingOffer(id, saved.expiresAt, "fictional-secret"), 0, d)).rejects.toThrow("no longer available");
  });
  it("proposed times are part of exact governed receipt content and approval digest", async () => {
    const d = deps(); d.rpc = vi.fn(async () => ({ context, witness: {}, offer: saved }));
    const offer = (await prepareInquiryBookingOffer({ tenantId: "site", inquiryId: leadId }, d))!;
    const inquiry = { id: leadId, tenantId: "site", name: "Dana", email: "dana@example.test", receivedAt: now.toISOString() };
    const route = { tenantId: "site", customerEmail: inquiry.email, ownerEmail: null, businessName: "Mooney Firm", source: "fixture" } as never;
    const plain = createInquiryDeliveryMessage(inquiry, route, "reply")!;
    const proposed = createInquiryDeliveryMessage({ ...inquiry, bookingOffer: offer }, route, "reply")!;
    expect(renderInquiryMessage(proposed).text).toContain("business must confirm");
    expect(renderInquiryMessage(proposed).text).toContain("Choose a time");
    expect(getInquiryDeliveryMessageDigest(proposed)).not.toEqual(getInquiryDeliveryMessageDigest(plain));
    expect(getInquiryDeliveryMessageDigest(proposed)).toEqual(getInquiryDeliveryMessageDigest(createInquiryDeliveryMessage({ ...inquiry, bookingOffer: offer }, route, "reply")!));
  });
});
