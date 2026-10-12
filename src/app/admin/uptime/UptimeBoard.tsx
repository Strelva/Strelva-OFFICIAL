"use client";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";

import { useEffect, useState } from "react";
import type { TenantDomainHealth, DomainState } from "@/lib/domain-monitor";
import { StCell, StEmpty, StHead, StMono, StNotice, StPage, StPill, StState, StGrid, StTextButton } from "@/components/ui/strelva/Kit";

import { CRON_MAX_AGE_SECONDS } from "@/platform/infra/heartbeat";

export function monitorEvidenceIssue(available: boolean, scannedAt: string | null, now = Date.now()): string | null {
  if (!available) return "Checks unavailable. No readable monitor snapshot is on record. Run again to check the sites.";
  const at = Date.parse(scannedAt ?? "");
  if (!Number.isFinite(at) || at > now) return "Check time is unverified. These results cannot establish current health. Run again.";
  if (now - at > CRON_MAX_AGE_SECONDS["domain-monitor"] * 1000) return "Checks are stale. These are historical results; run again to verify current health.";
  return null;
}

const DOWN_STATES = new Set<DomainState>(["down", "parked", "unreachable"]);
function severity(result: TenantDomainHealth) {
  return DOWN_STATES.has(result.worst) ? 0 : result.nearestExpiryDays !== null && result.nearestExpiryDays <= 30 ? 1 : result.worst === "unknown" ? 2 : 3;
}
export function sortSiteChecks(results: readonly TenantDomainHealth[]) {
  return [...results].sort((a, b) => severity(a) - severity(b) || a.siteName.localeCompare(b.siteName));
}
function stateLabel(state: DomainState) { return state === "up" ? "Up" : state === "unknown" ? "Not checked" : state === "unreachable" ? "Unreachable" : state === "parked" ? "Parked" : "Down"; }

/** Uses measured monitor results only. TLS/form coverage is explicitly unknown. */
export function UptimeBoard({ initialResults, initialScannedAt, initialAvailable = true, request = fetch, preview = false }: { initialResults: TenantDomainHealth[]; initialScannedAt: string | null; initialAvailable?: boolean; request?: typeof fetch; preview?: boolean }) {
  const [results, setResults] = useState(initialResults);
  const [scannedAt, setScannedAt] = useState(initialScannedAt);
  const [available, setAvailable] = useState(initialAvailable);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const evidenceIssue = monitorEvidenceIssue(available, scannedAt, now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function rescan() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await request("/api/admin/domain-monitor/scan", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Scan failed (${response.status})`);
      if (!Array.isArray(data.results) || typeof data.scannedAt !== "string" || !Number.isFinite(Date.parse(data.scannedAt))) throw new Error("The check response was incomplete. Run again to verify the sites.");
      setResults(data.results as TenantDomainHealth[]); setScannedAt(data.scannedAt); setAvailable(true); setNow(Date.now());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Checks could not be read."); }
    finally { setBusy(false); }
  }
  const failing = results.filter(result => DOWN_STATES.has(result.worst)).length;
  const unknown = results.filter(result => result.worst === "unknown").length;
  return <StPage><StHead title={OPERATOR_DESTINATIONS.checks.label} meta={<>{!available ? "Checks unavailable" : <>{results.length} sites · {failing} failing · {unknown} not checked · last checked {scannedAt && Number.isFinite(Date.parse(scannedAt)) ? new Date(scannedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Time unverified"}</>}</>} actions={<StPill variant="soft" busy={busy} onClick={() => void rescan()}>{busy ? "Checking…" : "Run again"}</StPill>} />
    {evidenceIssue && <StNotice tone="critical">{evidenceIssue}</StNotice>}
    {error && <StNotice tone="critical">{error} {available ? "Previous checks are still shown." : "Current site health is unverified."}</StNotice>}
    {results.length === 0 ? <StEmpty>{available ? "No active client sites in the last check." : "No checks available."}</StEmpty> : <StGrid label="Checks across every client site, failing first" columns={["Site", "Up", "Certificate", "Form", "Domain"]}>
      {sortSiteChecks(results).flatMap(result => (result.checks.length ? result.checks : [null]).map((check, index) => <tr key={`${result.tenantId}-${check?.host ?? index}`}>
        <StCell heading label="Site"><StTextButton href={preview ? `/preview/strelva/operator-client?client=${result.tenantId}` : `/admin/clients/${result.tenantId}`}><StMono tone="text">{check?.host ?? result.primaryHost ?? result.siteName}</StMono></StTextButton></StCell>
        <StCell label="Up"><StState kind={!evidenceIssue && check?.state === "up" ? "live" : check && DOWN_STATES.has(check.state) ? "down" : "draft"}>{evidenceIssue ? "Last check: " : ""}{stateLabel(check?.state ?? "unknown")}{check?.httpStatus ? ` · ${check.httpStatus}` : ""}</StState>{check?.reason ? <div>{check.reason}</div> : null}</StCell>
        <StCell label="Certificate">Not measured</StCell>
        <StCell label="Form">Not checked here</StCell>
        <StCell label="Domain">{check?.daysToExpiry != null ? <StMono tone={check.daysToExpiry <= 30 ? "need" : undefined}>{evidenceIssue ? "Last check: " : ""}{check.daysToExpiry <= 0 ? "Expired" : `${check.daysToExpiry} days to registry expiry`}</StMono> : "Expiry unknown"}</StCell>
      </tr>))}
    </StGrid>}
    <StNotice>These checks measure site responses and domain registry expiry. Certificate lifetime, form delivery and 30-day uptime are not measured by this monitor.</StNotice>
  </StPage>;
}
