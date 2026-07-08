import { requireDashboardView } from "@/lib/dashboard-auth";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";

export default async function SchedulePage() {
  await requireDashboardView();
  return (
    <ComingSoonSurface
      title="Schedule"
      description="Your class schedule — recurring classes, capacity, waitlists, and instructors — will live here."
    />
  );
}
