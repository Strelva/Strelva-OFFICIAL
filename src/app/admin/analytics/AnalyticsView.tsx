"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type {
  TenantAnalyticsConfig,
  SearchPerf,
  GaPerf,
} from "@/lib/analytics";
import type { Goal } from "@/lib/goals";
import { GOAL_METRIC_LABELS } from "@/lib/goals";

const SERVICE_ACCOUNT = "strelva-reporting@strelva.iam.gserviceaccount.com";

interface TenantOption {
  id: string;
  siteName: string;
}

interface ClickWindow {
  thisWeek: number;
  lastWeek: number;
  total: number;
  today: number;
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatPosition(n: number): string {
  return n.toFixed(1);
}

function formatUpdated(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-base/40 border border-glass-border px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-warm-white">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-faint">{sub}</p>}
    </div>
  );
}

function DeltaChip({ thisWeek, lastWeek }: { thisWeek: number; lastWeek: number }) {
  if (thisWeek === 0 && lastWeek === 0) return null;
  if (lastWeek === 0) return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold text-positive bg-positive/12">
      +{thisWeek} vs last wk
    </span>
  );
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  const label = pct >= 0 ? `+${pct}%` : `${pct}%`;
  const cls = pct > 0
    ? "text-positive bg-positive/12"
    : pct < 0
      ? "text-critical bg-critical/12"
      : "text-warning bg-warning/12";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label} vs last wk
    </span>
  );
}

/** Shared "not wired up yet" state — most clients land here first, so it must
 *  read as an intentional next step, not a broken card. */
function ConnectPrompt({ service }: { service: string }) {
  return (
    <div className="rounded-lg border border-dashed border-glass-border bg-surface-base/30 px-5 py-6">
      <p className="text-sm font-medium text-warm-white">
        Connect this client&apos;s {service}
      </p>
      <p className="mt-1.5 text-xs leading-5 text-gray-muted">
        Add the Strelva reporting service account (the address shown in the
        Connection card below) as a user on their {service} property, then set
        the property below and save.
      </p>
    </div>
  );
}

