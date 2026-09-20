import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { advance, boundedStore, readBounded, type BoundedStore } from "@/platform/bounded-work/repository";
import { WorkspaceConflictError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";
import { calendarAvailabilityQuerySchema, calendarProviderSchema, calendarReminderPolicySchema, reservationSchema, scheduleCommandSchema, scheduleSchema } from "../contracts";
import { CalendarProviderError, createCalendarAdapter, type CalendarAdapter } from "./adapters";
import { createFixtureCalendarAdapter } from "./fixture";
import type { CalendarEvent } from "./contracts";
import {
  getWorkspaceCalendarConnection,
  readCalendarEventReceipt,
  saveCalendarEventReceipt,
  type CalendarEventReceipt,
} from "./repository";

type Schedule = z.infer<typeof scheduleSchema>;
type Reservation = z.infer<typeof reservationSchema>;
type ScheduleWork = SavedWork & { payload: Schedule };
type Connection = Awaited<ReturnType<typeof getWorkspaceCalendarConnection>>;
type ReadyConnection = NonNullable<Connection> & { accessToken: string };

export interface CalendarReceiptStore {
  read(actor: WorkspaceActor, workspaceId: string, workId: string, requestId: string, provider: "outlook" | "google"): Promise<CalendarEventReceipt | null>;
  save(actor: WorkspaceActor, receipt: Omit<CalendarEventReceipt, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<CalendarEventReceipt>;
}

export interface CalendarSchedulingDeps {
  connection?: (actor: WorkspaceActor, workspaceId: string, provider: "outlook" | "google") => Promise<Connection>;
  receiptStore?: CalendarReceiptStore;
  adapter?: (provider: "outlook" | "google") => CalendarAdapter;
  workspaceExitCompleted?: (workspaceId: string) => Promise<boolean>;
  /** @deprecated Use workspaceExitCompleted. Kept for injected callers during the exit migration. */
  workspaceExitStopped?: (workspaceId: string) => Promise<boolean>;
}

const defaultReceiptStore: CalendarReceiptStore = { read: readCalendarEventReceipt, save: saveCalendarEventReceipt };

async function readWorkspaceExitFlag(workspaceId: string, rpcName: "workspace_exit_completed" | "workspace_exit_resources_stopped"): Promise<boolean> {
  if (!z.string().uuid().safeParse(workspaceId).success) {
    throw new WorkspaceConflictError("Workspace exit status could not be checked before the calendar change.");
  }
  const db = getSupabase() as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  } | null;
  if (!db) throw new WorkspaceConflictError("Workspace exit status is unavailable. Retry before changing the calendar.");
  try {
    const result = await db.rpc(rpcName, { p_workspace_id: workspaceId });
    if (result.error || typeof result.data !== "boolean") throw new Error("workspace exit status unavailable");
    return result.data;
  } catch {
    throw new WorkspaceConflictError("Workspace exit status is unavailable. Retry before changing the calendar.");
  }
}

export function readWorkspaceExitCompleted(workspaceId: string): Promise<boolean> {
  return readWorkspaceExitFlag(workspaceId, "workspace_exit_completed");
}

/** Explicit user action only: provider calendar discovery never runs on a
 * workspace read and never returns credentials. */
export async function listWorkspaceProviderCalendars(actor: WorkspaceActor, workspaceId: string, providerValue: unknown) {
  const provider = parseProvider(providerValue);
  const bound = await getWorkspaceCalendarConnection(actor, workspaceId, provider);
  connectionReady(bound);
  const adapter = environmentAdapter(provider);
  return adapter.listCalendars(bound);
}

/** Provider busy intervals are advisory evidence layered over local availability. */
export async function readWorkspaceProviderAvailability(actor: WorkspaceActor, workspaceId: string, providerValue: unknown, query: { start: string; end: string; timeZone?: string }) {
  const provider = parseProvider(providerValue);
  const bound = await getWorkspaceCalendarConnection(actor, workspaceId, provider);
  connectionReady(bound);
  const input = calendarAvailabilityQuerySchema.parse({ calendarId: bound.calendarId, start: query.start, end: query.end, timeZone: query.timeZone || bound.timeZone });
  const adapter = environmentAdapter(provider);
  return { provider, timeZone: input.timeZone, ...(await adapter.availability(bound, input)) };
}

function parseProvider(value: unknown): "outlook" | "google" {
  return calendarProviderSchema.parse(value);
}

function environmentAdapter(provider: "outlook" | "google"): CalendarAdapter {
  return process.env.STRELVA_CALENDAR_FIXTURE === "1" ? createFixtureCalendarAdapter(provider) : createCalendarAdapter(provider);
}

function isoEqual(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function reservationInterval(value: Reservation, start?: string, end?: string): { start: string; end: string } {
  return {
    start: start ?? value.pendingStart ?? value.start,
    end: end ?? value.pendingEnd ?? value.end,
  };
}

function matchesReservationEvent(
  event: CalendarEvent,
  reservationValue: Reservation,
  connection: NonNullable<Connection>,
  expected: { eventId?: string; start?: string; end?: string } = {},
): boolean {
  const interval = reservationInterval(reservationValue, expected.start, expected.end);
  return event.calendarId === connection.calendarId
    && event.title === reservationValue.title
    && (!expected.eventId || event.id === expected.eventId)
    && isoEqual(event.start, interval.start)
    && isoEqual(event.end, interval.end);
}

function assertReceiptCalendar(receipt: CalendarEventReceipt | null, connection: NonNullable<Connection>, required = false): void {
  if (!receipt && required) {
    throw new WorkspaceConflictError("This reservation has no calendar receipt. Reconnect and recover it before changing the provider event.");
  }
  if (receipt && receipt.calendarId !== connection.calendarId) {
    throw new WorkspaceConflictError("Reconnect the original calendar before recovering this reservation.");
  }
}

function connectionReady(connection: Connection): asserts connection is ReadyConnection {
  if (!connection || connection.status === "revoked" || connection.status === "error" || !connection.accessToken || connection.calendarId === "pending") {
    throw new WorkspaceConflictError("Connect and choose a calendar before syncing this reservation.");
  }
}

function assertReservationProvider(reservation: Reservation, provider: "outlook" | "google"): void {
  if (reservation.provider && reservation.provider !== provider) throw new WorkspaceConflictError("This reservation is bound to another calendar provider.");
}

function reminder(connection: NonNullable<Connection>) {
  return calendarReminderPolicySchema.parse(connection.reminderPolicy);
}

function eventInput(connection: NonNullable<Connection>, reservation: Reservation, idempotencyKey: string, eventId?: string) {
  return {
    calendarId: connection.calendarId,
    title: reservation.title,
    start: reservation.pendingStart ?? reservation.start,
    end: reservation.pendingEnd ?? reservation.end,
    timeZone: connection.timeZone,
    idempotencyKey,
    ...(eventId ? { eventId } : {}),
    reminderPolicy: reminder(connection),
  };
}

function receiptFor(input: {
  work: ScheduleWork;
  reservation: Reservation;
  connection: NonNullable<Connection>;
  idempotencyKey: string;
  operation: "create" | "update" | "delete";
  status: CalendarEventReceipt["status"];
  externalEventId?: string;
  lastError?: string;
  observedAt?: string;
}): Omit<CalendarEventReceipt, "id" | "createdAt" | "updatedAt"> {
  return {
    workspaceId: input.work.workspaceId,
    workId: input.work.id,
    requestId: input.reservation.requestId,
    provider: input.connection.provider,
    calendarId: input.connection.calendarId,
    idempotencyKey: input.idempotencyKey,
    externalEventId: input.externalEventId,
    operation: input.operation,
    status: input.status,
    revision: input.work.payload.revision,
    title: input.reservation.title,
    start: input.reservation.pendingStart ?? input.reservation.start,
    end: input.reservation.pendingEnd ?? input.reservation.end,
    timeZone: input.connection.timeZone,
    reminderPolicy: reminder(input.connection),
    lastError: input.lastError,
    attemptedAt: new Date().toISOString(),
    observedAt: input.observedAt,
  };
}

export function createCalendarSchedulingService(store: BoundedStore = boundedStore, dependencies: CalendarSchedulingDeps = {}) {
  const connection = dependencies.connection ?? getWorkspaceCalendarConnection;
  const receipts = dependencies.receiptStore ?? defaultReceiptStore;
  const adapterFor = dependencies.adapter ?? createCalendarAdapter;
  const workspaceExitCompleted = dependencies.workspaceExitCompleted ?? dependencies.workspaceExitStopped ?? readWorkspaceExitCompleted;
  const read = (actor: WorkspaceActor, id: string) => readBounded(store, actor, id, "scheduling", scheduleSchema);

  async function assertProviderWriteAllowed(workspaceId: string, allowExistingCancellation = false) {
    if (allowExistingCancellation) return;
    let exited = false;
    try {
      exited = await workspaceExitCompleted(workspaceId);
    } catch (error) {
      if (error instanceof WorkspaceConflictError) throw error;
      throw new WorkspaceConflictError("Workspace exit status is unavailable. Retry before changing the calendar.");
    }
    if (exited) {
      throw new WorkspaceConflictError("Calendar sync is stopped for this workspace. The existing reservation remains available for review.");
    }
  }

  async function save(actor: WorkspaceActor, work: ScheduleWork, payload: Schedule) {
    const saved = await store.update(actor, work, work.payload.revision, scheduleSchema.parse(payload));
    return { ...saved, payload: scheduleSchema.parse(saved.payload) };
  }

  function reservation(work: ScheduleWork, requestId: string): Reservation {
    const value = work.payload.reservations.find(item => item.requestId === requestId);
    if (!value) throw new WorkspaceConflictError("Reservation not found.");
    return value;
  }

  function assertTargetAvailable(schedule: Schedule, requestId: string, start: string, end: string) {
    const startMs = Date.parse(start), endMs = Date.parse(end);
    if (!schedule.availability.some(slot => Date.parse(slot.start) <= startMs && Date.parse(slot.end) >= endMs)) throw new WorkspaceConflictError("That time is outside permitted availability.");
    if (schedule.reservations.some(item => item.requestId !== requestId && item.status !== "cancelled" && Date.parse(item.start) < endMs && Date.parse(item.end) > startMs)) throw new WorkspaceConflictError("That time conflicts with another reservation.");
  }

  async function providerAvailabilityFailure(
    adapter: CalendarAdapter,
    bound: ReadyConnection,
    start: string,
    end: string,
    ignoredEventId?: string,
  ): Promise<string | null> {
    try {
      const result = await adapter.availability(bound, {
        calendarId: bound.calendarId,
        start,
        end,
        timeZone: bound.timeZone,
        ...(ignoredEventId ? { ignoredEventId } : {}),
      });
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      const conflict = result.busy.some(item => {
        if (ignoredEventId && item.sourceId === ignoredEventId) return false;
        return Date.parse(item.start) < endMs && Date.parse(item.end) > startMs;
      });
      return conflict
        ? "The selected provider calendar is busy during this time. Review availability before trying again."
        : null;
    } catch (error) {
      return error instanceof CalendarProviderError
        ? error.message
        : "The provider calendar availability could not be confirmed. Retry after checking the calendar.";
    }
  }

  async function recordAvailabilityFailure(
    actor: WorkspaceActor,
    work: ScheduleWork,
    requestId: string,
    connectionValue: ReadyConnection,
    idempotencyKey: string,
    operation: "create" | "update",
    message: string,
    attemptedStart: string,
    attemptedEnd: string,
    externalEventId?: string,
  ): Promise<ScheduleWork> {
    const current = reservation(work, requestId);
    const next = advance(work.payload, work.payload.revision, "provider_availability_conflict", actor);
    next.reservations = next.reservations.map(item => item.requestId === requestId
      ? { ...current, syncError: message.slice(0, 1000) }
      : item);
    const saved = await save(actor, work, next);
    await receipts.save(actor, receiptFor({
      work: saved,
      reservation: { ...current, pendingStart: attemptedStart, pendingEnd: attemptedEnd },
      connection: connectionValue,
      idempotencyKey,
      operation,
      status: "failed",
      externalEventId,
      lastError: message,
    }));
    return saved;
  }

  async function finalize(actor: WorkspaceActor, work: ScheduleWork, requestId: string, update: Partial<Reservation> & { status: Reservation["status"] }) {
    const current = reservation(work, requestId);
    const next = advance(work.payload, work.payload.revision, "provider_reconciled", actor);
    next.reservations = next.reservations.map(item => item.requestId === requestId ? { ...current, ...update } : item);
    return save(actor, work, next);
  }

  async function markUnknown(actor: WorkspaceActor, work: ScheduleWork, requestId: string, operation: "create" | "update" | "delete", error: unknown) {
    const current = reservation(work, requestId);
    const message = error instanceof Error ? error.message : "The provider did not confirm this change.";
    const next = advance(work.payload, work.payload.revision, "provider_unknown", actor);
    next.reservations = next.reservations.map(item => item.requestId === requestId ? {
      ...current,
      status: "unknown" as const,
      syncOperation: operation,
      syncError: message.slice(0, 1000),
    } : item);
    return save(actor, work, next);
  }

  async function recover(actor: WorkspaceActor, workId: string, requestId: string, provider: "outlook" | "google") {
    let work = await read(actor, workId);
    const current = reservation(work, requestId);
    assertReservationProvider(current, provider);
    const readbackRecovery = (current.status === "accepted" || current.status === "cancelled") && current.verification === "failed";
    if (current.status !== "unknown" && current.status !== "writing" && !readbackRecovery) return work;
    const bound = await connection(actor, work.workspaceId, provider);
    connectionReady(bound);
    const adapter = adapterFor(provider);
    const key = `schedule:${work.workspaceId}:${work.id}:${requestId}`;
    const receipt = await receipts.read(actor, work.workspaceId, work.id, requestId, provider);
    assertReceiptCalendar(receipt, bound, Boolean(current.providerId));
    const event = current.providerId
      ? await adapter.get(bound, { calendarId: bound.calendarId, eventId: current.providerId })
      : await adapter.findByIdempotencyKey(bound, { calendarId: bound.calendarId, idempotencyKey: key, timeZone: bound.timeZone });
    if (current.syncOperation === "delete") {
      if (!event) {
        work = await finalize(actor, work, requestId, { status: "cancelled", syncOperation: undefined, syncError: undefined, pendingStart: undefined, pendingEnd: undefined, verification: "verified" });
        if (receipt) await receipts.save(actor, { ...receipt, status: "verified", lastError: undefined, observedAt: new Date().toISOString() });
      }
      return work;
    }
    if (readbackRecovery && current.status === "cancelled") {
      if (event) return work;
      work = await finalize(actor, work, requestId, { status: "cancelled", provider, verification: "verified", syncError: undefined });
      if (receipt) await receipts.save(actor, { ...receipt, status: "verified", lastError: undefined, observedAt: new Date().toISOString() });
      return work;
    }
    if (!event) return work;
    if (readbackRecovery) {
      if (!matchesReservationEvent(event, current, bound, { eventId: current.providerId })) return work;
      work = await finalize(actor, work, requestId, { status: current.status, providerId: event.id, provider, verification: "verified", syncError: undefined });
      if (receipt) await receipts.save(actor, { ...receipt, status: "verified", externalEventId: event.id, lastError: undefined, observedAt: event.observedAt });
      return work;
    }
    if (!matchesReservationEvent(event, current, bound, { eventId: current.providerId })) return work;
    work = await finalize(actor, work, requestId, {
      status: "accepted", providerId: event.id, provider, verification: "verified",
      ...(current.pendingStart && current.pendingEnd ? { start: current.pendingStart, end: current.pendingEnd } : {}),
      syncOperation: undefined, syncError: undefined, pendingStart: undefined, pendingEnd: undefined,
    });
    if (receipt) await receipts.save(actor, { ...receipt, status: "verified", externalEventId: event.id, lastError: undefined, observedAt: event.observedAt });
    return work;
  }

  async function create(actor: WorkspaceActor, workId: string, requestId: string, providerValue: unknown) {
    let work = await read(actor, workId);
    const current = reservation(work, requestId);
    const provider = parseProvider(providerValue);
    assertReservationProvider(current, provider);
    if (current.status === "accepted") return work;
    const bound = await connection(actor, work.workspaceId, provider);
    connectionReady(bound);
    const adapter = adapterFor(provider);
    const key = `schedule:${work.workspaceId}:${work.id}:${requestId}`;
    if (current.status === "unknown" || current.status === "writing") return recover(actor, workId, requestId, provider);
    if (current.status !== "reserved") throw new WorkspaceConflictError("Reservation is not available for calendar sync.");
    await assertProviderWriteAllowed(work.workspaceId);
    const availabilityFailure = await providerAvailabilityFailure(adapter, bound, current.start, current.end);
    if (availabilityFailure) {
      await recordAvailabilityFailure(actor, work, requestId, bound, key, "create", availabilityFailure, current.start, current.end);
      throw new WorkspaceConflictError(availabilityFailure);
    }
    work = await save(actor, work, { ...advance(work.payload, work.payload.revision, "provider_claim", actor), reservations: work.payload.reservations.map(item => item.requestId === requestId ? { ...current, status: "writing" as const, provider, syncOperation: "create" as const, syncError: undefined } : item) });
    await receipts.save(actor, receiptFor({ work, reservation: current, connection: bound, idempotencyKey: key, operation: "create", status: "writing" }));
    try {
      const event = await adapter.create(bound, eventInput(bound, current, key));
      const acceptedReceipt = await receipts.save(actor, receiptFor({ work, reservation: current, connection: bound, idempotencyKey: key, operation: "create", status: "accepted", externalEventId: event.id, observedAt: event.observedAt }));
      let verified = true;
      let verificationError: unknown;
      try {
        const observed = await adapter.get(bound, { calendarId: bound.calendarId, eventId: event.id });
        verified = Boolean(observed && matchesReservationEvent(observed, current, bound, { eventId: event.id }));
      } catch (error) {
        verified = false;
        verificationError = error;
      }
      await receipts.save(actor, {
        ...acceptedReceipt,
        status: verified ? "verified" : "failed",
        lastError: verified ? undefined : verificationError instanceof Error ? verificationError.message : "The provider accepted the event but readback did not confirm it.",
        observedAt: event.observedAt,
      });
      work = await finalize(actor, work, requestId, { status: "accepted", providerId: event.id, provider, verification: verified ? "verified" : "failed", syncOperation: undefined, syncError: undefined });
      return work;
    } catch (error) {
      await receipts.save(actor, receiptFor({ work, reservation: current, connection: bound, idempotencyKey: key, operation: "create", status: "unknown", lastError: error instanceof Error ? error.message : "Provider response was lost." }));
      return markUnknown(actor, work, requestId, "create", error);
    }
  }

  async function reschedule(actor: WorkspaceActor, workId: string, requestId: string, input: { provider: unknown; expectedRevision: number; start: string; end: string }) {
    let work = await read(actor, workId);
    const current = reservation(work, requestId);
    const provider = parseProvider(input.provider);
    assertReservationProvider(current, provider);
    if (current.status === "reserved") {
      const command = scheduleCommandSchema.parse({ kind: "reschedule", expectedRevision: input.expectedRevision, requestId, start: input.start, end: input.end });
      await assertProviderWriteAllowed(work.workspaceId);
      return changeLocal(actor, work, command);
    }
    if (current.status === "unknown" || current.status === "writing") return recover(actor, workId, requestId, provider);
    if (current.status !== "accepted" || !current.providerId) throw new WorkspaceConflictError("The provider reservation needs recovery before it can change.");
    if (work.payload.revision !== input.expectedRevision) throw new WorkspaceConflictError("This work changed. Reload before trying again.");
    await assertProviderWriteAllowed(work.workspaceId);
    assertTargetAvailable(work.payload, requestId, input.start, input.end);
    const bound = await connection(actor, work.workspaceId, provider);
    connectionReady(bound);
    const adapter = adapterFor(provider);
    const targetReceipt = await receipts.read(actor, work.workspaceId, work.id, requestId, provider);
    assertReceiptCalendar(targetReceipt, bound, true);
    const providerEvent = await adapter.get(bound, { calendarId: bound.calendarId, eventId: current.providerId });
    if (!providerEvent) throw new WorkspaceConflictError("The provider reservation no longer exists. Refresh before changing it.");
    if (!matchesReservationEvent(providerEvent, current, bound, { eventId: current.providerId })) throw new WorkspaceConflictError("The provider reservation changed elsewhere. Review its current details before changing it.");
    const key = `schedule:${work.workspaceId}:${work.id}:${requestId}:update:${input.expectedRevision + 1}`;
    const availabilityFailure = await providerAvailabilityFailure(adapter, bound, input.start, input.end, current.providerId);
    if (availabilityFailure) {
      await recordAvailabilityFailure(actor, work, requestId, bound, key, "update", availabilityFailure, input.start, input.end, current.providerId);
      throw new WorkspaceConflictError(availabilityFailure);
    }
    const pending = { ...current, status: "writing" as const, provider, syncOperation: "update" as const, pendingStart: input.start, pendingEnd: input.end, syncError: undefined };
    const next = advance(work.payload, input.expectedRevision, "provider_update_claim", actor);
    next.reservations = next.reservations.map(item => item.requestId === requestId ? pending : item);
    work = await save(actor, work, next);
    await receipts.save(actor, receiptFor({ work, reservation: pending, connection: bound, idempotencyKey: key, operation: "update", status: "writing", externalEventId: current.providerId }));
    try {
      const updateInput = {
        ...eventInput(bound, { ...current, start: input.start, end: input.end, pendingStart: undefined, pendingEnd: undefined }, key, current.providerId),
        eventId: current.providerId,
        ...(providerEvent.versionTag ? { versionTag: providerEvent.versionTag } : {}),
      } as Parameters<CalendarAdapter["update"]>[1];
      const event = await adapter.update(bound, updateInput);
      const acceptedReceipt = await receipts.save(actor, receiptFor({ work, reservation: pending, connection: bound, idempotencyKey: key, operation: "update", status: "accepted", externalEventId: current.providerId, observedAt: event.observedAt }));
      let verified = false;
      let verificationError: unknown;
      try {
        const observed = await adapter.get(bound, { calendarId: bound.calendarId, eventId: event.id });
        verified = Boolean(observed && matchesReservationEvent(observed, pending, bound, { eventId: current.providerId, start: input.start, end: input.end }));
      } catch (error) {
        verificationError = error;
      }
      await receipts.save(actor, {
        ...acceptedReceipt,
        status: verified ? "verified" : "failed",
        lastError: verified ? undefined : verificationError instanceof Error ? verificationError.message : "The provider accepted the change but readback did not confirm it.",
        observedAt: event.observedAt,
      });
      work = await finalize(actor, work, requestId, { status: "accepted", providerId: current.providerId, provider, start: input.start, end: input.end, verification: verified ? "verified" : "failed", syncOperation: undefined, pendingStart: undefined, pendingEnd: undefined, syncError: undefined });
      return work;
    } catch (error) {
      await receipts.save(actor, receiptFor({ work, reservation: pending, connection: bound, idempotencyKey: key, operation: "update", status: "unknown", externalEventId: current.providerId, lastError: error instanceof Error ? error.message : "Provider response was lost." }));
      return markUnknown(actor, work, requestId, "update", error);
    }
  }

  async function cancel(actor: WorkspaceActor, workId: string, requestId: string, input: { provider: unknown; expectedRevision: number }) {
    let work = await read(actor, workId);
    const current = reservation(work, requestId);
    const provider = parseProvider(input.provider);
    assertReservationProvider(current, provider);
    if (current.status === "reserved") return changeLocal(actor, work, scheduleCommandSchema.parse({ kind: "cancel", expectedRevision: input.expectedRevision, requestId }));
    if (current.status === "unknown" || current.status === "writing") return recover(actor, workId, requestId, provider);
    if (current.status !== "accepted" || !current.providerId) throw new WorkspaceConflictError("The provider reservation needs recovery before it can be cancelled.");
    if (work.payload.revision !== input.expectedRevision) throw new WorkspaceConflictError("This work changed. Reload before trying again.");
    await assertProviderWriteAllowed(work.workspaceId, true);
    const bound = await connection(actor, work.workspaceId, provider);
    connectionReady(bound);
    const adapter = adapterFor(provider);
    const targetReceipt = await receipts.read(actor, work.workspaceId, work.id, requestId, provider);
    assertReceiptCalendar(targetReceipt, bound, true);
    const providerEvent = await adapter.get(bound, { calendarId: bound.calendarId, eventId: current.providerId });
    if (!providerEvent) throw new WorkspaceConflictError("The provider reservation no longer exists. Refresh before cancelling it.");
    if (!matchesReservationEvent(providerEvent, current, bound, { eventId: current.providerId })) throw new WorkspaceConflictError("The provider reservation changed elsewhere. Review its current details before cancelling it.");
    const key = `schedule:${work.workspaceId}:${work.id}:${requestId}:delete:${input.expectedRevision + 1}`;
    const pending = { ...current, status: "writing" as const, provider, syncOperation: "delete" as const, syncError: undefined };
    const next = advance(work.payload, input.expectedRevision, "provider_delete_claim", actor);
    next.reservations = next.reservations.map(item => item.requestId === requestId ? pending : item);
    work = await save(actor, work, next);
    await receipts.save(actor, receiptFor({ work, reservation: pending, connection: bound, idempotencyKey: key, operation: "delete", status: "writing", externalEventId: current.providerId }));
    try {
      const result = await adapter.remove(bound, { calendarId: bound.calendarId, eventId: current.providerId, ...(providerEvent.versionTag ? { versionTag: providerEvent.versionTag } : {}) });
      const acceptedReceipt = await receipts.save(actor, receiptFor({ work, reservation: pending, connection: bound, idempotencyKey: key, operation: "delete", status: "accepted", externalEventId: current.providerId, observedAt: result.observedAt }));
      let verified = false;
      let verificationError: unknown;
      try {
        verified = (await adapter.get(bound, { calendarId: bound.calendarId, eventId: current.providerId })) === null;
      } catch (error) {
        verificationError = error;
      }
      await receipts.save(actor, {
        ...acceptedReceipt,
        status: verified ? "verified" : "failed",
        lastError: verified ? undefined : verificationError instanceof Error ? verificationError.message : "The provider accepted the cancellation but readback did not confirm it.",
        observedAt: result.observedAt,
      });
      work = await finalize(actor, work, requestId, { status: "cancelled", providerId: current.providerId, provider, verification: verified ? "verified" : "failed", syncOperation: undefined, syncError: undefined });
      return work;
    } catch (error) {
      await receipts.save(actor, receiptFor({ work, reservation: pending, connection: bound, idempotencyKey: key, operation: "delete", status: "unknown", externalEventId: current.providerId, lastError: error instanceof Error ? error.message : "Provider response was lost." }));
      return markUnknown(actor, work, requestId, "delete", error);
    }
  }

  async function changeLocal(actor: WorkspaceActor, work: ScheduleWork, command: z.infer<typeof scheduleCommandSchema>) {
    const current = work.payload.reservations.find(item => item.requestId === command.requestId);
    if (!current) throw new WorkspaceConflictError("Reservation not found.");
    const next = advance(work.payload, command.expectedRevision, command.kind, actor);
    if (command.kind === "reschedule") {
      assertTargetAvailable(next, command.requestId, command.start, command.end);
      next.reservations = next.reservations.map(item => item.requestId === command.requestId ? { ...item, start: command.start, end: command.end, status: "reserved" as const } : item);
    } else {
      next.reservations = next.reservations.map(item => item.requestId === command.requestId ? { ...item, status: "cancelled" as const } : item);
    }
    return save(actor, work, next);
  }

  return { create, reschedule, cancel, recover, read };
}
