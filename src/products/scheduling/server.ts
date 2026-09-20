import { z } from "zod";
import { scheduleSchema, scheduleCommandSchema, reservationSchema, createScheduleSchema } from "./contracts";
export { scheduleSchema, scheduleCommandSchema } from "./contracts";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { advance, boundedStore, initial, readBounded, type BoundedStore } from "@/platform/bounded-work/repository";
import { createCalendarSchedulingService } from "./calendar/service";
import { readWorkspaceExitCompleted } from "./calendar/service";
import { createCalendarAdapter } from "./calendar/adapters";
import { createFixtureCalendarAdapter } from "./calendar/fixture";
type Reservation = z.infer<typeof reservationSchema>;
export interface SchedulingProvider {
  /** Must use the provider's idempotency mechanism with the supplied stable key. */
  reserve(reservation: Reservation, idempotencyKey: string): Promise<{ providerId: string }>;
  find(idempotencyKey: string): Promise<{ providerId: string } | null>;
  verify(providerId: string): Promise<boolean>;
  /** Supplied by the governed provider integration, never by browser input. */
  authorize(actor: WorkspaceActor, workspaceId: string, workId: string, reservation: Reservation): Promise<void>;
}
export interface SchedulingServiceDeps {
  workspaceExitCompleted?: (workspaceId: string) => Promise<boolean>;
}
export function createSchedulingService(store: BoundedStore = boundedStore, dependencies: SchedulingServiceDeps = {}) {
  const workspaceExitCompleted = dependencies.workspaceExitCompleted ?? readWorkspaceExitCompleted;
  const read = (actor: WorkspaceActor, id: string) => readBounded(store, actor, id, "scheduling", scheduleSchema);
  async function save(actor: WorkspaceActor, work: Awaited<ReturnType<typeof read>>, payload: z.infer<typeof scheduleSchema>) {
    const saved = await store.update(actor, work, work.payload.revision, scheduleSchema.parse(payload));
    return { ...saved, payload: scheduleSchema.parse(saved.payload) };
  }
  return {
    read,
    async create(actor: WorkspaceActor, workspaceId: string, raw: unknown) {
      await store.member(actor, workspaceId); const input = createScheduleSchema.parse(raw);
      const payload = scheduleSchema.parse({ ...initial(input.title, actor), availability: input.availability, reservations: [] });
      const saved = await store.create(actor, workspaceId, { productId: "scheduling", resourceKind: "schedule", title: input.title, payload });
      return { ...saved, payload: scheduleSchema.parse(saved.payload) };
    },
    async command(actor: WorkspaceActor, id: string, raw: unknown) {
      const work = await read(actor, id); await store.member(actor, work.workspaceId); const command = scheduleCommandSchema.parse(raw);
      const prior = work.payload.reservations.find(value => value.requestId === command.requestId);
      if (command.kind === "reserve" && prior) {
        if (prior.start !== command.start || prior.end !== command.end || prior.title !== command.title) throw new WorkspaceConflictError("This request identifier belongs to a different reservation.");
        return work;
      }
      if (command.kind === "cancel" && prior) {
        if (prior.status === "cancelled") return work;
        if (prior.status !== "reserved") throw new WorkspaceConflictError("A provider reservation needs governed provider cancellation or reconciliation.");
      }
      if ((command.kind === "reserve" || command.kind === "reschedule") && await workspaceExitCompleted(work.workspaceId)) {
        throw new WorkspaceConflictError("New scheduling work is stopped for this workspace. Existing reservations remain available for review.");
      }
      if (command.kind === "reschedule") {
        if (!prior) throw new WorkspaceConflictError("Reservation not found.");
        if (prior.status === "reserved" && prior.start === command.start && prior.end === command.end) return work;
        if (prior.status === "cancelled") throw new WorkspaceConflictError("A cancelled reservation cannot be rescheduled.");
        if (prior.status !== "reserved") throw new WorkspaceConflictError("A provider reservation needs governed provider rescheduling or reconciliation.");
      }
      const next = advance(work.payload, command.expectedRevision, command.kind, actor);
      if (command.kind === "reserve") {
        const start = Date.parse(command.start), end = Date.parse(command.end);
        if (!next.availability.some(slot => Date.parse(slot.start) <= start && Date.parse(slot.end) >= end)) throw new WorkspaceConflictError("That time is outside permitted availability.");
        if (next.reservations.some(value => value.status !== "cancelled" && Date.parse(value.start) < end && Date.parse(value.end) > start)) throw new WorkspaceConflictError("That time conflicts with another reservation.");
        next.reservations = [...next.reservations, reservationSchema.parse({ ...command, status: "reserved" })];
      } else if (command.kind === "reschedule") {
        const start = Date.parse(command.start), end = Date.parse(command.end);
        if (!next.availability.some(slot => Date.parse(slot.start) <= start && Date.parse(slot.end) >= end)) throw new WorkspaceConflictError("That time is outside permitted availability.");
        if (next.reservations.some(value => value.requestId !== command.requestId && value.status !== "cancelled" && Date.parse(value.start) < end && Date.parse(value.end) > start)) throw new WorkspaceConflictError("That time conflicts with another reservation.");
        next.reservations = next.reservations.map(value => value.requestId === command.requestId ? reservationSchema.parse({ ...value, start: command.start, end: command.end, status: "reserved" }) : value);
      } else {
        if (!prior) throw new WorkspaceConflictError("Reservation not found.");
        if (prior.status !== "reserved") throw new WorkspaceConflictError("A provider reservation needs governed provider cancellation or reconciliation.");
        next.reservations = next.reservations.map(value => value.requestId === command.requestId ? { ...value, status: "cancelled" as const } : value);
      }
      return save(actor, work, next);
    },
    /** An injected governed adapter is required. No production provider is implicitly available. */
    async deliver(actor: WorkspaceActor, id: string, requestId: string, provider: SchedulingProvider) {
      let work = await read(actor, id); await store.member(actor, work.workspaceId);
      let reservation = work.payload.reservations.find(value => value.requestId === requestId);
      if (!reservation || reservation.status === "cancelled") throw new WorkspaceConflictError("Reservation unavailable.");
      if (reservation.status === "reserved" && await workspaceExitCompleted(work.workspaceId)) {
        throw new WorkspaceConflictError("New calendar provider work is stopped for this workspace. The reservation remains available for review.");
      }
      await provider.authorize(actor, work.workspaceId, id, reservation);
      const key = `schedule:${work.workspaceId}:${id}:${requestId}`;
      if (reservation.status === "reserved") {
        work = await save(actor, work, { ...advance(work.payload, work.payload.revision, "provider_claim", actor), reservations: work.payload.reservations.map(value => value.requestId === requestId ? { ...value, status: "writing" as const } : value) });
        await store.member(actor, work.workspaceId);
        await provider.authorize(actor, work.workspaceId, id, reservation);
        try {
          const accepted = await provider.reserve(reservation, key);
          work = await save(actor, work, { ...advance(work.payload, work.payload.revision, "provider_accepted", actor), reservations: work.payload.reservations.map(value => value.requestId === requestId ? { ...value, status: "accepted" as const, providerId: z.string().min(1).parse(accepted.providerId), verification: "pending" as const } : value) });
        } catch {
          // An interrupted write remains closed. Re-entry only looks up the stable provider key.
          const latest = await read(actor, id);
          if (latest.payload.reservations.find(value => value.requestId === requestId)?.status === "writing") {
            work = await save(actor, latest, { ...advance(latest.payload, latest.payload.revision, "provider_unknown", actor), reservations: latest.payload.reservations.map(value => value.requestId === requestId ? { ...value, status: "unknown" as const } : value) });
          } else work = latest;
          return work;
        }
      } else if (reservation.status === "writing" || reservation.status === "unknown") {
        const accepted = await provider.find(key);
        if (!accepted) return work; // Absence is not proof that retrying a non-idempotent write is safe.
        work = await save(actor, work, { ...advance(work.payload, work.payload.revision, "provider_reconciled", actor), reservations: work.payload.reservations.map(value => value.requestId === requestId ? { ...value, status: "accepted" as const, providerId: accepted.providerId, verification: "pending" as const } : value) });
      }
      reservation = work.payload.reservations.find(value => value.requestId === requestId)!;
      if (reservation.status === "accepted" && reservation.providerId && reservation.verification !== "verified") {
        let verified = false;
        try { verified = await provider.verify(reservation.providerId); } catch { /* Separate evidence, never reopen accepted write. */ }
        work = await save(actor, work, { ...advance(work.payload, work.payload.revision, "provider_verified", actor), reservations: work.payload.reservations.map(value => value.requestId === requestId ? { ...value, verification: verified ? "verified" as const : "failed" as const } : value) });
      }
      return work;
    },
  };
}
export const { create: createWorkspaceSchedule, read: readWorkspaceSchedule, command: changeWorkspaceSchedule } = createSchedulingService();

