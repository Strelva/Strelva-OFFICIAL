import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";

export default async function RosterPage() {
  await requireDashboardFeature("roster");
  return (
    <ComingSoonSurface
      title="Roster"
      description="Today's classes and who's booked in — with one-tap check-in — will live here."
    />
  );
}
