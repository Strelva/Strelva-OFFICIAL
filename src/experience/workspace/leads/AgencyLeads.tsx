"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StCopy, StEmpty, StField, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import type { DeliveryLead } from "@/platform/infra/delivery-contracts";
import type { LeadWorkflow } from "@/platform/infra/lead-workflow-contracts";
import type { readAgencyLeads } from "./leads-server";

type Snapshot = Awaited<ReturnType<typeof readAgencyLeads>>;
type LeadRow = Snapshot["leads"][number];
type Command = { agencyWorkspaceId: string; expectedActorId: string; idempotencyKey: string; token: string } & (
  { action: "status"; status: "new" | "contacted" | "dismissed" } | { action: "note"; note: string } | { action: "convert" }
);
const labels = { new: "New", contacted: "Contacted", converting: "Converting", converted: "Converted", dismissed: "Dismissed" };
const statuses = new Set(Object.keys(labels));
const handoff = (agency: string, token: string) => `/workspace/agency/clients/new?workspaceId=${encodeURIComponent(agency)}&leadToken=${encodeURIComponent(token)}`;
const paymentLink = (agency: string, token: string) => `/workspace/payment-links?workspaceId=${encodeURIComponent(agency)}&leadToken=${encodeURIComponent(token)}`;

function isLeadRow(value: unknown): value is LeadRow {
  if (!value || typeof value !== "object") return false;
  const row = value as { lead?: Partial<DeliveryLead>; workflow?: Partial<LeadWorkflow>; legacyOwnership?: unknown };
  return !!row.lead && typeof row.lead.businessName === "string" && typeof row.lead.email === "string"
    && typeof row.lead.statusToken === "string" && /^[a-f0-9]{36}$/.test(row.lead.statusToken)
    && !!row.workflow && row.workflow.token === row.lead.statusToken && statuses.has(String(row.workflow.status))
    && typeof row.legacyOwnership === "boolean";
}

function confirmedCommand(value: unknown, body: Command): value is LeadRow & { idempotencyKey: string; href?: string } {
  if (!isLeadRow(value)) return false;
  const receipt = value as LeadRow & { idempotencyKey?: string; href?: string };
  if (receipt.idempotencyKey !== body.idempotencyKey || receipt.lead.statusToken !== body.token) return false;
  if (body.action === "note") {
    const notes = (receipt.workflow as LeadWorkflow & { notes?: { id: string; text: string; createdBy: string; createdAt: string }[] }).notes;
    return Array.isArray(notes) && notes.some(note => note.id === body.idempotencyKey && note.text === body.note
      && note.createdBy === body.expectedActorId && Number.isFinite(Date.parse(note.createdAt)));
  }
  if (body.action === "convert") return receipt.workflow.status === "converting" && receipt.lead.deliveryStatus === "drafting"
    && receipt.href === handoff(body.agencyWorkspaceId, body.token);
  const delivery = { new: "received", contacted: "reviewing", dismissed: "paused" };
  return receipt.workflow.status === body.status && receipt.lead.deliveryStatus === delivery[body.status];
}

export function AgencyLeads({ agencyWorkspaceId, request = fetch }: { agencyWorkspaceId: string; request?: typeof fetch }) {
  return <ScopedAgencyLeads key={agencyWorkspaceId} agencyWorkspaceId={agencyWorkspaceId} request={request} />;
}

