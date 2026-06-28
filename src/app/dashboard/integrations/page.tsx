import { requireDashboardView } from "@/lib/dashboard-auth";
import { ConnectionsPage } from "@/components/dashboard/ConnectionsPage";

export default async function IntegrationsRoute() {
  await requireDashboardView();
  return <ConnectionsPage />;
}
