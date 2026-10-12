"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StEmpty, StInput, StLabel, StMono, StNotice, StPill, StRow, StRows, StSection, StSegmented, StSkeleton, StState, StTextButton, StToggle } from "@/components/ui/strelva/Kit";
import type { TenantReleaseState } from "@/platform/owner-entry/operator";

/**
 * Per-workspace release flags for one converted client (owner-entry spec §3.7).
 * Every change needs a reason. `On` records an approval for the signed-in
 * operator, and owner entry can go `on` only once every page this
 * client uses has moved; until then `Operators` stays limited to operators
 * and named testers.
 */

type FlagState = "unset" | "off" | "operators" | "on";
function isReleaseState(value: unknown): value is TenantReleaseState {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Extract<TenantReleaseState, { linked: true }>>;
  if (typeof data.tenantId !== "string") return false;
  if ((value as { linked?: unknown }).linked === false) return true;
  return data.linked === true && typeof data.workspaceId === "string" && typeof data.workspaceRelease === "boolean"
    && Array.isArray(data.flags) && Array.isArray(data.history) && Array.isArray(data.testerEmails) && Array.isArray(data.ownerEntryBlockers);
}

const STATES: { value: FlagState; label: string }[] = [
  { value: "unset", label: "Follow global" },
  { value: "off", label: "Off" },
  { value: "operators", label: "Operators" },
  { value: "on", label: "On" },
];

