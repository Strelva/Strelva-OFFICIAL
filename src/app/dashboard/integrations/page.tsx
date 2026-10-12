import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { ConnectionsPage } from "@/components/dashboard/ConnectionsPage";

export default async function IntegrationsRoute() {
  // Moved to the workspace website when owner entry is on: the layout redirects a full load; this covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/integrations");

  await requireDashboardView();
  return <ConnectionsPage />;
}
