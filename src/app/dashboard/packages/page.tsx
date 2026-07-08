import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";

export default async function PackagesPage() {
  await requireDashboardFeature("packages");
  return (
    <ComingSoonSurface
      title="Packages"
      description="Class packs, memberships, drop-ins, and intro offers you sell will live here."
    />
  );
}
