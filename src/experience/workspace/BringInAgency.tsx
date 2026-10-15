"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { StEmpty, StLabel, StNotice, StPill, StRow, StRows, StSection, StSegmented, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import {
  AGENCY_LEVEL_HELP, AGENCY_LEVEL_LABELS, AGENCY_SCOPE_LABELS, AGENCY_SCOPES, agencyConsentText,
  type AgencyLevel, type AgencyScope,
} from "@/platform/agency-directory/contract";

type DirectoryAgency = { agencyWorkspaceId: string; name: string; summary: string };
type BusinessAgency = { agencyWorkspaceId: string; name: string; seat: boolean; ofRecord: boolean; scopes: Array<{ scope: AgencyScope; level: AgencyLevel; status: "proposed" | "active" }> };
type Choice = AgencyLevel | "off";
type AgencyChoice = DirectoryAgency & { changing?: boolean };
type Transport = (input: string, init?: RequestInit) => Promise<Response>;
const agencySchema = z.object({ agencyWorkspaceId: z.string().uuid(), name: z.string().min(1), seat: z.boolean(), ofRecord: z.boolean(),
  scopes: z.array(z.object({ scope: z.enum(AGENCY_SCOPES), level: z.enum(["prepare", "full_control"]), status: z.enum(["proposed", "active"]) })) });
const directorySchema = z.array(z.object({ agencyWorkspaceId: z.string().uuid(), name: z.string().min(1), summary: z.string() }));
const agenciesSchema = z.array(agencySchema);

const LEVEL_OPTIONS = [
  { value: "off" as const, label: "Not this" },
  { value: "prepare" as const, label: AGENCY_LEVEL_LABELS.prepare },
  { value: "full_control" as const, label: AGENCY_LEVEL_LABELS.full_control },
];

function scopeSummary(scopes: BusinessAgency["scopes"]): string {
  const active = scopes.filter(item => item.status === "active");
  const proposed = scopes.filter(item => item.status === "proposed");
  const describe = (items: BusinessAgency["scopes"]) => items.map(item => `${AGENCY_SCOPE_LABELS[item.scope]} · ${AGENCY_LEVEL_LABELS[item.level]}`).join(", ");
  return [active.length ? `Current: ${describe(active)}` : "", proposed.length ? `Proposed: ${describe(proposed)}` : ""].filter(Boolean).join(". ");
}

/**
 * Bring in an agency (ADR 0015). The business chooses from a list, never a
 * default; each area gets Prepare or Full control, and the agency accepts
 * before anything changes. Payer, data and ending access stay with the owner.
 */
export function BringInAgency(props: { workspaceId: string; canManage: boolean; transport?: Transport; initialScope?: AgencyScope }) {
  const request = useWorkspaceRequest();
  return <BringInAgencyScreen key={props.workspaceId} {...props} transport={props.transport ?? request} />;
}

