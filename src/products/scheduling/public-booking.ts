import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";

/**
 * Server boundary for a native booking surface on a generated client site.
 *
 * This module deliberately does not resolve a tenant to a schedule. The
 * caller must supply a published capability binding, an owner actor, and the
 * existing governed calendar operations. That keeps the public route from
 * guessing from legacy booking URLs or exposing private work/provider ids.
 */

export const publicBookingProviderSchema = z.enum(["outlook", "google"]);
export type PublicBookingProvider = z.infer<typeof publicBookingProviderSchema>;

export const publicBookingStatusSchema = z.enum(["confirmed", "pending", "cancelled"]);
export type PublicBookingStatus = z.infer<typeof publicBookingStatusSchema>;

const publicToken = z.string().trim().min(8).max(2048).regex(/^[A-Za-z0-9._~-]+$/);
/** Public callers must bring a high-entropy idempotency key. A short or
 * guessable key could disclose another visitor's receipt on replay. */
export const publicBookingRequestIdSchema = z.string().trim().min(32).max(96).regex(/^[A-Za-z0-9._~-]+$/);
const isoDate = z.string().datetime({ offset: true });

export const publicBookingRangeSchema = z.object({ from: isoDate, to: isoDate }).strict()
  .refine(value => Date.parse(value.to) > Date.parse(value.from), "The booking range must end after it starts.");
export type PublicBookingRange = z.infer<typeof publicBookingRangeSchema>;

export const publicBookingSlotSchema = z.object({
  id: publicToken,
  start: isoDate,
  end: isoDate,
}).strict().refine(value => Date.parse(value.end) > Date.parse(value.start), "The booking slot must end after it starts.");
export type PublicBookingSlot = z.infer<typeof publicBookingSlotSchema>;

export const publicBookingVisitorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  message: z.string().trim().max(2_000).optional(),
}).strict();
export type PublicBookingVisitor = z.infer<typeof publicBookingVisitorSchema>;

/**
 * Bind a replay key to the exact public booking intent. The stable tenant
 * identity is preferred over the mutable public tenant slug, while the slot
 * bounds and normalized visitor fields make a reused key unable to return a
 * receipt for a different booking.
 */
