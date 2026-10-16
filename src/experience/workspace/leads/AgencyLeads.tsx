"use client";
/**
 * Agency Leads in XA (lane xs-leads; borrows XA · S3 Inbox): businesses that
 * asked the agency for work, listed beside the one picked. The read, the
 * actor-bound commands, receipt confirmation and held retries are unchanged;
 * only the structure, words and motion are XA.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaAnswers, XaButton, XaButtonLink, XaDot, XaEmpty, XaInitial, XaSegmented, XaStatus, XaSystemTile, XaTextArea, XaTextLink, type XaStatusKind } from "@/components/ui/strelva/Xa";
import { XaNote, XaPlace, XaPlaceHead, XaPlaceTrouble, xaShortDate } from "@/experience/places/XaPlace";
import styles from "@/experience/places/xa-place.module.css";
import type { DeliveryLead } from "@/platform/infra/delivery-contracts";
import type { LeadWorkflow } from "@/platform/infra/lead-workflow-contracts";
import type { readAgencyLeads } from "./leads-server";

type Snapshot = Awaited<ReturnType<typeof readAgencyLeads>>;
type LeadRow = Snapshot["leads"][number];
type Command = { agencyWorkspaceId: string; expectedActorId: string; idempotencyKey: string; token: string } & (
  { action: "status"; status: "new" | "contacted" | "dismissed" } | { action: "note"; note: string } | { action: "convert" }
);
const labels = { new: "New", contacted: "Contacted", converting: "Converting", converted: "Converted", dismissed: "Dismissed" };
/** Status as an exception: New waits on the agency; Converting is mid-way; the rest are quiet facts. */
const STATUS_KIND: Record<keyof typeof labels, XaStatusKind> = { new: "waits", contacted: "draft", converting: "working", converted: "live", dismissed: "draft" };
const statuses = new Set(Object.keys(labels));
const handoff = (agency: string, token: string) => `/workspace/agency/clients/new?workspaceId=${encodeURIComponent(agency)}&leadToken=${encodeURIComponent(token)}`;
const paymentLink = (agency: string, token: string) => `/workspace/payment-links?workspaceId=${encodeURIComponent(agency)}&leadToken=${encodeURIComponent(token)}`;
const isOpen = (row: LeadRow) => row.workflow.status !== "converted" && row.workflow.status !== "dismissed";

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
  const [view, setView] = useState<"open" | "done">("open");
  const [picked, setPicked] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
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
        : body.action === "note" ? "Note added." : body.status === "dismissed" ? "Dismissed. It moved to Done." : "Lead status saved.");
      await load();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Request unconfirmed. Retry the same request to check its receipt.");
    } finally { flight.current = false; if (mounted.current) setBusy(false); }
  }

  function terms(token: string) {
    return { agencyWorkspaceId, expectedActorId: snapshot!.currentActorId, token, idempotencyKey: crypto.randomUUID() };
  }
  const disabled = busy || loading || stale || !!pending;
  const refresh = <XaButton variant="quiet" size="sm" onClick={() => void load()} disabled={busy || loading}>Refresh leads</XaButton>;

  if (loading && !snapshot) return <XaPlace label="Leads">
    <XaPlaceHead art={<XaSystemTile kind="inbox" size={56} />} title="Leads" status="Reading what businesses asked for" />
    <div className={styles.loading}><StSkeleton label="Reading leads" width="40%" /><StSkeleton width="70%" /><StSkeleton width="55%" /></div>
  </XaPlace>;

  if (!snapshot) return <XaPlace label="Leads">
    <XaPlaceHead art={<XaSystemTile kind="inbox" size={56} />} title="Leads" />
    <XaPlaceTrouble title="Leads did not load." quiet="Nothing changed on any lead." action={refresh}>
      <p>{error || "Leads are unavailable."}</p>
      <p>Only a verified owner or admin of this agency can manage its leads.</p>
    </XaPlaceTrouble>
  </XaPlace>;

  const open = snapshot.leads.filter(isOpen);
  const done = snapshot.leads.filter(row => !isOpen(row));
  const shown = view === "open" ? open : done;
  const current = shown.find(row => row.lead.statusToken === picked) ?? shown[0] ?? null;
  const fresh = open.filter(row => row.workflow.status === "new").length;

  return <XaPlace label="Leads">
    <XaPlaceHead art={<XaSystemTile kind="inbox" size={56} />} title="Leads"
      status={<>{fresh ? <XaStatus kind="waits">{fresh === 1 ? "1 new" : `${fresh} new`}</XaStatus> : null}<span>Businesses that asked {snapshot.agency.name} for work. It becomes accepted work once scope and deadline are agreed.</span></>}
      aside={<>{refresh}{snapshot.leads.length ? <XaSegmented label="Which leads" value={view} onChange={next => { setView(next); setPicked(null); setOpened(false); }} options={[{ value: "open", label: `Open ${open.length}` }, { value: "done", label: `Done ${done.length}` }]} /> : null}</>} />

    {error ? <XaNote tone="trouble" pebble role="alert">{error}{stale && snapshot ? " Retained leads may be out of date. Refresh before changing anything." : ""}</XaNote> : null}
    {pending ? <XaNote tone="waits" pebble role="status">This exact request is awaiting confirmation. Its submitted terms are held. <XaButton variant="quiet" size="sm" disabled={busy || loading || stale} onClick={() => void command(pending)}>Retry the same request</XaButton></XaNote> : null}

    {!snapshot.leads.length ? <XaEmpty pose="waving" title="No agency leads recorded yet." job={`Pebble is watching ${snapshot.agency.name}'s request form`}>
      When a business asks {snapshot.agency.name} for work, it lands here in its own words.
    </XaEmpty> : <div className={styles.split} data-open={opened || undefined}>
      <ul className={styles.list} aria-label={view === "open" ? "Open leads" : "Done leads"}>
        {shown.length ? shown.map(row => {
          const lead = row.lead;
          const selected = current?.lead.statusToken === lead.statusToken;
          return <li key={lead.statusToken}><button type="button" className={styles.pick} aria-current={selected || undefined} onClick={() => { setPicked(lead.statusToken); setOpened(true); }}>
            <span className={styles.pickLead}><XaInitial name={lead.businessName} shape="round" size={36} color={row.workflow.status === "new" ? undefined : "var(--st-faint)"} /></span>
            <span className={styles.pickTitle}>{lead.businessName}</span>
            <time className={styles.pickMeta} dateTime={lead.submittedAt}>{xaShortDate(lead.submittedAt)}</time>
            <span className={styles.pickLine} data-quiet={row.workflow.status !== "new" || undefined}>{row.workflow.status === "new" ? (lead.description || "Asked for work") : labels[row.workflow.status]}</span>
            {row.workflow.status === "new" ? <span className={styles.pickDot}><XaDot kind="waits" label="New" /></span> : null}
          </button></li>;
        }) : <li><p className={styles.quiet}>{view === "open" ? "Nothing open. Every lead is a client or dismissed." : "Nothing done yet."}</p></li>}
      </ul>
      {current ? <LeadDetail key={current.lead.statusToken} row={current} snapshot={snapshot} agencyWorkspaceId={agencyWorkspaceId} disabled={disabled} message={message}
        onBack={() => setOpened(false)}
        onStatus={status => void command({ ...terms(current.lead.statusToken), action: "status", status })}
        onConvert={() => void command({ ...terms(current.lead.statusToken), action: "convert" })}
        onNote={note => void command({ ...terms(current.lead.statusToken), action: "note", note })}
        formRef={node => { if (node) noteForms.current.set(current.lead.statusToken, node); else noteForms.current.delete(current.lead.statusToken); }} /> : null}
    </div>}
  </XaPlace>;
}

