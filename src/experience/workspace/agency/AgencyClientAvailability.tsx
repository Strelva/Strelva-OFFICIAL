"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { agencyFlagViewSchema, type AgencyFlagView } from "@/platform/release-flags/agency-contracts";
export function AgencyClientAvailability({ agencyWorkspaceId, workspaceId, request = fetch }: { agencyWorkspaceId: string; workspaceId: string; request?: typeof fetch }) {
  const [open, setOpen] = useState(false), [data, setData] = useState<AgencyFlagView | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const currentData = data?.workspaceId === workspaceId && data.agencyWorkspaceId === agencyWorkspaceId ? data : null;
  async function load() {
    setBusy(true); setError(null); setSaved(false);
    try {
      const response = await request(`/api/workspace/agency-release-flags?${new URLSearchParams({ agencyWorkspaceId, workspaceId })}`, { credentials: "same-origin" });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "Client availability is unavailable.");
      const parsed = agencyFlagViewSchema.parse(value); if (parsed.workspaceId !== workspaceId || parsed.agencyWorkspaceId !== agencyWorkspaceId) throw new Error("This availability belongs to a different business.");
      setData(parsed);
    } catch (error) { setData(null); setError(error instanceof Error ? error.message : "Client availability is unavailable."); }
    finally { setBusy(false); }
  }
  return <details className="mx-2 mb-4" onToggle={event => { const next = event.currentTarget.open; setOpen(next); if (next) void load(); }}>
    <summary className="flex min-h-11 cursor-pointer items-center text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2">Client capability availability</summary>
    {open ? <section aria-label="Client capability availability" className="grid gap-4 py-4">
      <p className="max-w-prose text-sm text-gray-muted">Choose availability within the platform’s permission for this business. Customer approvals and connected-account permissions still apply.</p>
      {saved ? <p role="status" className="text-sm">Availability saved.</p> : null}
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>Refresh permissions</Button>
      {busy ? <p role="status">Checking current permissions…</p> : error ? <div role="alert"><p>{error}</p><Button variant="secondary" size="sm" onClick={() => void load()}>Retry</Button></div> : currentData ? currentData.flags.length ? currentData.flags.map(flag => <FlagControl key={`${flag.flag}:${flag.revision}:${flag.ceilingRevision}`} flag={flag} agencyWorkspaceId={agencyWorkspaceId} workspaceId={workspaceId} request={request} changed={value => { setData(value); setSaved(true); }} />) : <p className="text-sm text-gray-muted">The platform has not permitted any capability changes for this business. Each permission must name a capability and System.</p> : null}
    </section> : null}
  </details>;
}
function FlagControl({ flag, agencyWorkspaceId, workspaceId, request, changed }: { flag: AgencyFlagView["flags"][number]; agencyWorkspaceId: string; workspaceId: string; request: typeof fetch; changed: (value: AgencyFlagView) => void }) {
  const [state, setState] = useState(flag.state), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const blocked = !flag.workspaceReleased || flag.environment === "off" || flag.ceiling === "off" || !flag.verified;
  const explanation = !flag.workspaceReleased || flag.environment === "off" ? "Paused by the platform release switch." : flag.ceiling === "off" ? "The platform has paused this permission." : !flag.verified ? `Agency verification for ${flag.verificationEffect} is required.` : `Platform limit: ${flag.ceiling === "on" ? "On" : "Operators and named testers"}.`;
  async function save() {
    setBusy(true); setMessage(null);
    try {
      const response = await request("/api/workspace/agency-release-flags", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agencyWorkspaceId, workspaceId, flag: flag.flag, state, reason, expectedRevision: flag.revision, ceilingRevision: flag.ceilingRevision }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "Availability was not changed. Refresh to check current permissions.");
      const parsed = agencyFlagViewSchema.parse(value); if (parsed.workspaceId !== workspaceId || parsed.agencyWorkspaceId !== agencyWorkspaceId) throw new Error("The response belongs to a different business.");
      changed(parsed);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Availability could not be changed."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-3 border-t border-gray-border pt-4"><div><h3 className="text-sm font-medium">{flag.label}</h3><p className="mt-1 text-xs text-gray-muted">{flag.systemName} · {explanation}</p></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
      <SelectInput label={`${flag.label} availability`} value={state} onChange={event => setState(event.target.value as typeof state)} disabled={blocked || busy} options={[{ value: "off", label: "Off" }, { value: "operators", label: "Operators and named testers" }, ...(flag.ceiling === "on" || flag.state === "on" ? [{ value: "on", label: flag.ceiling === "on" ? "On" : "On · platform controlled" }] : [])]} />
      <TextInput label="Reason for change" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={blocked || busy} />
      <Button variant="secondary" size="sm" disabled={blocked || reason.trim().length < 3 || state === flag.state || (state === "on" && flag.ceiling !== "on")} loading={busy} onClick={() => void save()}>Save availability</Button>
    </div>{message ? <p role="alert" className="text-sm text-critical">{message}</p> : null}
  </div>;
}
