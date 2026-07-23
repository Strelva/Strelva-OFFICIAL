"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, RotateCw, ArrowRight, CircleAlert } from "lucide-react";
import { ClientLogo, Grade, LaunchBar } from "../console";

/** Tone the score bar to match the letter grade (A/B good, C/D watch, F bad) so
 *  the bar and the badge never disagree — a B-grade site reads healthy, not amber. */
function gradeTone(grade: string | null): "good" | "warn" | "crit" | undefined {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "C" || grade === "D") return "warn";
  if (grade === "F") return "crit";
  return undefined;
}

export interface AuditRow {
  id: string;
  siteName: string;
  url: string | null;
  grade: string | null;
  score: number | null;
  /** Total open issues (high + medium + low), or null if never scanned. */
  issues: number | null;
  high: number;
  scannedAt: string | null;
}

function ago(iso: string | null): string {
  if (!iso) return "never scanned";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "scanned today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function SiteAuditsBoard({ initialRows }: { initialRows: AuditRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [allRunning, setAllRunning] = useState(false);
  const [error, setError] = useState("");

  async function scanOne(id: string): Promise<void> {
    setBusy((b) => new Set(b).add(id));
    setError("");
    try {
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Scan failed (${res.status})`);
      const issues: { priority?: string }[] = Array.isArray(data.prioritizedIssues) ? data.prioritizedIssues : [];
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                grade: data.grade ?? r.grade,
                score: data.overallScore ?? r.score,
                issues: issues.length,
                high: issues.filter((i) => i.priority === "high").length,
                scannedAt: data.scannedAt ?? new Date().toISOString(),
              }
            : r,
        ),
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const name = rows.find((r) => r.id === id)?.siteName ?? "that site";
      // A DNS/connection failure is the common case (wrong or unresolvable
      // domain) — say that plainly instead of leaking "getaddrinfo ENOTFOUND".
      const msg = /ENOTFOUND|getaddrinfo|ECONNREFUSED|fetch failed/i.test(raw)
        ? `Couldn't reach ${name}'s site — check the production domain is live.`
        : `Couldn't scan ${name}${raw ? `: ${raw}` : "."}`;
      setError(msg);
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(id);
        return n;
      });
    }
  }

  async function scanAll() {
    setAllRunning(true);
    // Sequential — each audit fetches the live site, so firing them all at once
    // would hammer the target hosts and blow the function timeout.
    for (const r of rows) await scanOne(r.id);
    setAllRunning(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-muted">
          A health + SEO audit of each client&rsquo;s live site. Re-scan any one, or the whole book.
        </p>
        <button
          type="button"
          onClick={scanAll}
          disabled={allRunning || busy.size > 0}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {allRunning ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <RotateCw className="h-4 w-4" strokeWidth={2} />}
          {allRunning ? "Scanning…" : "Scan all sites"}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-critical" role="alert">
          <CircleAlert className="h-3.5 w-3.5" strokeWidth={2} /> {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-glass-border bg-glass">
        <div className="hidden grid-cols-[1fr_auto_150px_auto_auto] items-center gap-5 px-4 pb-1.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-faint md:grid">
          <span>Client</span>
          <span className="w-[52px] text-center">Grade</span>
          <span>Score</span>
          <span className="w-[120px] text-right">Fix first</span>
          <span className="w-[92px] text-right">Audit</span>
        </div>
        <div className="divide-y divide-glass-border">
          {rows.map((r) => {
            const scanning = busy.has(r.id);
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 md:grid md:grid-cols-[1fr_auto_150px_auto_auto] md:gap-5">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <ClientLogo name={r.siteName} size={34} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/clients/${r.id}`} className="block truncate text-[13.5px] font-semibold tracking-[-0.01em] text-warm-white hover:text-accent">
                      {r.siteName}
                    </Link>
                    <p className="mt-0.5 truncate text-[11px] text-gray-faint">{ago(r.scannedAt)}</p>
                  </div>
                </div>

                <div className="hidden w-[52px] justify-center md:flex">
                  {r.grade ? <Grade grade={r.grade} /> : <span className="text-[12px] text-gray-faint">&ndash;</span>}
                </div>

                <div className="hidden md:block">
                  {r.score != null ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-gray-muted">
                        <span>Health</span>
                        <span className="font-mono tabular-nums">{r.score}/100</span>
                      </div>
                      <LaunchBar pct={r.score} tone={gradeTone(r.grade)} />
                    </div>
                  ) : (
                    <span className="text-[12px] text-gray-faint">not scanned yet</span>
                  )}
                </div>

                <div className="hidden w-[120px] justify-end text-right text-[12px] md:flex">
                  {r.issues == null ? (
                    <span className="text-gray-faint">&mdash;</span>
                  ) : r.issues === 0 ? (
                    <span className="text-positive">all clear</span>
                  ) : (
                    <span className="text-gray-muted">
                      {r.high > 0 && <span className="font-semibold text-critical">{r.high} high</span>}
                      {r.high > 0 && " · "}
                      {r.issues} to fix
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center justify-end gap-1 md:w-[92px]">
                  <button
                    type="button"
                    onClick={() => scanOne(r.id)}
                    disabled={scanning || allRunning}
                    aria-label={`Re-scan ${r.siteName}`}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-glass-border px-2.5 py-1.5 text-[12px] font-medium text-gray-muted transition-colors hover:border-gray-border hover:text-warm-white disabled:opacity-50"
                  >
                    {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : <RotateCw className="h-3.5 w-3.5" strokeWidth={1.9} />}
                    {scanning ? "" : "Scan"}
                  </button>
                  <Link
                    href={`/admin/clients/${r.id}#site-health`}
                    aria-label={`Full audit detail for ${r.siteName}`}
                    className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] border border-glass-border text-gray-muted transition-colors hover:border-gray-border hover:text-warm-white"
                  >
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.9} />
                  </Link>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-gray-muted">No client sites to audit yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
