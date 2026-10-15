"use client";
import { useCallback, useEffect, useState } from "react";
import { StCopy, StNotice, StPill, StSection, StSegmented, StSkeleton, StTable, StTextButton } from "@/components/ui/strelva/Kit";
import { careReportListResponseSchema, type CareReportList } from "@/platform/care-reports/contracts";
import { careDeliveryLine, careMonthLabel, careShortDate, currentCareMonth, previousCareMonth } from "@/platform/care-reports/model";

type Loaded = { list: CareReportList; emailOn: boolean };
type State = { kind: "loading" } | { kind: "off" } | { kind: "error" } | { kind: "ready"; data: Loaded };
type Skip = { workspaceId: string; name: string; reason: "not_available" | "not_allowed" | "failed" };
export type CareReportsOutcome = { generated: number; skipped: Skip[] };
type Outcome = CareReportsOutcome;

const SKIP_SENTENCE: Record<Skip["reason"], (name: string) => string> = {
  not_available: name => `Care plan reports are off for ${name}`,
  not_allowed: name => `You can't prepare reports for ${name}`,
  failed: name => `${name} couldn't be read. Nothing changed.`,
};

/**
 * Care plan reports across the agency's clients for one month: what each client
 * has so far, who has a report, and one action to prepare them all. Renders
 * nothing while the App is off (the route answers 503).
 */
export function AgencyCareReports({ agencyWorkspaceId, agencyName, request = fetch, initialMonth, initialOutcome = null }: { agencyWorkspaceId: string; agencyName: string; request?: typeof fetch; initialMonth?: string; initialOutcome?: CareReportsOutcome | null }) {
  const previous = previousCareMonth();
  const current = currentCareMonth();
  const [month, setMonth] = useState(initialMonth ?? previous);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(initialOutcome);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await request(`/api/workspace/care-reports?${new URLSearchParams({ agencyWorkspaceId, month })}`, { credentials: "same-origin" });
        if (!live) return;
        if (response.status === 503) { setState({ kind: "off" }); return; }
        const value = response.ok ? await response.json() : null;
        const parsed = careReportListResponseSchema.safeParse(value);
        setState(parsed.success && parsed.data.agencyWorkspaceId === agencyWorkspaceId
          ? { kind: "ready", data: { list: parsed.data, emailOn: parsed.data.emailOn } } : { kind: "error" });
      } catch { if (live) setState({ kind: "error" }); }
    })();
    return () => { live = false; };
  }, [agencyWorkspaceId, month, request, attempt]);

  const generate = useCallback(async (workspaceIds?: string[]) => {
    setBusy(workspaceIds?.[0] ?? "all");
    setOutcome(null);
    try {
      const response = await request("/api/workspace/care-reports", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyWorkspaceId, month, ...(workspaceIds ? { workspaceIds } : {}) }),
      });
      const value = await response.json().catch(() => null) as { generated?: number; skipped?: Skip[]; error?: string } | null;
      if (!response.ok || !value) {
        setOutcome({ generated: 0, skipped: [] });
        setState({ kind: "error" });
        return;
      }
      setOutcome({ generated: value.generated ?? 0, skipped: value.skipped ?? [] });
      setAttempt(count => count + 1);
    } catch { setState({ kind: "error" }); }
    finally { setBusy(null); }
  }, [agencyWorkspaceId, month, request]);

  if (state.kind === "off") return null;
  const label = careMonthLabel(month);
  const meta = month === current ? `${label} so far` : label;
  const segmented = <StSegmented label="Report month" value={month} onChange={value => { setOutcome(null); setState({ kind: "loading" }); setMonth(value); }}
    options={[{ value: previous, label: careMonthLabel(previous) }, { value: current, label: `${careMonthLabel(current)} so far` }]} />;
  if (state.kind === "loading") return <StSection title="Care plan reports" meta={meta}><StSkeleton label="Loading Care plan reports" width="60%" /><StSkeleton /></StSection>;
  if (state.kind === "error") return <StSection title="Care plan reports" meta={meta}>
    <StNotice tone="critical" action={<StTextButton onClick={() => { setState({ kind: "loading" }); setAttempt(count => count + 1); }}>Retry</StTextButton>}>Care plan reports could not be read. Nothing changed.</StNotice>
  </StSection>;

  const { list, emailOn } = state.data;
  const rows = list.clients.map(client => {
    const report = client.report;
    const status = !report ? "Not generated"
      : report.latestRelease ? `Release ${report.latestRelease.number} shared ${careShortDate(report.latestRelease.publishedAt)}` : "Draft";
    return {
      key: client.workspaceId,
      label: client.name,
      cells: {
        client: client.name,
        sofar: `${client.soFar.releasesRecorded} ${client.soFar.releasesRecorded === 1 ? "Release" : "Releases"} · ${client.soFar.changesVerified} checked`,
        report: status,
        email: careDeliveryLine(report?.lastDelivery ?? null, emailOn),
        open: report
          ? <StTextButton href={`/workspace/care-reports/${report.id}?workspaceId=${agencyWorkspaceId}`}>Open</StTextButton>
          : client.canWrite ? <StTextButton disabled={busy !== null} onClick={() => void generate([client.workspaceId])}>{busy === client.workspaceId ? "Generating…" : "Generate"}</StTextButton> : "—",
      },
    };
  });

  return <StSection title="Care plan reports" meta={meta}>
    {segmented}
    {list.canGenerate && list.clients.length ? <div>
      <StPill busy={busy === "all"} disabled={busy !== null} onClick={() => void generate()}>Generate {label} reports for all clients</StPill>
    </div> : null}
    {outcome ? <StNotice>
      <p>{outcome.generated} generated</p>
      {outcome.skipped.length ? <ul>{outcome.skipped.map(skip => <li key={`${skip.workspaceId}-${skip.reason}`}>{SKIP_SENTENCE[skip.reason](skip.name || "this client")}</li>)}</ul> : null}
    </StNotice> : null}
    {list.clients.length ? <StTable label="Care plan reports by client" columns={[
      { key: "client", label: "Client" }, { key: "sofar", label: "This month so far" }, { key: "report", label: "Report" }, { key: "email", label: "Email" }, { key: "open", label: "Open" },
    ]} rows={rows} /> : <StCopy muted>No clients yet. Reports appear once a client has chosen {agencyName}.</StCopy>}
    <StCopy muted>Reports go out under {agencyName}&apos;s name. Nothing is sent to a client until you share it.{emailOn ? "" : " Email is off, so share by copying the link."}</StCopy>
  </StSection>;
}
