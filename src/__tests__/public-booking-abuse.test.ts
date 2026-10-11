import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicBookingService, PublicBookingError, type PublicBookingBinding, type PublicBookingReservationRef, type PublicBookingAdmission } from "@/products/scheduling/public-booking";
const binding: PublicBookingBinding = { tenantId: "fixture", capabilityId: "consult", version: 1, name: "Consultation", provider: "google", timeZone: "UTC",
  owner: { userId: "owner", verifiedEmail: "owner@example.test" }, workspaceId: "business", workId: "schedule",
  slots: [{ id: "slot-abcdefgh", start: "2099-11-06T15:00:00Z", end: "2099-11-06T15:30:00Z" }] };
const input = { tenantId: "fixture", capabilityId: "consult", capabilityVersion: 1, slotId: "slot-abcdefgh", requestId: "request-" + "a".repeat(32), visitor: { name: "Dana", email: "dana@example.test" } };
function fixture() {
  let ref: PublicBookingReservationRef | null = null;
  const admission: PublicBookingAdmission = { claim: vi.fn(async () => {}), send: vi.fn(async () => {}),
    consume: vi.fn(async () => ({ tenantId: input.tenantId, requestId: input.requestId, visitor: input.visitor })),
    placed: vi.fn(async () => {}), verified: vi.fn(async () => false), cancel: vi.fn(async () => true) };
  const calendar = { reserve: vi.fn(async () => ({ verification: "verified" as const, start: binding.slots[0]!.start, end: binding.slots[0]!.end, expectedRevision: 1 })), change: vi.fn(), cancel: vi.fn() };
  const store = { claim: vi.fn(async () => "claimed" as const), settle: vi.fn(async () => {}), release: vi.fn() };
  const capture = vi.fn(async () => ({ inquiryId: "inquiry" }));
  const resolve = vi.fn(async () => binding);
  const service = createPublicBookingService({ admission, calendar, store, inquiries: { capture }, resolve,
    tokens: { findByRequest: async () => ref, findByToken: async () => ref, save: async value => { ref = value; return value; } },
    createReservationId: () => "reservation-abcdefgh", createManagementToken: () => "management-abcdefgh" });
  return { service, admission, calendar, store, capture, resolve };
}
beforeEach(() => vi.clearAllMocks());
describe("email-gated public booking", () => {
  it("records a pending receipt, emails only the confirmation, and makes no calendar/store placement or owner update", async () => {
    const f = fixture();
    const receipt = await f.service.reserve(input);
    expect(receipt.status).toBe("pending");
    expect(f.admission.claim).toHaveBeenCalledBefore(f.capture);
    expect(f.admission.send).toHaveBeenCalledWith({ tenantId: input.tenantId, requestId: input.requestId });
    expect(f.calendar.reserve).not.toHaveBeenCalled(); expect(f.store.claim).not.toHaveBeenCalled(); expect(f.store.settle).not.toHaveBeenCalled();
    expect(JSON.stringify(receipt)).not.toContain("confirmationToken");
  });
  it.each(["business", "email", "slot"])("refuses the %s cap before capture, mail or provider writes", async cap => {
    const f = fixture(); vi.mocked(f.admission.claim).mockRejectedValue(new PublicBookingError("conflict", `${cap} cap`, 429));
    await expect(f.service.reserve(input)).rejects.toMatchObject({ status: 429 });
    expect(f.capture).not.toHaveBeenCalled(); expect(f.admission.send).not.toHaveBeenCalled(); expect(f.calendar.reserve).not.toHaveBeenCalled();
  });
  it("fails closed when durable admission storage errors", async () => {
    const f = fixture(); vi.mocked(f.admission.claim).mockRejectedValue(new Error("storage down"));
    await expect(f.service.reserve(input)).rejects.toThrow("storage down");
    expect(f.capture).not.toHaveBeenCalled(); expect(f.calendar.reserve).not.toHaveBeenCalled();
  });
  it("allows legitimate email confirmation only after consuming its durable authorization", async () => {
    const f = fixture(); await f.service.reserve(input);
    expect((await f.service.confirm("email-only-token")).status).toBe("confirmed");
    expect(f.admission.consume).toHaveBeenCalledBefore(f.store.claim); expect(f.store.claim).toHaveBeenCalledBefore(f.calendar.reserve);
    expect(f.calendar.reserve).toHaveBeenCalledOnce(); expect(f.admission.placed).toHaveBeenCalledOnce(); expect(f.store.settle).toHaveBeenCalledOnce();
  });
  it.each(["expired", "replayed", "wrong-token"])("denies %s confirmation without provider placement", async () => {
    const f = fixture(); await f.service.reserve(input); vi.mocked(f.admission.consume).mockRejectedValue(new PublicBookingError("not_found", "expired"));
    await expect(f.service.confirm("invalid")).rejects.toMatchObject({ status: 404 }); expect(f.calendar.reserve).not.toHaveBeenCalled();
  });
  it("rechecks withdrawn slots after email confirmation and never forces the booking", async () => {
    const f = fixture(); await f.service.reserve(input); f.resolve.mockResolvedValue({ ...binding, slots: [] });
    await expect(f.service.confirm("email-token")).rejects.toMatchObject({ code: "conflict" }); expect(f.calendar.reserve).not.toHaveBeenCalled();
  });
  it("management tokens cannot change an unverified request or bypass email; cancellation needs no provider write", async () => {
    const f = fixture(); const r = await f.service.reserve(input);
    await expect(f.service.change({ ...input, reservationId: r.reservationId, managementToken: r.managementToken })).rejects.toMatchObject({ code: "conflict" });
    expect((await f.service.cancel({ tenantId: input.tenantId, reservationId: r.reservationId, managementToken: r.managementToken })).status).toBe("cancelled");
    expect(f.calendar.change).not.toHaveBeenCalled(); expect(f.calendar.cancel).not.toHaveBeenCalled();
  });
});
