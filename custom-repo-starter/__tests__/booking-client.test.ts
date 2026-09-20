import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelBooking,
  changeBooking,
  clearBookingRequestDraft,
  createBookingRequestId,
  isPublicBookingReceipt,
  isPublicBookingSchedule,
  loadBookingSchedule,
  readBookingStatus,
  readBookingRequestDraft,
  reserveBooking,
  sameBookingRequest,
  writeBookingRequestDraft,
  type PublicBookingReceipt,
  type PublicBookingSchedule,
} from "../booking-client";

const schedule: PublicBookingSchedule = {
  schemaVersion: 1,
  capabilityId: "native-booking",
  version: 3,
  name: "Consultation times",
  provider: "outlook",
  timeZone: "America/New_York",
  slots: [
    { id: "slot-2026-10-01-1300", start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" },
    { id: "slot-2026-10-01-1400", start: "2026-10-01T14:00:00Z", end: "2026-10-01T15:00:00Z" },
  ],
};

const receipt: PublicBookingReceipt = {
  schemaVersion: 1,
  reservationId: "reservation-abc123",
  managementToken: "manage-token-abc123",
  capabilityId: schedule.capabilityId,
  version: schedule.version,
  provider: "outlook",
  status: "confirmed",
  title: "Consultation",
  start: schedule.slots[0]!.start,
  end: schedule.slots[0]!.end,
  timeZone: schedule.timeZone,
};

afterEach(() => vi.unstubAllGlobals());

describe("public native booking contract", () => {
  it("accepts only safe published schedule and receipt shapes", () => {
    expect(isPublicBookingSchedule(schedule)).toBe(true);
    expect(isPublicBookingSchedule({ ...schedule, provider: "calendly" })).toBe(false);
    expect(isPublicBookingSchedule({ ...schedule, slots: [{ ...schedule.slots[0], providerEventId: "secret" }] })).toBe(false);
    expect(isPublicBookingReceipt(receipt)).toBe(true);
    expect(isPublicBookingReceipt({ ...receipt, providerEventId: "secret" })).toBe(false);
    expect(isPublicBookingReceipt({ ...receipt, status: "writing" })).toBe(false);
  });

  it("loads a versioned tenant schedule without credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(schedule));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadBookingSchedule("https://app.example/", "example", schedule.capabilityId, {
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-08T00:00:00Z",
    })).resolves.toEqual(schedule);
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain("/api/v1/bookings/example?");
    expect(String(url)).toContain("capabilityId=native-booking");
    expect(String(url)).toContain("from=2026-10-01T00%3A00%3A00Z");
    expect(init.credentials).toBe("omit");
  });

  it("binds reserve to the published version and never sends workspace or provider IDs", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ receipt }));
    vi.stubGlobal("fetch", fetcher);
    await reserveBooking("https://app.example", "example", schedule, schedule.slots[0]!, {
      name: "Avery Buyer",
      email: "avery@example.test",
      message: "Please call me.",
    });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.example/api/v1/bookings/example/reservations");
    expect(JSON.parse(String(init.body))).toEqual({
      capabilityId: schedule.capabilityId,
      capabilityVersion: schedule.version,
      slotId: schedule.slots[0]!.id,
      visitor: { name: "Avery Buyer", email: "avery@example.test", message: "Please call me." },
    });
    expect(JSON.stringify(init.body)).not.toContain("workspace");
    expect(JSON.stringify(init.body)).not.toContain("providerId");
    expect(init.credentials).toBe("omit");
  });

  it("can carry a caller-owned opaque request id for safe retry", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ receipt }));
    vi.stubGlobal("fetch", fetcher);
    await reserveBooking("https://app.example", "example", schedule, schedule.slots[0]!, { name: "Avery Buyer", email: "avery@example.test" }, { requestId: "request-abcdefgh" });
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ requestId: "request-abcdefgh" });
  });

  it("uses a secure random fallback when randomUUID is unavailable and fails closed without one", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(0xab);
        return bytes;
      },
    });
    expect(createBookingRequestId()).toBe(`request-${"ab".repeat(16)}`);

    vi.stubGlobal("crypto", {});
    expect(() => createBookingRequestId()).toThrow(/secure/i);
  });

  it("persists one pending request draft and replaces it only for different details", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    const key = "strelva:booking:request:test";
    const draft = {
      requestId: "request-abcdefghijklmnopqrstuvwxyz123456",
      capabilityId: schedule.capabilityId,
      capabilityVersion: schedule.version,
      slotId: schedule.slots[0]!.id,
      visitor: { name: "Avery Buyer", email: "avery@example.test", message: "Please call." },
    };
    writeBookingRequestDraft(key, draft);
    expect(readBookingRequestDraft(key)).toEqual(draft);
    expect(sameBookingRequest(draft, { slotId: schedule.slots[0]!.id, visitor: draft.visitor })).toBe(true);
    expect(sameBookingRequest(draft, { slotId: schedule.slots[1]!.id, visitor: draft.visitor })).toBe(false);
    clearBookingRequestDraft(key);
    expect(readBookingRequestDraft(key)).toBeNull();
  });

  it("keeps the opaque receipt token in the JSON body for change and cancel", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ receipt: { ...receipt, start: schedule.slots[1]!.start, end: schedule.slots[1]!.end } }))
      .mockResolvedValueOnce(Response.json({ receipt: { ...receipt, status: "cancelled" } }));
    vi.stubGlobal("fetch", fetcher);
    await changeBooking("https://app.example", "example", receipt, schedule.slots[1]!);
    await cancelBooking("https://app.example", "example", receipt);
    const changeBody = JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body));
    const cancelBody = JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body));
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://app.example/api/v1/bookings/example/reservations/reservation-abc123");
    expect(changeBody).toMatchObject({ managementToken: receipt.managementToken, capabilityId: schedule.capabilityId, capabilityVersion: schedule.version, slotId: schedule.slots[1]!.id });
    expect(cancelBody).toEqual({ managementToken: receipt.managementToken });
    expect(JSON.stringify(changeBody)).not.toContain("providerId");
  });

  it("checks an ambiguous booking receipt without repeating a write", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ receipt: { ...receipt, status: "confirmed" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readBookingStatus("https://app.example", "example", { reservationId: receipt.reservationId, managementToken: receipt.managementToken })).resolves.toMatchObject({ status: "confirmed" });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://app.example/api/v1/bookings/example/reservations/reservation-abc123/readback");
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ managementToken: receipt.managementToken });
  });

  it("rejects invalid visitor input before contacting the booking service", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(reserveBooking("https://app.example", "example", schedule, schedule.slots[0]!, { name: "", email: "bad" })).rejects.toThrow("valid email");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
