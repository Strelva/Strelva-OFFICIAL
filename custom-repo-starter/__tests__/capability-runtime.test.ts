import { describe, expect, it, vi } from "vitest";
import { createCapabilityApi } from "../website-generation/capability-runtime.mjs";

const config = {
  baseUrl: "https://app.example",
  tenant: "northstar",
  inquiry: { capabilityId: "inquiry-main", version: 3 },
  booking: {
    capabilityId: "booking-main",
    version: 4,
    range: { from: "2026-10-01T13:00:00+00:00", to: "2026-10-31T22:00:00+00:00" },
  },
};

const inquiry = {
  schemaVersion: 1,
  capabilityId: "inquiry-main",
  version: 3,
  name: "Buyer inquiries",
  form: {
    component: "form",
    id: "buyer",
    title: "Tell us what you need",
    intro: "A person will follow up.",
    disclosure: "Strelva",
    fields: [{ id: "name", label: "Name", kind: "text", component: "text_field", required: true }],
  },
};

const schedule = {
  schemaVersion: 1,
  capabilityId: "booking-main",
  version: 4,
  name: "Consultations",
  provider: "outlook",
  timeZone: "America/New_York",
  slots: [
    { id: "slot-12345678", start: "2026-10-01T13:00:00+00:00", end: "2026-10-01T14:00:00+00:00" },
    { id: "slot-87654321", start: "2026-10-02T13:00:00+00:00", end: "2026-10-02T14:00:00+00:00" },
  ],
};

const receipt = {
  schemaVersion: 1,
  reservationId: "reservation-12345678",
  managementToken: "management-12345678",
  capabilityId: "booking-main",
  version: 4,
  provider: "outlook",
  status: "confirmed",
  title: "Consultations",
  start: schedule.slots[0]!.start,
  end: schedule.slots[0]!.end,
  timeZone: schedule.timeZone,
};

function response(body: unknown, status = 200): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

describe("generated website capability runtime", () => {
  it("uses the published inquiry protocol and capability version", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(inquiry))
      .mockResolvedValueOnce(response({ ok: true }));
    const api = createCapabilityApi(fetcher);
    const definition = await api.loadInquiry(config);
    await api.submitInquiry(config, definition, { name: "Avery", email: "avery@example.test" });
    expect(fetcher.mock.calls[0]![0]).toBe("https://app.example/api/v1/inquiries/northstar?capabilityId=inquiry-main");
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toMatchObject({ capabilityId: "inquiry-main", capabilityVersion: 3, source: "inquiry-capability" });
  });

  it("uses the published booking protocol for reserve, change, and cancel", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(schedule))
      .mockResolvedValueOnce(response({ receipt }))
      .mockResolvedValueOnce(response({ receipt: { ...receipt, start: schedule.slots[1]!.start, end: schedule.slots[1]!.end } }))
      .mockResolvedValueOnce(response({ receipt: { ...receipt, status: "cancelled" } }));
    const api = createCapabilityApi(fetcher);
    const loaded = await api.loadBooking(config);
    const reserved = await api.reserveBooking(config, loaded, loaded.slots[0]!, { name: "Avery", email: "avery@example.test" });
    const changed = await api.changeBooking(config, reserved, loaded.slots[1]!);
    const cancelled = await api.cancelBooking(config, changed);
    expect(cancelled.status).toBe("cancelled");
    expect(String(fetcher.mock.calls[0]![0])).toContain("/api/v1/bookings/northstar?");
    expect(String(fetcher.mock.calls[0]![0])).toContain("capabilityId=booking-main");
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toMatchObject({ capabilityId: "booking-main", capabilityVersion: 4, slotId: loaded.slots[0]!.id });
    expect(fetcher.mock.calls[2]![0]).toBe("https://app.example/api/v1/bookings/northstar/reservations/reservation-12345678");
    expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body))).toMatchObject({ managementToken: receipt.managementToken, capabilityId: "booking-main", capabilityVersion: 4, slotId: loaded.slots[1]!.id });
    expect(fetcher.mock.calls[3]![1]?.method).toBe("DELETE");
    expect(JSON.parse(String(fetcher.mock.calls[3]![1]?.body))).toEqual({ managementToken: receipt.managementToken });
  });

  it("reuses the durable request id after a lost reserve response, including after a runtime remount", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(schedule))
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(response({ receipt }));
    const firstApi = createCapabilityApi(fetcher);
    const loaded = await firstApi.loadBooking(config);
    await expect(firstApi.reserveBooking(config, loaded, loaded.slots[0]!, { name: "Avery", email: "avery@example.test" })).rejects.toThrow("response lost");

    const secondApi = createCapabilityApi(fetcher);
    await secondApi.reserveBooking(config, loaded, loaded.slots[0]!, { name: "Avery", email: "avery@example.test" });
    const firstBody = JSON.parse(String(fetcher.mock.calls[1]![1]?.body));
    const secondBody = JSON.parse(String(fetcher.mock.calls[2]![1]?.body));
    expect(secondBody.requestId).toBe(firstBody.requestId);
  });

  it("uses secure random values when randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(0xcd);
        return bytes;
      },
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(schedule))
      .mockResolvedValueOnce(response({ receipt }));
    const api = createCapabilityApi(fetcher);
    const loaded = await api.loadBooking(config);
    await api.reserveBooking(config, loaded, loaded.slots[0]!, { name: "Avery", email: "avery@example.test" });
    const body = JSON.parse(String(fetcher.mock.calls[1]![1]?.body));
    expect(body.requestId).toBe(`request-${"cd".repeat(16)}`);
  });

  it("does not expose change or cancel actions for a pending receipt", async () => {
    const pending = { ...receipt, status: "pending" };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(schedule))
      .mockResolvedValueOnce(response({ receipt: pending }))
      .mockResolvedValueOnce(response({ receipt }));
    const api = createCapabilityApi(fetcher);
    const loaded = await api.loadBooking(config);
    const next = await api.reserveBooking(config, loaded, loaded.slots[0]!, { name: "Avery", email: "avery@example.test" });
    expect(next.status).toBe("pending");
    expect(next).toMatchObject({ reservationId: receipt.reservationId });
    const reconciled = await api.readbackBooking(config, next);
    expect(reconciled.status).toBe("confirmed");
    expect(fetcher.mock.calls[2]![0]).toBe("https://app.example/api/v1/bookings/northstar/reservations/reservation-12345678/readback");
    expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body))).toEqual({ managementToken: receipt.managementToken });
  });
});
