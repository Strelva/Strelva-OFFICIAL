import { describe, expect, it, vi } from "vitest";
import {
  createPublicBookingService,
  PublicBookingError,
  type PublicBookingBinding,
  type PublicBookingReservationRef,
  type PublicBookingTokenStore,
} from "@/products/scheduling/public-booking";

const binding: PublicBookingBinding = {
  tenantId: "northstar",
  capabilityId: "consultations",
  version: 4,
  name: "Repair consultation",
  provider: "outlook",
  timeZone: "America/New_York",
  slots: [
    { id: "slot-1-abcdefgh", start: "2026-10-01T13:00:00+00:00", end: "2026-10-01T14:00:00+00:00" },
    { id: "slot-2-abcdefgh", start: "2026-10-01T14:00:00+00:00", end: "2026-10-01T15:00:00+00:00" },
  ],
  owner: { userId: "owner-1", verifiedEmail: "owner@example.test" },
  workspaceId: "workspace-private",
  workId: "work-private",
};
const strongRequestId = "request-abcdefghijklmnopqrstuvwxyz123456";

function tokenStore() {
  const values = new Map<string, PublicBookingReservationRef>();
  const store: PublicBookingTokenStore = {
    findByRequest: vi.fn(async ({ tenantId, requestId }) => [...values.values()].find(value => value.tenantId === tenantId && value.requestId === requestId) ?? null),
    findByToken: vi.fn(async ({ tenantId, managementToken }) => [...values.values()].find(value => value.tenantId === tenantId && value.managementToken === managementToken) ?? null),
    save: vi.fn(async value => { values.set(value.managementToken, value); return value; }),
  };
  return { store, values };
}

function fixture(overrides: Partial<Parameters<typeof createPublicBookingService>[0]> = {}) {
  const tokens = tokenStore();
  const inquiries = { capture: vi.fn(async () => ({ inquiryId: "inquiry-private" })) };
  const calendar = {
    reserve: vi.fn(async () => ({ verification: "verified" as const, start: binding.slots[0]!.start, end: binding.slots[0]!.end, expectedRevision: 3 })),
    change: vi.fn(async ({ start, end, expectedRevision }: { start: string; end: string; expectedRevision: number }) => ({ verification: "verified" as const, start, end, expectedRevision: expectedRevision + 1 })),
    cancel: vi.fn(async ({ expectedRevision }: { expectedRevision: number }) => ({ verification: "verified" as const, start: binding.slots[0]!.start, end: binding.slots[0]!.end, expectedRevision: expectedRevision + 1 })),
  };
  const service = createPublicBookingService({
    resolve: vi.fn(async () => binding),
    inquiries,
    calendar,
    tokens: tokens.store,
    createReservationId: () => "reservation-abcdefgh",
    createRequestId: () => strongRequestId,
    createManagementToken: () => "management-abcdefgh",
    ...overrides,
  });
  return { service, tokens, inquiries, calendar };
}

