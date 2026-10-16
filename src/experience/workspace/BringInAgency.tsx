"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { XaButton, XaLabel, XaRow, XaRows, XaSays, XaSegmented, XaStatus, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import styles from "./owner-help.module.css";
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

/** Area names inside a sentence: lower case except proper names. */
function areas(items: BusinessAgency["scopes"]): string {
  const names = items.map(item => item.scope === "google" ? AGENCY_SCOPE_LABELS[item.scope] : AGENCY_SCOPE_LABELS[item.scope].toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "";
}

/** What an agency does, as a sentence in GLOSSARY words (Prepare, Full control), never a list of grants. */
export function agencyAccessSentence(scopes: BusinessAgency["scopes"]): string {
  const full = scopes.filter(item => item.level === "full_control");
  const prepare = scopes.filter(item => item.level === "prepare");
  return [full.length ? `Full control of ${areas(full)}: they make it live.` : "", prepare.length ? `Prepares ${areas(prepare)} for you to approve.` : ""].filter(Boolean).join(" ");
}

/**
 * Bring in an agency (ADR 0015), XA (October 16). The business chooses from
 * a list, never a default; each area gets Prepare or Full control, and the
 * agency accepts before anything changes. Payer, data and ending access stay
 * with the owner. Open rows, one action per row ("Change access"); ending
 * access sits inside that change, beside the areas it ends.
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

  return <section className={styles.section} aria-labelledby="bring-in-agency">
    <XaLabel as="h2" id="bring-in-agency">Want it done for you? Bring in an agency.</XaLabel>
    <p className={styles.quiet}>The agency accepts before anything changes. You keep payment, your data and the choice to end their access.</p>
    {state.loading ? <XaWorking title="Reading your agencies" steps={[]} /> : state.error ? <XaSays links={[<XaTextLink key="retry" onClick={() => void load()}>Try again</XaTextLink>]}>{state.error}</XaSays> : <>
      {state.agencies.length ? <><XaLabel as="h3">Your agencies</XaLabel><XaRows label="Your agencies">{state.agencies.map(agency => {
        const active = agency.scopes.filter(item => item.status === "active");
        const proposed = agency.scopes.filter(item => item.status === "proposed");
        return <XaRow key={agency.agencyWorkspaceId} title={agency.name}
          detail={<>{active.length ? agencyAccessSentence(active) : agency.ofRecord ? "Your main agency." : "Works on this business."}{proposed.length ? <span className={styles.proposed}><XaStatus kind="waits" size="sm">Waits for them to accept</XaStatus> {agencyAccessSentence(proposed)}</span> : null}</>}
          action={canManage && !(choosing?.changing && choosing.agencyWorkspaceId === agency.agencyWorkspaceId) ? <XaTextLink onClick={() => { if (!busy) choose(agency); }}>Change access</XaTextLink> : undefined} />;
      })}</XaRows></> : null}
      {!canManage ? <p className={styles.quiet}>Only an owner can bring in, change or end an agency.</p> : choosing ? <div className={styles.choosing} role="group" aria-label={`${choosing.changing ? "Change access for" : "Bring in"} ${choosing.name}`}>
        <p className={styles.choosingTitle}><strong>{choosing.name}</strong> <span>{choosing.summary}</span></p>
        {choosing.changing ? <p className={styles.quiet}>Choose every area they should handle. Current access stays in place until they accept. Areas set to Not this end when they accept. To remove every area now, use End access.</p> : null}
        <div className={styles.areas}>{AGENCY_SCOPES.map(scope => <div key={scope} className={styles.area}>
          <p className={styles.areaName}>{AGENCY_SCOPE_LABELS[scope]}{takenFullControl.has(scope) ? <span className={styles.areaNote}>Another agency has full control here.</span> : null}</p>
          <XaSegmented label={`${AGENCY_SCOPE_LABELS[scope]} for ${choosing.name}`} value={levels[scope]}
            options={LEVEL_OPTIONS.map(option => ({ ...option, disabled: option.value === "full_control" && takenFullControl.has(scope) }))}
            onChange={value => { if (!busy) setLevels(current => ({ ...current, [scope]: value })); }} />
        </div>)}</div>
        <div className={styles.consent}>
          {selected.some(item => item.level === "prepare") ? <p><strong>{AGENCY_LEVEL_LABELS.prepare}:</strong> {AGENCY_LEVEL_HELP.prepare}</p> : null}
          {selected.some(item => item.level === "full_control") ? <p><strong>{AGENCY_LEVEL_LABELS.full_control}:</strong> {AGENCY_LEVEL_HELP.full_control}</p> : null}
          {selected.length ? <p>{agencyConsentText(choosing.name, selected)}</p> : <p>Choose at least one area.</p>}
        </div>
        <div className={styles.choosingActions}>
          <XaButton variant="primary" disabled={busy || !selected.length} busy={busy} onClick={() => void send("POST", { agencyWorkspaceId: choosing.agencyWorkspaceId, scopes: selected }, `Sent to ${choosing.name}. Nothing changes until they accept.`)}>Send to {choosing.name}</XaButton>
          <XaButton variant="quiet" disabled={busy} onClick={() => setChoosing(null)}>Cancel</XaButton>
          {choosing.changing ? <span className={styles.endAccess}><XaButton variant="quiet" disabled={busy} onClick={() => void send("DELETE", { agencyWorkspaceId: choosing.agencyWorkspaceId }, `${choosing.name} no longer has access. Your data stays here.`)}>End access</XaButton></span> : null}
        </div>
      </div> : available.length ? <><XaLabel as="h3">Agencies you can bring in</XaLabel><p className={styles.quiet}>Each agency writes its own description. Agree the work, price and deadline with the one you choose before work starts.</p><XaRows label="Agencies you can bring in">{available.map(agency => <XaRow key={agency.agencyWorkspaceId} title={agency.name} detail={agency.summary}
          onClick={() => choose(agency)} meta="Choose" />)}</XaRows></>
        : <p className={styles.quiet}>No other agencies are listed yet.</p>}
    </>}
    {message ? <div role="status"><XaSays>{message}</XaSays></div> : null}
  </section>;
}
