"use client";

import { useState } from "react";
import { TextArea } from "@/components/ui/TextInput";
import { StEmpty, StHold, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

export interface ProviderChangeNotice {
  id: string;
  business_workspace_id: string;
  status: string;
  business_name?: string | null;
  outgoing_agency_name?: string | null;
  incoming_agency_name?: string | null;
  new_agency_workspace_id?: string | null;
  requested_by_name?: string | null;
  requested_at?: string | null;
  completed_at?: string | null;
  summary?: Array<{ label: string; detail: string; verified: boolean }>;

  respond_by: string | null;
  policy_version?: string | null;
  cancellation?: { cancelled_at: string };
  responses?: Array<{ kind: string; note: string }>;
}

export default function ProviderChangeNotices({ workspaceId, requests, canCancel = false }: { workspaceId: string; requests: ProviderChangeNotice[]; canCancel?: boolean }) {
  const request = useWorkspaceRequest();
  const [rows, setRows] = useState(requests);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(requestId: string, action: "acknowledge" | "complete" | "respond" | "cancel") {
    if (busy) return;
    setBusy(requestId); setMessage(null); setError(null);
    try {
      const response = await request("/api/workspace/provider-change", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action, ...(action === "respond" ? { kind: "handoff_ready", note: notes[requestId] ?? "", idempotencyKey: crypto.randomUUID() } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error ?? "The agency change could not continue.");
      if (typeof result.id !== "string") throw Error("The agency change could not be confirmed. Sign in and try again.");
      if (action !== "respond" && result.id !== requestId) throw Error("The agency change receipt belongs to another handoff. Reload before continuing.");
      if (action === "acknowledge") setRows(rs => rs.map(q => q.id === requestId ? { ...q, status: result.status, respond_by: result.respond_by } : q));
      if (action === "cancel") {
        if (result.status !== "cancelled") throw Error("Cancellation could not be confirmed. Reload and try again.");
        setRows(rs => rs.map(q => q.id === requestId ? { ...q, status: "cancelled", cancellation: result.cancellation } : q));
      }
      if (action === "complete") {
        if (result.status !== "completed") throw Error("Completion could not be confirmed. Reload before continuing.");
        setRows(rs => rs.map(q => q.id === requestId ? { ...q, status: "completed", summary: undefined } : q));
      }
      if (action === "respond") setRows(rs => rs.map(q => q.id === requestId ? { ...q, responses: [...(q.responses ?? []), result] } : q));
      setMessage(action === "cancel" ? "Agency change cancelled. Your current agency and billing stay as they are." : action === "respond" ? "Your handoff response was recorded." : action === "acknowledge" ? `Notice acknowledged. Response deadline: ${result.respond_by ? new Date(result.respond_by).toLocaleString() : "waiting for policy"}.` : "Agency change completed. Reload to read the updated handoff records.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The agency change could not continue."); }
    finally { setBusy(null); }
  }
  return <>
    <p className="text-sm leading-relaxed text-gray-muted">The business owner chooses the agency. A change waits for the outgoing agency’s notice and the approved response window.</p>
    {rows.length ? rows.map(q => <StSection key={q.id} id={`handoff-${q.id}`} title={`${q.business_name || "Business name unavailable"}: ${q.outgoing_agency_name || "Agency name unavailable"} → ${q.incoming_agency_name || (q.new_agency_workspace_id === null ? "No incoming agency" : "Incoming agency name unavailable")}`} meta={<StState kind={q.status === "completed" ? "live" : q.status === "cancelled" ? "draft" : "need"}>{q.status.replaceAll("_", " ")}</StState>}>
      <StRows>
        <StRow title="Requested by" detail={`${q.requested_by_name || "Actor not recorded"}${q.requested_at ? ` · ${new Date(q.requested_at).toLocaleString()}` : ""}`} />
        <StRow title="Current step" detail={q.status === "awaiting_policy" ? "Waiting for an approved notice policy" : q.status === "awaiting_notice" ? "Waiting for the outgoing agency to acknowledge notice" : q.status === "notified" ? "Response window · the business owner completes the change after the deadline" : q.status === "completed" ? "Agency change completed" : "Agency change cancelled"} />
        <StRow title="Effective date" detail={q.completed_at ? new Date(q.completed_at).toLocaleString() : q.status === "completed" ? "Completed date not recorded" : "The change takes effect when the owner completes it; no date is scheduled."} />
        <StRow title="Client workspace" end={<StTextButton href={`/workspace?workspaceId=${encodeURIComponent(q.business_workspace_id)}`}>Open {q.business_name || "business"}</StTextButton>} />
        <StRow title="Response deadline" detail={q.respond_by ? <StMono>{new Date(q.respond_by).toLocaleString()}</StMono> : "The response window has not been set."} />
        {q.responses?.map((r, index) => <StRow key={index} title={r.kind.replaceAll("_", " ")} detail={<span className="whitespace-pre-wrap">{r.note}</span>} />)}
      </StRows>
      <StSection title="Handoff summary"><StRows>{(q.summary ?? [{ label: "Transfer rules", detail: "System retention, History, source update eligibility, outgoing access and open Requests have not been verified for this handoff.", verified: false }]).map(item => <StRow key={item.label} title={item.label} detail={item.detail} end={<StState kind={item.verified ? "live" : "need"}>{item.verified ? "Verified record" : "Unverified rule"}</StState>} />)}</StRows></StSection>
      {q.business_workspace_id !== workspaceId && ["awaiting_notice", "awaiting_policy"].includes(q.status) ? <StPill disabled={!!busy} busy={busy === q.id} onClick={() => void act(q.id, "acknowledge")}>Acknowledge notice</StPill> : null}
      {canCancel && q.business_workspace_id === workspaceId && q.status === "awaiting_policy" && !q.respond_by && !q.policy_version && !q.responses?.length ? <StSurface label="Cancel agency change">
        <p className="mb-4 text-sm text-gray-muted">This request is waiting for a notice policy. You can cancel the request and keep your current agency.</p>
        <StHold label="Cancel agency change" disabled={!!busy} onAccept={() => void act(q.id, "cancel")} />
      </StSurface> : null}
      {q.status === "cancelled" ? <StNotice>Cancelled{q.cancellation?.cancelled_at ? ` · ${new Date(q.cancellation.cancelled_at).toLocaleString()}` : ""}. Your current agency and billing were kept.</StNotice> : null}
      {q.business_workspace_id !== workspaceId && q.status === "notified" && q.respond_by && new Date(q.respond_by).getTime() >= Date.now() ? <StSurface label="Agency handoff response"><div className="grid gap-4">
        <TextArea label="Agency handoff response" value={notes[q.id] ?? ""} onChange={event => setNotes(values => ({ ...values, [q.id]: event.target.value }))} maxLength={5000} />
        <StPill disabled={!!busy || !notes[q.id]?.trim()} busy={busy === q.id} onClick={() => void act(q.id, "respond")}>Record handoff response</StPill>
      </div></StSurface> : null}
      {canCancel && q.business_workspace_id === workspaceId && q.status === "notified" ? <StHold label="Complete agency change" disabled={!!busy || !q.respond_by || new Date(q.respond_by).getTime() > Date.now()} onAccept={() => void act(q.id, "complete")} /> : null}
    </StSection>) : <StEmpty>No agency changes are waiting.</StEmpty>}
    <StNotice>Strelva doesn’t pass messages between agencies. If you want to talk to the other agency, that’s up to you.</StNotice>
    {message ? <p role="status" className="text-sm text-positive">{message}</p> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </>;
}
