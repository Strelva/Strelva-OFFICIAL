/** Staff take a booking request; only the owner decides it through Needs you. */
import { resolveBookingScope } from "./booking-scope";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { bookingReadSource, bookingStoreWriteEnabled } from "./flags";
import { nativeRpc, nativeServices, nativeSlots } from "./native";
import { parseStoreBooking, readTenantBookings, type BookingContext } from "./store";
import { bookingServicePoliciesEnabled, servicePolicy, validateBookingIntake } from "./service-policy";
import { PublicBookingError } from "./errors";
import { deliverBookingUpdates, notifyBookingRequestNow } from "./updates";

export const manualBookingScope = z.object({ workspaceId: z.string().uuid(), tenantId: z.string().min(1).max(80).optional() }).strict();
export const manualBookingInput = manualBookingScope.extend({
  serviceId: z.string().min(1).max(200), start: z.string().datetime({ offset: true }),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  customer: z.object({ name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(320), phone: z.string().max(80).optional() }).strict(),
  intakeAnswers: z.record(z.string().max(80), z.string().max(5000)).optional(),
}).strict();
export async function manualBookingsEnabled() {
  return process.env.STRELVA_BOOKING_MANUAL === "1" && bookingStoreWriteEnabled() && await bookingReadSource() === "postgres";
}
export interface ManualBookingPorts {
  enabled(): Promise<boolean>;
  rpc: typeof nativeRpc;
  services: typeof nativeServices;
  slots: typeof nativeSlots;
  bookings: typeof readTenantBookings;
  notify: typeof notifyBookingRequestNow;
  updates: typeof deliverBookingUpdates;
}
const defaults: ManualBookingPorts = { enabled: manualBookingsEnabled, rpc: nativeRpc, services: nativeServices, slots: nativeSlots, bookings: readTenantBookings, notify: notifyBookingRequestNow, updates: deliverBookingUpdates };
async function authorize(actor: WorkspaceActor, scope: z.infer<typeof manualBookingScope>, ports: ManualBookingPorts) {
  if (!await ports.enabled()) throw new PublicBookingError("unavailable", "Taking bookings here is not enabled. Nothing changed.");
  const bookingScope = resolveBookingScope(scope.workspaceId,scope.tenantId);
  const context = await ports.rpc("read_workspace_manual_booking_context", { p_workspace_id: scope.workspaceId, p_tenant_id: bookingScope, p_user_id: actor.userId, p_email: actor.verifiedEmail }) as BookingContext;
  if (bookingScope.startsWith("workspace:") && (context.workspaceId !== scope.workspaceId || !context.systemId)) throw new PublicBookingError("not_found","This business’s Bookings System is unavailable.");
  return { ...context, servicePolicies: bookingServicePoliciesEnabled() ? context.servicePolicies : undefined };
}
export async function manualBookingOptions(actor: WorkspaceActor, scope: z.infer<typeof manualBookingScope>, serviceId?: string, ports = defaults) {
  const parsed=manualBookingScope.parse(scope);
  const bookingScope=resolveBookingScope(parsed.workspaceId,parsed.tenantId);
  const context=await authorize(actor, parsed, ports);
  const services = await ports.services(bookingScope);
  const from = new Date().toISOString(), to = new Date(Date.now() + 14 * 86400000).toISOString();
  const offered = serviceId && !context.paused ? await ports.slots(bookingScope, serviceId, from, to) : null;
  return { ...services, slots: offered?.slots.slice(0, 60) ?? [] };
}
export async function createManualBooking(actor: WorkspaceActor, raw: unknown, ports = defaults) {
  const input = manualBookingInput.parse(raw);
  const bookingScope=resolveBookingScope(input.workspaceId,input.tenantId);
  const context = await authorize(actor, { workspaceId: input.workspaceId, tenantId: bookingScope }, ports);
  const legacyId = `manual-${input.requestId}`;
  const existing = (await ports.bookings(bookingScope)).find(b => b.legacyId === legacyId);
  const fingerprint = createHash("sha256").update(JSON.stringify(bookingScope.startsWith("workspace:") ? {
    workspaceId:input.workspaceId,scope:bookingScope,serviceId:input.serviceId,start:input.start,requestId:input.requestId,customer:input.customer,
    intakeAnswers:Object.fromEntries(Object.entries(input.intakeAnswers ?? {}).sort(([a],[b])=>a.localeCompare(b))),
  } : { ...input, intakeAnswers: input.intakeAnswers ?? {} })).digest("hex");
  let end = existing?.end;
  if (!existing) {
    if (context.paused) throw new PublicBookingError("conflict","Bookings are paused. Existing bookings are kept.");
    try { input.intakeAnswers = validateBookingIntake(servicePolicy(context, input.serviceId), input.intakeAnswers); }
    catch (error) { throw new PublicBookingError("invalid", error instanceof Error ? error.message : "Check the booking questions."); }
    const offered = await ports.slots(bookingScope, input.serviceId, input.start, new Date(Date.parse(input.start) + 86400000).toISOString());
    end = offered.slots.find(s => Date.parse(s.start) === Date.parse(input.start))?.end;
    if (!end) throw new PublicBookingError("conflict", "That time is unavailable. Choose another time.");
  }
  const data = await ports.rpc("create_workspace_manual_booking", {
    p_workspace_id: input.workspaceId, p_tenant_id: bookingScope, p_user_id: actor.userId, p_email: actor.verifiedEmail,
    p_booking: { legacyId, serviceRef: input.serviceId, start: input.start, end, customer: input.customer,
      intakeAnswers: input.intakeAnswers ?? {}, requestFingerprint: fingerprint },
  }) as { status: string; booking: unknown };
  if (data.status === "conflict") throw new PublicBookingError("conflict", "That time has just been taken. Choose another time.");
  const booking = parseStoreBooking(data.booking);
  if (!booking) throw new PublicBookingError("unavailable", "The booking receipt is unavailable. Check bookings before trying again.");
  await ports.notify(booking).catch(() => undefined);
  await ports.updates(booking.id).catch(() => undefined);
  return { booking, created: data.status === "recorded" };
}
