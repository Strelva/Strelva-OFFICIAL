import { describe, expect, it, vi } from "vitest";
import { createSchedulingService, scheduleLifecycle, scheduleObligations } from "@/products/scheduling/server";
import { createCalendarSchedulingService, type CalendarReceiptStore } from "@/products/scheduling/calendar/service";
import type { CalendarAdapter } from "@/products/scheduling/calendar/adapters";
import type { CalendarConnection } from "@/products/scheduling/calendar/contracts";
import type { CalendarEventReceipt } from "@/products/scheduling/calendar/repository";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

const availability = [{ start: "2026-10-10T09:00:00Z", end: "2026-10-10T12:00:00Z" }];
const first = { kind: "reserve" as const, requestId: "request-1", title: "Roof inspection", start: "2026-10-10T09:00:00Z", end: "2026-10-10T10:00:00Z" };
const second = { kind: "reserve" as const, requestId: "request-2", title: "Gutter check", start: "2026-10-10T10:00:00Z", end: "2026-10-10T11:00:00Z" };
const pausedAt = new Date("2026-10-04T12:00:00.000Z");

function service(options: { assertManager?: (actor: WorkspaceActor, workspaceId: string) => Promise<void> } = {}) {
  const store = memoryBoundedStore();
  const scheduling = createSchedulingService(store, {
    workspaceExitCompleted: async () => false,
    assertManager: options.assertManager ?? (async () => {}),
    now: () => pausedAt,
  });
  return { store, scheduling };
}

async function scheduleWithReservation(scheduling: ReturnType<typeof service>["scheduling"]) {
  const created = await scheduling.create(owner, "workspace-a", { title: "Consultations", availability });
  return scheduling.command(owner, created.id, { ...first, expectedRevision: 0 });
}

