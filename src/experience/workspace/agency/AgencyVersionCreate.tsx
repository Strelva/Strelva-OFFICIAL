"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import type { AgencyClientRow } from "../agency-clients";
const uuid = z.string().uuid();
const sourceRef = z.object({ businessId: uuid, systemId: uuid, revisionId: uuid, number: z.number().int().positive() }).strict();
const schema = z.object({ workspaceId: uuid, sources: z.array(z.object({ systemId: uuid, name: z.string(), revisions: z.array(z.object({ source: sourceRef, summary: z.string() })) })) });
const receipt = z.object({ workspaceId: uuid, systemId: uuid, versionId: uuid, rowRevision: z.number().int().positive(), outcome: z.literal("created") }).strict();
export function AgencyVersionCreate({ request, agencyWorkspaceId, clients }: { request: typeof fetch; agencyWorkspaceId: string; clients: readonly AgencyClientRow[] }) {
  const [sources, setSources] = useState<z.infer<typeof schema>["sources"] | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [installCommandId, setInstallCommandId] = useState<string | null>(null), [grantError, setGrantError] = useState("");
  const [sourceId, setSourceId] = useState(""), [client, setClient] = useState(""), [name, setName] = useState(""), [label, setLabel] = useState(""), [context, setContext] = useState("agency_client");
  const [busy, setBusy] = useState(false), [result, setResult] = useState<z.infer<typeof receipt> | null>(null);
  const pending = useRef<string | null>(null), inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void request(`/api/workspace/versions/manage?agencyWorkspaceId=${encodeURIComponent(agencyWorkspaceId)}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Sources could not be read.");
      const parsed = schema.parse(body);
      if (parsed.workspaceId !== agencyWorkspaceId) throw new Error("Sources returned for another agency.");
      if (!controller.signal.aborted) { setSources(parsed.sources); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Sources could not be read."); });
    return () => controller.abort();
  }, [request, agencyWorkspaceId, attempt]);
  const selected = sources?.find(item => item.systemId === sourceId)?.revisions.at(-1);
  const targets = clients.filter(item => item.status === "ready" && (item.reach === "agency" || (item.reach === "member" && (item.role === "owner" || item.role === "admin"))));
  const delegated = targets.find(item => item.workspaceId === client)?.reach === "agency";
  useEffect(() => {
    setInstallCommandId(null); setGrantError("");
    if (!selected || !client || !delegated) return;
    const controller = new AbortController();
    void request(`/api/workspace/packages?${new URLSearchParams({ workspaceId: client, grantsForRevision: selected.source.revisionId })}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null); if (!response.ok) throw new Error("The client owner must allow this exact installation first.");
      const parsed = z.object({ workspaceId: z.literal(client), grants: z.array(z.object({ commandId: uuid, agencyWorkspaceId: uuid, revisionId: uuid, status: z.enum(["active","revoked"]), expiresAt: z.string() }).passthrough()) }).parse(body);
      const available = parsed.grants.find(item => item.agencyWorkspaceId === agencyWorkspaceId && item.revisionId === selected.source.revisionId && item.status === "active" && Date.parse(item.expiresAt) > Date.now());
      if (!available) throw new Error("The client owner must allow this exact installation first.");
      if (!controller.signal.aborted) setInstallCommandId(available.commandId);
    }).catch(cause => { if (!controller.signal.aborted) setGrantError(cause instanceof Error ? cause.message : "Install permission could not be read."); });
    return () => controller.abort();
  }, [request, client, selected, delegated, agencyWorkspaceId]);
  const locked = busy || Boolean(pending.current) || Boolean(result);
  async function create() {
    if (!selected || !client || (delegated && !installCommandId) || !name.trim() || !label.trim() || inFlight.current || result) return;
    pending.current ??= JSON.stringify({ action: "create", agencyWorkspaceId, workspaceId: client, source: selected.source, context: { kind: context, label: label.trim() }, name: name.trim(), commandId: installCommandId ?? crypto.randomUUID() });
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await request("/api/workspace/versions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: pending.current });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Creation could not be confirmed. Retry the same Version.");
      const accepted = receipt.parse(body);
      if (accepted.workspaceId !== client) throw new Error("The Version receipt returned for another business.");
      setResult(accepted);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Creation could not be confirmed."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="mb-8"><summary className="cursor-pointer text-sm font-medium">Create a client Version</summary><div className="mt-4 max-w-xl space-y-4 text-sm">
    <p className="text-gray-muted">Copy a source’s reusable definition into this business as a separate Draft System. Its accounts, data and permissions start empty.</p>
    {!sources && !error ? <p role="status">Reading source revisions…</p> : null}
    {grantError ? <p role="status" className="text-gray-muted">{grantError}</p> : null}
    {error ? <p role="alert" className="text-critical">{error}</p> : null}
    {!sources && error ? <Button variant="secondary" size="sm" onClick={() => setAttempt(value => value + 1)}>Retry sources</Button> : null}
    {sources ? <><SelectInput label="Source" disabled={locked} value={sourceId} onChange={event => setSourceId(event.target.value)} options={[{ value: "", label: "Choose a source" }, ...sources.filter(item => item.revisions.length).map(item => ({ value: item.systemId, label: `${item.name} · revision ${item.revisions.at(-1)!.source.number}` }))]} /><SelectInput label="Client business" disabled={locked} value={client} onChange={event => setClient(event.target.value)} options={[{ value: "", label: "Choose a client" }, ...targets.map(item => ({ value: item.workspaceId, label: item.name }))]} /><TextInput label="New System name" value={name} maxLength={160} disabled={locked} onChange={event => setName(event.target.value)} /><SelectInput label="Version context" value={context} disabled={locked} onChange={event => setContext(event.target.value)} options={[{ value: "agency_client", label: "Agency client" }, { value: "location", label: "Location" }, { value: "customer_segment", label: "Customer segment" }, { value: "franchise", label: "Franchise" }]} /><TextInput label="Context name" value={label} maxLength={200} disabled={locked} onChange={event => setLabel(event.target.value)} /><Button size="sm" loading={busy} disabled={busy || Boolean(result) || !selected || !client || (delegated && !installCommandId) || !name.trim() || !label.trim()} onClick={() => void create()}>{pending.current && !result ? "Retry this Version" : "Create Draft Version"}</Button></> : null}
    {result ? <p role="status">The client Version is ready as a draft. <a className="underline underline-offset-2" href={`/workspace?view=system&system=${result.systemId}&workspaceId=${result.workspaceId}`}>Open its System</a> to bind accounts and prepare a release.</p> : null}
  </div></details>;
}
