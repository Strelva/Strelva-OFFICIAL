/** The tenant directory port for the platform MCP. Tenant rows live in
 * src/lib, which workspace layers may not import, so the app edge supplies it. */
import type { BusinessDirectory } from "@/platform/agent-channel/public-tools";
import { getActiveTenants } from "@/lib/tenants";
import { getTenantPublicUrl } from "@/lib/tenant-urls";
import { isTenantId } from "@/lib/scaffold-contracts";

export const tenantDirectory: BusinessDirectory = {
  async list() {
    return (await getActiveTenants()).filter(t => isTenantId(t.id)).map(t => ({
      business: t.id, name: t.siteName || t.id, industry: t.industry || null, website: getTenantPublicUrl(t),
    }));
  },
};
