"use client";

import { useCallback, useEffect, useState } from "react";
import { StEmpty, StNotice, StPill, StRow, StRows, StSection, StSegmented, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import {
  AGENCY_LEVEL_HELP, AGENCY_LEVEL_LABELS, AGENCY_SCOPE_LABELS, AGENCY_SCOPES, agencyConsentText,
  type AgencyLevel, type AgencyScope,
} from "@/platform/agency-directory/contract";

type DirectoryAgency = { agencyWorkspaceId: string; name: string; summary: string };
type BusinessAgency = { agencyWorkspaceId: string; name: string; seat: boolean; ofRecord: boolean; scopes: Array<{ scope: AgencyScope; level: AgencyLevel; status: "proposed" | "active" }> };
type Choice = AgencyLevel | "off";
type Transport = (input: string, init?: RequestInit) => Promise<Response>;

const LEVEL_OPTIONS = [
  { value: "off" as const, label: "Not this" },
  { value: "prepare" as const, label: AGENCY_LEVEL_LABELS.prepare },
  { value: "full_control" as const, label: AGENCY_LEVEL_LABELS.full_control },
];

function scopeSummary(scopes: BusinessAgency["scopes"]): string {
  return scopes.map(item => `${AGENCY_SCOPE_LABELS[item.scope]} · ${AGENCY_LEVEL_LABELS[item.level]}`).join(", ");
}

/**
 * Bring in an agency (ADR 0015). The business chooses from a list, never a
 * default; each area gets Prepare or Full control, and the agency accepts
 * before anything changes. Payer, data and ending access stay with the owner.
 */
export function BringInAgency({ workspaceId, canManage, transport = fetch }: { workspaceId: string; canManage: boolean; transport?: Transport }) {
  const [state, setState] = useState<{ loading: boolean; error: string; directory: DirectoryAgency[]; agencies: BusinessAgency[] }>({ loading: true, error: "", directory: [], agencies: [] });
  const [choosing, setChoosing] = useState<DirectoryAgency | null>(null);
  const [levels, setLevels] = useState<Record<AgencyScope, Choice>>(() => Object.fromEntries(AGENCY_SCOPES.map(scope => [scope, "off"])) as Record<AgencyScope, Choice>);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await transport(`/api/workspace/agencies?${new URLSearchParams({ workspaceId })}`, { cache: "no-store" });
      const body = await response.json() as { directory?: DirectoryAgency[]; agencies?: BusinessAgency[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Agencies couldn't be loaded. Nothing changed.");
      setState({ loading: false, error: "", directory: body.directory ?? [], agencies: body.agencies ?? [] });
    } catch (cause) {
      setState(current => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : "Agencies couldn't be loaded. Nothing changed." }));
    }
  }, [transport, workspaceId]);
  useEffect(() => { void load(); }, [load]);

  const selected = AGENCY_SCOPES.filter(scope => levels[scope] !== "off").map(scope => ({ scope, level: levels[scope] as AgencyLevel }));
  const takenFullControl = new Set(state.agencies.filter(agency => agency.agencyWorkspaceId !== choosing?.agencyWorkspaceId)
    .flatMap(agency => agency.scopes.filter(item => item.level === "full_control").map(item => item.scope)));

  async function send(method: "POST" | "DELETE", body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage("");
    try {
      const response = await transport("/api/workspace/agencies", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
      const result = await response.json() as { agencies?: BusinessAgency[]; error?: string };
      if (!response.ok) throw new Error(result.error || "That couldn't be confirmed. Nothing changed.");
      setState(current => ({ ...current, agencies: result.agencies ?? current.agencies }));
      setChoosing(null);
      setLevels(Object.fromEntries(AGENCY_SCOPES.map(scope => [scope, "off"])) as Record<AgencyScope, Choice>);
      setMessage(done);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "That couldn't be confirmed. Nothing changed.");
    } finally { setBusy(false); }
  }

  const current = new Set(state.agencies.map(agency => agency.agencyWorkspaceId));
  const available = state.directory.filter(agency => !current.has(agency.agencyWorkspaceId));

  return <StSection title="Want it done for you? Bring in an agency." meta="Choose an agency and what it can do. It accepts before anything changes. You keep payment, your data and the choice to end their access.">
    {state.loading ? <><p role="status">Loading agencies…</p><StSkeleton label="Loading agencies" /></> : state.error ? <StNotice tone="critical" action={<StTextButton onClick={() => void load()}>Try again</StTextButton>}>{state.error}</StNotice> : <>
      {state.agencies.length ? <StRows label="Your agencies">{state.agencies.map(agency => {
        const waiting = agency.scopes.some(item => item.status === "proposed");
        return <StRow key={agency.agencyWorkspaceId} title={agency.name} detail={agency.scopes.length ? scopeSummary(agency.scopes) : "Works on this business"}
          value={waiting ? "Waiting for them to accept" : agency.ofRecord ? "Your main agency" : undefined}
          end={canManage ? <StTextButton disabled={busy} onClick={() => void send("DELETE", { agencyWorkspaceId: agency.agencyWorkspaceId }, `${agency.name} no longer has access. Your data stays here.`)}>End access</StTextButton> : undefined} />;
      })}</StRows> : null}
      {!canManage ? <p>Only an owner can bring in or end an agency.</p> : choosing ? <StSurface label={`Bring in ${choosing.name}`}>
        <p><strong>{choosing.name}</strong> · {choosing.summary}</p>
        {AGENCY_SCOPES.map(scope => <div key={scope}>
          <p>{AGENCY_SCOPE_LABELS[scope]}</p>
          <StSegmented label={`${AGENCY_SCOPE_LABELS[scope]} for ${choosing.name}`} value={levels[scope]} options={LEVEL_OPTIONS}
            disabledValues={takenFullControl.has(scope) ? ["full_control"] : []} disabledReason="Another agency already has full control here."
            onChange={value => setLevels(current => ({ ...current, [scope]: value }))} />
        </div>)}
        {selected.map(item => item.level).includes("full_control") ? <p>{AGENCY_LEVEL_HELP.full_control}</p> : selected.length ? <p>{AGENCY_LEVEL_HELP.prepare}</p> : null}
        {selected.length ? <p>{agencyConsentText(choosing.name, selected)}</p> : null}
        <StPill disabled={busy || !selected.length} busy={busy} onClick={() => void send("POST", { agencyWorkspaceId: choosing.agencyWorkspaceId, scopes: selected }, `Sent to ${choosing.name}. Nothing changes until they accept.`)}>Send to {choosing.name}</StPill>
        <StTextButton disabled={busy} onClick={() => setChoosing(null)}>Cancel</StTextButton>
      </StSurface> : available.length ? <StRows label="Agencies you can bring in">{available.map(agency => <StRow key={agency.agencyWorkspaceId} title={agency.name} detail={agency.summary}
          onClick={() => { setChoosing(agency); setMessage(""); }} value="Choose" />)}</StRows>
        : <StEmpty>No other agencies are listed yet.</StEmpty>}
    </>}
    {message ? <p role="status">{message}</p> : null}
  </StSection>;
}