function BringInAgencyScreen({ workspaceId, canManage, transport, initialScope }: { workspaceId: string; canManage: boolean; transport: Transport; initialScope?: AgencyScope }) {
  const [state, setState] = useState<{ loading: boolean; error: string; directory: DirectoryAgency[]; agencies: BusinessAgency[] }>({ loading: true, error: "", directory: [], agencies: [] });
  const [choosing, setChoosing] = useState<AgencyChoice | null>(null);
  const [levels, setLevels] = useState<Record<AgencyScope, Choice>>(() => Object.fromEntries(AGENCY_SCOPES.map(scope => [scope, "off"])) as Record<AgencyScope, Choice>);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await transport(`/api/workspace/agencies?${new URLSearchParams({ workspaceId })}`, { cache: "no-store", signal });
      const body = await response.json() as { directory?: DirectoryAgency[]; agencies?: BusinessAgency[]; error?: string };
      if (signal?.aborted) return;
      const directory = directorySchema.safeParse(body.directory);
      const agencies = agenciesSchema.safeParse(body.agencies);
      if (!response.ok || !directory.success || !agencies.success) throw new Error(body.error || "Agencies couldn't be loaded. Nothing changed.");
      setState({ loading: false, error: "", directory: directory.data, agencies: agencies.data });
    } catch (cause) {
      if (!signal?.aborted) setState(current => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : "Agencies couldn't be loaded. Nothing changed." }));
    }
  }, [transport, workspaceId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const selected = AGENCY_SCOPES.filter(scope => levels[scope] !== "off").map(scope => ({ scope, level: levels[scope] as AgencyLevel }));
  const takenFullControl = new Set(state.agencies.filter(agency => agency.agencyWorkspaceId !== choosing?.agencyWorkspaceId)
    .flatMap(agency => agency.scopes.filter(item => item.level === "full_control").map(item => item.scope)));

  async function send(method: "POST" | "DELETE", body: Record<string, unknown>, done: string) {
    if (!canManage) return;
    setBusy(true); setMessage("");
    try {
      const response = await transport("/api/workspace/agencies", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
      const result = await response.json() as { agencies?: BusinessAgency[]; error?: string };
      if (!response.ok && response.status < 500) {
        setMessage(result.error || "That request was rejected. Review the areas and try again.");
        return;
      }
      const agencies = agenciesSchema.safeParse(result.agencies);
      if (!response.ok || !agencies.success) throw new Error("Outcome not confirmed.");
      setState(current => ({ ...current, agencies: agencies.data }));
      setChoosing(null);
      setLevels(Object.fromEntries(AGENCY_SCOPES.map(scope => [scope, "off"])) as Record<AgencyScope, Choice>);
      setMessage(done);
    } catch {
      setChoosing(null);
      setMessage("Outcome not confirmed. We are checking current access. Review the current and proposed areas before sending another request.");
      await load();
    } finally { setBusy(false); }
  }

  function choose(agency: DirectoryAgency | BusinessAgency) {
    const changing = "scopes" in agency;
    const scopes = changing ? (agency.scopes.some(item => item.status === "proposed")
      ? agency.scopes.filter(item => item.status === "proposed") : agency.scopes) : [];
    setLevels(Object.fromEntries(AGENCY_SCOPES.map(scope => [scope, scopes.find(item => item.scope === scope)?.level ?? (!changing && scope === initialScope ? "prepare" : "off")])) as Record<AgencyScope, Choice>);
    setChoosing({ agencyWorkspaceId: agency.agencyWorkspaceId, name: agency.name, summary: changing ? "Change what this agency can do." : agency.summary, changing });
    setMessage("");
  }

  const current = new Set(state.agencies.map(agency => agency.agencyWorkspaceId));
  const available = state.directory.filter(agency => !current.has(agency.agencyWorkspaceId));

  return <StSection title="Want it done for you? Bring in an agency." meta="Choose an agency and what it can do. It accepts before anything changes. You keep payment, your data and the choice to end their access.">
    {state.loading ? <><p role="status">Loading agencies…</p><StSkeleton label="Loading agencies" /></> : state.error ? <StNotice tone="critical" action={<StTextButton onClick={() => void load()}>Try again</StTextButton>}>{state.error}</StNotice> : <>
      {state.agencies.length ? <StLabel>Your agencies</StLabel> : null}
      {state.agencies.length ? <StRows label="Your agencies">{state.agencies.map(agency => {
        const waiting = agency.scopes.some(item => item.status === "proposed");
        return <StRow key={agency.agencyWorkspaceId} title={agency.name} detail={agency.scopes.length ? scopeSummary(agency.scopes) : "Works on this business"}
          value={waiting ? "Waiting for them to accept" : agency.ofRecord ? "Your main agency" : undefined}
          end={canManage ? <span className="flex flex-wrap items-center gap-4"><StTextButton disabled={busy} onClick={() => choose(agency)}>Change access</StTextButton><StTextButton disabled={busy} onClick={() => void send("DELETE", { agencyWorkspaceId: agency.agencyWorkspaceId }, `${agency.name} no longer has access. Your data stays here.`)}>End access</StTextButton></span> : undefined}>
          {waiting ? <p className="text-sm text-gray-muted">Your proposal is in {agency.name}’s Queue. No scope, price or deadline is agreed yet. You can change the proposal or end access here.</p> : null}</StRow>;
      })}</StRows> : null}
      {!canManage ? <p>Only an owner can bring in, change or end an agency.</p> : choosing ? <StSurface label={`${choosing.changing ? "Change access for" : "Bring in"} ${choosing.name}`}>
        <p className="mb-4"><strong>{choosing.name}</strong> · {choosing.summary}</p>
        {choosing.changing ? <p className="mb-4 text-sm text-gray-muted">Choose the complete set of areas they should handle. Current access stays in place until they accept. Areas set to Not this end on acceptance. To remove every area now, use End access.</p> : null}
        <div className="grid gap-3">{AGENCY_SCOPES.map(scope => <div key={scope} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">{AGENCY_SCOPE_LABELS[scope]}</p>
          <StSegmented label={`${AGENCY_SCOPE_LABELS[scope]} for ${choosing.name}`} value={levels[scope]} options={LEVEL_OPTIONS}
            disabledValues={takenFullControl.has(scope) ? ["full_control"] : []} disabledReason="Another agency already has full control here."
            onChange={busy ? undefined : value => setLevels(current => ({ ...current, [scope]: value }))} />
        </div>)}</div>
        <div className="mt-5 grid gap-2 text-sm text-gray-muted">
          {selected.some(item => item.level === "prepare") ? <p><strong className="text-warm-black">{AGENCY_LEVEL_LABELS.prepare}:</strong> {AGENCY_LEVEL_HELP.prepare}</p> : null}
          {selected.some(item => item.level === "full_control") ? <p><strong className="text-warm-black">{AGENCY_LEVEL_LABELS.full_control}:</strong> {AGENCY_LEVEL_HELP.full_control}</p> : null}
          {selected.length ? <p>{agencyConsentText(choosing.name, selected)}</p> : <p>Choose at least one area.</p>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <StPill disabled={busy || !selected.length} busy={busy} onClick={() => void send("POST", { agencyWorkspaceId: choosing.agencyWorkspaceId, scopes: selected }, `Sent to ${choosing.name}. Nothing changes until they accept.`)}>Send to {choosing.name}</StPill>
          <StTextButton disabled={busy} onClick={() => setChoosing(null)}>Cancel</StTextButton>
        </div>
      </StSurface> : available.length ? <><StLabel>Agencies you can bring in</StLabel><p className="text-sm text-gray-muted">Each agency supplies its own description. Agree the work, price and deadline with your chosen agency before work starts.</p><StRows label="Agencies you can bring in">{available.map(agency => <StRow key={agency.agencyWorkspaceId} title={agency.name} detail={agency.summary}
          onClick={() => choose(agency)} value="Choose" />)}</StRows></>
        : <StEmpty>No other agencies are listed yet.</StEmpty>}
    </>}
    {message ? <p role="status">{message}</p> : null}
  </StSection>;
}
