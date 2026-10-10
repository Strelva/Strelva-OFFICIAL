import { describe, expect, it, vi } from "vitest";
import { runBookingParitySweep } from "@/server/bookings/parity-sweep";
import type { BookingParityReport } from "@/platform/bookings/move";

vi.mock("@/server/bookings/legacy-ports", () => ({ legacyBookingPorts: {} }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
const report = (tenant: string): BookingParityReport => ({ tenant, ok: true, legacyCount: 2, storeCount: 2, missing: [], mismatched: [], slotDifferences: [], slotDifferencesExplained: false, recorded: false });
function deps() {
  const rpc = vi.fn(async () => ({ data: { recorded: 2 }, error: null }));
  return { enabled: () => true, tenants: async () => ["a", "b"], db: { rpc }, compare: vi.fn(async (tenant: string) => report(tenant)) };
}
describe("booking parity sweep", () => {
  it("off means no reads or writes", async () => {
    const d = deps(); d.enabled = () => false;
    expect((await runBookingParitySweep(d)).status).toBe("disabled");
    expect(d.compare).not.toHaveBeenCalled(); expect(d.db.rpc).not.toHaveBeenCalled();
  });
  it("commits one complete batch; never repairs booking data", async () => {
    const d = deps();
    expect(await runBookingParitySweep(d)).toMatchObject({ recorded: 2, failed: 0 });
    expect(d.db.rpc).toHaveBeenCalledOnce();
    expect(d.db.rpc).toHaveBeenCalledWith("record_booking_parity_batch", { p_reports: [
      { tenant: "a", legacyCount: 2, storeCount: 2, missing: 0, mismatched: 0 },
      { tenant: "b", legacyCount: 2, storeCount: 2, missing: 0, mismatched: 0 },
    ] });
  });
  it("records failed tenant reads as negative parity, never a partial green day", async () => {
    const d = deps(); d.compare.mockImplementation(async tenant => { if (tenant === "b") throw new Error("down"); return report(tenant); });
    expect(await runBookingParitySweep(d)).toMatchObject({ recorded: 2, failed: 1 });
    expect(d.db.rpc).toHaveBeenCalledWith("record_booking_parity_batch", { p_reports: expect.arrayContaining([expect.objectContaining({ tenant: "b", missing: 1, mismatched: 1 })]) });
  });
  it("unexplained slot drift blocks parity; record narrowing is preserved", async () => {
    const d = deps(); d.compare.mockImplementation(async tenant => ({ ...report(tenant), ok: false, slotDifferences: [{ date: "2026-10-12", serviceId: "s", legacy: ["09:00"], store: [] }] }));
    expect((await runBookingParitySweep(d)).outOfParity).toEqual(["a", "b"]);
    expect(d.db.rpc).toHaveBeenCalledWith("record_booking_parity_batch", { p_reports: expect.arrayContaining([expect.objectContaining({ mismatched: 1 })]) });
  });
  it("a deadline produces negative parity for unreached tenants", async () => {
    const d = deps(); let clock = 0;
    expect(await runBookingParitySweep({ ...d, deadlineMs: 1, now: () => clock++ })).toMatchObject({ failed: 2 });
    expect(d.compare).not.toHaveBeenCalled();
  });
  it("a failed list/batch or missing database never reports success", async () => {
    const d = deps();
    expect(await runBookingParitySweep({ ...d, tenants: async () => { throw new Error("down"); } })).toMatchObject({ failed: 1, recorded: 0 });
    d.db.rpc.mockRejectedValue(new Error("db down"));
    expect(await runBookingParitySweep(d)).toMatchObject({ failed: 1, recorded: 0 });
    expect(await runBookingParitySweep({ ...d, db: null })).toMatchObject({ status: "unconfigured", failed: 1 });
  });
});
