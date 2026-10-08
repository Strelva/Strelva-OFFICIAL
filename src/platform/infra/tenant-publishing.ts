import type { UnifiedEvent } from "./event-contract";
import type { CollectionType } from "./collection-types";

/** The app edge supplies the existing tenant stores. Workspace code depends
 * on this contract, never imports the tenant model or creates a second store. */
export interface TenantPublishingPorts {
  /** Existing tenant policy/drafter, supplied at the app edge. Missing is
   * unavailable; workspace maintenance must never guess a policy or reply. */
  reviewPreparation?: {
    mode(tenantId: string): Promise<string>;
    declined(tenantId: string, reviewId: string): Promise<boolean>;
    draft(review: { reviewId: string; reviewerName: string; rating: number; comment?: string }, business: { id: string; siteName: string }): Promise<string>;
  };
  markExecutionExternalAccepted(eventId: string): Promise<void>;
  markExecutionExternalUnconfirmed(eventId: string): Promise<void>;
  addEvent(event: Omit<UnifiedEvent, "id" | "createdAt">, options?: { requirePersistence?: boolean }): Promise<UnifiedEvent>;
  getEventRaw(id: string): Promise<UnifiedEvent | null>;
  getEvents(tenantId: string, options?: { limit?: number; status?: UnifiedEvent["status"] }): Promise<UnifiedEvent[]>;
  getEventsRaw(tenantId: string, options?: { limit?: number; status?: UnifiedEvent["status"] }): Promise<UnifiedEvent[]>;
  getEntry(tenantId: string, type: CollectionType, slug: string): Promise<{ status: string; data: unknown } | null>;
  listEntriesForType(tenantId: string, type: CollectionType, options?: { limit?: number }): Promise<Array<{ slug: string; status: string; data: unknown }>>;
  resolveEventAction(tenantId: string, eventId: string, action: "approved" | "dismissed", actorId: string): Promise<{ changed: boolean; reason?: string }>;
  mirrorPublishedReviewReply(tenantId: string, reviewId: string, text: string | null): Promise<unknown>;
  recordGoogleConnection(input: { tenantId: string; accessToken: string; refreshToken: string; expiresAt: string; scopes: string[] }): Promise<{ binding: string }>;
}

const SLOT = Symbol.for("strelva.tenant-publishing-ports");
type Slot = typeof globalThis & { [SLOT]?: () => Promise<TenantPublishingPorts> };
export function registerTenantPublishingPorts(load: () => Promise<TenantPublishingPorts>): void {
  (globalThis as Slot)[SLOT] = load;
}
export async function tenantPublishingPorts(): Promise<TenantPublishingPorts> {
  const load = (globalThis as Slot)[SLOT];
  if (!load) throw new Error("Tenant publishing ports are not registered at the app edge.");
  return load();
}
