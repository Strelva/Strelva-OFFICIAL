import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { ComingSoonSurface } from "@/components/dashboard/ComingSoonSurface";
import { InspectPreviewBanner } from "@/components/dashboard/InspectPreviewBanner";

export default async function PackagesPage() {
  const { tenant, preview } = await requireDashboardFeature("packages");
  return (
    <>
      {preview && <InspectPreviewBanner tenant={tenant} featureId="packages" />}
      <ComingSoonSurface
        title="Packages"
        description="Class packs, memberships, drop-ins, and intro offers you sell will live here."
      />
    </>
  );
}
