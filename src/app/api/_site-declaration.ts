import { getTenantConfig, updateTenant } from "@/lib/tenants";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { siteCapabilityManifestSchema } from "@/lib/schemas";
import { logAuditEvent } from "@/lib/storage";
import {
  readSiteDeclaration as readDeclaration, refreshSiteDeclaration as refreshDeclaration, verifySiteRelease as verifyRelease,
  type SiteDeclaration, type SiteDeclarationPorts, type SiteReleaseCheck,
} from "@/products/websites/server";

/**
 * The tenant-model side of reading what a site declares (products/websites/
 * site-declaration.ts takes these as ports). Routes and adapters at the app
 * edge import from here.
 */
export function siteDeclarationPorts(): SiteDeclarationPorts {
  return {
    tenantConfig: (tenantId) => getTenantConfig(tenantId),
    parseManifest(raw) {
      const parsed = siteCapabilityManifestSchema.safeParse(raw);
      return parsed.success ? { contentSource: parsed.data.contentSource ?? null, commitSha: parsed.data.release?.commitSha ?? null } : null;
    },
    async persist(tenantId, declared) {
      const config = await getTenantConfig(tenantId);
      if (!config) return null;
      return updateTenant(tenantId, { customRepo: { ...(config.customRepo ?? {}), ...declared } });
    },
    audit: ({ tenantId, from, to }) => logAuditEvent({
      tenant: tenantId, action: "tenant.content-source.declared", targetType: "tenant", targetId: tenantId,
      actor: { userId: null, email: null, type: "system", isSuperAdmin: false },
      metadata: { from, to },
    }),
    revalidate: (tenantId) => revalidateClientSite(tenantId, "all"),
  };
}

export const readSiteDeclaration = (tenantId: string): Promise<SiteDeclaration> => readDeclaration(tenantId, siteDeclarationPorts());
export const refreshSiteDeclaration = (tenantId: string): Promise<SiteDeclaration> => refreshDeclaration(tenantId, siteDeclarationPorts());
export const verifySiteRelease = (tenantId: string, commitSha: string): Promise<SiteReleaseCheck> => verifyRelease(tenantId, commitSha, siteDeclarationPorts());
