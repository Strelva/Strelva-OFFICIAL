import { z } from "zod";
import { resolvePublishedPublicBooking } from "./public-booking-server";
import { postgresPublicBookingTokenStore } from "./public-booking-store";
import { scheduleSchema } from "./contracts";
import {
  PublicBookingError,
  publicBookingReceiptSchema,
  type PublicBookingBinding,
  type PublicBookingReceipt,
  type PublicBookingReservationRef,
  type PublicBookingTokenStore,
} from "./public-booking";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { calendarSchedulingService } from "./server";

const managementTokenSchema = z.string().trim().min(8).max(2_048).regex(/^[A-Za-z0-9._~-]+$/);

type RecoveryCalendar = {
  read(actor: WorkspaceActor, workId: string): Promise<{ payload: unknown }>;
  recover(actor: WorkspaceActor, workId: string, requestId: string, provider: PublicBookingReservationRef["provider"]): Promise<unknown>;
};
type RecoveryResolver = typeof resolvePublishedPublicBooking;
type RecoveryTokenStore = Pick<PublicBookingTokenStore, "findByToken" | "save">;

export interface PublicBookingRecoveryDependencies {
  tokens?: RecoveryTokenStore;
  resolve?: RecoveryResolver;
  calendar?: RecoveryCalendar;
}

export interface PublicBookingRecoveryInput {
  tenantId: string;
  reservationId: string;
  managementToken: string;
}

function unavailable(message = "Booking recovery is temporarily unavailable. Try again."): PublicBookingError {
  return new PublicBookingError("unavailable", message);
}

function notFound(): PublicBookingError {
  return new PublicBookingError("not_found", "This reservation is unavailable.");
}

function receipt(value: PublicBookingReservationRef): PublicBookingReceipt {
  const parsed = publicBookingReceiptSchema.safeParse({
    schemaVersion: 1,
    reservationId: value.reservationId,
    managementToken: value.managementToken,
    capabilityId: value.capabilityId,
    version: value.version,
    provider: value.provider,
    status: value.status,
    title: value.title,
    start: value.start,
    end: value.end,
    timeZone: value.timeZone,
  });
  if (!parsed.success) throw unavailable("The booking receipt is unavailable right now.");
  return parsed.data;
}

async function findToken(store: RecoveryTokenStore, input: { tenantId: string; managementToken: string }): Promise<PublicBookingReservationRef | null> {
  try {
    return await store.findByToken(input);
  } catch {
    throw unavailable("Booking records are temporarily unavailable. Try again.");
  }
}

async function saveToken(store: RecoveryTokenStore, value: PublicBookingReservationRef): Promise<PublicBookingReservationRef> {
  try {
    const saved = await store.save(value);
    if (saved.tenantId !== value.tenantId || saved.reservationId !== value.reservationId || saved.requestId !== value.requestId) {
      throw new Error("The saved booking receipt did not match the recovery claim.");
    }
    return saved;
  } catch {
    throw unavailable("The booking readback was confirmed, but its receipt could not be saved. Try again.");
  }
}

async function readNative(calendar: RecoveryCalendar, owner: WorkspaceActor, workId: string) {
  try {
    const result = await calendar.read(owner, workId);
    const parsed = scheduleSchema.safeParse(result.payload);
    if (!parsed.success) throw new Error("The native schedule is invalid.");
    return parsed.data;
  } catch (error) {
    if (error instanceof PublicBookingError) throw error;
    throw unavailable();
  }
}

async function recoverNative(calendar: RecoveryCalendar, owner: WorkspaceActor, workId: string, requestId: string, provider: PublicBookingReservationRef["provider"]): Promise<void> {
  try {
    await calendar.recover(owner, workId, requestId, provider);
  } catch (error) {
    if (error instanceof PublicBookingError) throw error;
    throw unavailable();
  }
}

function bindingMatches(ref: PublicBookingReservationRef, binding: PublicBookingBinding): boolean {
  return binding.tenantId === ref.tenantId
    && binding.workspaceId === ref.workspaceId
    && binding.workId === ref.workId
    && binding.capabilityId === ref.capabilityId
    && binding.version === ref.version
    && binding.provider === ref.provider
    && (!ref.tenantStableId || binding.tenantStableId === ref.tenantStableId)
    && (!ref.grantId || binding.grantId === ref.grantId);
}

function statusForNative(reservation: z.infer<typeof scheduleSchema>["reservations"][number]): PublicBookingReservationRef["status"] {
  if (reservation.status === "cancelled" && reservation.verification === "verified") return "cancelled";
  if (reservation.status === "accepted" && reservation.verification === "verified") return "confirmed";
  return "pending";
}

/**
 * Recover a durable public receipt through the existing native scheduling
 * owner. This path reads and reconciles an existing reservation only; it has
 * no reserve, change, or cancel operation and never creates provider work.
 */
export async function recoverPublicWebsiteBooking(
  input: PublicBookingRecoveryInput,
  dependencies: PublicBookingRecoveryDependencies = {},
): Promise<PublicBookingReceipt> {
  const tokenResult = managementTokenSchema.safeParse(input.managementToken);
  if (!tokenResult.success || !input.tenantId || !input.reservationId) throw new PublicBookingError("invalid", "The booking recovery request is incomplete.");

  const tokens = dependencies.tokens ?? postgresPublicBookingTokenStore;
  const resolve = dependencies.resolve ?? resolvePublishedPublicBooking;
  const calendar = dependencies.calendar ?? calendarSchedulingService;
  const ref = await findToken(tokens, { tenantId: input.tenantId, managementToken: tokenResult.data });
  if (!ref || ref.tenantId !== input.tenantId || ref.reservationId !== input.reservationId || ref.managementToken !== tokenResult.data) throw notFound();

  let binding: PublicBookingBinding | null;
  try {
    binding = await resolve({ tenantId: input.tenantId, capabilityId: ref.capabilityId, includeRevoked: true });
  } catch (error) {
    if (error instanceof PublicBookingError) throw error;
    throw unavailable();
  }
  if (!binding || !bindingMatches(ref, binding)) throw notFound();

  let schedule = await readNative(calendar, binding.owner, ref.workId);
  let nativeReservation = schedule.reservations.find(candidate => candidate.requestId === ref.requestId);
  if (!nativeReservation) {
    const pending = { ...ref, status: "pending" as const, expectedRevision: schedule.revision };
    return receipt(await saveToken(tokens, pending));
  }

  await recoverNative(calendar, binding.owner, ref.workId, ref.requestId, ref.provider);
  schedule = await readNative(calendar, binding.owner, ref.workId);
  nativeReservation = schedule.reservations.find(candidate => candidate.requestId === ref.requestId);
  if (!nativeReservation) {
    const pending = { ...ref, status: "pending" as const, expectedRevision: schedule.revision };
    return receipt(await saveToken(tokens, pending));
  }

  const current = await saveToken(tokens, {
    ...ref,
    expectedRevision: schedule.revision,
    start: nativeReservation.start,
    end: nativeReservation.end,
    status: statusForNative(nativeReservation),
  });
  return receipt(current);
}
