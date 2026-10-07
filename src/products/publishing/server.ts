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
}

const defaultReaders: PublishingExtraReaders = {
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
    const [count, types] = await Promise.all([
      readers.activeSubscribers(tenantId).catch(() => null),
      readers.collections(tenantId).catch(() => null),
    ]);
    if (count !== null) newsletters.push({ tenantId, activeSubscribers: count });
    if (types) collections.push({ tenantId, types });
  }));
  newsletters.sort((a, b) => a.tenantId.localeCompare(b.tenantId));
  collections.sort((a, b) => a.tenantId.localeCompare(b.tenantId));
  return { newsletters, collections };
}
