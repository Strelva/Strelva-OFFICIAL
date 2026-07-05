import Link from "next/link";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { getActivity, getLatestSiteSnapshot } from "@/lib/storage";
import { withClientFallbackRoot } from "@/lib/client-fallback";
import { SiteSafetyPanel } from "@/components/dashboard/SiteSafetyPanel";

/** Website > History — the change log + rollback safety net. Lives under the
 *  Website pillar (not the dashboard): "revert to a last good version" and the
 *  recent-changes trail are site-management tools, not at-a-glance metrics. */
export default async function SiteHistoryPage() {
  const { tenant, clientFallbackRoot } = await requireDashboardView();

  const [activity, latestSnapshot] = await Promise.all([
    getActivity(tenant, { actor: "ai" }).catch(() => []),
    getLatestSiteSnapshot(tenant).catch(() => null),
  ]);
  const recentChanges = activity.slice(0, 12);
  const dashboardHref = (path: string) => withClientFallbackRoot(clientFallbackRoot, path);

  return (
    <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Website
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium tracking-[-0.02em] text-warm-black sm:text-[32px]">
            History &amp; safety
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-muted">
            Every change made to your site, and a one-click way to roll back to a known-good version.
          </p>
        </div>

        <SiteSafetyPanel latestSnapshot={latestSnapshot} />

        <section className="rounded-2xl border border-glass-border bg-glass p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                What changed
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-[18px] font-normal text-warm-black">
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
          {recentChanges.length > 0 ? (
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
