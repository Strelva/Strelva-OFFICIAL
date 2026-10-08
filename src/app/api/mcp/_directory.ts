/** The business directory port for the platform MCP. Tenant rows live in
 * src/lib, which workspace layers may not import, so the app edge supplies it.
 *
 * Website clients are listed by tenant id. Businesses without a website are
 * listed as `biz:<handle>` only while their /biz page is published and public,
 * under the same gates as /biz/<handle>; the handle resolves to the native
 * `workspace:<id>` booking scope, which is never accepted directly. */
import type { BusinessDirectory } from "@/platform/agent-channel/public-tools";
import { getActiveTenants } from "@/lib/tenants";
import { getTenantPublicUrl } from "@/lib/tenant-urls";
import { isTenantId } from "@/lib/scaffold-contracts";
import { workspaceBookingScope } from "@/platform/bookings/booking-scope";
import { appOrigin, businessPageUrl, listPublishedBusinessPages, loadPublishedBusinessPage } from "@/products/connected-sites/server";

const NATIVE = "biz:";

export const tenantDirectory: BusinessDirectory = {
  async list() {
    const [tenants, pages] = await Promise.all([getActiveTenants(), listPublishedBusinessPages().catch(() => [])]);
    return [
      ...tenants.filter(t => isTenantId(t.id)).map(t => ({
        business: t.id, name: t.siteName || t.id, industry: t.industry || null, website: getTenantPublicUrl(t),
      })),
      ...pages.map(page => ({
        business: `${NATIVE}${page.handle}`, name: page.facts.name!, industry: null, website: businessPageUrl(appOrigin(), page.handle),
      })),
    ];
  },
  async scope(business) {
    if (!business.startsWith(NATIVE)) return isTenantId(business) ? business : null;
    const page = await loadPublishedBusinessPage(business.slice(NATIVE.length)).catch(() => null);
    return page ? workspaceBookingScope(page.workspaceId) : null;
  },
};
