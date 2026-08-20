"use client";

import { useState } from "react";
import { Loader2, RotateCw, Globe, ShieldAlert } from "lucide-react";
import { TONE_PILL, type Tone } from "@/lib/status-colors";
import type { TenantDomainHealth, DomainState } from "@/lib/domain-monitor";

/** States that mean the site is not serving real content. Inlined (not imported
 *  from domain-monitor) so this client bundle never pulls server-only tenant code. */
const DOWN_STATES = new Set<DomainState>(["down", "parked", "unreachable"]);

function stateTone(state: DomainState): Tone {
  if (state === "up") return "good";
  if (DOWN_STATES.has(state)) return "bad";
  return "neutral";
}

function expiryTone(days: number): Tone {
  if (days <= 7) return "bad";
  if (days <= 30) return "warn";
  return "good";
}

function stateLabel(state: DomainState): string {
  return state === "up" ? "UP" : state.toUpperCase();
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TONE_PILL[tone]}`}
    >
      {children}
    </span>
  );
}

export function UptimeBoard({
  initialResults,
  initialScannedAt,
}: {
  initialResults: TenantDomainHealth[];
  initialScannedAt: string;
}) {
  const [results, setResults] = useState(initialResults);
  const [scannedAt, setScannedAt] = useState(initialScannedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function rescan(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/domain-monitor/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Scan failed (${res.status})`);
      setResults(data.results as TenantDomainHealth[]);
      setScannedAt(data.scannedAt as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  const downCount = results.filter((r) => DOWN_STATES.has(r.worst)).length;
  const expiringCount = results.filter(
    (r) => r.nearestExpiryDays !== null && r.nearestExpiryDays <= 30,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-warm-white">
            <Globe className="h-4 w-4 text-gray-muted" />
            Uptime &amp; domains
          </h1>
          <p className="mt-0.5 text-xs text-gray-faint">
            Client-facing domains — down / parking-page / expiry monitor. Scanned {ago(scannedAt)}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {downCount > 0 && <Pill tone="bad">{downCount} down</Pill>}
          {expiringCount > 0 && <Pill tone="warn">{expiringCount} expiring</Pill>}
          {downCount === 0 && expiringCount === 0 && <Pill tone="good">all healthy</Pill>}
          <button
            onClick={() => void rescan()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-glass-border px-3 py-1.5 text-xs text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            {busy ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-critical/25 bg-critical/10 px-3 py-2 text-xs text-critical">
          <ShieldAlert className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {results.length === 0 && (
          <p className="rounded-md border border-glass-border bg-gray-bg px-3 py-6 text-center text-xs text-gray-faint">
            No active tenants to monitor.
          </p>
        )}
        {results.map((r) => (
          <div
            key={r.tenantId}
            className="rounded-lg border border-glass-border bg-gray-bg p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Pill tone={stateTone(r.worst)}>{stateLabel(r.worst)}</Pill>
                <span className="text-sm font-medium text-warm-white">{r.siteName}</span>
                {r.primaryHost && (
                  <span className="text-xs text-gray-faint">{r.primaryHost}</span>
                )}
              </div>
              {r.nearestExpiryDays !== null && r.nearestExpiryDays <= 30 && (
                <Pill tone={expiryTone(r.nearestExpiryDays)}>
                  {r.nearestExpiryDays <= 0
                    ? "domain expired"
                    : `expires in ${r.nearestExpiryDays}d`}
                </Pill>
              )}
            </div>

            {/* Per-host checks */}
            <div className="mt-2 flex flex-col gap-1">
              {r.checks.length === 0 && (
                <p className="text-xs text-gray-faint">No monitorable domain resolved.</p>
              )}
              {r.checks.map((c) => (
                <div
                  key={`${r.tenantId}-${c.host}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-glass-border/50 pt-1 text-xs first:border-0 first:pt-0"
                >
                  <Pill tone={stateTone(c.state)}>{stateLabel(c.state)}</Pill>
                  <span className="font-mono text-gray-muted">{c.host}</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-faint">
                    {c.kind}
                  </span>
                  {c.reason && <span className="text-gray-faint">· {c.reason}</span>}
                  {c.httpStatus !== null && (
                    <span className="text-gray-faint">· HTTP {c.httpStatus}</span>
                  )}
                  {c.bytes !== null && (
                    <span className="text-gray-faint">· {c.bytes}B</span>
                  )}
                  {c.expiresAt && (
                    <span className="ml-auto text-gray-faint">
                      exp {c.expiresAt}
                      {c.daysToExpiry !== null ? ` (${c.daysToExpiry}d)` : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
