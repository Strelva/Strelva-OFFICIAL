import { getContent, getSectionTimestamps } from "@/lib/storage";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { getTemplateForTenant } from "@/components/templates/registry";
import { getTenantConfig } from "@/lib/tenants";
import { getProducts } from "@/lib/products";
import { defaults } from "@/lib/defaults";
import { safeFetch } from "@/lib/utils";
import { buildSectionData } from "@/lib/buildSectionData";
import { ContentWorkspace } from "@/components/dashboard/ContentWorkspace";
import { WebsiteSubnav } from "@/components/dashboard/WebsiteSubnav";
import { tenantHasStore } from "@/lib/dashboard-surfaces";
import type { ContentSection } from "@/lib/types";

export default async function SitePage() {
  const { tenant } = await requireDashboardView();

  const siteModel = await getTemplateForTenant(tenant);
  const [tenantConfig, products] = await Promise.all([
    getTenantConfig(tenant).catch(() => null),
    getProducts(tenant).catch(() => []),
  ]);
  const hasStore = tenantHasStore({
    tenantConfig: { features: tenantConfig?.features },
    hasCommerce: products.length > 0,
  });

  const sectionEntries = await Promise.all(
    siteModel.contentSections.map(async (section) => {
      const data = await safeFetch(
        () => getContent(section as ContentSection, tenant),
        (defaults as Record<string, unknown>)[section] || {},
      );
      return [section, data] as const;
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: Record<string, any> = Object.fromEntries(sectionEntries);
  const timestamps = await safeFetch(() => getSectionTimestamps(tenant), {});

  const sectionData = buildSectionData(sections, timestamps);
  const settings = sections.settings || {};

  return (
    <div className="flex h-full flex-col">
      <WebsiteSubnav hasStore={hasStore} />
      <div className="min-h-0 flex-1">
        <ContentWorkspace
          siteName={settings.siteName || "Your Business"}
          ownerName={settings.ownerName || "there"}
          sectionData={sectionData}
          timestamps={timestamps}
        />
      </div>
    </div>
  );
}
