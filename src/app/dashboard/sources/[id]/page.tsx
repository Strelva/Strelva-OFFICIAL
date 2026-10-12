import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { ConnectionDetailPage } from "@/components/dashboard/ConnectionDetailPage";

export default async function ConnectionDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Moved to the workspace website when owner entry is on: the layout redirects a full load; this covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), `/sources/${encodeURIComponent(id)}`);

  await requireDashboardView();
  return <ConnectionDetailPage connectionId={id} />;
}
