import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTemplateForTenant } from "@/components/templates/registry";
import { hasTenantAccess } from "@/lib/auth";
import { defaults } from "@/lib/defaults";
import { safeFetch } from "@/lib/utils";
import { buildSectionData } from "@/lib/buildSectionData";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { ContentWorkspace } from "@/components/dashboard/ContentWorkspace";
import type { ContentSection } from "@/lib/types";

export default async function SitePage() {
  const tenant = await getTenantFromHeaders();
  const allowed = await hasTenantAccess(tenant);
  if (!allowed) {
    const clientFallbackRoot = getClientFallbackRoot(await headers());
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }

  const siteModel = await getTemplateForTenant(tenant);

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
    <ContentWorkspace
      siteName={settings.siteName || "Your Business"}
      ownerName={settings.ownerName || "there"}
      sectionData={sectionData}
      timestamps={timestamps}
    />
  );
}
