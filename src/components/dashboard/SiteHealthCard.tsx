"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import type { AuditResult, CategoryResult } from "@/lib/audit/types";

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

// Grade + bar color read the shared semantic tokens: positive (sage) for good,
// the one warning amber for the middle, the one critical red for bad. No raw ramp.
function gradeColor(grade: string): string {
  switch (grade) {
    case "A":
    case "B":
      return "var(--color-positive)";
    case "C":
    case "D":
      return "var(--color-warning)";
    default:
      return "var(--color-critical)";
  }
}

function barColor(score: number): string {
  if (score >= 80) return "var(--color-positive)";
  if (score >= 50) return "var(--color-warning)";
  return "var(--color-critical)";
}

/** Client-facing category marker. A green check celebrates a strong area; every
 *  other level gets a calm neutral dot — never a red "fail" X. The score number
 *  and bar color still carry the honest signal; the raw pass/warn/fail per-check
 *  breakdown lives admin-side (the tenant SiteScan view), per the product rule
 *  that the client sees good numbers, not a problem list. */
function categoryMarker(score: number): React.ReactNode {
  if (score >= 80) {
    return <CheckCircle2 className="h-4 w-4 text-positive" strokeWidth={2} />;
  }
  return <span className="inline-block h-2 w-2 rounded-full bg-gray-muted/50" aria-hidden />;
}

type TrendPoint = { overallScore: number; scannedAt: string };

/** Compact score-over-time band. History arrives newest-first. */
function TrendBand({ history }: { history: TrendPoint[] }) {
  const ordered = [...history].reverse(); // oldest -> newest for the sparkline
  const scores = ordered.map((p) => p.overallScore);
  const latest = scores[scores.length - 1] ?? 0;
  const prev = scores[scores.length - 2] ?? 0;
  const delta = latest - prev;
  const max = Math.max(100, ...scores);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--st-line)] py-3">
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
            <span className={delta > 0 ? "font-medium text-positive" : "font-medium text-critical"}>
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
          await res.text().catch(() => ""); // end the request; no check yet is not an error
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
      <p className="m-0 flex items-center gap-2 text-[15px] text-[var(--st-text-2)]" role="status">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
        Reading the last site check
      </p>
    );
  }

  if (state === "empty") {
    return (
      <p className="m-0 text-[15px] text-[var(--st-text-2)]">Strelva checks your site once a day. Your score shows up here after the first check.</p>
    );
  }

  if (state === "error") {
    return (
      <p className="m-0 flex flex-wrap items-baseline gap-2 text-[15px] text-[var(--st-text)]" role="alert">
        <span className="inline-block h-[7px] w-[7px] self-center rounded-full bg-[var(--st-critical)]" aria-hidden="true" />
        {error}
        <button type="button" onClick={() => void load(false)} className="border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--st-accent)] hover:underline">Try again</button>
      </p>
    );
  }

  if (!audit) return null;

  return (
    <div className="flex flex-col">
      {/* Header: score + grade + rescan */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--st-line)] pb-4">
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
              <div className="text-[12px] font-semibold" style={{ color: gradeColor(audit.grade) }}>
                {audit.grade}
              </div>
            </div>
          </div>
          <div>
            <p className="m-0 text-[15px] font-medium text-[var(--st-text)]">Score {audit.overallScore}, grade {audit.grade}</p>
            <p className="m-0 text-[13px] text-[var(--st-text-2)]">
              Checked {new Date(audit.scannedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={rescanning}
          className="border-0 bg-transparent p-0 text-[14px] font-medium text-[var(--st-accent)] hover:underline disabled:opacity-60"
        >
          {rescanning ? "Checking now" : "Check again"}
        </button>
      </div>

      {/* Weekly trend */}
      {history.length >= 2 && <TrendBand history={history} />}

      {/* Quick wins — MANAGED, forward-looking framing. The client sees
          opportunities to climb, not a red problem list (the raw issue detail is
          admin-side). The action is "ask Strelva", never a DIY how-to. */}
      {audit.topFixes.length > 0 && (
        <div className="border-b border-[var(--st-line)] py-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-semibold text-warm-black">
              {audit.grade === "A" ? "Ways to stay ahead" : "Quick wins to reach an A"}
            </p>
            <Link
              href={dashboardHref("/dashboard/chat")}
              className="shrink-0 text-[12px] font-medium text-accent transition-colors hover:text-warm-black"
            >
              Ask Strelva to handle these -&gt;
            </Link>
          </div>
          <p className="mt-0.5 text-[12px] text-gray-muted">
            Small boosts we&apos;re already watching. Ask Strelva to knock one out in
            chat, or we&apos;ll pick it up as we manage your site.
          </p>
          <ul className="mt-3 grid gap-2">
            {audit.topFixes.map((fix) => (
              <li key={`${fix.category}-${fix.name}`} className="py-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-warm-black">{fix.name}</span>
                  {fix.quantified ? (
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-warm-black">
                      {fix.quantified}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[13px] text-gray-muted">
                      {fix.category}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-gray-muted">
                  {fix.impact || fix.message}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Category bars */}
      <div className="grid gap-2.5 py-4">
        {audit.categories
          .filter((c: CategoryResult) => c.weight > 0)
          .map((cat: CategoryResult) => (
            <div key={cat.slug} className="flex items-center gap-3">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {categoryMarker(cat.score)}
              </span>
              <span className="w-40 shrink-0 truncate text-[13px] text-warm-black">{cat.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full">
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
