import { requireDashboardView } from "@/lib/dashboard-auth";
import { ConnectionDetailPage } from "@/components/dashboard/ConnectionDetailPage";

export default async function ConnectionDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDashboardView();
  const { id } = await params;
  return <ConnectionDetailPage connectionId={id} />;
}
