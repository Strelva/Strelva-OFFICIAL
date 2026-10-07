import { z } from "zod";
import { createHash } from "node:crypto";
import { systemsReleasedFor } from "@/platform/systems-release";
import { listWorkspaces } from "@/platform/workspaces";
import { listBusinessSystems } from "@/platform/systems/from-existing";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { getTenantConfig } from "@/lib/tenants";
import { getVersions } from "@/lib/storage/version-store";
import { applySectionUpdate } from "@/lib/apply-section-update";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { getSiteCapabilityManifest } from "@/lib/site-capabilities";
import { requireTenantPermission } from "@/platform/infra/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { isSuperAdminUser } from "@/platform/infra/db/repositories";
import { isContentSection } from "@/lib/types";
import { siteEditingFor, siteChangeRequestCommand, type WebsiteRebuildRecord } from "@/products/websites/client";
import { getSiteSnapshots } from "@/lib/storage/site-snapshot-store";
import { websiteRebuildReleasedFor, websiteDocumentStore } from "@/products/websites/index";

// App-edge composition: resolve workspace authority, then adapt the existing
// tenant review stores. Neither product code nor src/lib imports this adapter.
export const websiteContentRestoreSchema = z.object({
  workspaceId: z.string().uuid(), systemId: z.string().uuid(),
  section: z.string().refine(isContentSection), versionId: z.string().min(1).max(200),
}).strict();