function LeadDetail({ row, snapshot, agencyWorkspaceId, disabled, message, onBack, onStatus, onConvert, onNote, formRef }: {
  row: LeadRow; snapshot: Snapshot; agencyWorkspaceId: string; disabled: boolean; message: string;
  onBack: () => void; onStatus: (status: "new" | "contacted" | "dismissed") => void; onConvert: () => void; onNote: (note: string) => void;
  formRef: (node: HTMLFormElement | null) => void;
}) {
  const { lead, workflow, legacyOwnership } = row;
  const token = lead.statusToken;
  const status = workflow.status;
  const contact = [lead.email, lead.phone, lead.location].filter(Boolean).join(" · ");
  const canConvert = snapshot.conversionAvailable && status !== "converted";
  return <section className={styles.detail} aria-label={`Lead from ${lead.businessName}`}>
    <span className={styles.backToList}><XaTextLink onClick={onBack}>Back to leads</XaTextLink></span>
    <header className={styles.detailHead}>
      <XaInitial name={lead.businessName} shape="round" size={40} />
      <div className={styles.detailWho}>
        <h2 className={styles.detailName}>{lead.businessName}</h2>
        <span className={styles.detailMeta}>{contact}</span>
      </div>
      <XaStatus kind={STATUS_KIND[status]}>{labels[status]}</XaStatus>
    </header>
    <div className={styles.detailBody}>
      {lead.description ? <p className={styles.bubble}>{lead.description}</p> : <p className={styles.quiet}>They didn&apos;t write a description.</p>}
      <XaAnswers labelWidth={150} rows={[
        ["Received", <time key="r" dateTime={lead.submittedAt}>{xaShortDate(lead.submittedAt)}</time>],
        ...(lead.currentWebsite ? [["Current website", lead.currentWebsite] as const] : []),
        ...(legacyOwnership ? [["Attribution", "Received before agency ownership was recorded"] as const] : []),
      ]} />
      {workflow.note ? <div className={styles.stack}><p className={styles.quiet}>Notes</p><p className={`${styles.body} ${styles.pre}`}>{workflow.note}</p></div> : null}
      <form className={styles.stack} ref={formRef} onSubmit={event => {
        event.preventDefault(); if (disabled) return;
        const note = String(new FormData(event.currentTarget).get("note") || "").trim();
        if (note && note.length <= 2000) onNote(note);
      }}>
        <XaTextArea name="note" label={`Add a note for ${lead.businessName}`} hint="Up to 2,000 characters. Saved notes stay in this lead's history." maxLength={2000} required rows={3} disabled={disabled} />
        <span><XaButton type="submit" size="sm" disabled={disabled}>Add note</XaButton></span>
      </form>
      {message ? <XaNote role="status" pebble>{message}</XaNote> : null}
    </div>
    <footer className={styles.detailFoot}>
      {status === "converting" && snapshot.conversionAvailable
        ? disabled ? <XaButton variant="primary" disabled>Continue adding client</XaButton> : <XaButtonLink variant="primary" href={handoff(agencyWorkspaceId, token)}>Continue adding client</XaButtonLink>
        : <XaButton variant="primary" disabled={disabled || !canConvert} onClick={onConvert}>Add as client</XaButton>}
      {status === "new" ? <XaButton disabled={disabled} onClick={() => onStatus("contacted")}>Mark contacted</XaButton>
        : status === "contacted" || status === "dismissed" ? <XaButton disabled={disabled} onClick={() => onStatus("new")}>Mark new</XaButton> : null}
      {status !== "converted" && status !== "dismissed" ? <XaButton variant="quiet" disabled={disabled} onClick={() => onStatus("dismissed")}>Dismiss</XaButton> : null}
      <span className={styles.detailFootNote}>
        {!snapshot.conversionAvailable ? "Adding a client is currently unavailable. You can still manage lead status and notes. " : null}
        {disabled ? "Payment links · Coming soon" : <XaTextLink href={paymentLink(agencyWorkspaceId, token)}>Payment links · Coming soon</XaTextLink>}
      </span>
    </footer>
  </section>;
}