// Routes consume scheduling through this product entry point. Keeping the
// provider and connection implementations behind the entry avoids coupling
// unrelated route modules to calendar internals.
export {
  configureWorkspaceCalendarConnection,
  assertWorkspaceCalendarManager,
  assertWorkspaceCalendarWriteAllowed,
  getWorkspaceCalendarConnection,
  listWorkspaceCalendarConnections,
  markWorkspaceCalendarConnectionError,
  readCalendarEventReceipt,
  revokeWorkspaceCalendarConnection,
  saveCalendarEventReceipt,
  saveWorkspaceCalendarConnection,
} from "./calendar/repository";
export { calendarOAuthConfiguration, calendarOAuthRedirectUri, consumeCalendarOAuthState, createCalendarOAuthState, exchangeCalendarOAuthCode } from "./calendar/oauth";
export { CalendarProviderError, createCalendarAdapter, createGoogleCalendarAdapter, createOutlookCalendarAdapter } from "./calendar/adapters";
export type { CalendarEventReceipt } from "./calendar/repository";
export type { CalendarAdapter, CalendarCredentials, ProviderCalendar } from "./calendar/adapters";
export { createCalendarSchedulingService, listWorkspaceProviderCalendars, readWorkspaceProviderAvailability } from "./calendar/service";
export const calendarSchedulingService = createCalendarSchedulingService(undefined, {
  adapter: provider => process.env.STRELVA_CALENDAR_FIXTURE === "1" ? createFixtureCalendarAdapter(provider) : createCalendarAdapter(provider),
});
