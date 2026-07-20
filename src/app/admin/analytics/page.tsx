import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import {
  getAnalyticsConfig,
  getSearchConsolePerf,
  getGa4Perf,
} from "@/lib/analytics";
import { getClickCounts, getDailyMetrics } from "@/lib/storage";
import { getGoal } from "@/lib/goals";
import type { GoalMetric } from "@/lib/goals";
import { AnalyticsView } from "./AnalyticsView";
import { PortfolioAnalytics } from "./PortfolioAnalytics";
import type { PortfolioRow } from "./PortfolioAnalytics";

export const dynamic = "force-dynamic";

/** Map a GoalMetric to the beacon metric name for getClickCounts. */
function goalToBeacon(metric: GoalMetric): string | null {
  if (metric === "visitors") return "page-view";
  if (metric === "calls") return "phone-click";
  if (metric === "bookings") return "booking-click";
  // "reviews" has no beacon source
  return null;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  // Defense in depth: the admin layout already gates on super-admin, but mirror
  // the guard so this page never renders client data if the layout chain changes.
  if (!(await isSuperAdmin())) redirect("/");

  const allTenants = await getAllTenants();
  const active = allTenants.filter(isActiveTenant);

  const tenants = active.map((t) => ({
    id: t.id,
    siteName: t.siteName || t.id,
    // siteUrl used to derive domain for favicon fetch
    siteUrl: t.siteUrl ?? null,
    productionDomain: t.productionDomain ?? null,
  }));

  // No active clients — nothing to select, render the empty shell.
  if (tenants.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">
            Search + Analytics
          </h1>
          <p className="text-sm text-gray-muted mt-1">
            Search Console + GA4 performance + beacon conversions, per client.
          </p>
        </div>
        <div className="rounded-2xl border border-glass-border bg-glass p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No active clients yet</p>
          <p className="mt-1 text-xs text-gray-muted">
            Clients appear here once tenants exist.
          </p>
        </div>
      </div>
    );
  }

  const { tenant: requested } = await searchParams;
  const selected =
    (requested && tenants.find((t) => t.id === requested)?.id) ?? tenants[0].id;

  // --- Per-tenant portfolio data (parallel, fail-soft per tenant) ---
  function extractDomain(t: { siteUrl: string | null; productionDomain: string | null }): string | null {
    if (t.productionDomain) return t.productionDomain;
    if (t.siteUrl) {
      try {
        return new URL(t.siteUrl.includes("://") ? t.siteUrl : `https://${t.siteUrl}`).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    }
    return null;
  }

  const portfolioRows: PortfolioRow[] = await Promise.all(
    tenants.map(async (t) => {
      const [goal, dailyRaw] = await Promise.all([
        getGoal(t.id).catch(() => null),
        getDailyMetrics(t.id, 7).catch(() => []),
      ]);

      const beaconMetric = goal ? goalToBeacon(goal.metric) : "page-view";

      // When goal metric is "reviews", we have no beacon source — show dashes
      if (goal?.metric === "reviews") {
        return {
          tenantId: t.id,
          name: t.siteName,
          domain: extractDomain(t),
          goalMetric: goal.metric,
          thisWeek: 0,
          lastWeek: 0,
          sparkline: [],
        } satisfies PortfolioRow;
      }

      const metric = beaconMetric ?? "page-view";
      const counts = await getClickCounts(metric, t.id).catch(() => ({
        thisWeek: 0,
        lastWeek: 0,
        total: 0,
        today: 0,
      }));

      // Build sparkline from daily series for the goal metric
      let sparkline: number[] = [];
      if (metric === "page-view") {
        sparkline = dailyRaw.map((d) => d.pageViews);
      } else if (metric === "booking-click") {
        sparkline = dailyRaw.map((d) => d.bookingClicks);
      } else if (metric === "phone-click") {
        sparkline = dailyRaw.map((d) => d.phoneClicks ?? 0);
      }

      return {
        tenantId: t.id,
        name: t.siteName,
        domain: extractDomain(t),
        goalMetric: goal?.metric ?? null,
        thisWeek: counts.thisWeek,
        lastWeek: counts.lastWeek,
        sparkline,
      } satisfies PortfolioRow;
    })
  );

  // Sort worst-trend-first. An ACTIVELY declining client needs attention more than
  // a brand-new client with no data yet, so: down → no-data → stalled → up.
  function trendScore(row: PortfolioRow): number {
    if (row.thisWeek < row.lastWeek) return 0;              // down — needs attention most
    if (row.thisWeek === 0 && row.lastWeek === 0) return 1; // no data yet
    if (row.thisWeek === row.lastWeek) return 2;            // stalled
    return 3;                                               // up — best
  }
  portfolioRows.sort((a, b) => trendScore(a) - trendScore(b));

  // --- Selected client deep-dive data ---
  const [config, search, ga, pageViewCounts, bookingCounts, phoneCounts, goal, dailyMetrics] =
    await Promise.all([
      getAnalyticsConfig(selected),
      getSearchConsolePerf(selected),
      getGa4Perf(selected),
      getClickCounts("page-view", selected).catch(() => ({ thisWeek: 0, lastWeek: 0, total: 0, today: 0 })),
      getClickCounts("booking-click", selected).catch(() => ({ thisWeek: 0, lastWeek: 0, total: 0, today: 0 })),
      getClickCounts("phone-click", selected).catch(() => ({ thisWeek: 0, lastWeek: 0, total: 0, today: 0 })),
      getGoal(selected).catch(() => null),
      getDailyMetrics(selected, 7).catch(() => []),
    ]);

  const selectedName =
    tenants.find((t) => t.id === selected)?.siteName || selected;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">
          Search + Analytics
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          Portfolio roll-up + deep dive for{" "}
          <span className="text-warm-white">{selectedName}</span>.
        </p>
      </div>

      {/* Portfolio roll-up — primary view */}
      <PortfolioAnalytics rows={portfolioRows} />

      {/* Per-client deep dive */}
      <AnalyticsView
        tenants={tenants.map((t) => ({ id: t.id, siteName: t.siteName }))}
        selected={selected}
        config={config}
        search={search}
        ga={ga}
        pageViewCounts={pageViewCounts}
        bookingCounts={bookingCounts}
        phoneCounts={phoneCounts}
        goal={goal}
        dailyMetrics={dailyMetrics}
      />
    </div>
  );
}
