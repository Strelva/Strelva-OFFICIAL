import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { loadCollectionsData } from "@/lib/website-page-data";
import { CollectionsManager } from "@/components/dashboard/CollectionsManager";

export default async function CollectionsPage() {
  // Moved to the workspace website when owner entry is on: the layout redirects a full load; this covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/collections");

  const { tenant } = await requireDashboardView();
  const { types, initialType, initialEntries } = await loadCollectionsData(tenant);

  return <CollectionsManager types={types} initialType={initialType} initialEntries={initialEntries} />;
}