describe("pausing a workspace booking schedule", () => {
  it("stops new reservations and keeps every existing one; resume restores intake", async () => {
    const { scheduling } = service();
    const live = await scheduleWithReservation(scheduling);
    expect(scheduleLifecycle(live.payload)).toBe("live");

    const paused = await scheduling.command(owner, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Closed for inventory week" });
    expect(scheduleLifecycle(paused.payload)).toBe("paused");
    expect(paused.payload.pause).toEqual({ pausedAt: pausedAt.toISOString(), pausedBy: owner.userId, reason: "Closed for inventory week" });
    expect(paused.payload.reservations).toEqual(live.payload.reservations);

    await expect(scheduling.command(owner, live.id, { ...second, expectedRevision: paused.payload.revision })).rejects.toThrow(/Bookings are paused/);
    await expect(scheduling.command(owner, live.id, { kind: "reschedule", expectedRevision: paused.payload.revision, requestId: first.requestId, start: second.start, end: second.end })).rejects.toThrow(/Bookings are paused/);
    const unchanged = await scheduling.read(owner, live.id);
    expect(unchanged.payload.reservations).toHaveLength(1);
    expect(unchanged.payload.revision).toBe(paused.payload.revision);

    const resumed = await scheduling.command(owner, live.id, { kind: "resume", expectedRevision: paused.payload.revision });
    expect(scheduleLifecycle(resumed.payload)).toBe("live");
    expect(resumed.payload.pause).toBeUndefined();
    expect(resumed.payload.history.map(entry => entry.kind)).toEqual(["reserve", "pause", "resume"]);
    const booked = await scheduling.command(owner, live.id, { ...second, expectedRevision: resumed.payload.revision });
    expect(booked.payload.reservations.map(value => value.requestId)).toEqual(["request-1", "request-2"]);
  });

  it("keeps existing reservations cancellable while paused", async () => {
    const { scheduling } = service();
    const live = await scheduleWithReservation(scheduling);
    const paused = await scheduling.command(owner, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Holiday" });
    const cancelled = await scheduling.command(owner, live.id, { kind: "cancel", expectedRevision: paused.payload.revision, requestId: first.requestId });
    expect(cancelled.payload.reservations[0]!.status).toBe("cancelled");
    expect(cancelled.payload.pause).toBeDefined();
  });

  it("treats a second pause as a no-op that keeps the first time and reason, even from a stale tab", async () => {
    const { scheduling } = service();
    const live = await scheduleWithReservation(scheduling);
    const paused = await scheduling.command(owner, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Holiday" });
    const again = await scheduling.command(owner, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Second click" });
    expect(again.payload.revision).toBe(paused.payload.revision);
    expect(again.payload.pause?.reason).toBe("Holiday");
    const resumeTwice = await scheduling.command(owner, live.id, { kind: "resume", expectedRevision: again.payload.revision });
    const noop = await scheduling.command(owner, live.id, { kind: "resume", expectedRevision: again.payload.revision });
    expect(noop.payload.revision).toBe(resumeTwice.payload.revision);
  });

  it("denies pause and resume to anyone who cannot manage the workspace", async () => {
    const denied = vi.fn(async () => { throw new WorkspaceAccessError("A workspace owner or administrator must manage calendar connections."); });
    const { scheduling } = service({ assertManager: denied });
    const live = await scheduleWithReservation(scheduling);
    await expect(scheduling.command(owner, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Holiday" })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(denied).toHaveBeenCalledWith(owner, "workspace-a");
    expect((await scheduling.read(owner, live.id)).payload.pause).toBeUndefined();
    // Reservations themselves keep the ordinary member rule.
    expect((await scheduling.command(owner, live.id, { ...second, expectedRevision: live.payload.revision })).payload.reservations).toHaveLength(2);
  });

  it("refuses a non-member before the lifecycle check runs", async () => {
    const assertManager = vi.fn(async () => {});
    const { scheduling } = service({ assertManager });
    const live = await scheduleWithReservation(scheduling);
    const stranger = { userId: "stranger", verifiedEmail: "stranger@example.com" };
    await expect(scheduling.command(stranger, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Holiday" })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(assertManager).not.toHaveBeenCalled();
  });

  it("answers an exact replay of a reservation accepted before the pause", async () => {
    const { scheduling } = service();
    const live = await scheduleWithReservation(scheduling);
    const paused = await scheduling.command(owner, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Holiday" });
    const replay = await scheduling.command(owner, live.id, { ...first, expectedRevision: 0 });
    expect(replay.payload.revision).toBe(paused.payload.revision);
    expect(replay.payload.reservations).toHaveLength(1);
  });

  it("reports expired holds on resume instead of confirming or re-offering them", async () => {
    const { scheduling } = service();
    const live = await scheduleWithReservation(scheduling);
    const paused = await scheduling.command(owner, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Holiday" });
    const resumed = await scheduling.command(owner, live.id, { kind: "resume", expectedRevision: paused.payload.revision });
    const afterHoldEnded = Date.parse("2026-10-10T10:30:00Z");
    const obligations = scheduleObligations(resumed.payload, afterHoldEnded);
    expect(obligations.expiredHolds).toEqual([{ requestId: "request-1", title: first.title, start: first.start, end: first.end }]);
    expect(obligations.openHolds).toEqual([]);
    expect(resumed.payload.reservations[0]!.status).toBe("reserved");
    // Before the hold's time it is still an open obligation.
    expect(scheduleObligations(resumed.payload, Date.parse("2026-10-09T00:00:00Z")).openHolds).toHaveLength(1);
  });
});

describe("pause with the calendar provider", () => {
  const connection: CalendarConnection & { accessToken: string } = {
    id: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-8222-222222222222", provider: "outlook", calendarId: "calendar-1", calendarName: "Operations", timeZone: "America/New_York", status: "connected", scopes: ["Calendars.ReadWrite"], reminderPolicy: { mode: "provider_minutes", minutes: 60 }, tokenExpiresAt: null, lastCheckedAt: null, lastError: null, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z", accessToken: "fixture-token",
  };

  function calendarFixture() {
    const store = memoryBoundedStore();
    const scheduling = createSchedulingService(store, { workspaceExitCompleted: async () => false, assertManager: async () => {}, now: () => pausedAt });
    const created: Array<Record<string, unknown>> = [];
    let event = { id: "event-1", title: first.title, start: first.start, end: first.end, calendarId: connection.calendarId, timeZone: connection.timeZone, observedAt: "2026-10-04T12:00:00.000Z" };
    const adapter = {
      provider: "outlook",
      async listCalendars() { return []; },
      async availability() { return { busy: [], observedAt: event.observedAt }; },
      async create(_credentials: unknown, input: Record<string, unknown>) { created.push(input); return event; },
      async findByIdempotencyKey() { return created.length ? event : null; },
      async get() { return event; },
      async update(_credentials: unknown, input: { start: string; end: string }) { event = { ...event, start: input.start, end: input.end }; return event; },
      async remove() { return { id: event.id, observedAt: event.observedAt }; },
    } as unknown as CalendarAdapter;
    const receipts = new Map<string, CalendarEventReceipt>();
    const receiptStore: CalendarReceiptStore = {
      async read(_actor, _workspaceId, _workId, requestId) { return [...receipts.values()].find(value => value.requestId === requestId) ?? null; },
      async save(_actor, input) {
        const value = { ...input, id: input.id ?? `receipt-${receipts.size + 1}`, createdAt: "2026-10-04T12:00:00.000Z", updatedAt: "2026-10-04T12:00:00.000Z" } as CalendarEventReceipt;
        receipts.set(`${value.workId}:${value.requestId}`, value);
        return value;
      },
    };
    const calendar = createCalendarSchedulingService(store, { connection: async () => connection, adapter: () => adapter, receiptStore, workspaceExitStopped: async () => false });
    return { scheduling, calendar, created };
  }

  it("finishes an in-flight hold accepted before the pause, with its reminder", async () => {
    const { scheduling, calendar, created } = calendarFixture();
    const live = await scheduleWithReservation(scheduling);
    await scheduling.command(owner, live.id, { kind: "pause", expectedRevision: live.payload.revision, reason: "Holiday" });
    const delivered = await calendar.create(owner, live.id, first.requestId, "outlook");
    expect(delivered.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1", verification: "verified" });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ reminderPolicy: { mode: "provider_minutes", minutes: 60 } });
    expect(delivered.payload.pause).toBeDefined();
  });

  it("will not move a confirmed appointment to a new time while paused, but still cancels it", async () => {
    const { scheduling, calendar } = calendarFixture();
    const live = await scheduleWithReservation(scheduling);
    const accepted = await calendar.create(owner, live.id, first.requestId, "outlook");
    const paused = await scheduling.command(owner, live.id, { kind: "pause", expectedRevision: accepted.payload.revision, reason: "Holiday" });
    await expect(calendar.reschedule(owner, live.id, first.requestId, { provider: "outlook", expectedRevision: paused.payload.revision, start: second.start, end: second.end })).rejects.toThrow(/Bookings are paused/);
    const cancelled = await calendar.cancel(owner, live.id, first.requestId, { provider: "outlook", expectedRevision: paused.payload.revision });
    expect(cancelled.payload.reservations[0]!.status).toBe("cancelled");
  });
});
