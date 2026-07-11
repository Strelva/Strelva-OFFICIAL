import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";
import { InspectPreviewBanner } from "@/components/dashboard/InspectPreviewBanner";

export default async function MembersPage() {
  const { tenant, preview } = await requireDashboardFeature("members");
  return (
    <>
      {preview && <InspectPreviewBanner tenant={tenant} featureId="members" />}
      <ComingSoonSurface
        title="Members"
        description="Your studio members — profiles, visit history, and pack/membership balances — will live here."
      />
    </>
  );
}
