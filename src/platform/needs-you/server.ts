import { getEventRaw, getEvents } from "@/lib/events";
import { resolveEventAction } from "@/lib/event-actions";
import { sendEmailWithReceipt } from "@/lib/email/send";
import { DeliveryCommitmentService, PostgresServiceRequestStore, mutateServiceRequestCommitment } from "@/platform/service-requests";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { serviceRequestAdapter, tenantEventAdapter } from "./adapters";
import type { HandledReceipt } from "./contracts";
import { handledFromStore, handledFromTenantEvent, mergeHandled } from "./handled";
import { PostgresNeedsYouStore, type NeedsYouStore } from "./repository";
import { createNeedsYouService } from "./service";
import { systemsSourceAdapters } from "./systems-sources";
import { workspaceSourceAdaptersA } from "./sources/server";
import { liveSourceAdaptersB } from "./sources/live-b";

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
      ...workspaceSourceAdaptersA(),
      ...liveSourceAdaptersB(),
    ],
  });
}

/** The last week of what Strelva did for this business, newest first. */
export async function readStrelvaHandled(actor: WorkspaceActor, workspaceId: string, store: NeedsYouStore = PostgresNeedsYouStore, now = Date.now()): Promise<HandledReceipt[]> {
  const since = now - 7 * 24 * 60 * 60 * 1000;
  const rows = await store.handled(actor, workspaceId, new Date(since).toISOString());
  const tenants = await store.linkedTenants(workspaceId).catch(() => []);
  const events = (await Promise.all(tenants.map(link => getEvents(link.tenantId, { limit: 100 }).catch(() => [])))).flat();
  return mergeHandled([...rows.map(handledFromStore), ...events.map(handledFromTenantEvent)], since).slice(0, 50);
}
