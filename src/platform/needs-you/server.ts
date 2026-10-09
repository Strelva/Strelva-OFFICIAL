import { withCanonicalApprovalStore } from "@/platform/approval-store";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { businessRecordDraftAdapter } from "./sources/business-record-draft";
import { PostgresBusinessFactDraftStore } from "@/platform/ask/workspace-drafts-repository";
import { askReleaseMayBeOn } from "@/platform/ask/release";
import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { chaseBookingCalendarHealth } from "@/platform/bookings/calendar-health";
import { bookingSettingsAdapter } from "@/platform/bookings/setup";
import { deliverBookingUpdates } from "@/platform/bookings/updates";
import { connectedSiteSchemaAdapter } from "./sources/connected-site-schema";
import { getEventRaw, getEvents, getEventsRaw } from "@/lib/events";
import { readCatalogReportHandled } from "@/platform/catalog-reports/receipts";
import { readToolNoticeHandled } from "@/platform/catalog-reports/tool-notices";
import { resolveEventAction } from "@/lib/event-actions";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { publishingDecisionDeliveryAllowed } from "./publishing-delivery";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
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
import { businessFactsAdapter, createBusinessFactReviewStore, type BusinessFactsPorts } from "./sources/business-facts";
import { bookingRequestAdapter, bookingRequestItem } from "@/platform/bookings/needs-you-adapter";
import { decideBookingRequest, readWorkspaceBooking, readWorkspaceBookingRequests, readNativeBookingWorkspaces } from "@/platform/bookings/store";
import { bookingStoreWriteEnabled, bookingOwnerNoticeEnabled, bookingReadSource } from "@/platform/bookings/flags";
import { updateBooking as updateLegacyBookingStatus } from "@/platform/bookings/legacy-store";
import { businessPaymentAdapter } from "./sources/business-payment";
import { inquiryFactAdapter } from "./sources/inquiry-fact";

import { needsYouReleaseEnabled } from "./release";
export { needsYouReleaseEnabled } from "./release";

/** The item store, exposed so the approve route can render its confirm page. */
export const needsYouStore: NeedsYouStore = PostgresNeedsYouStore;

export function needsYouAppOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || CONTROL_PLANE_URL;
}

/** What a decision carries past the source, wired at the app edge (routes may import what platform can't). */
export interface NeedsYouEffects {
  google?: import("@/platform/make-real/google-adapter").GoogleMakeRealPorts;
  /** After business facts are confirmed: native websites follow (#509). */
  businessFactsConfirmed?: BusinessFactsPorts["confirmed"];
}

