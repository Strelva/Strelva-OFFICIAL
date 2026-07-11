"use client";

import { useState } from "react";
import type { ScanSummary, ScanPrioritizedIssue } from "@/lib/scan-store";
import type { PrioritizedActionList, PrioritizedIssue } from "@/lib/audit/prioritize";
import { TONE_PILL, TONE_DOT, gradeTone, scoreTone } from "@/lib/status-colors";
import { Sparkline } from "../../Sparkline";

interface FreshCheck {
  name: string;
  status: "pass" | "warn" | "fail";
}
interface FreshCategory {
  name: string;
  slug: string;
  score: number;
  checks: FreshCheck[];
}

const PRIORITY_PILL: Record<PrioritizedIssue["priority"], string> = {
  high: "bg-critical0/15 text-critical border-critical0/30",
  medium: "bg-warning0/15 text-warning border-warning0/30",
  low: "bg-gray-bg text-gray-muted border-glass-border",
};

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SiteScan({
  tenantId,
  initialScan,
  history = [],
}: {
  tenantId: string;
  initialScan: ScanSummary | null;
  history?: number[];
}) {
  // `scan` is the displayed summary (grade + per-category scores); `detail` holds
  // the full per-check breakdown, available only after a fresh in-session scan.
  const [scan, setScan] = useState<ScanSummary | null>(initialScan);
  const [detail, setDetail] = useState<FreshCategory[] | null>(null);
  const [issues, setIssues] = useState<PrioritizedActionList | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: tenantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const cats: FreshCategory[] = data.categories;
      setScan({
        url: data.url,
        scannedAt: data.scannedAt,
        overallScore: data.overallScore,
        grade: data.grade,
        categories: cats.map((c) => ({ name: c.name, slug: c.slug, score: c.score })),
      });
      setDetail(cats);
      setIssues(data.prioritizedIssues ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function failingChecks(slug: string): string[] {
    const cat = detail?.find((c) => c.slug === slug);
    if (!cat) return [];
    return cat.checks.filter((ch) => ch.status === "fail").map((ch) => ch.name);
  }

  // The ranked "fix first" verdict. A live re-scan yields the fuller
  // PrioritizedActionList (true portfolio-wide counts); on initial load we
  // render the compact verdict the scan persisted, so the operator sees it
  // WITHOUT clicking Re-scan. Live detail wins when present; both normalize to
  // one row shape so the list renders identically.
  const fixList: ScanPrioritizedIssue[] | null = issues
    ? issues.issues.map((i) => ({
        message: i.message,
        category: i.category,
        priority: i.priority,
        impact: i.impact,
        quantified: i.quantified,
      }))
    : scan?.prioritizedIssues && scan.prioritizedIssues.length > 0
      ? scan.prioritizedIssues
      : null;
  const fixCounts = issues
    ? { high: issues.highCount, medium: issues.mediumCount, low: issues.lowCount }
    : scan?.prioritizedCounts
      ? scan.prioritizedCounts
      : fixList
        ? {
            // Legacy records without persisted counts: count the capped list
            // (may understate when >8 issues, but never overstates).
            high: fixList.filter((f) => f.priority === "high").length,
            medium: fixList.filter((f) => f.priority === "medium").length,
            low: fixList.filter((f) => f.priority === "low").length,
          }
        : null;

  return (
    <div className="rounded-xl bg-glass border border-glass-border p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-medium text-warm-white">SEO + site health</h2>
          <p className="mt-0.5 text-xs text-gray-muted">
            {scan
              ? `Last scanned ${ago(scan.scannedAt)} · ${scan.url.replace(/^https?:\/\//, "")}`
              : "Live scan of the client's public site (SEO, schema, mobile, accessibility, security, speed)."}
          </p>
        </div>
        <button
          onClick={() => void runScan()}
          disabled={scanning}
          aria-busy={scanning}
          className="shrink-0 rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {scanning ? "Scanning…" : scan ? "Re-scan" : "Run scan"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-critical">{error}</p>}

      {scan && (
        <div className="mt-5">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border text-3xl font-semibold ${TONE_PILL[gradeTone(scan.grade)]}`}
            >
              {scan.grade}
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-normal text-warm-white">{scan.overallScore}/100</p>
              <p className="text-xs text-gray-faint">
                {detail ? "fresh scan" : "last stored result"}
              </p>
            </div>
            {history.length >= 2 && (
              <div className="ml-auto flex flex-col items-end">
                <Sparkline values={history} width={120} height={28} />
                <span className="mt-1 text-[11px] text-gray-faint">{history.length} scans</span>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {scan.categories.map((c) => {
              const fails = failingChecks(c.slug);
              return (
                <div key={c.slug}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-warm-white">{c.name}</span>
                    <span className="text-gray-muted">{c.score}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-bg">
                    <div
                      className={`h-1.5 rounded-full ${TONE_DOT[scoreTone(c.score)]}`}
                      style={{ width: `${c.score}%` }}
                    />
                  </div>
                  {fails.length > 0 && (
                    <p className="mt-1 text-[11px] text-critical/80">
                      {fails.slice(0, 2).join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {fixList && fixCounts && (
            <div className="mt-6 border-t border-glass-border pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-warm-white">Fix first</h3>
                <span className="text-[11px] text-gray-faint">
                  {fixCounts.high} high · {fixCounts.medium} medium · {fixCounts.low} low
                </span>
              </div>
              <ol className="mt-2 space-y-1.5">
                {fixList.slice(0, 8).map((issue, i) => (
                  <li
                    key={`${issue.category}-${issue.message}-${i}`}
                    className="flex items-start gap-2.5 text-xs"
                  >
                    <span className="mt-0.5 w-4 shrink-0 text-right tabular-nums text-gray-faint">
                      {i + 1}
                    </span>
                    <span
                      className={`mt-px shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${PRIORITY_PILL[issue.priority]}`}
                    >
                      {issue.priority}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-warm-white">{issue.message}</span>
                      <span className="text-gray-faint"> · {issue.category}</span>
                      {issue.impact && (
                        <span className="block text-[11px] text-gray-muted">{issue.impact}</span>
                      )}
                    </span>
                    {issue.quantified && (
                      <span className="mt-px shrink-0 text-[11px] font-semibold tabular-nums text-warm-white">
                        {issue.quantified}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
