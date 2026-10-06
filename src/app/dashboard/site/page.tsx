import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { loadSiteEditorData } from "@/lib/website-page-data";
import { ContentWorkspace } from "@/components/dashboard/ContentWorkspace";

/** Website editor. The same editor opens in the workspace website (/workspace/site). */
export default async function SitePage() {
  // Moved to the workspace website when owner entry is on: the layout redirects a full load; this covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/site");

  const { tenant } = await requireDashboardView();
  const { siteName, ownerName, sectionData, timestamps } = await loadSiteEditorData(tenant);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ContentWorkspace
          siteName={siteName}
          ownerName={ownerName}
          sectionData={sectionData}
          timestamps={timestamps}
        />
      </div>
    </div>
  );
}
