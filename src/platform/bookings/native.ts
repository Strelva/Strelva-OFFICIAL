/** Native services and availability for agent discovery and customer management.
 * Every slot is recomputed from the record and guarded by the one store. */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/platform/infra/crypto/secrets";
import { PublicBookingError } from "@/products/scheduling/public-booking";
import { settingsOrDefault, storeSlotsForDate, timeZoneOf, zonedLocalToUtc } from "./availability";
import { readCalendarBusy, withoutBusy } from "./calendar-busy";
import { bookingAgentsEnabled, bookingReadSource } from "./flags";
import { bookingStoreDb, parseStoreBooking, readBookingContext, readTenantBookings, type StoreBooking } from "./store";

export const agentBookingSchema = z.object({
  origin: z.literal("agent"), serviceId: z.string().min(1).max(200), start: z.string().datetime({ offset: true }),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  agent: z.object({ name: z.string().trim().min(1).max(120) }).strict(),
  customer: z.object({ name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(320), phone: z.string().max(80).optional() }).strict(),
}).strict();
export type AgentBookingInput = z.infer<typeof agentBookingSchema>;
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function nativeRpc(name: string, args: Record<string, unknown>) {
  const db = bookingStoreDb();
  if (!db) throw new PublicBookingError("unavailable", "Booking storage is unavailable.");
  const call = db.rpc(name, args);
  const response = await (call.abortSignal ? call.abortSignal(AbortSignal.timeout(5000)) : call);
  if (response.error) {
    const message = response.error.message ?? "";
    if (/booking_(not_found|hold_expired)/.test(message)) throw new PublicBookingError("not_found", "This booking link has expired.");
    if (/booking_(paused|slot_taken|request_conflict)/.test(message)) throw new PublicBookingError("conflict", "This time cannot be booked now.");
    if (message.includes("booking_agent_limit")) throw new PublicBookingError("conflict", "Too many agent requests for this business. Try again later.");
    throw new PublicBookingError("unavailable", "Booking storage is unavailable.");
  }
  return response.data;
}

export async function requireAgentBookings() {
  if (!bookingAgentsEnabled() || await bookingReadSource() !== "postgres") throw new PublicBookingError("unavailable", "Agent bookings are not enabled.");
}

async function context(tenant: string) {
  const ctx = await readBookingContext(tenant);
  if (!ctx?.workspaceId) throw new PublicBookingError("not_found", "This booking business is unavailable.");
  return ctx;
}

export async function nativeServices(tenant: string) {
  const ctx = await context(tenant);
  const settings = settingsOrDefault(ctx);
  return { timeZone: timeZoneOf(ctx), paused: ctx.paused, services: ctx.services.filter(s => s.active).map(s => ({
    id: s.externalRef ?? s.id, name: s.name, durationMinutes: s.durationMinutes ?? settings.defaultLengthMinutes,
    mode: settings.mode, bufferMinutes: settings.bufferMinutes,
  })) };
}

function addDays(day: string, n: number) { return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10); }

export async function nativeSlots(tenant: string, serviceId: string, from: string, to: string) {
  const ctx = await context(tenant);
  const service = ctx.services.find(s => s.active && (s.id === serviceId || s.externalRef === serviceId));
  if (!service) throw new PublicBookingError("not_found", "This service is unavailable.");
  const fromMs = Date.parse(from), toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || toMs - fromMs > 60 * 86400000) throw new PublicBookingError("invalid", "Choose a range of up to 60 days.");
  const zone = timeZoneOf(ctx);
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  const first = format.format(new Date(fromMs)), last = format.format(new Date(toMs));
  const bookings = await readTenantBookings(tenant, { from: addDays(first, -1), to: addDays(last, 1) });
  const minutes = service.durationMinutes ?? settingsOrDefault(ctx).defaultLengthMinutes;
  const slots: Array<{ id: string; start: string; end: string; calendarChecked: boolean }> = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const offered = storeSlotsForDate(ctx, date, minutes, bookings);
    if (!offered.length) continue;
    const calendar = await readCalendarBusy(ctx, date, zone);
    const times = calendar.connected && calendar.checked ? withoutBusy(offered, date, minutes, zone, calendar.busy) : offered;
    for (const time of times) {
      const start = zonedLocalToUtc(date, time, zone), end = new Date(Date.parse(start) + minutes * 60000).toISOString();
      if (Date.parse(start) < fromMs || Date.parse(end) > toMs) continue;
      slots.push({ id: start, start, end, calendarChecked: !calendar.connected || calendar.checked });
    }
  }
  return { version: ctx.settings?.revision ?? 1, timeZone: zone, slots: slots.slice(0, 500) };
}

export function newBookingAccess(agentName?: string) {
  // Unlike staged legacy secrets, these bearer tokens must never be stored plaintext.
  if (!process.env.SECRETS_ENC_KEY) throw new PublicBookingError("unavailable", "Booking token encryption is not configured.");
  const manage = randomBytes(32).toString("base64url"), confirm = agentName ? randomBytes(32).toString("base64url") : null;
  const status = agentName ? randomBytes(32).toString("base64url") : null;
  return {
    manageHash: tokenHash(manage), manageCiphertext: encryptSecret(manage),
    ...(confirm && status ? { confirmHash: tokenHash(confirm), confirmCiphertext: encryptSecret(confirm), statusHash: tokenHash(status), statusCiphertext: encryptSecret(status), agentName } : {}),
  };
}

