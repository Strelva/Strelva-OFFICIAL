"use client";

import { useState } from "react";
import { StEmpty, StMono, StNotice, StPill, StSection, StState, StTable, StTextButton } from "@/components/ui/strelva/Kit";

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

export function SiteAuditsBoard({ initialRows, request = fetch }: { initialRows: AuditRow[]; request?: typeof fetch }) {
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [allRunning, setAllRunning] = useState(false);
  const [error, setError] = useState("");

  async function scanOne(id: string): Promise<void> {
    setBusy((b) => new Set(b).add(id));
    setError("");
    try {
      const res = await request("/api/admin/scan", {
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

  return <StSection title="Client sites" meta={<StMono>{rows.length}</StMono>} action={rows.length > 0 ? <StPill onClick={scanAll} disabled={allRunning || busy.size > 0} busy={allRunning}>{allRunning ? "Scanning…" : "Scan all sites"}</StPill> : undefined}>
    {error && <StNotice tone="critical">{error} Previous audit results are still shown.</StNotice>}
    {rows.length === 0 ? <StEmpty>No client sites to audit yet.</StEmpty> : <StTable label="Site audits" columns={[
      { key: "client", label: "Client" }, { key: "grade", label: "Grade" }, { key: "score", label: "Score", mono: true }, { key: "issues", label: "Fix first" }, { key: "actions", label: "Audit" },
    ]} rows={rows.map(row => {
      const scanning = busy.has(row.id);
      return { key: row.id, cells: {
        client: <><StTextButton href={`/admin/clients/${row.id}`}>{row.siteName}</StTextButton><br /><StMono as="time" dateTime={row.scannedAt ?? undefined}>{ago(row.scannedAt)}</StMono></>,
        grade: row.grade ? <StState kind={row.grade === "A" || row.grade === "B" ? "live" : row.grade === "F" ? "down" : "need"}>Grade {row.grade}</StState> : <StState kind="draft">Not scanned</StState>,
        score: row.score != null ? `${row.score}/100` : "Not measured",
        issues: row.issues == null ? "Not checked" : row.issues === 0 ? <StState kind="live">All clear</StState> : <StState kind={row.high > 0 ? "down" : "need"}>{row.high > 0 ? `${row.high} high · ` : ""}{row.issues} to fix</StState>,
        actions: <div className="flex flex-wrap items-center gap-2"><StPill variant="soft" onClick={() => scanOne(row.id)} disabled={scanning || allRunning} busy={scanning} aria-label={`Re-scan ${row.siteName}`}>{scanning ? "Scanning…" : "Scan"}</StPill><StTextButton href={`/admin/clients/${row.id}#site-health`} aria-label={`Full audit detail for ${row.siteName}`}>Detail</StTextButton></div>,
      }};
    })} />}
  </StSection>;
}
