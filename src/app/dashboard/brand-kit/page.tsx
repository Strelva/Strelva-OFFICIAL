import { requireDashboardView } from "@/lib/dashboard-auth";
import { getContent } from "@/lib/storage";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { BrandKitPanel } from "@/components/dashboard/BrandKitPanel";

export default async function BrandKitPage() {
  const { tenant } = await requireDashboardView();

  const settings = await getContent("settings", tenant).catch(() => ({}));

  return (
    <>
      <EngagementTracker event="brand-kit-view" />
      <BrandKitPanel initialSettings={settings as Record<string, string>} />
    </>
  );
}
