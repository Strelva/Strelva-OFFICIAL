import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";

export default async function SchedulePage() {
  await requireDashboardFeature("schedule");
  return (
    <ComingSoonSurface
      title="Schedule"
      description="Your class schedule — recurring classes, capacity, waitlists, and instructors — will live here."
    />
  );
}