export async function issueNativeAccess(tenant: string, ref: string) {
  return await nativeRpc("issue_booking_access", { p_tenant_id: tenant, p_ref: ref, p_access: newBookingAccess() }) as Record<string, unknown>;
}

export async function requestAgentBooking(tenant: string, raw: unknown) {
  await requireAgentBookings();
  const input = agentBookingSchema.parse(raw);
  const ctx = await context(tenant);
  const service = ctx.services.find(s => s.active && (s.externalRef === input.serviceId || s.id === input.serviceId));
  if (!service) throw new PublicBookingError("not_found", "This service is unavailable.");
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const legacyId = `agent-${input.requestId}`;
  // Idempotent retries must survive their own occupied slot and never reopen
  // an expired hold. The atomic hold RPC verifies the original fingerprint.
  const existing = (await readTenantBookings(tenant)).find(b => b.legacyId === legacyId);
  const duration = service.durationMinutes ?? settingsOrDefault(ctx).defaultLengthMinutes;
  const end = new Date(Date.parse(input.start) + duration * 60000).toISOString();
  if (!existing) {
    const offered = await nativeSlots(tenant, input.serviceId, input.start, new Date(Date.parse(end) + 1).toISOString());
    if (!offered.slots.some(s => Date.parse(s.start) === Date.parse(input.start))) throw new PublicBookingError("conflict", "That time has just been taken. Choose another time.");
  }
  const data = await nativeRpc("hold_agent_booking", { p_tenant_id: tenant, p_booking: {
    legacyId, status: "held", origin: "agent", serviceRef: input.serviceId, serviceName: service.name,
    start: input.start, end, bufferMinutes: settingsOrDefault(ctx).bufferMinutes, timeZone: timeZoneOf(ctx),
    customer: input.customer, requestFingerprint: fingerprint,
  }, p_access: newBookingAccess(input.agent.name) }) as { status: string; booking?: unknown; access?: Record<string, unknown> };
  if (data.status === "conflict") throw new PublicBookingError("conflict", "That time has just been taken. Choose another time.");
  const booking = parseStoreBooking(data.booking);
  if (!booking || !data.access) throw new PublicBookingError("unavailable", "The booking receipt is unavailable.");
  // The assistant receives only a status token, never the customer confirm or
  // management token. Confirmation can only come from the customer's email.
  return { booking, created: data.status === "recorded", statusToken: decryptSecret(String(data.access.status_ciphertext)), confirmationRequired: booking.status === "held" };
}

export async function nativeBookingByToken(hash: string, kind: "manage" | "confirm" | "status") {
  const data = await nativeRpc("read_native_booking_access", { p_hash: hash, p_kind: kind }) as Record<string, unknown> | null;
  const booking = parseStoreBooking(data);
  return booking && data ? { ...booking, siteName: String(data.siteName ?? ""), confirmationRequired: data.confirmationRequired === true,
    confirmUntil: typeof data.confirmUntil === "string" ? data.confirmUntil : null } : null;
}

export async function confirmAgent(hash: string) {
  const booking = await nativeBookingByToken(hash, "confirm");
  if (!booking?.tenantId) throw new PublicBookingError("not_found", "This booking link has expired.");
  const ctx = await context(booking.tenantId);
  const calendar = await readCalendarBusy(ctx, booking.localDate, booking.timeZone);
  const result = await nativeRpc("confirm_agent_booking", { p_hash: hash, p_force_request: calendar.connected && !calendar.checked }) as { booking: unknown };
  return parseStoreBooking(result.booking)!;
}

export async function changeNativeBooking(hash: string, action: "cancel" | "reschedule", start?: string) {
  const booking = await nativeBookingByToken(hash, "manage");
  if (!booking?.tenantId || Date.parse(booking.end) <= Date.now()) throw new PublicBookingError("not_found", "This booking link has expired.");
  let change: Record<string, unknown> = { action };
  if (action === "reschedule") {
    if (!start || !booking.serviceRef) throw new PublicBookingError("invalid", "Choose an open time.");
    const minutes = Math.round((Date.parse(booking.end) - Date.parse(booking.start)) / 60000);
    const offered = await nativeSlots(booking.tenantId, booking.serviceRef, start, new Date(Date.parse(start) + (minutes + 1) * 60000).toISOString());
    const slot = offered.slots.find(s => Date.parse(s.start) === Date.parse(start));
    if (!slot) throw new PublicBookingError("conflict", "That time is unavailable.");
    change = { action, start: slot.start, end: slot.end, forceRequest: !slot.calendarChecked };
  }
  const data = await nativeRpc("change_native_booking", { p_hash: hash, p_change: change });
  const result = parseStoreBooking(data);
  if (!result) throw new PublicBookingError("unavailable", "The booking receipt is unavailable.");
  return result;
}

export function agentReceipt(result: { booking: StoreBooking; statusToken: string | null; confirmationRequired: boolean }) {
  return { reservationId: result.booking.id, status: result.booking.status, confirmationRequired: result.confirmationRequired,
    statusToken: result.statusToken, start: result.booking.start, end: result.booking.end };
}