export function needsYouService(store: NeedsYouStore = PostgresNeedsYouStore, effects: NeedsYouEffects = {}) {
  const commitments = new DeliveryCommitmentService(mutateServiceRequestCommitment);
  const facts = createBusinessFactReviewStore();
  return createNeedsYouService({
    store,
    appOrigin: needsYouAppOrigin(),
    now: () => Date.now(),
    bookingCalendarHealth: chaseBookingCalendarHealth,
    bookingUrgentAllowed: async workspaceId => {
      try { return !await isRateLimitedWindowedAsync(`booking-owner-urgent:${workspaceId}`, 5, 3600000); }
      catch { return false; } // keep the durable item for the digest on outages
    },
    bookingWorkspaces: async () => bookingStoreWriteEnabled() && await bookingReadSource() === "postgres" ? readNativeBookingWorkspaces() : [],
    pendingWorkspaces: () => facts.pendingWorkspaces(),
    async sendEmail(input) {
      if (input.tags?.lifecycle === "booking_request" || input.tags?.lifecycle === "booking_calendar_health") {
        const { bookingCustomerEmailAllowed } = await import("@/platform/bookings/updates");
        if (!await bookingCustomerEmailAllowed(input.tenantId ?? null, input.tags?.bookingWorkspaceId)) return { status: "suppressed", reason: "email_gates" };
      }
      return sendEmailWithReceipt(input);
    },
    emailAllowed: async row => {
      if (row.sourceLifecycle !== "website_domain") return true;
      const domains = await import("./sources/website-domain-store");
      const request = (await domains.websiteDomainRequestStore.list(row.workspaceId)).find(request => request.id === row.sourceId);
      return domains.websiteDomainEmailAllowed(request?.tenantId);
    },
    canDeliver: publishingDecisionDeliveryAllowed,
    urgentInquiryAllowed: async (tenantId) => process.env.STRELVA_INQUIRY_OWNER_NOTICES === "1" && needsYouReleaseEnabled()
      && emailSendingEnabled() && customerEmailEnabled() && (!tenantId || await getClientEmailOverride(tenantId) !== "off"),
    adapters: [
      connectedSiteSchemaAdapter(),
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
      businessRecordDraftAdapter(PostgresBusinessFactDraftStore, askReleaseMayBeOn, effects.businessFactsConfirmed),
      ...systemsSourceAdapters(store, effects.google),
      ...deliverySourceAdapters(),
      ...productSourceAdapters(),
      bookingSettingsAdapter(),
      inquiryFactAdapter(),
      businessPaymentAdapter(),
      // Provider and operator edits to business details wait for the owner (#509).
      businessFactsAdapter({ read: facts.read, confirm: facts.confirm, ...(effects.businessFactsConfirmed ? { confirmed: effects.businessFactsConfirmed } : {}) }),
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
    ].map(adapter => withCanonicalApprovalStore(adapter, { store, enabled: businessId => workspaceReleaseFlagEnabled("approval_store", businessId) })),
  });
}

/** The last week of recorded changes for this business, newest first. */
export async function readStrelvaHandled(actor: WorkspaceActor, workspaceId: string, store: NeedsYouStore = PostgresNeedsYouStore, now = Date.now()): Promise<HandledReceipt[]> {
  const since = now - 7 * 24 * 60 * 60 * 1000;
  const rows = await store.handled(actor, workspaceId, new Date(since).toISOString());
  const tenants = await store.linkedTenants(workspaceId).catch(() => []);
  // A tenant event an owner decided through Needs you is shown once, as the decision's receipt.
  const decided = decidedTenantEventIds(rows);
  const events = (await Promise.all(tenants.map(async link => (await getEvents(link.tenantId, { limit: 100 }).catch(() => []))
    .filter(event => !decided.has(`${link.tenantId}:${event.id}`))))).flat();
  const reports = await readCatalogReportHandled(actor, workspaceId, new Date(since).toISOString());
  const notices = await readToolNoticeHandled(actor, workspaceId, new Date(since).toISOString());
  return mergeHandled([...rows.map(handledFromStore), ...events.map(handledFromTenantEvent), ...reports, ...notices], since).slice(0, 50);
}

/** Booking capture opens only this request; the hourly cron remains recovery. */
export async function notifyBookingRequestNow(booking: import("@/platform/bookings/store").StoreBooking, store: NeedsYouStore = PostgresNeedsYouStore) {
  if (!needsYouReleaseEnabled() || !bookingStoreWriteEnabled() || !bookingOwnerNoticeEnabled() || !booking.workspaceId) return;
  const item = bookingRequestItem(booking, booking.workspaceId);
  if (!item) return;
  const opened = await store.open(booking.workspaceId, item);
  await needsYouService(store).notifyBookingRequest(booking.workspaceId, opened.id);
}

/** Pending inquiry drafts use the same tenant event adapter as Needs you. */
export function pendingInquiryDecisionEvents(tenantId: string) {
  return getEventsRaw(tenantId, { status: "pending", limit: 1000 });
}

/** Trusted event lookup for inquiry decision executors; a global id never grants tenant access. */
export async function readInquiryDecisionEvent(tenantId: string, eventId: string) {
  const event = await getEventRaw(eventId);
  return event?.tenantId === tenantId ? event : null;
}