export function ReleaseFlagsPanel({ tenantId, initialState, request = fetch, globalOwnerEmailPaused = true }: { tenantId: string; initialState?: TenantReleaseState; request?: typeof fetch; globalOwnerEmailPaused?: boolean }) {
  const [state, setState] = useState<TenantReleaseState | null>(initialState ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const reading = useRef(false);
  const awaitingReadback = useRef(false);
  const [needsReadback, setNeedsReadback] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [testerEmail, setTesterEmail] = useState("");

  const load = useCallback(async () => {
    if (reading.current || sending.current) return;
    reading.current = true;
    setBusy(true);
    setLoadError(null);
    try {
      const res = await request(`/api/admin/tenants/${tenantId}/release-flags`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (!isReleaseState(data)) throw new Error("Current flags could not be verified. Refresh them before making another change.");
      setState(data);
      awaitingReadback.current = false;
      setNeedsReadback(false);
      setError(null);
      setReceipt(previous => previous ? "The change was accepted. Current flags and history were refreshed." : null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't read the release flags.");
    } finally {
      reading.current = false;
      setBusy(false);
    }
  }, [tenantId, request]);

  useEffect(() => { if (!initialState) void load(); }, [initialState, load]);

  function holdForReadback() {
    awaitingReadback.current = true;
    setNeedsReadback(true);
  }

  async function send(body: Record<string, unknown>) {
    if (sending.current || reading.current || awaitingReadback.current) return;
    sending.current = true;
    setError(null);
    setReceipt(null);
    setBusy(true);
    let refused = false;
    try {
      const res = await request(`/api/admin/tenants/${tenantId}/release-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        refused = [400, 403, 404, 409].includes(res.status);
        if (!refused) holdForReadback();
        throw new Error(data.error || `Failed (${res.status})`);
      }
      if (data.mutation?.status === "accepted") {
        if (data.readback?.status === "available" && isReleaseState(data)) {
          setReceipt("The change was accepted. Current flags and history were refreshed.");
          setState(data);
        } else {
          setReceipt("The change was accepted. Current flags and history couldn't be read.");
          holdForReadback();
        }
      } else {
        // Retain compatibility with the state-only response during rollout.
        if (!isReleaseState(data)) {
          holdForReadback();
          throw new Error("The change result is unconfirmed. Refresh the flags before making another change.");
        }
        setState(data);
      }
      setReason("");
      setTesterEmail("");
    } catch (err) {
      if (!refused) holdForReadback();
      setError(err instanceof Error ? err.message : "The change result is unconfirmed. Refresh the flags before making another change.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const readbackNotice = <>{receipt && <StNotice>{receipt}</StNotice>}{needsReadback && <><StNotice tone="critical">The switches below are the previous view. Refresh current flags before making another change.</StNotice><StTextButton disabled={busy} onClick={() => void load()}>Refresh flags</StTextButton></>}</>;

  const ownerEmails = <StRow title="Owner emails" detail={globalOwnerEmailPaused ? "Off for every client during rollout · global, not per client" : "Global sending is enabled · cannot be changed here"} lead={<StToggle label="Owner emails" checked={!globalOwnerEmailPaused} disabled reason={globalOwnerEmailPaused ? "Owner emails are off globally during rollout." : "Owner email sending is a global setting."} />} />;

  if (loadError) {
    return <StSection title="What this client sees">{readbackNotice}<StNotice tone="critical">{loadError}</StNotice><StRows>{ownerEmails}</StRows><StTextButton onClick={() => void load()}>Try again</StTextButton></StSection>;
  }
  if (!state) {
    return <StSection title="What this client sees"><StSkeleton label="Loading release flags" /><StSkeleton width="70%" /><StRows>{ownerEmails}</StRows></StSection>;
  }
  if (!state.linked) {
    return <StSection title="What this client sees">{readbackNotice}<StEmpty>This client isn&apos;t converted to a business workspace yet, so it has no per-client flags. It follows the release settings and lands on <StMono>/dashboard</StMono>.</StEmpty><StRows>{ownerEmails}</StRows></StSection>;
  }

  const reasonOk = reason.trim().length >= 3;
  const primaryFlags = new Set(["owner_entry", "inquiries", "website_rebuild", "systems"]);
  const labelFor = (flag: typeof state.flags[number]) => flag.flag === "owner_entry" ? "Owner sign-in" : flag.flag === "inquiries" ? "Inquiries in the workspace" : flag.flag === "website_rebuild" ? "Rebuilt site" : flag.flag === "agent_channel" ? "Assistant customer confirmation (owner consent required)" : flag.label;
  const flagRow = (flag: typeof state.flags[number], compact = false) => {
    const current: FlagState = flag.row ?? "unset";
    return <StRow key={flag.flag} title={labelFor(flag)} align="start" lead={compact ? <StToggle label={labelFor(flag)} checked={flag.effective === "on"} disabled={busy || needsReadback || !reasonOk} reason={needsReadback ? "Refresh current flags first." : !reasonOk ? "Write a reason to enable changes." : busy ? "Change in progress." : undefined} onChange={checked => void send({ kind: "flag", flag: flag.flag, state: checked ? "on" : "off", reason, expectedRevision: flag.revision })} /> : undefined} detail={<>
      <StState kind={flag.effective === "on" ? "live" : flag.effective === "operators" ? "need" : "draft"}>{flag.effective === "on" ? "On for this client" : flag.effective === "operators" ? "Operators and testers" : "Off for this client"}</StState>
      <span className="block">{flag.envMode === "off" ? "The global release switch is off." : flag.envMode === "workspace" ? "Released separately for each client." : "The global release switch is on."}</span>
    </>} end={compact ? undefined : <StSegmented value={current} options={STATES} label={`${labelFor(flag)} for this client`} disabledValues={busy || needsReadback || !reasonOk ? STATES.map(option => option.value) : [current]} disabledReason={needsReadback ? "Refresh current flags first." : !reasonOk ? "Write a reason to enable changes." : "Change in progress."} onChange={next => void send({ kind: "flag", flag: flag.flag, state: next, reason, expectedRevision: flag.revision })} />} />;
  };

  return <StSection title="What this client sees" meta={<StState kind={state.workspaceRelease ? "live" : "draft"}>{state.workspaceRelease ? "Workspace release on" : "Workspace release off"}</StState>}>
    {readbackNotice}
    <StInput id={`release-reason-${tenantId}`} label="Reason for the next change" value={reason} onChange={event => setReason(event.target.value)} placeholder="Why should this change?" maxLength={480} hint="Every change records your signed-in identity and reason in this client's History." />
    <StRows label="Client release switches">{state.flags.filter(flag => primaryFlags.has(flag.flag)).map(flag => flagRow(flag, true))}{ownerEmails}</StRows>
    {!reasonOk && <StNotice>Write a reason to enable changes. Turning a release on records a single-use approval for this business, release and reason.</StNotice>}
    {state.flags.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">All release settings</summary><div className="mt-3"><StRows>{state.flags.map(flag => flagRow(flag))}</StRows></div></details>}

    {state.ownerEntryBlockers.length > 0 && <StSection as="div" title="Before owner sign-in can turn on"><StRows>{state.ownerEntryBlockers.map(page => <StRow key={page.route} title={<StMono>/dashboard{page.route === "/" ? "" : page.route}</StMono>} detail={<>Moves to {page.home}. {page.note}</>} />)}</StRows></StSection>}

    <StSection as="div" title="Named testers">
      {state.testerEmails.length === 0 ? <StEmpty>None. Operators state reaches Strelva operators only.</StEmpty> : <StRows>{state.testerEmails.map(email => <StRow key={email} title={email} end={<StTextButton disabled={busy || needsReadback || !reasonOk} onClick={() => void send({ kind: "tester", email, present: false, reason })}>Remove</StTextButton>} />)}</StRows>}
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><StInput id={`release-tester-${tenantId}`} label="Tester email" type="email" value={testerEmail} onChange={event => setTesterEmail(event.target.value)} placeholder="Email address" /></div><StPill variant="soft" disabled={busy || needsReadback || !reasonOk || !testerEmail.includes("@")} onClick={() => void send({ kind: "tester", email: testerEmail, present: true, reason })}>Add tester</StPill></div>
    </StSection>
    {error && <StNotice tone="critical">{error}</StNotice>}
    {state.history.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Recent changes</summary><div className="mt-3"><StRows>{state.history.map(change => <StRow key={change.id} title={<>{change.subject === "tester" ? `Tester ${change.testerEmail ?? ""}` : change.subject === "agent_channel" ? "Assistant customer confirmation" : change.subject} · {change.fromState} → {change.toState}</>} detail={<>{change.reason} · {change.changedBy} · <StMono as="time" dateTime={change.changedAt}>{new Date(change.changedAt).toLocaleString()}</StMono></>} />)}</StRows></div></details>}
    <StLabel>Each switch asks for a reason and appears in the client&apos;s History.</StLabel>
  </StSection>;
}