const identity = { workspaceId: z.string().uuid(), systemId: z.string().uuid() };
export const websiteHistoryRestoreSchema = z.union([
  websiteContentRestoreSchema,
  z.object({ ...identity, kind: z.literal("snapshot"), snapshotId: z.string().min(1).max(200) }).strict(),
  z.object({ ...identity, kind: z.literal("document"), workId: z.string().uuid(), targetRevision: z.number().int().positive(), targetContentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);

const live = {
  released: systemsReleasedFor,
  workspaces: listWorkspaces,
  systems: (actor: WorkspaceActor, businessId: string) => listBusinessSystems(actor, businessId, { store: createSupabaseSystemStore() }),
  operator: isSuperAdminUser,
  tenant: (tenantId: string) => getTenantConfig(tenantId),
  template: (tenantId: string) => getTemplateManifestForTenant(tenantId),
  capabilities: (tenantId: string) => getSiteCapabilityManifest(tenantId),
  canWrite: async (tenantId: string) => !(await requireTenantPermission(tenantId, "content:write")),
  subscribed: async (tenantId: string) => !(await requireActiveSubscription(tenantId)),
  versions: (...args: Parameters<typeof getVersions>) => getVersions(...args),
  apply: (...args: Parameters<typeof applySectionUpdate>) => applySectionUpdate(...args),
};

const history = {
  snapshots: (tenantId: string) => getSiteSnapshots(tenantId, 60),
  rebuildReleased: websiteRebuildReleasedFor,
  document: (...args: Parameters<typeof websiteDocumentStore.read>) => websiteDocumentStore.read(...args),
  rebuild: (actor: WorkspaceActor, workId: string) => import("@/products/websites/index").then(module => module.readWebsiteRebuild(actor, workId)),
  undo: (actor: WorkspaceActor, workId: string, input: unknown) => import("@/products/websites/index").then(module => module.undoWebsiteRebuild(actor, workId, input)),
  request: async (actor: WorkspaceActor, input: ReturnType<typeof siteChangeRequestCommand>) => {
    const { ServiceRequestService, PostgresServiceRequestStore } = await import("@/platform/service-requests");
    return new ServiceRequestService(PostgresServiceRequestStore).execute(actor, input);
  },
};

/** Reuse the agent's undo path: prepare a before/after review, never publish
 * from a History click. Every resource is resolved through this business's
 * authorized System, then through the tenant's own declared sections. */
export function createWebsiteContentRestoreService(ports: typeof live & Partial<typeof history> = live) {
  const sources = { ...history, ...ports };
  return async (actor: WorkspaceActor, raw: unknown) => {
    const input = websiteHistoryRestoreSchema.parse(raw);
    if (!(await ports.released(actor, input.workspaceId))) throw new WorkspaceConflictError("Website restore is not enabled for this business.");
    const workspace = (await ports.workspaces(actor)).find(item => item.id === input.workspaceId && item.kind === "customer" && item.access === "member");
    if (!workspace || (workspace.role !== "owner" && !(workspace.role === "admin" && await ports.operator(actor.userId)))) throw new WorkspaceAccessError("Only the owner or a Strelva operator can prepare a restore.");
    const site = (await ports.systems(actor, input.workspaceId)).systems.find(item => item.system.id === input.systemId && item.system.kind === "website");
    if (!site) throw new WorkspaceAccessError();
    if ("kind" in input && input.kind === "document") {
      if (site.references.savedWorkId !== input.workId) throw new WorkspaceAccessError();
      if (!(await sources.rebuildReleased(actor, input.workspaceId))) throw new WorkspaceConflictError("Website revision restore is not enabled for this business.");
      if (site.references.tenantId) {
        if (!(await ports.canWrite(site.references.tenantId))) throw new WorkspaceAccessError();
        if (!(await ports.subscribed(site.references.tenantId)) || !(await ports.tenant(site.references.tenantId))?.active) throw new WorkspaceConflictError("This website's service is not active.");
      }
      const target = await sources.document(actor, { workspaceId: input.workspaceId, workId: input.workId, revision: input.targetRevision });
      if (!target || target.contentHash !== input.targetContentHash) throw new WorkspaceConflictError("That saved site revision is unavailable.");
      const current: WebsiteRebuildRecord = await sources.rebuild(actor, input.workId);
      const candidate = current.rebuild.candidate;
      if (current.workspaceId !== input.workspaceId || !candidate || input.targetRevision >= candidate.revision) throw new WorkspaceConflictError("Choose an earlier saved site revision to restore.");
      // The shared undo service pins the current candidate by CAS, saves a new
      // immutable revision and clears approval. It cannot publish or move DNS.
      const prepared = await sources.undo(actor, input.workId, { expectedRevision: current.rebuild.revision, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash, targetRevision: input.targetRevision });
      return { status: "queued" as const, eventId: null, previewHref: prepared.rebuild.candidate?.previewHref, message: "The earlier site revision is saved as a new candidate for review. Your live website is unchanged." };
    }
    const tenantId = site?.references.tenantId;
    if (!tenantId) throw new WorkspaceAccessError();
    if (!(await ports.canWrite(tenantId))) throw new WorkspaceAccessError();
    if (!(await ports.subscribed(tenantId))) throw new WorkspaceConflictError("This website's service is not active.");
    const tenant = await ports.tenant(tenantId);
    if ("kind" in input && input.kind === "snapshot") {
      if (!tenant?.active || !site.references.tenantStableId) throw new WorkspaceConflictError("This website's service is not active.");
      const snapshot = (await sources.snapshots(tenantId)).find(item => item.id === input.snapshotId && item.tenantId === tenantId && item.status === "available");
      if (!snapshot) throw new WorkspaceConflictError("That saved site copy is unavailable on this website.");
      // The legacy full-snapshot restore writes live sections without review.
      // Request the exact copy instead; Strelva must prepare a preview and obtain
      // approval. Neither this Request nor its retry mutates the saved copy.
      const command = siteChangeRequestCommand({ workspaceId: input.workspaceId, systemId: input.systemId, tenantStableId: site.references.tenantStableId, editing: siteEditingFor(tenant), words: `Prepare a restore from saved copy "${snapshot.label}" (${snapshot.id}, saved ${snapshot.createdAt}) for my review. Preserve the live site until I approve the preview.`, idempotencyKey: `restore-snapshot:${createHash("sha256").update(`${input.systemId}:${snapshot.id}`).digest("hex")}` });
      const restoreCommand = { ...command, context: { ...command.context, restoreSnapshotId: snapshot.id, restoreSnapshotCreatedAt: snapshot.createdAt } };
      const filed = await sources.request(actor, restoreCommand);
      return { status: "requested" as const, requestId: filed.id, message: "Strelva has your Request to restore this exact saved copy. A preview still needs to be prepared and approved. Your live website is unchanged." };
    }
    if (!tenant?.active || siteEditingFor(tenant) !== "native") throw new WorkspaceConflictError("Strelva prepares repository changes as Requests for this website.");
    const template = await ports.template(tenantId);
    if (!isContentSection(input.section) || !template.contentSections.includes(input.section)) throw new WorkspaceConflictError("This section is not editable on this website.");
    const version = (await ports.versions(input.section, tenantId)).find(item => item.id === input.versionId);
    if (!version || !version.data || typeof version.data !== "object" || Array.isArray(version.data)) throw new WorkspaceConflictError("That saved content version is unavailable on this website.");
    return ports.apply({ tenantId, section: input.section, data: version.data as Record<string, unknown>, tenantConfig: tenant,
      siteManifest: await ports.capabilities(tenantId), forceReview: true });
  };
}

export const prepareWebsiteContentRestore = createWebsiteContentRestoreService();
