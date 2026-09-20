import Link from "next/link";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { getActivity, getSiteSnapshots } from "@/lib/storage";
import { getEvents } from "@/lib/events";
import { getScanHistory, getScanSummary } from "@/lib/scan-store";
import { withClientFallbackRoot } from "@/lib/client-fallback";
import { SiteSafetyPanel } from "@/components/dashboard/SiteSafetyPanel";
import { WebsiteRequestHistory } from "@/components/dashboard/WebsiteRequestHistory";
import { DatedSiteCheckHistory } from "@/components/dashboard/DatedSiteCheckHistory";

/** Website > History — the change log + rollback safety net. Lives under the
 *  Website pillar (not the dashboard): "revert to a last good version" and the
 *  recent-changes trail are site-management tools, not at-a-glance metrics. */
export default async function SiteHistoryPage({ searchParams }: { searchParams?: Promise<{ request?: string }> }) {
  const { tenant, clientFallbackRoot } = await requireDashboardView();
  const params = searchParams ? await searchParams : {};

  const [activity, snapshots, events, scanHistory, latestScan] = await Promise.allSettled([
    getActivity(tenant, { actor: "ai" }),
    // The full saved-version history (daily + manual backups) so the owner can
    // restore ANY good version, not just the latest.
    getSiteSnapshots(tenant, 60),
    getEvents(tenant, { limit: 60, requireStore: true }),
    getScanHistory(tenant, { requireStore: true }),
    getScanSummary(tenant, { requireStore: true }),
  ]);
  const recentChanges = activity.status === "fulfilled" ? activity.value.slice(0, 12) : [];
  const dashboardHref = (path: string) => withClientFallbackRoot(clientFallbackRoot, path);

  const historyHref = `${dashboardHref("/dashboard/history")}${params.request ? `?request=${encodeURIComponent(params.request)}` : ""}`;
  const unavailable = (message: string) => (
    <section role="alert" className="rounded-2xl border border-glass-border bg-glass p-5">
      <p className="text-sm text-gray-muted">{message}</p>
      <a href={historyHref} className="mt-3 inline-flex text-sm text-accent underline underline-offset-4">Reload history</a>
    </section>
  );

  return (
    <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Website
          </p>
          <h1 className="font-display text-[28px] font-medium tracking-[-0.02em] text-warm-black sm:text-[32px]">
            History &amp; safety
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-muted">
            Recent website requests, saved versions and dated site checks.
          </p>
        </div>

        {snapshots.status === "fulfilled" ? <SiteSafetyPanel snapshots={snapshots.value} /> : unavailable("Saved versions are temporarily unavailable.")}

        {events.status === "fulfilled" ? <WebsiteRequestHistory events={events.value} dashboardHref={dashboardHref} selectedRequestId={params.request} /> : unavailable("Website request history is temporarily unavailable.")}

        {scanHistory.status === "rejected" || latestScan.status === "rejected" ? unavailable("Site check history is temporarily unavailable.") : null}
        {scanHistory.status === "fulfilled" && latestScan.status === "fulfilled" ? (
          <DatedSiteCheckHistory latest={latestScan.value} history={scanHistory.value} dashboardHref={dashboardHref} />
        ) : scanHistory.status === "fulfilled" && scanHistory.value.length > 0 ? (
          <DatedSiteCheckHistory latest={null} history={scanHistory.value} dashboardHref={dashboardHref} />
        ) : latestScan.status === "fulfilled" && latestScan.value ? (
          <DatedSiteCheckHistory latest={latestScan.value} history={[]} dashboardHref={dashboardHref} />
        ) : null}

        <section className="rounded-2xl border border-glass-border bg-glass p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                What changed
              </p>
              <h2 className="mt-2 font-display text-[18px] font-normal text-warm-black">
                Recent changes
              </h2>
            </div>
            <Link
              href={dashboardHref("/dashboard/reports")}
              className="text-[12px] font-medium text-accent hover:text-accent/80"
            >
              Reports
            </Link>
          </div>
          {activity.status === "rejected" ? unavailable("Recent changes are temporarily unavailable.") : recentChanges.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {recentChanges.map((entry) => (
                <div
                  key={`${entry.time}-${entry.text}`}
                  className="rounded-lg border border-gray-border/70 bg-surface-raised px-3 py-2"
                >
                  <p className="line-clamp-2 text-[13px] text-warm-black">{entry.text}</p>
                  <p className="mt-1 text-[11px] text-gray-faint">{new Date(entry.time).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-gray-border/70 bg-surface-raised px-3 py-3 text-[13px] leading-relaxed text-gray-muted">
              No updates yet. Ask Strelva for one small update or edit the site directly, then every
              change shows up here as your proof trail.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
