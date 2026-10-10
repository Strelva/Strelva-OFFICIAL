"use client";

import { useState } from "react";
import type { TenantDomainHealth, DomainState } from "@/lib/domain-monitor";
import { StCell, StEmpty, StHead, StMono, StNotice, StPage, StPill, StState, StTable, StTextButton } from "@/components/ui/strelva/Kit";

const DOWN_STATES = new Set<DomainState>(["down", "parked", "unreachable"]);
function severity(result: TenantDomainHealth) {
  return DOWN_STATES.has(result.worst) ? 0 : result.nearestExpiryDays !== null && result.nearestExpiryDays <= 30 ? 1 : result.worst === "unknown" ? 2 : 3;
}
export function sortSiteChecks(results: readonly TenantDomainHealth[]) {
  return [...results].sort((a, b) => severity(a) - severity(b) || a.siteName.localeCompare(b.siteName));
}
function stateLabel(state: DomainState) { return state === "up" ? "Up" : state === "unknown" ? "Not checked" : state === "unreachable" ? "Unreachable" : state === "parked" ? "Parked" : "Down"; }

/** Uses measured monitor results only. TLS/form coverage is explicitly unknown. */
export function UptimeBoard({ initialResults, initialScannedAt, request = fetch, preview = false }: { initialResults: TenantDomainHealth[]; initialScannedAt: string; request?: typeof fetch; preview?: boolean }) {
  const [results, setResults] = useState(initialResults);
  const [scannedAt, setScannedAt] = useState(initialScannedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function rescan() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await request("/api/admin/domain-monitor/scan", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Scan failed (${response.status})`);
      setResults(data.results as TenantDomainHealth[]); setScannedAt(data.scannedAt as string);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Checks could not be read."); }
    finally { setBusy(false); }
  }
  const failing = results.filter(result => DOWN_STATES.has(result.worst)).length;
  const unknown = results.filter(result => result.worst === "unknown").length;
  return <StPage><StHead title="Checks" meta={<>{results.length} sites · {failing} failing · {unknown} not checked · checked {new Date(scannedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>} actions={<StPill variant="soft" busy={busy} onClick={() => void rescan()}>{busy ? "Checking…" : "Run again"}</StPill>} />
    {error && <StNotice tone="critical">{error} Previous checks are still shown.</StNotice>}
    {results.length === 0 ? <StEmpty>No active client sites to check.</StEmpty> : <StTable label="Checks across every client site, failing first" columns={["Site", "Up", "Certificate", "Form", "Domain"]}>
      {sortSiteChecks(results).flatMap(result => (result.checks.length ? result.checks : [null]).map((check, index) => <tr key={`${result.tenantId}-${check?.host ?? index}`}>
        <StCell heading label="Site"><StTextButton href={preview ? `/preview/strelva/operator-client?client=${result.tenantId}` : `/admin/clients/${result.tenantId}`}><StMono tone="text">{check?.host ?? result.primaryHost ?? result.siteName}</StMono></StTextButton></StCell>
        <StCell label="Up"><StState kind={check?.state === "up" ? "live" : check && DOWN_STATES.has(check.state) ? "down" : "draft"}>{stateLabel(check?.state ?? "unknown")}{check?.httpStatus ? ` · ${check.httpStatus}` : ""}</StState>{check?.reason ? <div>{check.reason}</div> : null}</StCell>
        <StCell label="Certificate">Not measured</StCell>
        <StCell label="Form">Not checked here</StCell>
        <StCell label="Domain">{check?.daysToExpiry != null ? <StMono tone={check.daysToExpiry <= 30 ? "need" : undefined}>{check.daysToExpiry <= 0 ? "Expired" : `${check.daysToExpiry} days to registry expiry`}</StMono> : "Expiry unknown"}</StCell>
      </tr>))}
    </StTable>}
    <StNotice>These checks measure site responses and domain registry expiry. Certificate lifetime, form delivery and 30-day uptime are not measured by this monitor.</StNotice>
  </StPage>;
}
