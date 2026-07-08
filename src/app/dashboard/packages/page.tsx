import { requireDashboardView } from "@/lib/dashboard-auth";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";

export default async function PackagesPage() {
  await requireDashboardView();
  return (
    <ComingSoonSurface
      title="Packages"
      description="Class packs, memberships, drop-ins, and intro offers you sell will live here."
    />
  );
}
