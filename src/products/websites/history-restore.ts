import { z } from "zod";
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
import { siteEditingFor } from "./site-editing";

export const websiteContentRestoreSchema = z.object({
  workspaceId: z.string().uuid(), systemId: z.string().uuid(),
  section: z.string().refine(isContentSection), versionId: z.string().min(1).max(200),
}).strict();

const live = {
  released: systemsReleasedFor,
  workspaces: listWorkspaces,
  systems: (actor: WorkspaceActor, businessId: string) => listBusinessSystems(actor, businessId, { store: createSupabaseSystemStore() }),
  operator: isSuperAdminUser,
  tenant: getTenantConfig,
  template: getTemplateManifestForTenant,
  capabilities: getSiteCapabilityManifest,
  canWrite: async (tenantId: string) => !(await requireTenantPermission(tenantId, "content:write")),
  subscribed: async (tenantId: string) => !(await requireActiveSubscription(tenantId)),
  versions: getVersions,
  apply: applySectionUpdate,
};

/** Reuse the agent's undo path: prepare a before/after review, never publish
 * from a History click. Every resource is resolved through this business's
 * authorized System, then through the tenant's own declared sections. */
export function createWebsiteContentRestoreService(ports: typeof live = live) {
  return async (actor: WorkspaceActor, raw: unknown) => {
    const input = websiteContentRestoreSchema.parse(raw);
    if (!(await ports.released(actor, input.workspaceId))) throw new WorkspaceConflictError("Website restore is not enabled for this business.");
    const workspace = (await ports.workspaces(actor)).find(item => item.id === input.workspaceId && item.kind === "customer" && item.access === "member");
    if (!workspace || (workspace.role !== "owner" && !(workspace.role === "admin" && await ports.operator(actor.userId)))) throw new WorkspaceAccessError("Only the owner or a Strelva operator can prepare a restore.");
    const site = (await ports.systems(actor, input.workspaceId)).systems.find(item => item.system.id === input.systemId && item.system.kind === "website");
    const tenantId = site?.references.tenantId;
    if (!tenantId) throw new WorkspaceAccessError();
    if (!(await ports.canWrite(tenantId))) throw new WorkspaceAccessError();
    if (!(await ports.subscribed(tenantId))) throw new WorkspaceConflictError("This website's service is not active.");
    const tenant = await ports.tenant(tenantId);
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