export function publicBookingRequestFingerprint(input: {
  tenantId: string;
  tenantStableId?: string;
  capabilityId: string;
  capabilityVersion: number;
  slot: Pick<PublicBookingSlot, "id" | "start" | "end">;
  visitor: PublicBookingVisitor;
}): string {
  const canonical = JSON.stringify({
    tenant: input.tenantStableId ?? input.tenantId,
    capabilityId: input.capabilityId,
    capabilityVersion: input.capabilityVersion,
    slot: { id: input.slot.id, start: input.slot.start, end: input.slot.end },
    visitor: {
      name: input.visitor.name.trim(),
      email: input.visitor.email.trim().toLowerCase(),
      message: input.visitor.message?.trim() ?? "",
    },
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export const publicBookingScheduleSchema = z.object({
  schemaVersion: z.literal(1),
  capabilityId: z.string().trim().min(1).max(200),
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  provider: publicBookingProviderSchema,
  timeZone: z.string().trim().min(1).max(128),
  slots: z.array(publicBookingSlotSchema).max(500),
}).strict();
export type PublicBookingSchedule = z.infer<typeof publicBookingScheduleSchema>;

export const publicBookingReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  reservationId: publicToken,
  managementToken: publicToken,
  capabilityId: z.string().trim().min(1).max(200),
  version: z.number().int().positive(),
  provider: publicBookingProviderSchema,
  status: publicBookingStatusSchema,
  title: z.string().trim().min(1).max(160),
  start: isoDate,
  end: isoDate,
  timeZone: z.string().trim().min(1).max(128),
}).strict().refine(value => Date.parse(value.end) > Date.parse(value.start), "The booking receipt must end after it starts.");
export type PublicBookingReceipt = z.infer<typeof publicBookingReceiptSchema>;

export interface PublicBookingBinding {
  /** Public identity and published schedule. Private ids are server-only fields. */
  tenantId: string;
  /** Stable identity used for durable receipt lookup across tenant slugs. */
  tenantStableId?: string;
  /** Durable grant id; never included in the public schedule response. */
  grantId?: string;
  /** Revoked bindings remain readable only for existing cancellation/recovery. */
  status?: "published" | "revoked";
  /** The native website binding may be revoked while an existing receipt is
   * still cancellable. This remains server-only state. */
  websiteBindingActive?: boolean;
  capabilityId: string;
  version: number;
  /** Optional published inquiry capability used for the visitor record. */
  inquiryCapabilityId?: string;
  inquiryVersion?: number;
  name: string;
  provider: PublicBookingProvider;
  timeZone: string;
  slots: readonly PublicBookingSlot[];
  /** Customer workspace authority for the existing native calendar service. */
  owner: WorkspaceActor;
  workspaceId: string;
  workId: string;
}

export interface PublicBookingReservationRef {
  tenantId: string;
  /** Public slug used for the current lookup. The stored reservation slug is
   * retained separately because tenant slugs can be renamed. */
  tenantIdAtReservation?: string;
  tenantStableId?: string;
  /** Durable grant id; never included in the public receipt. */
  grantId?: string;
  capabilityId: string;
  version: number;
  provider: PublicBookingProvider;
  reservationId: string;
  requestId: string;
  /** Immutable hash of the tenant, capability/version, slot, and visitor. */
  requestFingerprint: string;
  /** Original published slot. It remains available for an exact replay after
   * the live resolver removes an occupied slot from public availability. */
  slotId: string;
  slotStart: string;
  slotEnd: string;
  workspaceId: string;
  workId: string;
  /** Private link to the durable inquiry captured before calendar sync. */
  inquiryId: string;
  managementToken: string;
  expectedRevision: number;
  title: string;
  start: string;
  end: string;
  timeZone: string;
  status: PublicBookingStatus;
}

/** Durable token/idempotency store. Production callers must use Postgres or Redis. */
export interface PublicBookingTokenStore {
  findByRequest(input: { tenantId: string; requestId: string }): Promise<PublicBookingReservationRef | null>;
  findByToken(input: { tenantId: string; managementToken: string }): Promise<PublicBookingReservationRef | null>;
  save(value: PublicBookingReservationRef): Promise<PublicBookingReservationRef>;
}

export interface PublicBookingInquiryCapture {
  capture(input: {
    tenantId: string;
    capabilityId: string;
    capabilityVersion: number;
    requestId: string;
    visitor: PublicBookingVisitor;
    start: string;
    end: string;
  }): Promise<{ inquiryId: string }>;
}

/** Native calendar operations supplied by the existing scheduling owner. */
export interface PublicBookingCalendarConfirmation {
  /** `verified` requires the existing provider readback decision. */
  verification: "verified" | "pending";
  start: string;
  end: string;
  expectedRevision: number;
}

export interface PublicBookingCalendar {
  /** Re-checks local and provider availability before the governed create. */
  reserve(input: {
    binding: PublicBookingBinding;
    requestId: string;
    title: string;
    start: string;
    end: string;
  }): Promise<PublicBookingCalendarConfirmation>;
  /** Re-checks the current provider event before the governed update. */
  change(input: {
    binding: PublicBookingBinding;
    requestId: string;
    expectedRevision: number;
    start: string;
    end: string;
  }): Promise<PublicBookingCalendarConfirmation>;
  /** May cancel an existing accepted event after workspace exit, per owner policy. */
  cancel(input: {
    binding: PublicBookingBinding;
    requestId: string;
    expectedRevision: number;
  }): Promise<PublicBookingCalendarConfirmation>;
}

export interface PublicBookingDependencies {
  resolve(input: { tenantId: string; capabilityId: string; range?: PublicBookingRange; includeRevoked?: boolean }): Promise<PublicBookingBinding | null>;
  inquiries: PublicBookingInquiryCapture;
  calendar: PublicBookingCalendar;
  tokens: PublicBookingTokenStore;
  createReservationId?: () => string;
  createRequestId?: () => string;
  createManagementToken?: () => string;
}

export class PublicBookingError extends Error {
  constructor(readonly code: "unavailable" | "invalid" | "conflict" | "not_found", message: string, readonly status = code === "invalid" ? 400 : code === "not_found" ? 404 : code === "conflict" ? 409 : 503) {
    super(message);
    this.name = "PublicBookingError";
  }
}

function boundedToken(value: string, label: string): string {
  const parsed = publicToken.safeParse(value);
  if (!parsed.success) throw new PublicBookingError("invalid", `${label} is invalid.`);
  return parsed.data;
}

function boundedRequestId(value: string): string {
  const parsed = publicBookingRequestIdSchema.safeParse(value);
  if (!parsed.success) throw new PublicBookingError("invalid", "The booking request must be a strong idempotency key.");
  return parsed.data;
}

function parseRange(value: PublicBookingRange | undefined): PublicBookingRange | undefined {
  if (value === undefined) return undefined;
  const parsed = publicBookingRangeSchema.safeParse(value);
  if (!parsed.success) throw new PublicBookingError("invalid", "The booking date range is invalid.");
  return parsed.data;
}

function assertBinding(binding: PublicBookingBinding, tenantId: string, capabilityId: string): PublicBookingBinding {
  if (binding.tenantId !== tenantId || binding.capabilityId !== capabilityId || !Number.isSafeInteger(binding.version) || binding.version < 1) {
    throw new PublicBookingError("not_found", "This booking capability is unavailable.");
  }
  const parsed = publicBookingScheduleSchema.safeParse({
    schemaVersion: 1,
    capabilityId: binding.capabilityId,
    version: binding.version,
    name: binding.name,
    provider: binding.provider,
    timeZone: binding.timeZone,
    slots: binding.slots,
  });
  if (!parsed.success) throw new PublicBookingError("unavailable", "Booking availability is unavailable right now.");
  if ((binding.inquiryCapabilityId === undefined) !== (binding.inquiryVersion === undefined) ||
    (binding.inquiryCapabilityId !== undefined && (!binding.inquiryCapabilityId.trim() || !Number.isSafeInteger(binding.inquiryVersion) || (binding.inquiryVersion ?? 0) < 1))) {
    throw new PublicBookingError("unavailable", "The booking inquiry connection is unavailable right now.");
  }
  return binding;
}

function slotFor(binding: PublicBookingBinding, slotId: string): PublicBookingSlot {
  const parsed = boundedToken(slotId, "The booking slot");
  const slot = binding.slots.find(item => item.id === parsed);
  if (!slot) throw new PublicBookingError("conflict", "That booking time is no longer available. Choose another time.");
  const safe = publicBookingSlotSchema.safeParse(slot);
  if (!safe.success) throw new PublicBookingError("conflict", "That booking time is no longer available. Choose another time.");
  return safe.data;
}

function inRange(slot: PublicBookingSlot, range: PublicBookingRange): boolean {
  return Date.parse(slot.start) >= Date.parse(range.from) && Date.parse(slot.end) <= Date.parse(range.to);
}

function rangeSlots(binding: PublicBookingBinding, range?: PublicBookingRange): PublicBookingSlot[] {
  const slots = binding.slots.filter(slot => !range || inRange(slot, range));
  return slots.slice(0, 500);
}

function receipt(ref: PublicBookingReservationRef): PublicBookingReceipt {
  const parsed = publicBookingReceiptSchema.safeParse({
    schemaVersion: 1,
    reservationId: ref.reservationId,
    managementToken: ref.managementToken,
    capabilityId: ref.capabilityId,
    version: ref.version,
    provider: ref.provider,
    status: ref.status,
    title: ref.title,
    start: ref.start,
    end: ref.end,
    timeZone: ref.timeZone,
  });
  if (!parsed.success) throw new PublicBookingError("unavailable", "The booking receipt is unavailable right now.");
  return parsed.data;
}

async function findByRequest(dependencies: PublicBookingDependencies, input: { tenantId: string; requestId: string }): Promise<PublicBookingReservationRef | null> {
  try {
    return await dependencies.tokens.findByRequest(input);
  } catch {
    throw new PublicBookingError("unavailable", "Booking records are unavailable right now. Try again.");
  }
}

async function findByToken(dependencies: PublicBookingDependencies, input: { tenantId: string; managementToken: string }): Promise<PublicBookingReservationRef | null> {
  try {
    return await dependencies.tokens.findByToken(input);
  } catch {
    throw new PublicBookingError("unavailable", "Booking records are unavailable right now. Try again.");
  }
}

async function saveToken(dependencies: PublicBookingDependencies, value: PublicBookingReservationRef): Promise<PublicBookingReservationRef> {
  try {
    return await dependencies.tokens.save(value);
  } catch {
    throw new PublicBookingError("unavailable", "The booking was made, but its receipt could not be saved. Try again or contact the business.");
  }
}

function titleFor(binding: PublicBookingBinding): string {
  return binding.name.trim().slice(0, 160) || "Appointment";
}

async function resolveBinding(dependencies: PublicBookingDependencies, input: { tenantId: string; capabilityId: string; range?: PublicBookingRange; includeRevoked?: boolean }): Promise<PublicBookingBinding | null> {
  try {
    return await dependencies.resolve(input);
  } catch (error) {
    if (error instanceof PublicBookingError) throw error;
    throw new PublicBookingError("unavailable", "Booking availability is unavailable right now.");
  }
}

/**
 * Build a public booking service around the existing native calendar owner.
 * Resolver and token store are explicit so no public route can silently pick a
 * tenant's first schedule or keep management state only in process memory.
 */
export function createPublicBookingService(dependencies: PublicBookingDependencies) {
  const reservationId = dependencies.createReservationId ?? randomUUID;
  const requestId = dependencies.createRequestId ?? randomUUID;
  const managementToken = dependencies.createManagementToken ?? (() => randomUUID().replaceAll("-", ""));

  async function read(input: { tenantId: string; capabilityId: string; range?: PublicBookingRange }): Promise<PublicBookingSchedule> {
    const range = parseRange(input.range);
    const binding = await resolveBinding(dependencies, { ...input, range });
    if (!binding) throw new PublicBookingError("not_found", "This booking capability is unavailable.");
    const safe = assertBinding(binding, input.tenantId, input.capabilityId);
    return publicBookingScheduleSchema.parse({
      schemaVersion: 1,
      capabilityId: safe.capabilityId,
      version: safe.version,
      name: safe.name,
      provider: safe.provider,
      timeZone: safe.timeZone,
      slots: rangeSlots(safe, range),
    });
  }

  async function reserve(input: {
    tenantId: string;
    capabilityId: string;
    capabilityVersion: number;
    slotId: string;
    visitor: PublicBookingVisitor;
    requestId?: string;
  }): Promise<PublicBookingReceipt> {
    const visitorResult = publicBookingVisitorSchema.safeParse(input.visitor);
    if (!visitorResult.success) throw new PublicBookingError("invalid", "Enter your name and a valid email address.");
    const visitor = visitorResult.data;
    const idempotencyRequestId = boundedRequestId(input.requestId ?? requestId());

    // Replay is resolved from the durable receipt before asking the live
    // resolver for free slots. The default resolver intentionally removes
    // accepted reservations from public availability, so checking it first
    // would turn a safe retry into a false conflict (and could invite a
    // duplicate provider write).
    const existing = await findByRequest(dependencies, { tenantId: input.tenantId, requestId: idempotencyRequestId });
    if (existing) {
      if (existing.capabilityId !== input.capabilityId || existing.version !== input.capabilityVersion) {
        throw new PublicBookingError("conflict", "This booking request is already used for another capability.");
      }
      const requestFingerprint = publicBookingRequestFingerprint({
        tenantId: input.tenantId,
        ...(existing.tenantStableId ? { tenantStableId: existing.tenantStableId } : {}),
        capabilityId: existing.capabilityId,
        capabilityVersion: existing.version,
        slot: { id: existing.slotId, start: existing.slotStart, end: existing.slotEnd },
        visitor,
      });
      if (input.slotId !== existing.slotId || existing.requestFingerprint !== requestFingerprint) {
        throw new PublicBookingError("conflict", "This booking request is already used for different booking details.");
      }
      return receipt(existing);
    }

    const binding = await resolveBinding(dependencies, { tenantId: input.tenantId, capabilityId: input.capabilityId });
    if (!binding) throw new PublicBookingError("not_found", "This booking capability is unavailable.");
    const safe = assertBinding(binding, input.tenantId, input.capabilityId);
    if (input.capabilityVersion !== safe.version) throw new PublicBookingError("conflict", "This booking changed. Reload the available times before reserving.");
    const slot = slotFor(safe, input.slotId);
    const requestFingerprint = publicBookingRequestFingerprint({
      tenantId: input.tenantId,
      ...(safe.tenantStableId ? { tenantStableId: safe.tenantStableId } : {}),
      capabilityId: safe.capabilityId,
      capabilityVersion: safe.version,
      slot,
      visitor,
    });
    let captured: { inquiryId: string };
    try {
      captured = await dependencies.inquiries.capture({
        tenantId: input.tenantId,
        capabilityId: safe.inquiryCapabilityId ?? safe.capabilityId,
        capabilityVersion: safe.inquiryVersion ?? safe.version,
        requestId: idempotencyRequestId,
        visitor,
        start: slot.start,
        end: slot.end,
      });
    } catch (error) {
      if (error instanceof PublicBookingError) throw error;
      throw new PublicBookingError("unavailable", "Your request could not be recorded. Try again or contact the business.");
    }
    const title = titleFor(safe);
    const pendingReservationId = boundedToken(reservationId(), "The reservation id");
    const pending = await saveToken(dependencies, {
      tenantId: input.tenantId,
      ...(safe.tenantStableId ? { tenantStableId: safe.tenantStableId } : {}),
      ...(safe.grantId ? { grantId: safe.grantId } : {}),
      capabilityId: safe.capabilityId,
      version: safe.version,
      provider: safe.provider,
      reservationId: pendingReservationId,
      requestId: idempotencyRequestId,
      requestFingerprint,
      slotId: slot.id,
      slotStart: slot.start,
      slotEnd: slot.end,
      workspaceId: safe.workspaceId,
      workId: safe.workId,
      inquiryId: captured.inquiryId,
      managementToken: boundedToken(managementToken(), "The management token"),
      expectedRevision: 0,
      title,
      start: slot.start,
      end: slot.end,
      timeZone: safe.timeZone,
      status: "pending",
    });
    if (pending.requestFingerprint !== requestFingerprint || pending.slotId !== slot.id) {
      throw new PublicBookingError("conflict", "This booking request is already used for different booking details.");
    }
    // A concurrent request can win the durable unique request claim between
    // our lookup and save. Its receipt is authoritative; never call the
    // provider for the losing request.
    if (pending.reservationId !== pendingReservationId) return receipt(pending);
    let result: Awaited<ReturnType<PublicBookingCalendar["reserve"]>>;
    try {
      result = await dependencies.calendar.reserve({ binding: safe, requestId: idempotencyRequestId, title, start: slot.start, end: slot.end });
    } catch (error) {
      if (error instanceof PublicBookingError) throw error;
      throw new PublicBookingError("unavailable", "The booking request was received, but the calendar could not confirm it. Try again or contact the business.");
    }
    const ref = await saveToken(dependencies, {
      ...pending,
      expectedRevision: result.expectedRevision,
      start: result.start,
      end: result.end,
      status: result.verification === "verified" ? "confirmed" : "pending",
    });
    if (ref.requestFingerprint !== requestFingerprint) throw new PublicBookingError("conflict", "This booking request is already used for different booking details.");
    return receipt(ref);
  }

  async function change(input: {
    tenantId: string;
    reservationId: string;
    managementToken: string;
    capabilityId: string;
    capabilityVersion: number;
    slotId: string;
  }): Promise<PublicBookingReceipt> {
    const token = boundedToken(input.managementToken, "The management token");
    const ref = await findByToken(dependencies, { tenantId: input.tenantId, managementToken: token });
    if (!ref || ref.reservationId !== input.reservationId || ref.capabilityId !== input.capabilityId || ref.status === "cancelled") {
      throw new PublicBookingError("not_found", "This reservation is unavailable.");
    }
    const binding = await resolveBinding(dependencies, { tenantId: input.tenantId, capabilityId: ref.capabilityId, includeRevoked: true });
    if (!binding) throw new PublicBookingError("not_found", "This booking capability is unavailable.");
    const safe = assertBinding(binding, input.tenantId, ref.capabilityId);
    if (safe.status === "revoked" || safe.websiteBindingActive === false) throw new PublicBookingError("conflict", "This booking is no longer accepting changes. You can still cancel it.");
    if (input.capabilityVersion !== safe.version || ref.version !== safe.version) throw new PublicBookingError("conflict", "This booking changed. Reload the available times before changing it.");
    const slot = slotFor(safe, input.slotId);
    let result: Awaited<ReturnType<PublicBookingCalendar["change"]>>;
    try {
      result = await dependencies.calendar.change({ binding: safe, requestId: ref.requestId, expectedRevision: ref.expectedRevision, start: slot.start, end: slot.end });
    } catch (error) {
      if (error instanceof PublicBookingError) throw error;
      throw new PublicBookingError("unavailable", "The calendar could not confirm this change. Try again or contact the business.");
    }
    return receipt(await saveToken(dependencies, { ...ref, expectedRevision: result.expectedRevision, start: result.start, end: result.end, status: result.verification === "verified" ? "confirmed" : "pending" }));
  }

  async function cancel(input: { tenantId: string; reservationId: string; managementToken: string }): Promise<PublicBookingReceipt> {
    const token = boundedToken(input.managementToken, "The management token");
    const ref = await findByToken(dependencies, { tenantId: input.tenantId, managementToken: token });
    if (!ref || ref.reservationId !== input.reservationId) throw new PublicBookingError("not_found", "This reservation is unavailable.");
    if (ref.status === "cancelled") return receipt(ref);
    const binding = await resolveBinding(dependencies, { tenantId: input.tenantId, capabilityId: ref.capabilityId, includeRevoked: true });
    if (!binding) throw new PublicBookingError("not_found", "This booking capability is unavailable.");
    const safe = assertBinding(binding, input.tenantId, ref.capabilityId);
    if (ref.version !== safe.version) throw new PublicBookingError("conflict", "This booking changed. Reload before cancelling it.");
    let result: Awaited<ReturnType<PublicBookingCalendar["cancel"]>>;
    try {
      result = await dependencies.calendar.cancel({ binding: safe, requestId: ref.requestId, expectedRevision: ref.expectedRevision });
    } catch (error) {
      if (error instanceof PublicBookingError) throw error;
      throw new PublicBookingError("unavailable", "The calendar could not confirm this cancellation. Try again or contact the business.");
    }
    return receipt(await saveToken(dependencies, { ...ref, expectedRevision: result.expectedRevision, start: result.start, end: result.end, status: result.verification === "verified" ? "cancelled" : "pending" }));
  }

  return { read, reserve, change, cancel };
}
