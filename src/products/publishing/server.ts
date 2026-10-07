import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { BusinessSystems } from "@/platform/systems/from-existing";
import { publishingSnapshotSchema, type PublishingExtras, type PublishingSnapshot, type SiteAudience, type SiteCollections } from "./projection";

/**
 * Server reads for publishing in the workspace. Stores stay keyed by tenant
 * (newsletter_subscribers, collection_entries); the business reaches them
 * through the tenants it holds. Only the Google grant and its locations are
 * workspace-keyed. Everything here is read-only.
 */

/** STRELVA_PUBLISHING_RELEASE=1 shows the listing and newsletter Systems and
 * website parts on top of STRELVA_SYSTEMS_RELEASE. Off by default. */
export function publishingReleaseEnabled(env: { STRELVA_PUBLISHING_RELEASE?: string } = { STRELVA_PUBLISHING_RELEASE: process.env.STRELVA_PUBLISHING_RELEASE }): boolean {
  return env.STRELVA_PUBLISHING_RELEASE === "1" || env.STRELVA_PUBLISHING_RELEASE === "workspace";
}

type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };

/** Actor-checked by read_business_publishing; never returns a token. */
export async function readPublishingSnapshot(actor: WorkspaceActor, businessId: string, db: Db | null = getSupabase() as unknown as Db | null): Promise<PublishingSnapshot> {
  if (!db) throw new Error("Publishing storage is unavailable.");
  const { data, error } = await db.rpc("read_business_publishing", {
    p_workspace_id: z.string().uuid().parse(businessId),
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
    p_limit: 40,
  });
  if (error) throw new Error("Publishing could not be loaded.");
  return publishingSnapshotSchema.parse(data);
}

export interface PublishingExtraReaders {
  activeSubscribers(tenantId: string): Promise<number>;
  collections(tenantId: string): Promise<SiteCollections["types"]>;
  approvedIssues?(workspaceId: string, tenantId: string): Promise<number>;
}

const defaultReaders: PublishingExtraReaders = {
  async approvedIssues(workspaceId, tenantId) {
    const db = getSupabase();
    if (!db) throw new Error("Newsletter issues are unavailable.");
    const { data, error } = await (db as unknown as Db).rpc("read_workspace_newsletter_issues", { p_workspace_id: workspaceId, p_tenant_id: tenantId });
    if (error || !Array.isArray(data)) throw new Error("Newsletter issues could not be read.");
    return data.length;
  },
  async activeSubscribers(tenantId) {
    const { getSubscribers } = await import("@/lib/storage/newsletter-store");
    return (await getSubscribers(tenantId)).filter((subscriber) => subscriber.status === "active").length;
  },
  async collections(tenantId) {
    const { listEntriesForType } = await import("@/lib/cms/collections-service");
    const types = ["blog", "video", "product"] as const;
    return Promise.all(types.map(async (type) => {
      const rows = await listEntriesForType(tenantId, type, { limit: 500 });
      return {
        type,
        published: rows.filter((row) => row.status === "published").length,
        drafts: rows.filter((row) => row.status === "draft").length,
      };
    }));
  },
};

/** Subscribers and collections per website tenant. A store that can't be read
 * is left out, never reported as zero. */
export async function readPublishingExtras(listing: BusinessSystems, readers: PublishingExtraReaders = defaultReaders): Promise<PublishingExtras> {
  const tenants = [...new Set(listing.systems
    .filter((item) => item.system.kind === "website" && item.references.tenantId)
    .map((item) => item.references.tenantId!))];
  const newsletters: SiteAudience[] = [];
  const collections: SiteCollections[] = [];
  await Promise.all(tenants.map(async (tenantId) => {
    const [count, types, approvedIssues] = await Promise.all([
      readers.activeSubscribers(tenantId).catch(() => null),
      readers.collections(tenantId).catch(() => null),
      readers.approvedIssues?.(listing.businessId, tenantId).catch(() => null) ?? Promise.resolve(null),
    ]);
    if (count !== null) newsletters.push({ tenantId, activeSubscribers: count, ...(approvedIssues !== null ? { approvedIssues } : {}) });
    if (types) collections.push({ tenantId, types });
  }));
  newsletters.sort((a, b) => a.tenantId.localeCompare(b.tenantId));
  collections.sort((a, b) => a.tenantId.localeCompare(b.tenantId));
  return { newsletters, collections };
}

export const publishingEnabledForWorkspace = async (...args: Parameters<typeof import("./release").publishingEnabledForWorkspace>) => (await import("./release")).publishingEnabledForWorkspace(...args);

export const recordGoogleApprovalPolicyEnabled = async (...args: Parameters<typeof import("./release").recordGoogleApprovalPolicyEnabled>) => (await import("./release")).recordGoogleApprovalPolicyEnabled(...args);

export const authorizePublishingEvent = async (...args: Parameters<typeof import("./authority").authorizePublishingEvent>) => (await import("./authority")).authorizePublishingEvent(...args);

export const contentTarget = async (...args: Parameters<typeof import("./content-server").contentTarget>) => (await import("./content-server")).contentTarget(...args);

export const prepareContentDraft = async (...args: Parameters<typeof import("./content-service").prepareContentDraft>) => (await import("./content-service")).prepareContentDraft(...args);

export const readContentWorkspace = async (...args: Parameters<typeof import("./content-service").readContentWorkspace>) => (await import("./content-service")).readContentWorkspace(...args);

export const changeRecordWithGoogle = async (...args: Parameters<typeof import("./record-changes").changeRecordWithGoogle>) => (await import("./record-changes")).changeRecordWithGoogle(...args);

export const patchRecordWithGoogle = async (...args: Parameters<typeof import("./record-changes").patchRecordWithGoogle>) => (await import("./record-changes")).patchRecordWithGoogle(...args);

export const executePublishingEvent = async (...args: Parameters<typeof import("./execution").executePublishingEvent>) => (await import("./execution")).executePublishingEvent(...args);

export { recordGoogleApprovalCopy, recordGoogleSummary } from "./record-changes";
export type { RecordGoogleSummary } from "./record-changes";
export * from "./reconnect";
export { reconnectPage } from "./reconnect-page";

export const prepareContentRestore = async (...args: Parameters<typeof import("./content-service").prepareContentRestore>) => (await import("./content-service")).prepareContentRestore(...args);

export const prepareTenantCollectionDraft = async (...args: Parameters<typeof import("./content-server").prepareTenantCollectionDraft>) => (await import("./content-server")).prepareTenantCollectionDraft(...args);
