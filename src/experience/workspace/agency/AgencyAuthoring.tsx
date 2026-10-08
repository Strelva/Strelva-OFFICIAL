"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextArea, TextInput } from "@/components/ui/TextInput";
import { WorkPlanExperience } from "../WorkPlanExperience";
import type { AgencyClientRow } from "../agency-clients";
import type { WorkspaceSnapshot } from "../contracts";

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
  const choices = clients.filter(client => client.status === "ready" && client.reach === "member" && (client.role === "owner" || client.role === "admin"));
  const agencyId = snapshot.workspaceId;
  const url = `/api/workspace/agency-authoring?agencyWorkspaceId=${encodeURIComponent(agencyId)}`;
  if (kind === "package") return <AgencyPackage key={agencyId} request={request} workspaceId={agencyId} url={url} />;
  return <section aria-label="Build for a client" className="space-y-5">
    <div><h2 className="font-display text-xl text-warm-black">Make a System for a client</h2><p className="mt-2 text-sm text-gray-muted">Choose the business, describe the result, then review its draft. The client keeps ownership; going live waits for its own decision.</p></div>
    {choices.length ? <SelectInput label="Client" value={clientId} onChange={event => setClientId(event.target.value)} options={[{ value: "", label: "Choose a client" }, ...choices.map(client => ({ value: client.workspaceId, label: client.name }))]} /> : <p className="text-sm text-gray-muted">No client is available to build for. New Systems require admin access in that client’s business.</p>}
    {clientId && choices.some(client => client.workspaceId === clientId) ? <WorkPlanExperience key={clientId} workspaceId={clientId}
      initialRequest="Make an internal tool for this business. " sources={[]} prepareUrl={`${url}&action=prepare`} outputUrl={`${url}&action=execute`}
      onOpenWork={workId => onOpenClientWork(clientId, workId)} /> : null}
  </section>;
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
  return <section aria-label="Package a System" className="space-y-5">
    <div><h2 className="font-display text-xl text-warm-black">Package a System</h2><p className="mt-2 text-sm text-gray-muted">Publish its reusable definition as a source revision. Client records, accounts and permissions stay with each business.</p></div>
    {!state && !error ? <p role="status">Loading reusable Systems…</p> : null}
    {error ? <div><p role="alert" className="text-sm text-critical">{error}</p>{!state ? <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Retry</Button> : null}</div> : null}
    {state?.choices.length ? <SelectInput label="System owned by this agency" value={systemId} disabled={busy || Boolean(pending.current)} onChange={event => setSystemId(event.target.value)} options={[{ value: "", label: "Choose a System" }, ...state.choices.map(choice => ({ value: choice.systemId, label: `${choice.name} · revision ${choice.revision + 1}` }))]} /> : state ? <p className="text-sm text-gray-muted">No reusable Systems yet. Make an internal tool in this agency, or adapt a source into this agency first.</p> : null}
    {selected ? <><p className="text-sm text-gray-muted">{selected.name} becomes source revision {selected.revision + 1}. Each client Version chooses whether to take it.</p><TextArea label="What changed" value={summary} maxLength={500} required rows={3} disabled={busy || Boolean(pending.current)} onChange={event => setSummary(event.target.value)} /><TextInput label="Pushed standards (optional field paths, separated by commas)" value={locks} disabled={busy || Boolean(pending.current)} onChange={event => setLocks(event.target.value)} placeholder="branding.name, policy.cancellation" /><p className="text-xs text-gray-muted">Locked fields must exist in this definition. Client Versions take the source value; their own accounts, data and local fields remain independent. Each new revision needs its own qualification.</p><Button disabled={busy || !summary.trim() || Boolean(receipt)} loading={busy} onClick={() => void publish()}>{pending.current && !receipt ? "Retry this package" : "Publish source revision"}</Button></> : null}
    {receipt ? <p role="status" className="text-sm text-warm-black">Source revision {receipt.revision} is published. Open Library to prepare it for client review.</p> : null}
    {state?.unavailable.length ? <details><summary className="cursor-pointer text-sm text-gray-muted">{state.unavailable.length} Systems cannot be packaged yet</summary><ul className="mt-2 text-sm text-gray-muted">{state.unavailable.map(item => <li key={item.systemId}>{item.name} — no reusable definition could be read.</li>)}</ul></details> : null}
  </section>;
}