describe("public native booking adapter", () => {
  it("publishes bounded slots while keeping private work and actor ids server-side", async () => {
    const { service } = fixture();
    await expect(service.read({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, range: { from: "2026-10-01T13:00:00+00:00", to: "2026-10-01T14:30:00+00:00" } })).resolves.toEqual({
      schemaVersion: 1,
      capabilityId: binding.capabilityId,
      version: binding.version,
      name: binding.name,
      provider: binding.provider,
      timeZone: binding.timeZone,
      slots: [binding.slots[0]],
    });
    const serialized = JSON.stringify(await service.read({ tenantId: binding.tenantId, capabilityId: binding.capabilityId }));
    expect(serialized).not.toContain("workspace-private");
    expect(serialized).not.toContain("work-private");
    expect(serialized).not.toContain("owner@example.test");
  });

  it("captures the visitor and reserves through the injected native calendar owner", async () => {
    const { service, inquiries, calendar, tokens } = fixture();
    const result = await service.reserve({
      tenantId: binding.tenantId,
      capabilityId: binding.capabilityId,
      capabilityVersion: binding.version,
      slotId: binding.slots[0]!.id,
      requestId: strongRequestId,
      visitor: { name: "Avery Buyer", email: "avery@example.test", message: "Please call." },
    });
    expect(result).toMatchObject({ status: "confirmed", provider: "outlook", reservationId: "reservation-abcdefgh", managementToken: "management-abcdefgh" });
    expect(JSON.stringify(result)).not.toContain("providerId");
    expect(JSON.stringify(result)).not.toContain("workspace");
    expect(inquiries.capture).toHaveBeenCalledWith(expect.objectContaining({ requestId: strongRequestId, visitor: { name: "Avery Buyer", email: "avery@example.test", message: "Please call." } }));
    expect(calendar.reserve).toHaveBeenCalledWith(expect.objectContaining({ requestId: strongRequestId, start: binding.slots[0]!.start, end: binding.slots[0]!.end }));
    expect(tokens.store.save).toHaveBeenCalledTimes(2);
    expect(tokens.values.get(result.managementToken)?.inquiryId).toBe("inquiry-private");
    expect(tokens.values.get(result.managementToken)?.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("can bind booking capture to a separately published inquiry version", async () => {
    const { service, inquiries } = fixture({ resolve: vi.fn(async () => ({ ...binding, inquiryCapabilityId: "visitor-inquiry", inquiryVersion: 7 })) });
    await service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, visitor: { name: "Avery Buyer", email: "avery@example.test" } });
    expect(inquiries.capture).toHaveBeenCalledWith(expect.objectContaining({ capabilityId: "visitor-inquiry", capabilityVersion: 7 }));
  });

  it("replays the same accepted reservation without recapturing or writing twice", async () => {
    let resolveCount = 0;
    const resolve = vi.fn(async () => {
      resolveCount += 1;
      return resolveCount === 1 ? binding : { ...binding, slots: [] };
    });
    const { service, inquiries, calendar } = fixture({ resolve });
    const input = { tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, requestId: strongRequestId, visitor: { name: "Avery Buyer", email: "avery@example.test" } };
    const first = await service.reserve(input);
    const second = await service.reserve(input);
    expect(second).toEqual(first);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(inquiries.capture).toHaveBeenCalledTimes(1);
    expect(calendar.reserve).toHaveBeenCalledTimes(1);
  });

  it("rejects a reused request id when the slot or visitor details change", async () => {
    const { service, calendar } = fixture();
    const input = { tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, requestId: strongRequestId, visitor: { name: "Avery Buyer", email: "avery@example.test" } };
    await service.reserve(input);

    await expect(service.reserve({ ...input, slotId: binding.slots[1]!.id })).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(service.reserve({ ...input, visitor: { ...input.visitor, name: "Different Buyer" } })).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect(calendar.reserve).toHaveBeenCalledTimes(1);
  });

  it("requires a strong explicit request id before capturing or reserving", async () => {
    const { service, inquiries, calendar } = fixture();
    await expect(service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, requestId: "request-too-short", visitor: { name: "Avery Buyer", email: "avery@example.test" } })).rejects.toMatchObject({ code: "invalid", status: 400 });
    expect(inquiries.capture).not.toHaveBeenCalled();
    expect(calendar.reserve).not.toHaveBeenCalled();
  });

  it("changes and cancels using only the opaque receipt while advancing the private revision", async () => {
    const { service, calendar, tokens } = fixture();
    const first = await service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, requestId: strongRequestId, visitor: { name: "Avery Buyer", email: "avery@example.test" } });
    const changed = await service.change({ tenantId: binding.tenantId, reservationId: first.reservationId, managementToken: first.managementToken, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[1]!.id });
    expect(changed).toMatchObject({ reservationId: first.reservationId, managementToken: first.managementToken, start: binding.slots[1]!.start, status: "confirmed" });
    expect(calendar.change).toHaveBeenCalledWith(expect.objectContaining({ requestId: strongRequestId, expectedRevision: 3, start: binding.slots[1]!.start }));
    const cancelled = await service.cancel({ tenantId: binding.tenantId, reservationId: changed.reservationId, managementToken: changed.managementToken });
    expect(cancelled).toMatchObject({ reservationId: first.reservationId, managementToken: first.managementToken, status: "cancelled" });
    expect(calendar.cancel).toHaveBeenCalledWith(expect.objectContaining({ requestId: strongRequestId, expectedRevision: 4 }));
    expect(tokens.values.get(first.managementToken)?.expectedRevision).toBe(5);
  });

  it("keeps an existing receipt cancellable after the website binding is revoked", async () => {
    const resolve = vi.fn(async (input: { includeRevoked?: boolean }) => input.includeRevoked
      ? { ...binding, websiteBindingActive: false }
      : binding);
    const { service, calendar } = fixture({ resolve });
    const first = await service.reserve({
      tenantId: binding.tenantId,
      capabilityId: binding.capabilityId,
      capabilityVersion: binding.version,
      slotId: binding.slots[0]!.id,
      requestId: strongRequestId,
      visitor: { name: "Avery Buyer", email: "avery@example.test" },
    });
    await expect(service.change({
      tenantId: binding.tenantId,
      reservationId: first.reservationId,
      managementToken: first.managementToken,
      capabilityId: binding.capabilityId,
      capabilityVersion: binding.version,
      slotId: binding.slots[1]!.id,
    })).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(service.cancel({ tenantId: binding.tenantId, reservationId: first.reservationId, managementToken: first.managementToken })).resolves.toMatchObject({ status: "cancelled" });
    expect(calendar.change).not.toHaveBeenCalled();
    expect(calendar.cancel).toHaveBeenCalledTimes(1);
  });

  it("does not claim confirmation when the native calendar boundary cannot confirm", async () => {
    const calendar = {
      reserve: vi.fn(async () => { throw new Error("fixture provider unavailable"); }),
      change: vi.fn(),
      cancel: vi.fn(),
    };
    const { service, tokens } = fixture({ calendar });
    await expect(service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, requestId: strongRequestId, visitor: { name: "Avery Buyer", email: "avery@example.test" } })).rejects.toMatchObject({ code: "unavailable", status: 503 });
    expect(tokens.store.save).toHaveBeenCalledTimes(1);
    expect(tokens.values.get("management-abcdefgh")).toMatchObject({ status: "pending", expectedRevision: 0 });
    expect(calendar.reserve).toHaveBeenCalledTimes(1);
  });

  it("replays a durable pending claim without invoking the calendar twice", async () => {
    const calendar = {
      reserve: vi.fn(async () => { throw new Error("fixture provider unavailable"); }),
      change: vi.fn(),
      cancel: vi.fn(),
    };
    const { service, tokens, inquiries } = fixture({ calendar });
    const input = {
      tenantId: binding.tenantId,
      capabilityId: binding.capabilityId,
      capabilityVersion: binding.version,
      slotId: binding.slots[0]!.id,
      requestId: strongRequestId,
      visitor: { name: "Avery Buyer", email: "avery@example.test" },
    };
    await expect(service.reserve(input)).rejects.toMatchObject({ code: "unavailable", status: 503 });

    await expect(service.reserve(input)).resolves.toMatchObject({
      reservationId: "reservation-abcdefgh",
      status: "pending",
    });
    expect(tokens.store.findByRequest).toHaveBeenCalledTimes(2);
    expect(inquiries.capture).toHaveBeenCalledTimes(1);
    expect(calendar.reserve).toHaveBeenCalledTimes(1);
  });

  it("labels a provider acceptance without verified readback as pending", async () => {
    const calendar = {
      reserve: vi.fn(async () => ({ verification: "pending" as const, start: binding.slots[0]!.start, end: binding.slots[0]!.end, expectedRevision: 3 })),
      change: vi.fn(),
      cancel: vi.fn(),
    };
    const { service } = fixture({ calendar });
    const result = await service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, visitor: { name: "Avery Buyer", email: "avery@example.test" } });
    expect(result.status).toBe("pending");
    expect(result.status).not.toBe("confirmed");
  });

  it("does not call the calendar when durable owner capture is unavailable", async () => {
    const inquiries = { capture: vi.fn(async () => { throw new Error("redis unavailable"); }) };
    const { service, calendar } = fixture({ inquiries });
    await expect(service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, visitor: { name: "Avery Buyer", email: "avery@example.test" } })).rejects.toMatchObject({ code: "unavailable", status: 503 });
    expect(calendar.reserve).not.toHaveBeenCalled();
  });

  it("surfaces token-store outages instead of claiming a saved receipt", async () => {
    const tokens = tokenStore();
    tokens.store.save = vi.fn(async () => { throw new Error("postgres unavailable"); });
    const { service, calendar } = fixture({ tokens: tokens.store });
    await expect(service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, visitor: { name: "Avery Buyer", email: "avery@example.test" } })).rejects.toMatchObject({ code: "unavailable", status: 503 });
    expect(calendar.reserve).not.toHaveBeenCalled();
  });

  it("rejects a stale published version before capturing visitor data", async () => {
    const { service, inquiries } = fixture();
    await expect(service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: 3, slotId: binding.slots[0]!.id, visitor: { name: "Avery Buyer", email: "avery@example.test" } })).rejects.toBeInstanceOf(PublicBookingError);
    expect(inquiries.capture).not.toHaveBeenCalled();
  });

  it("returns a stable public validation error for malformed visitor data", async () => {
    const { service, inquiries } = fixture();
    await expect(service.reserve({ tenantId: binding.tenantId, capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[0]!.id, visitor: { name: "", email: "bad" } })).rejects.toMatchObject({ code: "invalid", status: 400 });
    expect(inquiries.capture).not.toHaveBeenCalled();
  });
});
