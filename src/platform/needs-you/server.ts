import { deliverBookingUpdates } from "@/platform/bookings/updates";
import { getEventRaw, getEvents } from "@/lib/events";
import { resolveEventAction } from "@/lib/event-actions";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { DeliveryCommitmentService, PostgresServiceRequestStore, mutateServiceRequestCommitment } from "@/platform/service-requests";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { serviceRequestAdapter, tenantEventAdapter } from "./adapters";
import type { HandledReceipt } from "./contracts";
import { decidedTenantEventIds, handledFromStore, handledFromTenantEvent, mergeHandled } from "./handled";
import { PostgresNeedsYouStore, type NeedsYouStore } from "./repository";
import { createNeedsYouService } from "./service";
import { systemsSourceAdapters } from "./systems-sources";
import { deliverySourceAdapters } from "./sources/live-delivery";
import { productSourceAdapters } from "./sources/live-products";
import { bookingRequestAdapter } from "@/platform/bookings/needs-you-adapter";
import { decideBookingRequest, readWorkspaceBooking, readWorkspaceBookingRequests } from "@/platform/bookings/store";
import { bookingStoreWriteEnabled } from "@/platform/bookings/flags";
import { updateBooking as updateLegacyBookingStatus } from "@/platform/bookings/legacy-store";

export { needsYouReleaseEnabled } from "./release";

/** The item store, exposed so the approve route can render its confirm page. */
export const needsYouStore: NeedsYouStore = PostgresNeedsYouStore;

export function needsYouAppOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com";
}

export function needsYouService(store: NeedsYouStore = PostgresNeedsYouStore) {
  const commitments = new DeliveryCommitmentService(mutateServiceRequestCommitment);
  return createNeedsYouService({
    store,
    appOrigin: needsYouAppOrigin(),
    now: () => Date.now(),
    sendEmail: sendEmailWithReceipt,
    adapters: [
      tenantEventAdapter({
        linkedTenants: async (workspaceId) => (await store.linkedTenants(workspaceId)).map(link => link.tenantId),
        pendingEvents: (tenantId) => getEvents(tenantId, { status: "pending", limit: 100 }),
        readEvent: getEventRaw,
        resolveEventAction: (tenantId, eventId, action, actorId) => resolveEventAction(tenantId, eventId, action, actorId),
      }),
      serviceRequestAdapter({
        list: (actor, businessId) => PostgresServiceRequestStore.list(actor, { businessId }),
        change: (actor, input) => commitments.execute(actor, { action: "delivery_commitment", ...input }),
      }),
      ...systemsSourceAdapters(store),
      ...deliverySourceAdapters(),
      ...productSourceAdapters(),
      // Booking requests in the one booking store (empty until request mode is used).
      bookingRequestAdapter({
        // Nothing to read until the store receives writes (and its migration exists).
        requests: async (workspaceId) => (bookingStoreWriteEnabled() ? readWorkspaceBookingRequests(workspaceId) : []),
        decide: (workspaceId, bookingId, decision, actor) => decideBookingRequest(workspaceId, bookingId, decision, actor),
        // Why a request stopped waiting (its own 72-hour clock, a cancel) for the closed item.
        booking: (workspaceId, bookingId) => readWorkspaceBooking(workspaceId, bookingId),
        afterDecision: async (booking) => {
          await deliverBookingUpdates(booking.id).catch(() => undefined);
          if (booking.legacyId && booking.tenantId) {
            await updateLegacyBookingStatus(booking.legacyId, { status: booking.status === "confirmed" ? "confirmed" : "cancelled" }, booking.tenantId);
          }
        },
      }),
    ],
  });
}

/** The last week of what Strelva did for this business, newest first. */
export async function readStrelvaHandled(actor: WorkspaceActor, workspaceId: string, store: NeedsYouStore = PostgresNeedsYouStore, now = Date.now()): Promise<HandledReceipt[]> {
  const since = now - 7 * 24 * 60 * 60 * 1000;
  const rows = await store.handled(actor, workspaceId, new Date(since).toISOString());
  const tenants = await store.linkedTenants(workspaceId).catch(() => []);
  // A tenant event an owner decided through Needs you is shown once, as the decision's receipt.
  const decided = decidedTenantEventIds(rows);
  const events = (await Promise.all(tenants.map(async link => (await getEvents(link.tenantId, { limit: 100 }).catch(() => []))
    .filter(event => !decided.has(`${link.tenantId}:${event.id}`))))).flat();
  return mergeHandled([...rows.map(handledFromStore), ...events.map(handledFromTenantEvent)], since).slice(0, 50);
}
