import { systemOriginId } from "@/platform/systems/invariants";
import type { ExistingSystemsSnapshot } from "@/platform/systems/from-existing";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { siteEditingFor, type SiteEditing } from "./site-editing";

/**
 * Resolves `/workspace/site` (a managed website's own pages in the
 * workspace): session actor → business membership → website System → link →
 * tenant. The website is found only through this business's link, by the
 * tenant's stable id, so a System id from another business opens nothing.
 * Every tab still runs the tenant's own API permission checks; this decides
 * what to show, never what to allow.
 */

export type WorkspaceSiteState =
  | { kind: "off" }
  | { kind: "permission" }
  | { kind: "not_found" }
  | { kind: "error" }
  | {
    kind: "ready";
    workspaceName: string;
    role: "owner" | "admin" | "member";
    operator: boolean;
    site: { tenantId: string; tenantStableId: string; siteName: string; tenantActive: boolean };
    editing: SiteEditing;
    /** The person can reach the tenant's own APIs (tenant membership, or a Strelva operator). */
    tenantAccess: boolean;
    /** Owners and admins change the site; members read it. */
    canChange: boolean;
  };

export interface WorkspaceSiteDeps {
  systemsReleased(workspaceId: string, viewer: { operator: boolean; tester: boolean; userId: string }): Promise<boolean>;
  listWorkspaces(actor: WorkspaceActor): Promise<Array<{ id: string; kind: string; name: string; access?: string; role?: string | null }>>;
  readSystems(actor: WorkspaceActor, workspaceId: string): Promise<ExistingSystemsSnapshot>;
  tenantConfig(tenantId: string): Promise<{ id: string; deliveryModel?: "custom_repo" | "platform_template" | null } | undefined>;
  hasTenantAccess(tenantId: string): Promise<boolean>;
  isOperator(): Promise<boolean>;
}

export async function resolveWorkspaceSite(deps: WorkspaceSiteDeps, actor: WorkspaceActor, workspaceId: string, systemId: string): Promise<WorkspaceSiteState> {
  try {
    const operator = await deps.isOperator().catch(() => false);
    if (!(await deps.systemsReleased(workspaceId, { operator, tester: false, userId: actor.userId }).catch(() => false))) return { kind: "off" };
    const workspace = (await deps.listWorkspaces(actor)).find((item) => item.id === workspaceId);
    const role = workspace?.role;
    if (!workspace || workspace.kind !== "customer" || (workspace.access && workspace.access !== "member") || (role !== "owner" && role !== "admin" && role !== "member")) {
      return { kind: "permission" };
    }
    const snapshot = await deps.readSystems(actor, workspaceId);
    const site = snapshot.managedWebsites.find((item) => systemOriginId(workspaceId, { kind: "tenant", ref: item.tenantStableId }) === systemId);
    if (!site) return { kind: "not_found" };
    const config = await deps.tenantConfig(site.tenantId).catch(() => undefined);
    const tenantAccess = await deps.hasTenantAccess(site.tenantId).catch(() => false);
    return {
      kind: "ready",
      workspaceName: workspace.name,
      role,
      operator,
      site: { tenantId: site.tenantId, tenantStableId: site.tenantStableId, siteName: site.siteName, tenantActive: site.tenantActive },
      editing: siteEditingFor(config ?? { id: site.tenantId }),
      tenantAccess,
      canChange: role === "owner" || role === "admin",
    };
  } catch (error) {
    if (error instanceof Error && (error.name === "WorkspaceAccessError" || error.name === "ZodError")) return { kind: "permission" };
    return { kind: "error" };
  }
}
