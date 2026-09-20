import { describe, expect, it } from "vitest";
import { createSchedulingService } from "@/products/scheduling/server";
import { createCalendarSchedulingService, type CalendarReceiptStore } from "@/products/scheduling/calendar/service";
import { CalendarProviderError, type CalendarAdapter } from "@/products/scheduling/calendar/adapters";
import type { CalendarConnection, CalendarProvider } from "@/products/scheduling/calendar/contracts";
import type { CalendarEventReceipt } from "@/products/scheduling/calendar/repository";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

const interval = { start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" };
const reservation = { kind: "reserve" as const, expectedRevision: 0, requestId: "request-1", title: "Roof inspection", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" };
const connection: CalendarConnection & { accessToken: string } = {
  id: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-8222-222222222222", provider: "outlook", calendarId: "calendar-1", calendarName: "Operations", timeZone: "America/New_York", status: "connected", scopes: ["Calendars.ReadWrite"], reminderPolicy: { mode: "off" }, tokenExpiresAt: null, lastCheckedAt: null, lastError: null, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z", accessToken: "fixture-token",
};

function receiptStore(hideReads = false) {
  const entries = new Map<string, CalendarEventReceipt>();
  const store: CalendarReceiptStore = {
    async read(_actor, _workspaceId, _workId, requestId) { return hideReads ? null : [...entries.values()].find(value => value.requestId === requestId) ?? null; },
    async save(_actor, input) {
      const now = "2026-09-20T15:00:00.000Z";
      const value = { ...input, id: input.id ?? `receipt-${entries.size + 1}`, createdAt: now, updatedAt: now } as CalendarEventReceipt;
      entries.set(`${value.workId}:${value.requestId}:${value.provider}`, value);
      return value;
    },
  };
  return { store, latest: () => [...entries.values()].at(-1) };
}

type FixtureAdapter = CalendarAdapter & {
  calls: { create: number; update: number; remove: number; find: number };
  setReadback(mode: "normal" | "missing" | "wrong"): void;
  setReadbackAfterUpdate(value: boolean): void;
  setBusy(value: boolean): void;
  setBusyIntervals(value: Array<{ start: string; end: string; sourceId?: string }>): void;
};

function adapterFixture(options: { provider?: CalendarProvider; loseCreate?: boolean; loseReadback?: boolean; wrongReadback?: boolean; busyConflict?: boolean; availabilityError?: boolean; wrongUpdateIdentity?: boolean; busyIntervals?: Array<{ start: string; end: string; sourceId?: string }> } = {}): FixtureAdapter {
  const calls = { create: 0, update: 0, remove: 0, find: 0 };
  const event = { id: "event-1", title: "Roof inspection", start: reservation.start, end: reservation.end, calendarId: connection.calendarId, timeZone: connection.timeZone, observedAt: "2026-09-20T15:00:00.000Z" };
  let currentEvent = event;
  let deleted = false;
  let readback: "normal" | "missing" | "wrong" = options.loseReadback ? "missing" : options.wrongReadback ? "wrong" : "normal";
  let busy = options.busyConflict ?? false;
  let wrongAfterUpdate = false;
  let busyInterval = options.busyConflict ? { start: reservation.start, end: reservation.end } : { start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" };
  let busyIntervals = options.busyIntervals ?? [];
  return {
    provider: options.provider ?? "outlook",
    calls,
    async listCalendars() { return []; },
    async availability() { if (options.availabilityError) throw new Error("provider availability unavailable"); return { busy: busyIntervals.length ? busyIntervals : busy ? [{ ...busyInterval, sourceId: "other-event" }] : [], observedAt: event.observedAt }; },
    async create() { calls.create += 1; if (options.loseCreate) throw new Error("response lost"); deleted = false; return currentEvent; },
    async findByIdempotencyKey() { calls.find += 1; return calls.create ? currentEvent : null; },
    async get(_credentials, input) {
      if (input.eventId && input.eventId !== currentEvent.id) return null;
      if (readback === "missing" || deleted) return null;
      if (readback === "wrong") return { ...currentEvent, start: "2026-09-20T11:00:00Z", end: "2026-09-20T12:00:00Z" };
      return currentEvent;
    },
    async update(_credentials, input) { calls.update += 1; currentEvent = { ...currentEvent, start: input.start, end: input.end }; if (wrongAfterUpdate) readback = "wrong"; return options.wrongUpdateIdentity ? { ...currentEvent, id: "event-2" } : currentEvent; },
    async remove() { calls.remove += 1; deleted = true; return { id: event.id, observedAt: event.observedAt }; },
    setReadback(mode) { readback = mode; },
    setReadbackAfterUpdate(value) { wrongAfterUpdate = value; },
    setBusy(value) { busy = value; busyInterval = { start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" }; },
    setBusyIntervals(value) { busyIntervals = value; },
  };
}

async function prepared(options: { provider?: CalendarProvider; loseCreate?: boolean; loseReadback?: boolean; wrongReadback?: boolean; busyConflict?: boolean; availabilityError?: boolean; wrongUpdateIdentity?: boolean; hideReceiptReads?: boolean; workspaceExitStopped?: boolean; busyIntervals?: Array<{ start: string; end: string; sourceId?: string }> } = {}) {
  const store = memoryBoundedStore();
  const local = createSchedulingService(store, { workspaceExitCompleted: async () => false });
  const schedule = await local.create(owner, "workspace-a", { title: "Consultations", availability: [interval] });
  await local.command(owner, schedule.id, reservation);
  const adapter = adapterFixture(options);
  const receipts = receiptStore(options.hideReceiptReads);
  let activeConnection = options.provider && options.provider !== connection.provider ? { ...connection, provider: options.provider } : connection;
  const calendar = createCalendarSchedulingService(store, {
    connection: async () => activeConnection,
    adapter: () => adapter,
    receiptStore: receipts.store,
    workspaceExitStopped: async () => options.workspaceExitStopped ?? false,
  });
  return { schedule, calendar, adapter, local, store, receipts, setConnection: (value: typeof connection) => { activeConnection = value; } };
}

describe("workspace calendar scheduling lifecycle", () => {
  it("accepts a reservation after the provider readback and preserves its external id", async () => {
    const { schedule, calendar, adapter, receipts } = await prepared();
    const result = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    expect(result.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1", provider: "outlook", verification: "verified" });
    expect(receipts.latest()).toMatchObject({ status: "verified", externalEventId: "event-1" });
    expect(adapter.calls).toEqual({ create: 1, update: 0, remove: 0, find: 0 });
  });

  it("keeps the accepted event and records failed readback evidence without retrying the create", async () => {
    const { schedule, calendar, adapter, receipts } = await prepared({ loseReadback: true });
    const result = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    expect(result.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1", verification: "failed" });
    expect(receipts.latest()).toMatchObject({ status: "failed", externalEventId: "event-1" });
    expect(adapter.calls.create).toBe(1);
  });

  it("does not verify a provider event whose readback time differs from the reservation", async () => {
    const { schedule, calendar, adapter, receipts } = await prepared({ wrongReadback: true });
    const result = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    expect(result.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1", verification: "failed" });
    expect(receipts.latest()).toMatchObject({ status: "failed", externalEventId: "event-1" });
    expect(adapter.calls.create).toBe(1);
  });

  it("never creates twice after a lost response and recovers only through the stable lookup", async () => {
    const { schedule, calendar, adapter } = await prepared({ loseCreate: true });
    const unresolved = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    expect(unresolved.payload.reservations[0]).toMatchObject({ status: "unknown", syncOperation: "create" });
    const recovered = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    expect(recovered.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1" });
    expect(adapter.calls.create).toBe(1);
    expect(adapter.calls.find).toBe(1);
  });

  it("routes accepted changes and cancellation through the same external event identity", async () => {
    const { schedule, calendar, adapter, receipts } = await prepared();
    let current = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    current = await calendar.reschedule(owner, schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: current.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    expect(current.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1", start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    current = await calendar.cancel(owner, schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: current.payload.revision });
    expect(current.payload.reservations[0]).toMatchObject({ status: "cancelled", providerId: "event-1" });
    expect(receipts.latest()).toMatchObject({ status: "verified", operation: "delete", externalEventId: "event-1" });
    expect(adapter.calls).toEqual({ create: 1, update: 1, remove: 1, find: 0 });
  });

  it("keeps an accepted reschedule unresolved until a matching recovery readback arrives", async () => {
    const { schedule, calendar, adapter } = await prepared();
    let current = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    adapter.setReadbackAfterUpdate(true);
    current = await calendar.reschedule(owner, schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: current.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    expect(current.payload.reservations[0]).toMatchObject({ status: "accepted", verification: "failed", start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    const wrong = await calendar.recover(owner, schedule.id, reservation.requestId, "outlook");
    expect(wrong.payload.reservations[0]).toMatchObject({ status: "accepted", verification: "failed" });
    adapter.setReadback("normal");
    const recovered = await calendar.recover(owner, schedule.id, reservation.requestId, "outlook");
    expect(recovered.payload.reservations[0]).toMatchObject({ status: "accepted", verification: "verified" });
  });

  it("keeps the original external identity when an update response names another event", async () => {
    const { schedule, calendar, adapter, receipts } = await prepared({ wrongUpdateIdentity: true });
    let current = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    current = await calendar.reschedule(owner, schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: current.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    expect(current.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1", verification: "failed" });
    expect(receipts.latest()).toMatchObject({ externalEventId: "event-1", status: "failed" });
    expect(adapter.calls.update).toBe(1);
  });

  it("withholds provider creation when fresh availability is busy and records recovery evidence", async () => {
    const { schedule, calendar, adapter, receipts } = await prepared({ busyConflict: true });
    await expect(calendar.create(owner, schedule.id, reservation.requestId, "outlook")).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    const result = await calendar.read(owner, schedule.id);
    expect(result.payload.reservations[0]).toMatchObject({ status: "reserved", syncError: expect.stringContaining("busy") });
    expect(receipts.latest()).toMatchObject({ status: "failed", operation: "create" });
    expect(adapter.calls.create).toBe(0);
  });

  it("withholds provider creation when availability cannot be confirmed", async () => {
    const { schedule, calendar, adapter, receipts } = await prepared({ availabilityError: true });
    await expect(calendar.create(owner, schedule.id, reservation.requestId, "outlook")).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    const result = await calendar.read(owner, schedule.id);
    expect(result.payload.reservations[0]).toMatchObject({ status: "reserved", syncError: expect.stringContaining("could not be confirmed") });
    expect(receipts.latest()).toMatchObject({ status: "failed", operation: "create" });
    expect(adapter.calls.create).toBe(0);
  });

  it("withholds an external reschedule when the provider reports a concurrent busy interval", async () => {
    const { schedule, calendar, adapter, receipts } = await prepared();
    let current = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    adapter.setBusy(true);
    await expect(calendar.reschedule(owner, schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: current.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" })).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    current = await calendar.read(owner, schedule.id);
    expect(current.payload.reservations[0]).toMatchObject({ status: "accepted", start: reservation.start, end: reservation.end, syncError: expect.stringContaining("busy") });
    expect(receipts.latest()).toMatchObject({ status: "failed", operation: "update", externalEventId: "event-1" });
    expect(adapter.calls.update).toBe(0);
  });

  it("ignores only the current Google event while keeping another overlapping event as a conflict", async () => {
    const { schedule, calendar, adapter } = await prepared({ provider: "google" });
    let current = await calendar.create(owner, schedule.id, reservation.requestId, "google");
    adapter.setBusyIntervals([
      { start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z", sourceId: "event-1" },
      { start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z", sourceId: "other-event" },
    ]);
    await expect(calendar.reschedule(owner, schedule.id, reservation.requestId, { provider: "google", expectedRevision: current.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" })).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    expect(adapter.calls.update).toBe(0);
    adapter.setBusyIntervals([{ start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z", sourceId: "event-1" }]);
    current = await calendar.read(owner, schedule.id);
    current = await calendar.reschedule(owner, schedule.id, reservation.requestId, { provider: "google", expectedRevision: current.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    expect(current.payload.reservations[0]).toMatchObject({ status: "accepted", provider: "google", providerId: "event-1", start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    expect(adapter.calls.update).toBe(1);
  });

  it("refuses recovery after a calendar is rebound away from the receipt target", async () => {
    const { schedule, calendar, setConnection } = await prepared({ loseCreate: true });
    const unresolved = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    expect(unresolved.payload.reservations[0]).toMatchObject({ status: "unknown" });
    setConnection({ ...connection, calendarId: "calendar-2", calendarName: "Other calendar" });
    await expect(calendar.create(owner, schedule.id, reservation.requestId, "outlook")).rejects.toMatchObject({ name: "WorkspaceConflictError" });
  });

  it("does not mutate a provider event when its durable receipt is unavailable", async () => {
    const { schedule, calendar, adapter } = await prepared({ hideReceiptReads: true });
    let current = await calendar.create(owner, schedule.id, reservation.requestId, "outlook");
    await expect(calendar.reschedule(owner, schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: current.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" })).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    current = await calendar.read(owner, schedule.id);
    expect(current.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1" });
    expect(adapter.calls.update).toBe(0);
  });

  it("keeps a stopped workspace from creating or changing provider events while allowing explicit cancellation cleanup", async () => {
    const { schedule, calendar, adapter } = await prepared({ workspaceExitStopped: true });
    await expect(calendar.create(owner, schedule.id, reservation.requestId, "outlook")).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    expect(adapter.calls.create).toBe(0);
    await expect(calendar.reschedule(owner, schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: 1, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" })).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    expect((await calendar.read(owner, schedule.id)).payload.reservations[0]).toMatchObject({ status: "reserved", start: reservation.start });

    const active = await prepared();
    const accepted = await active.calendar.create(owner, active.schedule.id, reservation.requestId, "outlook");
    expect(accepted.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "event-1" });
    const guarded = createCalendarSchedulingService(active.store, {
      connection: async () => connection,
      adapter: () => active.adapter,
      receiptStore: active.receipts.store,
      workspaceExitStopped: async () => true,
    });
    await expect(guarded.reschedule(owner, active.schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: accepted.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" })).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    const cancelled = await guarded.cancel(owner, active.schedule.id, reservation.requestId, { provider: "outlook", expectedRevision: accepted.payload.revision });
    expect(cancelled.payload.reservations[0]).toMatchObject({ status: "cancelled", providerId: "event-1" });
    expect(active.adapter.calls).toMatchObject({ update: 0, remove: 1 });
  });

  it("fails closed before provider creation when exit status cannot be checked", async () => {
    const { schedule, adapter, receipts, store } = await prepared();
    const guarded = createCalendarSchedulingService(store, {
      connection: async () => connection,
      adapter: () => adapter,
      receiptStore: receipts.store,
      workspaceExitCompleted: async () => { throw new Error("database unavailable"); },
    });
    await expect(guarded.create(owner, schedule.id, reservation.requestId, "outlook")).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    expect(adapter.calls.create).toBe(0);
  });

  it("does not begin a provider write when credential refresh fails", async () => {
    const store = memoryBoundedStore();
    const local = createSchedulingService(store, { workspaceExitCompleted: async () => false });
    const schedule = await local.create(owner, "workspace-a", { title: "Refresh failure", availability: [interval] });
    await local.command(owner, schedule.id, reservation);
    const adapter = adapterFixture();
    const receipts = receiptStore();
    const calendar = createCalendarSchedulingService(store, {
      connection: async () => { throw new CalendarProviderError({ provider: "outlook", message: "Calendar authorization has expired. Reconnect the calendar.", code: "unauthorized" }); },
      adapter: () => adapter,
      receiptStore: receipts.store,
    });
    await expect(calendar.create(owner, schedule.id, reservation.requestId, "outlook")).rejects.toMatchObject({ code: "unauthorized" });
    expect(adapter.calls).toEqual({ create: 0, update: 0, remove: 0, find: 0 });
  });
});
