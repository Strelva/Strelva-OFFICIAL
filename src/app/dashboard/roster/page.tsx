import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";
import { InspectPreviewBanner } from "@/components/dashboard/InspectPreviewBanner";

export default async function RosterPage() {
  const { tenant, preview } = await requireDashboardFeature("roster");
  return (
    <>
      {preview && <InspectPreviewBanner tenant={tenant} featureId="roster" />}
      <ComingSoonSurface
        title="Roster"
        description="Today's classes and who's booked in — with one-tap check-in — will live here."
      />
    </>
  );
}
