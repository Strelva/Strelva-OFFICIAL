import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";

export default async function MembersPage() {
  await requireDashboardFeature("members");
  return (
    <ComingSoonSurface
      title="Members"
      description="Your studio members — profiles, visit history, and pack/membership balances — will live here."
    />
  );
}