function UnavailableNote() {
  return (
    <p className="rounded-lg border border-glass-border bg-surface-base/30 px-5 py-4 text-xs text-gray-muted">
      Couldn&apos;t fetch this right now. The connection is set, but the API
      didn&apos;t answer. Try again shortly.
    </p>
  );
}

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-glass-border bg-glass overflow-hidden">
      <div className="px-5 py-3 border-b border-glass-border">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-faint">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SearchConsoleCard({ perf }: { perf: SearchPerf }) {
  if (perf.status === "unconfigured") {
    return (
      <CardShell title="Search Console (GSC)">
        <ConnectPrompt service="Search Console" />
      </CardShell>
    );
  }
  if (perf.status === "unavailable") {
    return (
      <CardShell title="Search Console (GSC)">
        <UnavailableNote />
      </CardShell>
    );
  }
  return (
    <CardShell title="Search Console (GSC)" subtitle="How people find them on Google — last 28 days, via GSC.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Clicks" value={formatInt(perf.clicks)} />
        <StatTile label="Impressions" value={formatInt(perf.impressions)} />
        <StatTile label="CTR" value={formatPct(perf.ctr)} />
        <StatTile label="Avg position" value={formatPosition(perf.position)} />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium text-gray-muted">Top queries</p>
        {perf.topQueries.length === 0 ? (
          <p className="text-xs text-gray-faint">No query data in this window.</p>
        ) : (
          <div className="rounded-lg border border-glass-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-glass-border text-left text-gray-muted">
                    <th className="px-4 py-2 font-medium">Query</th>
                    <th className="px-4 py-2 font-medium text-right">Clicks</th>
                    <th className="px-4 py-2 font-medium text-right">Impr.</th>
                    <th className="px-4 py-2 font-medium text-right">Pos.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border/50">
                  {perf.topQueries.map((q) => (
                    <tr key={q.query} className="hover:bg-gray-bg transition-colors">
                      <td className="px-4 py-2 text-warm-white">{q.query}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-muted">
                        {formatInt(q.clicks)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-muted">
                        {formatInt(q.impressions)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-muted">
                        {formatPosition(q.position)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </CardShell>
  );
}

function Ga4Card({ perf }: { perf: GaPerf }) {
  if (perf.status === "unconfigured") {
    return (
      <CardShell title="Analytics (GA4)">
        <ConnectPrompt service="Analytics" />
      </CardShell>
    );
  }
  if (perf.status === "unavailable") {
    return (
      <CardShell title="Analytics (GA4)">
        <UnavailableNote />
      </CardShell>
    );
  }
  return (
    <CardShell title="Analytics (GA4)" subtitle="Who's on the site and where they land — last 28 days, via GA4.">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Users (GA4)" value={formatInt(perf.users)} sub="via GA4" />
        <StatTile label="Sessions (GA4)" value={formatInt(perf.sessions)} />
        <StatTile label="Pageviews (GA4)" value={formatInt(perf.pageviews)} sub="via GA4 — different from beacon" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-gray-muted">Top pages</p>
          {perf.topPages.length === 0 ? (
            <p className="text-xs text-gray-faint">No page data in this window.</p>
          ) : (
            <div className="rounded-lg border border-glass-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-glass-border text-left text-gray-muted">
                      <th className="px-4 py-2 font-medium">Path</th>
                      <th className="px-4 py-2 font-medium text-right">Views</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/50">
                    {perf.topPages.map((p) => (
                      <tr key={p.path} className="hover:bg-gray-bg transition-colors">
                        <td className="px-4 py-2 font-mono text-xs text-warm-white">
                          {p.path}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-muted">
                          {formatInt(p.views)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-gray-muted">Top sources</p>
          {perf.topSources.length === 0 ? (
            <p className="text-xs text-gray-faint">No source data in this window.</p>
          ) : (
            <div className="rounded-lg border border-glass-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-glass-border text-left text-gray-muted">
                      <th className="px-4 py-2 font-medium">Source</th>
                      <th className="px-4 py-2 font-medium text-right">Sessions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/50">
                    {perf.topSources.map((s) => (
                      <tr key={s.source} className="hover:bg-gray-bg transition-colors">
                        <td className="px-4 py-2 text-warm-white">{s.source}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-muted">
                          {formatInt(s.sessions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </CardShell>
  );
}

interface DailyMetricRow {
  date: string;
  pageViews: number;
  bookingClicks: number;
  phoneClicks?: number;
}

function BeaconCard({
  pageViewCounts,
  bookingCounts,
  phoneCounts,
  goal,
  dailyMetrics,
}: {
  pageViewCounts: ClickWindow;
  bookingCounts: ClickWindow;
  phoneCounts: ClickWindow;
  goal: Goal | null;
  dailyMetrics: DailyMetricRow[];
}) {
  const noBeaconData =
    pageViewCounts.thisWeek === 0 &&
    pageViewCounts.lastWeek === 0 &&
    bookingCounts.thisWeek === 0 &&
    bookingCounts.lastWeek === 0 &&
    phoneCounts.thisWeek === 0 &&
    phoneCounts.lastWeek === 0;

  // Goal progress
  let goalValue = 0;
  if (goal) {
    if (goal.metric === "visitors") goalValue = pageViewCounts.thisWeek;
    else if (goal.metric === "bookings") goalValue = bookingCounts.thisWeek;
    else if (goal.metric === "calls") goalValue = phoneCounts.thisWeek;
  }
  const goalPct = goal && goal.target > 0 ? Math.min(100, Math.round((goalValue / goal.target) * 100)) : null;

  return (
    <CardShell
      title="Site Tracker — Conversions"
      subtitle="Beacon data from your site tracker (ScaffoldTracker). Separate from GA4."
    >
      {noBeaconData && (
        <div className="mb-4 rounded-lg border border-glass-border bg-surface-base/30 px-4 py-3 text-xs text-gray-muted">
          No beacon data in the last 7 days. The site tracker may not be installed or events haven&apos;t been fired yet.
          Check that <span className="font-mono text-gray-faint">ScaffoldTracker</span> is wired up in the client repo.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-surface-base/40 border border-glass-border px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">Page views</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-warm-white">
            {formatInt(pageViewCounts.thisWeek)}
          </p>
          <div className="mt-1.5">
            <DeltaChip thisWeek={pageViewCounts.thisWeek} lastWeek={pageViewCounts.lastWeek} />
          </div>
        </div>
        <div className="rounded-lg bg-surface-base/40 border border-glass-border px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">Booking clicks</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-warm-white">
            {formatInt(bookingCounts.thisWeek)}
          </p>
          <div className="mt-1.5">
            <DeltaChip thisWeek={bookingCounts.thisWeek} lastWeek={bookingCounts.lastWeek} />
          </div>
        </div>
        <div className="rounded-lg bg-surface-base/40 border border-glass-border px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">Phone clicks</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-warm-white">
            {formatInt(phoneCounts.thisWeek)}
          </p>
          <div className="mt-1.5">
            <DeltaChip thisWeek={phoneCounts.thisWeek} lastWeek={phoneCounts.lastWeek} />
          </div>
        </div>
      </div>

      {/* Goal progress */}
      {goal && goalPct !== null && (
        <div className="mt-5 rounded-lg border border-glass-border bg-surface-base/30 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-gray-muted">
              Weekly goal: {GOAL_METRIC_LABELS[goal.metric]}
            </p>
            <p className="text-xs tabular-nums text-gray-muted">
              {goalValue.toLocaleString()} / {goal.target.toLocaleString()} ({goalPct}%)
            </p>
          </div>
          <div className="mt-2 h-[5px] w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full ${goalPct >= 100 ? "bg-positive" : goalPct >= 60 ? "bg-warning" : "bg-critical"}`}
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>
      )}

      {!goal && (
        <p className="mt-4 text-xs text-gray-faint">
          No goal set for this client. Goals are set by the client in their dashboard settings.
        </p>
      )}

      {/* 7-day daily breakdown mini-table */}
      {!noBeaconData && dailyMetrics.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-gray-muted">Last 7 days (beacon)</p>
          <div className="rounded-lg border border-glass-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-glass-border text-left text-gray-muted">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium text-right">Views</th>
                    <th className="px-4 py-2 font-medium text-right">Bookings</th>
                    <th className="px-4 py-2 font-medium text-right">Calls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border/50">
                  {[...dailyMetrics].reverse().map((row) => (
                    <tr key={row.date} className="hover:bg-gray-bg transition-colors">
                      <td className="px-4 py-2 font-mono text-xs text-warm-white">{row.date}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-muted">
                        {row.pageViews}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-muted">
                        {row.bookingClicks}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-muted">
                        {row.phoneClicks ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </CardShell>
  );
}

export function AnalyticsView({
  tenants,
  selected,
  config,
  search,
  ga,
  pageViewCounts,
  bookingCounts,
  phoneCounts,
  goal,
  dailyMetrics,
}: {
  tenants: TenantOption[];
  selected: string;
  config: TenantAnalyticsConfig;
  search: SearchPerf;
  ga: GaPerf;
  pageViewCounts: ClickWindow;
  bookingCounts: ClickWindow;
  phoneCounts: ClickWindow;
  goal: Goal | null;
  dailyMetrics: DailyMetricRow[];
}) {
  const [tenantQuery, setTenantQuery] = useState("");
  const [gsc, setGsc] = useState(config.gscProperty ?? "");
  const [ga4, setGa4] = useState(config.ga4PropertyId ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(config.updatedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const visibleTenants = useMemo(() => {
    const q = tenantQuery.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        t.id === selected ||
        t.siteName.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [tenants, tenantQuery, selected]);

  const dirty =
    (gsc.trim() || null) !== (config.gscProperty ?? null) ||
    (ga4.trim() || null) !== (config.ga4PropertyId ?? null);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/tenants/${selected}/analytics-config`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            gscProperty: gsc.trim() || null,
            ga4PropertyId: ga4.trim() || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const next = data.config as TenantAnalyticsConfig;
      setGsc(next.gscProperty ?? "");
      setGa4(next.ga4PropertyId ?? "");
      setSavedAt(next.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tenant switcher */}
      <div className="rounded-2xl border border-glass-border bg-glass px-3 py-2.5 space-y-2">
        {/* Search input — only shown when there are enough tenants to warrant filtering */}
        {tenants.length > 8 && (
          <div className="flex items-center gap-2 rounded-[8px] border border-glass-border bg-surface-base/40 px-2.5">
            <Search className="h-[14px] w-[14px] shrink-0 text-gray-faint" strokeWidth={1.8} />
            <input
              value={tenantQuery}
              onChange={(e) => setTenantQuery(e.target.value)}
              placeholder="Filter clients…"
              className="w-full bg-transparent py-2 text-[12px] text-warm-white placeholder:text-gray-faint focus:outline-none"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-gray-muted">Client</span>
          {visibleTenants.map((t) => {
            const active = t.id === selected;
            return (
              <Link
                key={t.id}
                href={`/admin/analytics?tenant=${t.id}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                  active
                    ? "bg-glass text-warm-white border border-glass-border"
                    : "text-gray-muted hover:text-warm-white"
                }`}
              >
                {t.siteName}
              </Link>
            );
          })}
          {visibleTenants.length === 0 && (
            <span className="text-xs text-gray-faint">No clients match</span>
          )}
        </div>
      </div>

      {/* Beacon conversions + goal — leads the deep dive */}
      <BeaconCard
        pageViewCounts={pageViewCounts}
        bookingCounts={bookingCounts}
        phoneCounts={phoneCounts}
        goal={goal}
        dailyMetrics={dailyMetrics}
      />

      <SearchConsoleCard perf={search} />
      <Ga4Card perf={ga} />

      {/* Connection setup — moved to bottom so data leads */}
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-2 rounded-2xl border border-glass-border bg-glass px-5 py-3 text-[13px] font-semibold text-warm-white list-none">
          <span className="flex-1">Connection setup</span>
          <span className="text-[11px] font-normal text-gray-faint">
            saved {formatUpdated(savedAt)}
          </span>
          <span className="ml-2 text-gray-muted text-xs group-open:hidden">Show</span>
          <span className="ml-2 text-gray-muted text-xs hidden group-open:inline">Hide</span>
        </summary>
        <div className="mt-3 rounded-2xl border border-glass-border bg-glass p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-gray-muted">Search Console property</span>
              <input
                value={gsc}
                onChange={(e) => setGsc(e.target.value)}
                placeholder="sc-domain:example.com or https://example.com/"
                className="mt-1.5 w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-muted">GA4 property ID</span>
              <input
                value={ga4}
                onChange={(e) => setGa4(e.target.value)}
                placeholder="properties/123456789 or 123456789"
                className="mt-1.5 w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {error && (
              <p className="text-xs text-critical" role="alert">
                {error}
              </p>
            )}
            <p className="ml-auto text-[11px] text-gray-faint">
              Grant{" "}
              <span className="font-mono text-gray-muted">{SERVICE_ACCOUNT}</span>{" "}
              access first.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
