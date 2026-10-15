import { z } from "zod";
import { hasDashboardViewAccess, isSuperAdmin } from "@/platform/infra/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import { callReleaseFlagsRpc, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleasedFor } from "@/platform/systems-release";

/**
 * The managed sites a business holds, for the workspace homes of the old
 * `/dashboard` pages (owner-entry spec §5). Two checks, both required:
 *
 * 1. The person is a direct member of the business. `read_workspace_tenant_links`
 *    refuses anyone else (WorkspaceAccessError) and only returns tenants
 *    linked to this business by `tenant_workspace_links` (stable_id).
 * 2. For each linked site, the same tenant check the `/dashboard` page uses
 *    (`requireDashboardView` → `hasDashboardViewAccess`: a tenant membership
 *    or an active super admin). A site that fails it is listed as `denied`
 *    and none of its data is read.
 *
 * The public demo tenant is never read through a link.
 */

export interface LinkedSite {
  tenantId: string;
  tenantStableId: string;
  siteName: string;
}

export interface LinkedSites {
  /** Sites this person may read, in link order. */
  sites: LinkedSite[];
  /** Linked sites this person has no tenant access to. Named, never read. */
  denied: LinkedSite[];
}

export interface LinkedSiteDependencies {
  links: (actor: WorkspaceActor, workspaceId: string) => Promise<Array<{ tenantId: string; tenantStableId: string }>>;
  canView: (tenantId: string) => Promise<boolean>;
  siteName: (tenantId: string) => Promise<string>;
}

const linkRows = z.array(z.object({ tenantId: z.string().min(1), tenantStableId: z.string().uuid(), linkedAt: z.string() }));

export const linkedSiteDefaults: LinkedSiteDependencies = {
  links: (actor, workspaceId) => callReleaseFlagsRpc("read_workspace_tenant_links", {
    p_workspace_id: z.string().uuid().parse(workspaceId),
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  }, linkRows, "The business's sites could not be read."),
  canView: (tenantId) => hasDashboardViewAccess(tenantId),
  siteName: async (tenantId) => getTenantSiteName(tenantId, (await getTenantConfig(tenantId).catch(() => null)) ?? undefined),
};

/** Throws WorkspaceAccessError for anyone who isn't a direct member of this business. */
export async function readLinkedSites(actor: WorkspaceActor, workspaceId: string, dependencies: LinkedSiteDependencies = linkedSiteDefaults): Promise<LinkedSites> {
  const rows = await dependencies.links(actor, workspaceId);
  const checked = await Promise.all(rows.filter((row) => row.tenantId !== "demo").map(async (row) => {
    const siteName = await dependencies.siteName(row.tenantId).catch(() => row.tenantId);
    // A failed check is a denial, never a read.
    const allowed = await dependencies.canView(row.tenantId).catch(() => false);
    return { site: { tenantId: row.tenantId, tenantStableId: row.tenantStableId, siteName }, allowed };
  }));
  return {
    sites: checked.filter((item) => item.allowed).map((item) => item.site),
    denied: checked.filter((item) => !item.allowed).map((item) => item.site),
  };
}

/** One linked site by tenant id, for writes. Null when it isn't linked or isn't allowed. */
export async function readLinkedSite(actor: WorkspaceActor, workspaceId: string, tenantId: string, dependencies: LinkedSiteDependencies = linkedSiteDefaults): Promise<LinkedSite | null> {
  const { sites } = await readLinkedSites(actor, workspaceId, dependencies);
  return sites.find((site) => site.tenantId === tenantId) ?? null;
}

/**
 * Retained tenant businesses require owner entry for this viewer. A business
 * created through the new direct-owner door can use its places with Systems
 * released, without moving legacy owners. Its atomic signup receipt records
 * that origin; later adding a hosted website does not close the owner's door.
 * This is navigation eligibility, never a grant to read or write records.
 */
export async function ownerEntryHomesOpen(workspaceId: string, userId: string, check: {
  operator?: () => Promise<boolean>;
  flag?: typeof workspaceReleaseFlagEnabled;
} = {}): Promise<boolean> {
  const operator = await (check.operator ?? isSuperAdmin)().catch(() => false);
  if (await (check.flag ?? workspaceReleaseFlagEnabled)("owner_entry", workspaceId, { operator, tester: false, userId }).catch(() => false)) return true;
  return directOwnerPlacesOpen(workspaceId, userId).catch(() => false);
}

async function directOwnerPlacesOpen(workspaceId: string, userId: string): Promise<boolean> {
  if (!workspaceReleaseEnabled()) return false;
  const user = await getSessionUser();
  if (user?.id !== userId || !user.email || !user.email_confirmed_at) return false;
  if (!await systemsReleasedFor({ userId }, workspaceId)) return false;
  return callReleaseFlagsRpc("read_direct_owner_places_eligibility", {
    p_workspace_id: z.string().uuid().parse(workspaceId),
    p_user_id: z.string().uuid().parse(userId),
    p_verified_email: z.string().email().parse(user.email.trim().toLowerCase()),
  }, z.boolean(), "The business's owner places could not be read.");
}
