import { requireDashboardView } from "@/lib/dashboard-auth";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { SiteHealthCard } from "@/components/dashboard/SiteHealthCard";

export default async function HealthPage() {
  await requireDashboardView();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <EngagementTracker event="health-view" />
      <div className="mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-normal text-warm-black">Site Health</h1>
        <p className="mt-1 text-[13px] text-gray-muted">
          An automatic health check of your live site, refreshed daily. The same
          checks that power our free audit, run on your site.
        </p>
      </div>
      <SiteHealthCard />
    </div>
  );
}
