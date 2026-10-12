import { describe, expect, it, vi } from "vitest";
import { backfillScheduleReservations, type WorkspaceSchedule } from "@/platform/bookings/move";
import type { BookingStoreDb } from "@/platform/bookings/store";

// Schedule reservations made in the workspace (no public receipt) copied into
// the one store. The SQL side (calendar choice, idempotency, refusals) is
// proven in tests/booking-lifecycle-schema.sql.

function db(results: Array<{ status: string } | Error>) {
  const calls: Array<Record<string, unknown>> = [];
  const store: BookingStoreDb = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, ...args });
      const next = results.shift() ?? { status: "recorded" };
      if (next instanceof Error) return Promise.resolve({ data: null, error: { message: next.message } });
      const booking = { id: "b", status: "confirmed", start: "2026-11-16T16:00:00.000Z", end: "2026-11-16T16:30:00.000Z" };
      return Promise.resolve({ data: next.status === "conflict" ? { status: "conflict", booking: null } : { status: next.status, booking }, error: null });
    },
  };
  return { store, calls };
}

const schedule: WorkspaceSchedule = {
  workspaceId: "ws-1",
  workId: "work-1",
  timeZone: "America/New_York",
  receiptRequestIds: new Set(["api-1"]),
  reservations: [
    { requestId: "api-1", title: "Consultation", start: "2026-11-16T15:00:00Z", end: "2026-11-16T15:30:00Z", status: "accepted" },
    { requestId: "owner-1", title: "Walk-in", start: "2026-11-16T16:00:00Z", end: "2026-11-16T16:30:00Z", status: "accepted" },
    { requestId: "owner-2", title: "Old", start: "2026-11-17T16:00:00Z", end: "2026-11-17T16:30:00Z", status: "cancelled" },
    { requestId: "owner-3", title: "Clash", start: "2026-11-18T16:00:00Z", end: "2026-11-18T16:30:00Z", status: "writing" },
    { requestId: "owner-4", title: "Broken", start: "2026-11-19T16:00:00Z", end: "2026-11-19T16:30:00Z", status: "reserved" },
  ],
};

describe("copying schedule reservations without a public receipt", () => {
  it("a dry run counts and writes nothing", async () => {
    const { store, calls } = db([]);
    const report = await backfillScheduleReservations({ apply: false, ports: { schedules: async () => [schedule] }, db: store });
    expect(report).toMatchObject({ schedules: 1, reservations: 4, withReceipt: 1, written: 0 });
    expect(calls).toEqual([]);
  });

  it("copies each one with its schedule identity, skips receipts, and reports overlaps and failures", async () => {
    const { store, calls } = db([{ status: "recorded" }, { status: "unchanged" }, { status: "conflict" }, new Error("booking_invalid")]);
    const report = await backfillScheduleReservations({ apply: true, ports: { schedules: async () => [schedule] }, db: store });
    expect(report).toMatchObject({ written: 1, unchanged: 1, conflicts: ["work-1:owner-3"], failed: [{ ref: "work-1:owner-4", reason: "booking_store_invalid" }] });
    expect(calls).toHaveLength(4);
    expect(calls[0]).toEqual({
      name: "record_workspace_booking", p_workspace_id: "ws-1", p_via: "backfill",
      p_booking: { workId: "work-1", requestId: "owner-1", status: "confirmed", title: "Walk-in", start: "2026-11-16T16:00:00.000Z", end: "2026-11-16T16:30:00.000Z", timeZone: "America/New_York" },
    });
    expect((calls[1]!.p_booking as { status: string }).status).toBe("cancelled");
    // A provider write in flight still holds the time.
    expect((calls[2]!.p_booking as { status: string }).status).toBe("confirmed");
  });

  it("refuses to apply without a database", async () => {
    await expect(backfillScheduleReservations({ apply: true, ports: { schedules: vi.fn(async () => [schedule]) }, db: null })).rejects.toThrow("unconfigured");
  });
});
