"use client";

import { ClientLogo, Chip, Panel } from "@/app/admin/console";
import { Sparkline } from "@/components/dashboard/Sparkline";
import type { GoalMetric } from "@/lib/goals";
import { GOAL_METRIC_LABELS } from "@/lib/goals";

export interface PortfolioRow {
  tenantId: string;
  name: string;
  domain: string | null;
  goalMetric: GoalMetric | null;
  thisWeek: number;
  lastWeek: number;
  sparkline: number[];
}

function delta(thisWeek: number, lastWeek: number): string {
  if (lastWeek === 0 && thisWeek === 0) return "";
  if (lastWeek === 0) return `+${thisWeek}`;
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

type Tone = "good" | "warn" | "crit" | "neutral";

function trendTone(thisWeek: number, lastWeek: number): Tone {
  if (thisWeek === 0 && lastWeek === 0) return "neutral";
  if (thisWeek > lastWeek) return "good";
  if (thisWeek < lastWeek) return "crit";
  return "warn";
}

function trendLabel(thisWeek: number, lastWeek: number): string {
  if (thisWeek === 0 && lastWeek === 0) return "NO DATA";
  if (thisWeek > lastWeek) return "UP";
  if (thisWeek < lastWeek) return "DOWN";
  return "STALLED";
}

export function PortfolioAnalytics({ rows }: { rows: PortfolioRow[] }) {
  if (rows.length === 0) return null;

  return (
    <Panel title="Portfolio" bodyClassName="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const tone = trendTone(row.thisWeek, row.lastWeek);
          const d = delta(row.thisWeek, row.lastWeek);
          const noData = row.thisWeek === 0 && row.lastWeek === 0;
          const faviconUrl = row.domain
            ? `https://www.google.com/s2/favicons?domain=${row.domain}&sz=64`
            : null;

          return (
            <div
              key={row.tenantId}
              className="flex flex-col gap-3 rounded-xl border border-glass-border bg-surface-base/40 px-4 py-3"
            >
              {/* Header row: logo + name + status chip */}
              <div className="flex items-center gap-2.5">
                <ClientLogo name={row.name} logoUrl={faviconUrl} size={28} />
                <span className="flex-1 truncate text-[13px] font-semibold text-warm-white">
                  {row.name}
                </span>
                <Chip tone={tone}>{trendLabel(row.thisWeek, row.lastWeek)}</Chip>
              </div>

              {/* Goal label */}
              <div>
                {row.goalMetric ? (
                  <p className="text-[11px] uppercase tracking-[0.1em] text-gray-faint">
                    Goal: {GOAL_METRIC_LABELS[row.goalMetric]}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-faint">no goal set</p>
                )}
              </div>

              {/* Numbers */}
              <div className="flex items-baseline gap-3">
                <span className="font-display text-[26px] font-medium tracking-[-0.02em] text-warm-white tabular-nums">
                  {row.thisWeek.toLocaleString()}
                </span>
                {!noData && d && (
                  <span
                    className={`text-[12px] font-semibold tabular-nums ${
                      tone === "good"
                        ? "text-positive"
                        : tone === "crit"
                          ? "text-critical"
                          : "text-warning"
                    }`}
                  >
                    {d} vs last wk
                  </span>
                )}
              </div>

              {/* Sparkline */}
              <div className="h-7">
                {row.sparkline.length > 1 && !noData ? (
                  <Sparkline series={row.sparkline} />
                ) : (
                  <p className="text-[10px] text-gray-faint">no beacon data — is the tracker installed?</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
