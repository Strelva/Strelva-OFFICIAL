"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import type { AuditResult, CategoryResult, CheckStatus } from "@/lib/audit/types";

type Fix = {
  category: string;
  name: string;
  message: string;
  impact?: string;
  quantified?: string;
  priority?: "high" | "medium" | "low";
  score: number;
  guides?: { slug: string; title: string }[];
};
type SiteAudit = AuditResult & { topFixes: Fix[] };

function gradeColor(grade: string): string {
  switch (grade) {
    case "A":
      return "#16a34a";
    case "B":
      return "#65a30d";
    case "C":
      return "#ca8a04";
    case "D":
      return "#ea580c";
    default:
      return "#dc2626";
  }
}

function barColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 50) return "#ca8a04";
  return "#dc2626";
}

const statusIcon: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="h-4 w-4 text-green-600" strokeWidth={2} />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={2} />,
  fail: <XCircle className="h-4 w-4 text-red-500" strokeWidth={2} />,
};

type TrendPoint = { overallScore: number; scannedAt: string };

/** Compact score-over-time band. History arrives newest-first. */
function TrendBand({ history }: { history: TrendPoint[] }) {
  const ordered = [...history].reverse(); // oldest -> newest for the sparkline
  const scores = ordered.map((p) => p.overallScore);
  const latest = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const delta = latest - prev;
  const max = Math.max(100, ...scores);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-border px-5 py-3">
      <div className="flex items-end gap-[3px]" aria-hidden>
        {scores.slice(-10).map((s, i) => (
          <div
            key={i}
            className="w-1.5 rounded-sm"
            style={{
              height: `${Math.max(4, (s / max) * 28)}px`,
              backgroundColor: barColor(s),
              opacity: 0.45 + (0.55 * (i + 1)) / Math.min(10, scores.length),
            }}
          />
        ))}
      </div>
      <p className="text-[12px] text-gray-muted">
        {delta === 0 ? (
          "No change since last check"
        ) : (
          <>
            <span className={delta > 0 ? "font-medium text-green-600" : "font-medium text-red-500"}>
              {delta > 0 ? "+" : ""}
              {delta}
            </span>{" "}
            since last check
          </>
        )}
      </p>
    </div>
  );
}

export function SiteHealthCard() {
  const { dashboardHref } = useDashboard();
  const [audit, setAudit] = useState<SiteAudit | null>(null);
  const [state, setState] = useState<"loading" | "done" | "empty" | "error">("loading");
  const [error, setError] = useState("");
  const [rescanning, setRescanning] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRescanning(true);
      else setState("loading");
      try {
        const res = await fetch(
          dashboardHref(`/api/dashboard/site-audit${refresh ? "?refresh=1" : ""}`),
          { credentials: "same-origin" }
        );
        if (res.status === 404) {
          setState("empty");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Audit failed (${res.status})`);
        }
        setAudit(await res.json());
        setState("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Audit failed.");
        setState("error");
      } finally {
        setRescanning(false);
      }
    },
    [dashboardHref]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // Weekly history for the trend line (filled by the Sunday cron over time).
  const [history, setHistory] = useState<TrendPoint[]>([]);
  useEffect(() => {
    let active = true;
    fetch(dashboardHref("/api/dashboard/site-audit/history"), { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && Array.isArray(d?.history)) setHistory(d.history);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [dashboardHref]);

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-border bg-gray-bg/40 px-5 py-8 text-sm text-gray-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking your site health...
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="rounded-xl border border-gray-border bg-gray-bg/40 px-5 py-8 text-center">
        <p className="text-sm font-medium text-warm-black">Site health is not available yet</p>
        <p className="mt-1 text-[13px] text-gray-muted">
          Your health score appears here once your site is live.
        </p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-6 text-center">
        <p className="text-sm font-medium text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void load(false)}
          className="mt-3 text-[13px] font-medium text-warm-black underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!audit) return null;

  return (
    <div className="rounded-2xl border border-gray-border bg-warm-white">
      {/* Header: score + grade + rescan */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-border px-5 py-4">
        <div className="flex items-center gap-4">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-full border-4"
            style={{
              borderColor: gradeColor(audit.grade),
              background: `color-mix(in oklch, ${gradeColor(audit.grade)} 8%, transparent)`,
            }}
          >
            <div className="text-center leading-none">
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: gradeColor(audit.grade) }}
              >
                {audit.overallScore}
              </div>
              <div className="text-[10px] font-semibold" style={{ color: gradeColor(audit.grade) }}>
                {audit.grade}
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-warm-black">Site Health</h2>
            <p className="text-[12px] text-gray-muted">
              Scanned {new Date(audit.scannedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={rescanning}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-border px-3 py-1.5 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? "animate-spin" : ""}`} />
          {rescanning ? "Scanning" : "Re-scan"}
        </button>
      </div>

      {/* Weekly trend */}
      {history.length >= 2 && <TrendBand history={history} />}

      {/* Top fixes */}
      {audit.topFixes.length > 0 && (
        <div className="border-b border-gray-border px-5 py-4">
          <p className="text-[13px] font-semibold text-warm-black">Fix these first</p>
          <ul className="mt-2 grid gap-2">
            {audit.topFixes.map((fix) => (
              <li key={`${fix.category}-${fix.name}`} className="rounded-lg bg-gray-bg/50 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-warm-black">{fix.name}</span>
                  {fix.quantified ? (
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-warm-black">
                      {fix.quantified}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-gray-muted">
                      {fix.category}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-gray-muted">
                  {fix.impact || fix.message}
                </p>
                {fix.guides && fix.guides.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {fix.guides.map((g) => (
                      <Link
                        key={g.slug}
                        href={`/guides/${g.slug}`}
                        className="text-[12px] font-medium text-accent transition-colors hover:text-warm-black"
                      >
                        Fix it: {g.title} -&gt;
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Category bars */}
      <div className="grid gap-2.5 px-5 py-4">
        {audit.categories
          .filter((c: CategoryResult) => c.weight > 0)
          .map((cat: CategoryResult) => (
            <div key={cat.slug} className="flex items-center gap-3">
              {statusIcon[cat.score >= 80 ? "pass" : cat.score >= 50 ? "warn" : "fail"]}
              <span className="w-40 shrink-0 truncate text-[13px] text-warm-black">{cat.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-bg">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${cat.score}%`, backgroundColor: barColor(cat.score) }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-[12px] tabular-nums text-gray-muted">
                {cat.score}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
