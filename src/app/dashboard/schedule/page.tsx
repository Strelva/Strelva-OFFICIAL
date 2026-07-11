import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";
import { InspectPreviewBanner } from "@/components/dashboard/InspectPreviewBanner";

export default async function SchedulePage() {
  const { tenant, preview } = await requireDashboardFeature("schedule");
  return (
    <>
      {preview && <InspectPreviewBanner tenant={tenant} featureId="schedule" />}
      <ComingSoonSurface
        title="Schedule"
        description="Your class schedule — recurring classes, capacity, waitlists, and instructors — will live here."
      />
    </>
  );
}
