import { issuePublicInquiryConfirmation, requirePublicBookingEmail } from "@/platform/bookings/public-confirmation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { inquiryRecordsRpc, inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { storeSlotsForDate, timeZoneOf, zonedLocalToUtc } from "@/platform/bookings/availability";
import { readTenantBookings, parseStoreBooking, type BookingContext, type StoreBooking } from "@/platform/bookings/store";
import { readCalendarBusy, withoutBusy } from "@/platform/bookings/calendar-busy";
import { bookingStoreWriteEnabled } from "@/platform/bookings/flags";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { inquiryReleaseEnabledForTenant, inquiryReleaseEnabledForWorkspace } from "./release";
import type { InquiryDeliverySubmission } from "./delivery-types";

export function inquiryBookingHandoffEnabled(env: Partial<Record<string, string | undefined>> = process.env): boolean {
  return env.STRELVA_INQUIRY_BOOKING_HANDOFF === "1" && inquiryRecordsEnabled(env) && bookingStoreWriteEnabled(env);
}
const slot = z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).strict();
const offerSchema = z.object({ services: z.array(z.object({ id: z.string().uuid(), name: z.string(), durationMinutes: z.number().int().nullable() })).default([]), id: z.string().uuid(), serviceId: z.string().uuid(), expiresAt: z.string().datetime({ offset: true }), serviceName: z.string(), timeZone: z.string(), slots: z.array(slot).min(1).max(3) });
export type InquiryBookingOffer = { serviceId: string; services: Array<{ id: string; name: string; durationMinutes: number | null }>; serviceName: string; timeZone: string; chooseUrl: string; expiresAt: string; slots: Array<{ start: string; end: string; label: string; chooseUrl: string }> };
export const prepareInquiryBookingInput = z.object({ workspaceId: z.string().uuid(), rowId: z.string().uuid(), serviceId: z.string().uuid().optional(), starts: z.array(z.string().datetime({ offset: true })).min(1).max(3).optional() }).strict();
export type PrepareInquiryBookingInput = z.infer<typeof prepareInquiryBookingInput>;
export interface InquiryBookingDependencies {
  enabled(): boolean;
  released(tenant: string): Promise<boolean>;
  workspaceReleased?: (workspaceId: string) => Promise<boolean>;
  rpc: typeof inquiryRecordsRpc;
  bookings: typeof readTenantBookings;
  nativeBookings?: (workspaceId: string, range: { from: string; to: string }) => Promise<StoreBooking[]>;
  busy: typeof readCalendarBusy;
  now(): Date;
  secret(): string;
  requireConfirmation?(scope: string): Promise<void>;
  confirm?(booking: StoreBooking): Promise<void>;
}
const defaults: InquiryBookingDependencies = {
  requireConfirmation: requirePublicBookingEmail, confirm: issuePublicInquiryConfirmation,
  enabled: inquiryBookingHandoffEnabled, released: (tenantId) => inquiryReleaseEnabledForTenant(tenantId), workspaceReleased: (workspaceId) => inquiryReleaseEnabledForWorkspace(workspaceId), rpc: inquiryRecordsRpc,
  bookings: readTenantBookings,
  nativeBookings: async (workspaceId, range) => {
    const raw = await inquiryRecordsRpc("read_inquiry_workspace_bookings", { p_workspace_id: workspaceId, p_from: range.from, p_to: range.to });
    if (!Array.isArray(raw)) throw new Error("Booking storage is unavailable.");
    return raw.map(parseStoreBooking).filter((row): row is StoreBooking => row !== null);
  }, busy: readCalendarBusy, now: () => new Date(),
  secret: () => {
    const value = process.env.APPROVE_LINK_SECRET || process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET;
    if (!value) throw new Error("Inquiry booking link signing is not configured.");
    return value;
  },
};
function signature(encoded: string, secret: string): string { return createHmac("sha256", secret).update(`inquiry-booking-v1:${encoded}`).digest("base64url"); }
export function signInquiryBookingOffer(id: string, expiresAt: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ id, exp: Date.parse(expiresAt) })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}
export function verifyInquiryBookingOffer(token: string, secret: string, now: Date): string | null {
  if (token.length > 500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, supplied] = token.split(".") as [string, string];
  const expected = signature(payload, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const value = z.object({ id: z.string().uuid(), exp: z.number().int() }).strict().parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    return value.exp > now.getTime() ? value.id : null;
  } catch { return null; }
}
function project(raw: unknown, deps: InquiryBookingDependencies): InquiryBookingOffer {
  const offer = offerSchema.parse(raw);
  const token = signInquiryBookingOffer(offer.id, offer.expiresAt, deps.secret());
  const chooseUrl = `/inquiry-booking/${token}`;
  return { serviceId: offer.serviceId, services: offer.services, serviceName: offer.serviceName, timeZone: offer.timeZone, chooseUrl, expiresAt: offer.expiresAt,
    slots: offer.slots.map((s, index) => ({ ...s, chooseUrl: `${chooseUrl}?slot=${index}`, label: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: offer.timeZone, timeZoneName: "short" }).format(new Date(s.start)) })) };
}
function nextDate(date: string, days: number): string { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
/** Next actual bookable times from the record, held bookings and the existing calendar busy seam. */
export async function nextInquiryBookingSlots(tenant: string | null, context: BookingContext, serviceId: string | undefined, deps: InquiryBookingDependencies = defaults, starts?: string[]): Promise<{ serviceId: string; slots: z.infer<typeof slot>[] } | null> {
  if (context.paused || !context.systemId || context.settings?.mode !== "request" || !context.workspaceId) return null;
  const service = context.services.find((s) => s.active && (!serviceId || s.id === serviceId));
  if (!service) return null;
  const duration = service.durationMinutes ?? context.settings.defaultLengthMinutes;
  const zone = timeZoneOf(context);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(deps.now());
  const horizon = Math.min(context.settings.maxAdvanceDays, 730);
  const range = { from: today, to: nextDate(today, horizon) };
  const bookings = tenant ? await deps.bookings(tenant, range) : await deps.nativeBookings?.(context.workspaceId, range);
  if (!bookings) throw new Error("Native booking storage is unavailable.");
  const result: z.infer<typeof slot>[] = [];
  for (let day = 0; day <= horizon; day += 1) {
    const date = nextDate(today, day);
    const busy = await deps.busy(context, date, zone);
    if (busy.connected && !busy.checked) return null;
    const available = storeSlotsForDate(context, date, duration, bookings);
    const times = busy.connected && busy.checked ? withoutBusy(available, date, duration, zone, busy.busy) : available;
    for (const time of times) {
      const start = zonedLocalToUtc(date, time, zone);
      const ms = Date.parse(start);
      if (ms < deps.now().getTime() + context.settings.minNoticeMinutes * 60_000 || ms <= deps.now().getTime()) continue;
      if (starts && !starts.includes(start)) continue;
      result.push({ start, end: new Date(ms + duration * 60_000).toISOString() });
      if (result.length === 3 || (starts && result.length === starts.length)) return { serviceId: service.id, slots: result };
    }
  }
  if (starts && result.length !== starts.length) throw new WorkspaceConflictError("One of these times is no longer available. Choose fresh times.");
  return result.length ? { serviceId: service.id, slots: result } : null;
}
/** No visitor-chosen lead id entry point: public preparation is called only after trusted capture or worker read. */
export async function prepareInquiryBookingOffer(input: { tenantId: string | null; inquiryId: string; workspaceId?: string; actor?: WorkspaceActor; selection?: PrepareInquiryBookingInput }, deps: InquiryBookingDependencies = defaults): Promise<InquiryBookingOffer | null> {
  if (!deps.enabled() || !(input.tenantId ? await deps.released(input.tenantId) : input.workspaceId && await deps.workspaceReleased?.(input.workspaceId))) return null;
  deps.secret(); // fail before storing an unusable offer
  const snapshot = await deps.rpc("read_inquiry_booking_handoff", {
    p_tenant_id: input.tenantId, p_inquiry_id: input.inquiryId,
    p_workspace_id: input.selection?.workspaceId ?? null, p_row_id: input.selection?.rowId ?? null,
    p_user_id: input.actor?.userId ?? null, p_verified_email: input.actor?.verifiedEmail ?? null,
  }, () => new WorkspaceAccessError()) as { context: BookingContext; witness: unknown; offer: unknown } | null;
  if (!snapshot) return null;
  if (input.workspaceId && snapshot.context.workspaceId !== input.workspaceId) throw new WorkspaceAccessError();
  if (!input.selection?.starts && snapshot.offer) {
    const previous = project(snapshot.offer, deps);
    if (!input.selection?.serviceId || previous.serviceId === input.selection.serviceId) return previous;
  }
  const effectiveContext = { ...snapshot.context, tenantStableId: snapshot.context.tenantStableId ?? snapshot.context.workspaceId! };
  const available = await nextInquiryBookingSlots(input.tenantId, effectiveContext, input.selection?.serviceId, deps, input.selection?.starts);
  if (!available) return null;
  const saved = await deps.rpc("prepare_inquiry_booking_offer", {
    p_tenant_id: input.tenantId, p_inquiry_id: input.inquiryId, p_witness: snapshot.witness,
    p_service_id: available.serviceId, p_slots: available.slots,
    p_user_id: input.actor?.userId ?? null, p_verified_email: input.actor?.verifiedEmail ?? null,
  }, () => new WorkspaceAccessError());
  return project(saved, deps);
}
export async function prepareWorkspaceInquiryBooking(actor: WorkspaceActor, raw: PrepareInquiryBookingInput, deps: InquiryBookingDependencies = defaults): Promise<InquiryBookingOffer | null> {
  const selection = prepareInquiryBookingInput.parse(raw);
  if (!deps.enabled()) return null;
  const record = await deps.rpc("resolve_workspace_inquiry_booking_lead", { p_workspace_id: selection.workspaceId, p_row_id: selection.rowId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }, () => new WorkspaceAccessError()) as { tenantId: string | null; inquiryId: string; workspaceId: string };
  return prepareInquiryBookingOffer({ ...record, actor, selection }, deps);
}
export type InquiryBookingChoice = { offer: InquiryBookingOffer; booking: StoreBooking | null };
export async function loadInquiryBookingChoice(token: string, deps: InquiryBookingDependencies = defaults): Promise<InquiryBookingChoice | null> {
  if (!deps.enabled()) return null;
  const id = verifyInquiryBookingOffer(token, deps.secret(), deps.now());
  if (!id) return null;
  const data = await deps.rpc("read_inquiry_booking_offer", { p_offer_id: id }) as { tenantId: string | null; workspaceId: string; offer: unknown; booking: unknown } | null;
  if (!data || !(data.tenantId ? await deps.released(data.tenantId) : await deps.workspaceReleased?.(data.workspaceId))) return null;
  return { offer: project(data.offer, deps), booking: parseStoreBooking(data.booking) };
}
export async function chooseInquiryBookingSlot(token: string, index: number, deps: InquiryBookingDependencies = defaults): Promise<StoreBooking> {
  if (!deps.enabled() || !Number.isInteger(index) || index < 0 || index > 2) throw new WorkspaceConflictError("Choose an offered time.");
  const id = verifyInquiryBookingOffer(token, deps.secret(), deps.now());
  if (!id) throw new WorkspaceConflictError("This link expired. Ask the business for fresh times.");
  const raw = await deps.rpc("read_inquiry_booking_offer", { p_offer_id: id }) as { tenantId: string | null; workspaceId: string; offer: unknown; booking: unknown; context: BookingContext } | null;
  if (!raw || !(raw.tenantId ? await deps.released(raw.tenantId) : await deps.workspaceReleased?.(raw.workspaceId))) throw new WorkspaceConflictError("These times are no longer available.");
  const existing = parseStoreBooking(raw.booking);
  if (existing) { await deps.confirm?.(existing); return existing; }
  await deps.requireConfirmation?.(raw.tenantId ?? `workspace:${raw.workspaceId}`);
  const offer = offerSchema.parse(raw.offer);
  const chosen = offer.slots[index];
  if (!chosen) throw new WorkspaceConflictError("Choose an offered time.");
  const selection = await nextInquiryBookingSlots(raw.tenantId, { ...raw.context, tenantStableId: raw.context.tenantStableId ?? raw.context.workspaceId! }, offer.serviceId, deps, [chosen.start]);
  if (!selection?.slots.some((s) => s.start === chosen.start && s.end === chosen.end)) throw new WorkspaceConflictError("That time is no longer available. Ask the business for fresh times.");
  const result = await deps.rpc("choose_inquiry_booking_slot", { p_offer_id: id, p_slot_index: index });
  const booking = parseStoreBooking(result);
  if (!booking) throw new WorkspaceConflictError("That time is no longer available. Nothing was confirmed.");
  await deps.confirm?.(booking);
  return booking;
}
/** The same saved offer is hashed into the governed email review and the actual send. */
export async function withInquiryBookingOffer(inquiry: InquiryDeliverySubmission): Promise<InquiryDeliverySubmission> {
  if (!inquiryBookingHandoffEnabled()) return inquiry;
  try {
    const offer = await prepareInquiryBookingOffer({ tenantId: inquiry.tenantId, inquiryId: inquiry.id });
    return offer ? { ...inquiry, bookingOffer: offer } : inquiry;
  } catch { return inquiry; }
}
