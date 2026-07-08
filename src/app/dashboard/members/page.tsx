import { requireDashboardView } from "@/lib/dashboard-auth";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";

export default async function MembersPage() {
  await requireDashboardView();
  return (
    <ComingSoonSurface
      title="Members"
      description="Your studio members — profiles, visit history, and pack/membership balances — will live here."
    />
  );
}
