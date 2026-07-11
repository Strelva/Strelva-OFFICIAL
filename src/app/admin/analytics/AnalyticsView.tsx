"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  TenantAnalyticsConfig,
  SearchPerf,
  GaPerf,
} from "@/lib/analytics";

const SERVICE_ACCOUNT = "strelva-reporting@strelva.iam.gserviceaccount.com";

interface TenantOption {
  id: string;
  siteName: string;
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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-base/40 border border-glass-border px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-warm-white">
        {value}
      </p>
    </div>
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
        Connection card above) as a user on their {service} property, then set
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
    <section className="rounded-xl bg-glass border border-glass-border overflow-hidden">
      <div className="px-5 py-3 border-b border-glass-border">
        <h2 className="text-[15px] font-medium text-warm-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-faint">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SearchConsoleCard({ perf }: { perf: SearchPerf }) {
  if (perf.status === "unconfigured") {
    return (
      <CardShell title="Search Console">
        <ConnectPrompt service="Search Console" />
      </CardShell>
    );
  }
  if (perf.status === "unavailable") {
    return (
      <CardShell title="Search Console">
        <UnavailableNote />
      </CardShell>
    );
  }
  return (
    <CardShell title="Search Console" subtitle="How people find them on Google.">
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
    <CardShell title="Analytics (GA4)" subtitle="Who's on the site and where they land.">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Users" value={formatInt(perf.users)} />
        <StatTile label="Sessions" value={formatInt(perf.sessions)} />
        <StatTile label="Pageviews" value={formatInt(perf.pageviews)} />
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

export function AnalyticsView({
  tenants,
  selected,
  config,
  search,
  ga,
}: {
  tenants: TenantOption[];
  selected: string;
  config: TenantAnalyticsConfig;
  search: SearchPerf;
  ga: GaPerf;
}) {
  const [gsc, setGsc] = useState(config.gscProperty ?? "");
  const [ga4, setGa4] = useState(config.ga4PropertyId ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(config.updatedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-glass border border-glass-border px-3 py-2.5">
        <span className="mr-1 text-xs text-gray-muted">Client</span>
        {tenants.map((t) => {
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
      </div>

      {/* Config row */}
      <section className="rounded-xl bg-glass border border-glass-border p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium text-warm-white">Connection</h2>
          <span className="text-[11px] text-gray-faint">
            saved {formatUpdated(savedAt)}
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
      </section>

      <SearchConsoleCard perf={search} />
      <Ga4Card perf={ga} />
    </div>
  );
}
