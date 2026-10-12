import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { withClientFallbackRoot } from "@/lib/client-fallback";
import { SiteHistoryContent } from "@/components/dashboard/SiteHistoryContent";

/** Website > History — the change log + rollback safety net. Lives under the
 *  Website pillar (not the dashboard): "revert to a last good version" and the
 *  recent-changes trail are site-management tools, not at-a-glance metrics.
 *  The body is shared with the workspace website (/workspace/site?tab=history). */
export default async function SiteHistoryPage({ searchParams }: { searchParams?: Promise<{ request?: string }> }) {
  // Moved to the workspace website when owner entry is on: the layout redirects a full load; this covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/history");

  const { tenant, clientFallbackRoot } = await requireDashboardView();
  const params = searchParams ? await searchParams : {};
  const dashboardHref = (path: string) => withClientFallbackRoot(clientFallbackRoot, path);
  const historyHref = `${dashboardHref("/dashboard/history")}${params.request ? `?request=${encodeURIComponent(params.request)}` : ""}`;

  return (
    <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
      <SiteHistoryContent tenant={tenant} dashboardHref={dashboardHref} historyHref={historyHref} selectedRequestId={params.request} />
    </div>
  );
}