function ScopedAgencyLeads({ agencyWorkspaceId, request }: { agencyWorkspaceId: string; request: typeof fetch }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Command | null>(null);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const mounted = useRef(true);
  const noteForms = useRef(new Map<string, HTMLFormElement>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await request(`/api/agency/leads?agencyWorkspaceId=${encodeURIComponent(agencyWorkspaceId)}`, { cache: "no-store", signal });
      const value = await response.json();
      if (!response.ok || value.agency?.id !== agencyWorkspaceId || !["owner", "admin"].includes(value.agency?.role)
        || typeof value.currentActorId !== "string" || !Array.isArray(value.leads) || !value.leads.every(isLeadRow)
        || typeof value.conversionAvailable !== "boolean") throw new Error(value.error || "Leads could not be read.");
      if (!signal?.aborted && mounted.current) { setSnapshot(value); setStale(false); }
    } catch (cause) {
      if (!signal?.aborted && mounted.current) { setStale(true); setError(cause instanceof Error ? cause.message : "Leads could not be read."); }
    } finally { if (!signal?.aborted && mounted.current) setLoading(false); }
  }, [agencyWorkspaceId, request]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function command(body: Command) {
    if (flight.current || !snapshot || stale) return;
    const replaying = pending !== null;
    flight.current = true; setBusy(true); setError(""); setMessage(""); setPending(body);
    try {
      const response = await request("/api/agency/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json();
      if (!mounted.current) return;
      if (!response.ok || !confirmedCommand(value, body)) {
        if (!replaying && [400, 401, 403, 409].includes(response.status)) setPending(null);
        throw new Error(value.error || "This request could not be confirmed. Retry the same request to check its receipt.");
      }
      setPending(null);
      setSnapshot(current => current ? { ...current, leads: current.leads.map(row => row.lead.statusToken === body.token ? value : row) } : current);
      if (body.action === "note") noteForms.current.get(body.token)?.reset();
      setMessage(body.action === "convert" ? "Ready to add this client. The lead stays Converting until the client business is created."
        : body.action === "note" ? "Note added." : "Lead status saved.");
      await load();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Request unconfirmed. Retry the same request to check its receipt.");
    } finally { flight.current = false; if (mounted.current) setBusy(false); }
  }

  function terms(token: string) {
    return { agencyWorkspaceId, expectedActorId: snapshot!.currentActorId, token, idempotencyKey: crypto.randomUUID() };
  }
  const disabled = busy || loading || stale || !!pending;
  return <>
    <StTextButton onClick={() => void load()} disabled={busy || loading}>Refresh leads</StTextButton>
    {error ? <StNotice tone="critical">{error}{stale && snapshot ? " Retained leads may be out of date. Refresh before changing anything." : ""}</StNotice> : null}
    {message ? <StNotice>{message}</StNotice> : null}
    {pending ? <StNotice>This exact request is awaiting confirmation. Its submitted terms are held.<StTextButton disabled={busy || loading || stale} onClick={() => void command(pending)}>Retry the same request</StTextButton></StNotice> : null}
    {loading && !snapshot ? <StSkeleton label="Reading leads" /> : !snapshot ? <StEmpty>Leads are unavailable. Only a verified owner or admin of Strelva Agency can manage this intake.</StEmpty> : <>
      <StCopy>{snapshot.agency.name} manages these service requests. A request becomes accepted work only after scope and deadline are agreed.</StCopy>
      {!snapshot.conversionAvailable ? <StNotice>Adding a client is currently unavailable. You can still manage lead status and notes.</StNotice> : null}
      <StSection title="Leads">
        {!snapshot.leads.length ? <StEmpty>No agency leads recorded yet.</StEmpty> : <StRows label="Agency leads">{snapshot.leads.map(row => {
          const { lead, workflow, legacyOwnership } = row;
          const token = lead.statusToken;
          return <StRow key={token} title={lead.businessName} align="start" detail={<>
            <StState kind={workflow.status === "converted" ? "live" : "draft"}>{labels[workflow.status]}</StState>
            <StCopy>{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}{lead.location ? ` · ${lead.location}` : ""}</StCopy>
            {lead.description ? <StCopy>{lead.description}</StCopy> : null}
            {lead.currentWebsite ? <StCopy>Current website: {lead.currentWebsite}</StCopy> : null}
            {legacyOwnership ? <StCopy muted>Received before agency ownership was recorded</StCopy> : null}
            <StCopy muted>Received {new Date(lead.submittedAt).toLocaleDateString()}</StCopy>
            {workflow.note ? <StCopy><span className="whitespace-pre-wrap">{workflow.note}</span></StCopy> : null}
            {workflow.status !== "converted" ? <form className="grid gap-4" onSubmit={event => {
              event.preventDefault(); if (disabled) return;
              const status = new FormData(event.currentTarget).get("status");
              if (status === "new" || status === "contacted" || status === "dismissed") void command({ ...terms(token), action: "status", status });
            }}>
              <StField label={`Status for ${lead.businessName}`}><select key={workflow.status} name="status" defaultValue={workflow.status} disabled={disabled}>
                {workflow.status === "converting" ? <option value="converting" disabled>Converting</option> : null}
                <option value="new">New</option><option value="contacted">Contacted</option><option value="dismissed">Dismissed</option>
              </select></StField>
              <StTextButton type="submit" disabled={disabled}>Save status</StTextButton>
            </form> : null}
            <form className="grid gap-4" ref={node => { if (node) noteForms.current.set(token, node); else noteForms.current.delete(token); }} onSubmit={event => {
              event.preventDefault(); if (disabled) return;
              const note = String(new FormData(event.currentTarget).get("note") || "").trim();
              if (note && note.length <= 2000) void command({ ...terms(token), action: "note", note });
            }}>
              <StField label={`Add a note for ${lead.businessName}`} hint="Up to 2,000 characters. Saved notes stay in this lead's history."><textarea name="note" maxLength={2000} required rows={3} disabled={disabled} /></StField>
              <StPill variant="soft" type="submit" disabled={disabled}>Add note</StPill>
            </form>
            <div className="flex flex-wrap gap-4">
              {workflow.status === "converting" && snapshot.conversionAvailable ? disabled ? <StTextButton disabled>Continue adding client</StTextButton> : <StTextButton href={handoff(agencyWorkspaceId, token)}>Continue adding client</StTextButton>
                : <StTextButton disabled={disabled || !snapshot.conversionAvailable || workflow.status === "converted"} onClick={() => void command({ ...terms(token), action: "convert" })}>Convert</StTextButton>}
              {disabled ? <StTextButton disabled>Create payment link</StTextButton> : <StTextButton href={paymentLink(agencyWorkspaceId, token)}>Create payment link</StTextButton>}
              {workflow.status !== "converted" && workflow.status !== "dismissed" ? <StTextButton tone="danger" disabled={disabled} onClick={() => void command({ ...terms(token), action: "status", status: "dismissed" })}>Dismiss</StTextButton> : null}
            </div>
          </>} />;
        })}</StRows>}
      </StSection>
    </>}
  </>;
}
