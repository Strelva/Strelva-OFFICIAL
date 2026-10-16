"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { StEmpty, StLabel, StNotice, StRow, StRows, StSection, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { SelectInput, TextArea, TextInput } from "@/components/ui/TextInput";
import { WorkPlanExperience } from "../WorkPlanExperience";
import type { AgencyClientRow } from "../agency-clients";
import type { WorkspaceSnapshot } from "../contracts";
import { AgencyNativePage } from "./AgencyNativePage";

const choicesSchema = z.object({ workspaceId: z.string().uuid(), choices: z.array(z.object({ systemId: z.string().uuid(), name: z.string(), revision: z.number().int(), fingerprint: z.string(), definition: z.record(z.string(), z.unknown()) })), unavailable: z.array(z.object({ systemId: z.string().uuid(), name: z.string() })) });
const packageReceiptSchema = z.object({ workspaceId: z.string().uuid(), systemId: z.string().uuid(), revision: z.number().int().positive(), revisionId: z.string().uuid() });
type Choices = z.infer<typeof choicesSchema>;
function message(body: unknown, fallback: string) { return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback; }

/** Build belongs to the chosen business. Package belongs to the agency.
 * These controls are mounted only on the released Systems agency surface. */
export function AgencyAuthoring({ request, snapshot, clients, kind, onOpenClientWork }: {
  request: typeof fetch; snapshot: WorkspaceSnapshot; clients: readonly AgencyClientRow[]; kind: "build" | "package";
  onOpenClientWork: (workspaceId: string, workId: string) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [buildKind, setBuildKind] = useState("internal_tool");
  const choices = clients.filter(client => client.status === "ready" && (buildKind === "internal_tool" ? client.canBuild === true : client.provider));
  const agencyId = snapshot.workspaceId;
  const url = `/api/workspace/agency-authoring?agencyWorkspaceId=${encodeURIComponent(agencyId)}`;
  if (kind === "package") return <AgencyPackage key={agencyId} request={request} workspaceId={agencyId} url={url} />;
  return <StSection title="Make a System for a client">
    <StLabel>{buildKind === "internal_tool" ? "Agency owners and admins choose a business where they have current owner or admin authoring access, then describe the result." : "Choose a client where your agency has current website and inquiry or booking scope. The server checks your agency membership, staff assignment and accepted scopes before reading or sending a page."} The draft is built there; the owner reviews it before publication.</StLabel>
    <SelectInput label="What to build" value={buildKind} onChange={event => { setBuildKind(event.target.value); setClientId(""); }} options={[{ value: "internal_tool", label: "Internal tool, document or tracker" }, { value: "form", label: "Form page" }, { value: "booking", label: "Booking page" }]} />
    {choices.length ? <StSurface label="Client to build for"><SelectInput label="Client" value={clientId} onChange={event => setClientId(event.target.value)} options={[{ value: "", label: "Choose a client" }, ...choices.map(client => ({ value: client.workspaceId, label: client.name }))]} /></StSurface> : <StEmpty>{buildKind === "internal_tool" ? "No client is available to build for. An agency owner or admin with current owner or admin authoring access to a client can choose that business here. Assigned staff open Clients to review permitted Systems; editing an existing draft requires separate authorization from the client." : "No client with a provider seat is available. Open Clients to check the agency’s accepted access and your staff assignment."}</StEmpty>}
    {clientId && choices.some(client => client.workspaceId === clientId) && buildKind === "internal_tool" ? <WorkPlanExperience key={clientId} workspaceId={clientId}
      initialRequest="Make an internal tool for this business. " sources={[]} prepareUrl={`${url}&action=prepare`} outputUrl={`${url}&action=execute`}
      onOpenWork={workId => onOpenClientWork(clientId, workId)} /> : null}
    {clientId && choices.some(client => client.workspaceId === clientId) && (buildKind === "form" || buildKind === "booking") ? <AgencyNativePage key={`${clientId}:${buildKind}`} request={request} workspaceId={clientId} businessName={choices.find(client => client.workspaceId === clientId)!.name} url={url} kind={buildKind} /> : null}
  </StSection>;
}

function AgencyPackage({ request, workspaceId, url }: { request: typeof fetch; workspaceId: string; url: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Choices | null>(null);
  const [error, setError] = useState("");
  const [systemId, setSystemId] = useState("");
  const [summary, setSummary] = useState("");
  const [locks, setLocks] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<z.infer<typeof packageReceiptSchema> | null>(null);
  const pending = useRef<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void request(url, { signal: controller.signal, credentials: "same-origin" }).then(async response => {
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(value, "Sources could not be read."));
      const parsed = choicesSchema.parse(value);
      if (parsed.workspaceId !== workspaceId) throw new Error("Sources returned for another agency.");
      if (!controller.signal.aborted) { setState(parsed); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Sources could not be read."); });
    return () => controller.abort();
  }, [request, url, workspaceId, attempt]);
  const selected = state?.choices.find(choice => choice.systemId === systemId);
  async function publish() {
    if (!selected || inFlight.current || receipt || !summary.trim()) return;
    inFlight.current = true; setBusy(true); setError("");
    pending.current ??= JSON.stringify({ workspaceId, systemId: selected.systemId, fingerprint: selected.fingerprint, expectedRevision: selected.revision, summary, ...(locks.trim() ? { lockedPaths: locks.split(",").map(path => path.trim()).filter(Boolean) } : {}), commandId: crypto.randomUUID() });
    try {
      const response = await request(`${url}&action=package`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: pending.current });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(value, "Publication could not be confirmed. Retry this same package."));
      const result = packageReceiptSchema.parse(value);
      if (result.workspaceId !== workspaceId || result.systemId !== selected.systemId || result.revision !== selected.revision + 1) throw new Error("The package receipt could not be confirmed. Check Library before starting another.");
      setReceipt(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The package could not be confirmed."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="space-y-7" aria-label="Package a System">
    <StSection title={selected ? `Release ${selected.revision + 1} draft: ${selected.name}` : "Package a System"}>
      <StLabel>Publishing makes a source release available. No client changes until its owner says yes.</StLabel>
      {!state && !error ? <StSkeleton label="Loading reusable Systems" /> : null}
      {error ? <StNotice tone="critical">{error}{!state ? <StTextButton onClick={() => setAttempt(value => value + 1)}>Retry</StTextButton> : null}</StNotice> : null}
      {state?.choices.length ? <SelectInput label="System owned by this agency" value={systemId} disabled={busy || Boolean(pending.current)} onChange={event => setSystemId(event.target.value)} options={[{ value: "", label: "Choose a System" }, ...state.choices.map(choice => ({ value: choice.systemId, label: `${choice.name} · Release ${choice.revision + 1} draft` }))]} /> : state ? <StEmpty>No reusable Systems yet. Make an internal tool in this agency, or adapt a source into this agency first.</StEmpty> : null}
    </StSection>
    {selected ? <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.55fr)]">
      <div className="space-y-7"><StSurface label="What owners will read"><TextArea id="agency-authoring-summary" label="What owners will read" value={summary} maxLength={500} required rows={3} disabled={busy || Boolean(pending.current)} onChange={event => setSummary(event.target.value)} /></StSurface>
        <StSection title="Rehearsal"><StNotice>Per-client rehearsal results are not available in this read. Publishing this source release does not qualify it or publish a client’s Version.</StNotice></StSection>
        <details><summary className="cursor-pointer text-sm text-gray-muted">Pushed standards</summary><div className="mt-3 space-y-3"><TextInput label="Pushed standards (optional field paths, separated by commas)" value={locks} disabled={busy || Boolean(pending.current)} onChange={event => setLocks(event.target.value)} placeholder="branding.name, policy.cancellation" /><StLabel>Locked fields must exist in this definition. Client Versions take the source value; their own accounts, data and local fields remain independent.</StLabel></div></details>
      </div><div className="space-y-5"><StSection title="New things it needs"><StLabel>Accounts, records and permissions stay with each business. The new source release needs its own qualification.</StLabel></StSection><StSection title="Cost to run"><StLabel>Run cost is not available for this release.</StLabel></StSection>{receipt ? null : <XaYes state={busy ? "going" : pending.current && error ? "failed" : "waiting"} shortcut={false} working={{ title: "Publishing the release", steps: [] }} failure={error || undefined}
        disabledReason={!summary.trim() ? "Write what owners will read first." : undefined} unblock={<XaTextLink href="#agency-authoring-summary">Write it now</XaTextLink>} onYes={() => void publish()} />}</div>
    </div> : null}
    {receipt ? <div role="status"><StState kind="live">Release {receipt.revision} is published.</StState><StLabel>Open Library to prepare it for client review.</StLabel></div> : null}
    {state?.unavailable.length ? <StSection title="Systems that cannot be packaged yet"><StRows>{state.unavailable.map(item => <StRow key={item.systemId} title={item.name} detail="No reusable definition could be read." end={<StState kind="down">Could not read</StState>} />)}</StRows></StSection> : null}
  </div>;
}
