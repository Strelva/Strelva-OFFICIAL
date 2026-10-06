import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { loadBrandKitSettings } from "@/lib/website-page-data";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { BrandKitPanel } from "@/components/dashboard/BrandKitPanel";

export default async function BrandKitPage() {
  // Moved to the workspace website when owner entry is on: the layout redirects a full load; this covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/brand-kit");

  const { tenant } = await requireDashboardView();
  const settings = await loadBrandKitSettings(tenant);

  return (
    <>
      <EngagementTracker event="brand-kit-view" />
      <BrandKitPanel initialSettings={settings} />
    </>
  );
}
