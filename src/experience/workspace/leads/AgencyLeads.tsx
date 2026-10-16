"use client";
/**
 * Service requests in XA (route /workspace/leads; lane xs-leads; borrows
 * XA · S3 Inbox): businesses that asked the agency for work, listed beside the
 * one picked, with Pebble saying what that request needs right above its one
 * ink pill. The read, the actor-bound commands, receipt confirmation and held
 * retries are unchanged; only the structure, words and motion are XA.
 * GLOSSARY: a Service request is a Request sent to an agency; it is not an
 * accepted job until scope and deadline are agreed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaAnswers, XaButton, XaButtonLink, XaDot, XaEmpty, XaInitial, XaPebbleAvatar, XaSegmented, XaStatus, XaSystemTile, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaNote, XaPlace, XaPlaceHead, XaPlaceTrouble, xaDayPhrase, xaShortDate } from "@/experience/places/XaPlace";
import styles from "@/experience/places/xa-place.module.css";
import type { DeliveryLead } from "@/platform/infra/delivery-contracts";
import type { LeadWorkflow } from "@/platform/infra/lead-workflow-contracts";
import type { readAgencyLeads } from "./leads-server";

type Snapshot = Awaited<ReturnType<typeof readAgencyLeads>>;
type LeadRow = Snapshot["leads"][number];
type Command = { agencyWorkspaceId: string; expectedActorId: string; idempotencyKey: string; token: string } & (
  { action: "status"; status: "new" | "contacted" | "dismissed" } | { action: "note"; note: string } | { action: "convert" }
);
/** Stored workflow states. Shown as sentences in the opened request, never as a status column. */
const statuses = new Set(["new", "contacted", "converting", "converted", "dismissed"]);
const handoff = (agency: string, token: string) => `/workspace/agency/clients/new?workspaceId=${encodeURIComponent(agency)}&leadToken=${encodeURIComponent(token)}`;
/** A business the agency already runs, read through ordinary agency scope by the route. */
export type KnownClient = { id: string; name: string; href: string };
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
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

export function AgencyLeads({ agencyWorkspaceId, request = fetch, knownClients = [], initialOpen = false }: { agencyWorkspaceId: string; request?: typeof fetch; knownClients?: readonly KnownClient[]; initialOpen?: boolean }) {
  return <ScopedAgencyLeads key={agencyWorkspaceId} agencyWorkspaceId={agencyWorkspaceId} request={request} knownClients={knownClients} initialOpen={initialOpen} />;
}

const TITLE = "Service requests";
const art = <XaSystemTile kind="inbox" size={56} />;

function ScopedAgencyLeads({ agencyWorkspaceId, request, knownClients, initialOpen }: { agencyWorkspaceId: string; request: typeof fetch; knownClients: readonly KnownClient[]; initialOpen: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Command | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"open" | "done">("open");
  const [picked, setPicked] = useState<string | null>(null);
  const [opened, setOpened] = useState(initialOpen);
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
        || typeof value.conversionAvailable !== "boolean") throw new Error(value.error || "Service requests didn't load.");
      if (!signal?.aborted && mounted.current) { setSnapshot(value); setStale(false); }
    } catch (cause) {
      if (!signal?.aborted && mounted.current) { setStale(true); setError(cause instanceof Error ? cause.message : "Service requests didn't load."); }
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
        throw new Error(value.error || "That change wasn't confirmed. Check again to see whether it saved.");
      }
      setPending(null);
      setSnapshot(current => current ? { ...current, leads: current.leads.map(row => row.lead.statusToken === body.token ? value : row) } : current);
      if (body.action === "note") noteForms.current.get(body.token)?.reset();
      setMessage(body.action === "convert" ? "" : body.action === "note" ? "Note added." : body.status === "dismissed" ? "Dismissed. It moved to Done." : body.status === "contacted" ? "Marked contacted." : "Moved back to new.");
      await load();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "That change wasn't confirmed. Check again to see whether it saved.");
    } finally { flight.current = false; if (mounted.current) setBusy(false); }
  }

  function terms(token: string) {
    return { agencyWorkspaceId, expectedActorId: snapshot!.currentActorId, token, idempotencyKey: crypto.randomUUID() };
  }
  const disabled = busy || loading || stale || !!pending;
  // A manual reload appears only after something failed, as "Try again".
  const tryAgain = <XaTextLink onClick={() => void load()}>Try again</XaTextLink>;

  if (loading && !snapshot) return <XaPlace label={TITLE}>
    <XaPlaceHead art={art} title={TITLE} status="Reading what businesses asked for" />
    <div className={styles.loading}><StSkeleton label="Reading service requests" width="40%" /><StSkeleton width="70%" /><StSkeleton width="55%" /></div>
  </XaPlace>;

  if (!snapshot) return <XaPlace label={TITLE}>
    <XaPlaceHead art={art} title={TITLE} />
    <XaPlaceTrouble title="Service requests didn't load." quiet="Nothing changed on any request." action={<XaButton variant="primary" onClick={() => void load()} disabled={busy || loading}>Try again</XaButton>}>
      <p>{error || "They couldn't be read just now."}</p>
      <p>Only an owner or admin of this agency can open its service requests.</p>
    </XaPlaceTrouble>
  </XaPlace>;

  const open = snapshot.leads.filter(isOpen);
  const done = snapshot.leads.filter(row => !isOpen(row));
  const shown = view === "open" ? open : done;
  const current = shown.find(row => row.lead.statusToken === picked) ?? shown[0] ?? null;
  const fresh = open.filter(row => row.workflow.status === "new");
  const newest = [...fresh].sort((a, b) => Date.parse(b.lead.submittedAt) - Date.parse(a.lead.submittedAt))[0];
  const status = fresh.length && newest
    ? <><XaStatus kind="waits">{fresh.length} new</XaStatus><span>{newest.lead.businessName} asked {xaDayPhrase(newest.lead.submittedAt)}.</span></>
    : snapshot.leads.length ? <span>Nothing new. {open.length === 1 ? "1 is still open." : `${open.length} are still open.`}</span> : null;

  return <XaPlace label={TITLE}>
    <XaPlaceHead art={art} title={TITLE} status={status}
      aside={snapshot.leads.length ? <XaSegmented label="Which requests" value={view} onChange={next => { setView(next); setPicked(null); setOpened(false); }} options={[{ value: "open", label: `Open ${open.length}` }, { value: "done", label: `Done ${done.length}` }]} /> : undefined} />

    {error ? <XaNote tone="trouble" pebble role="alert">{error}{stale ? " What you see may be out of date, so changes wait until it loads." : ""} {tryAgain}</XaNote> : null}
    {pending ? <XaNote tone="waits" pebble role="status">Your last change is waiting to be confirmed. Nothing else changes until it is. <XaButton variant="quiet" size="sm" disabled={busy || loading || stale} onClick={() => void command(pending)}>Check again</XaButton></XaNote> : null}

    {!snapshot.leads.length ? <XaEmpty pose="waving" title="No service requests yet." job={`Pebble is watching ${snapshot.agency.name}'s request form`}>
      When a business asks {snapshot.agency.name} for work, it lands here in its own words.
    </XaEmpty> : <div className={styles.split} data-open={opened || undefined}>
      <ul className={styles.list} aria-label={view === "open" ? "Open service requests" : "Done service requests"}>
        {shown.length ? shown.map(row => {
          const lead = row.lead;
          const selected = current?.lead.statusToken === lead.statusToken;
          const fresh = row.workflow.status === "new";
          return <li key={lead.statusToken}><button type="button" className={styles.pick} aria-current={selected || undefined} onClick={() => { setPicked(lead.statusToken); setOpened(true); setMessage(""); }}>
            <span className={styles.pickLead}><XaInitial name={lead.businessName} shape="round" size={36} color={fresh ? undefined : "var(--st-faint)"} /></span>
            <span className={styles.pickTitle}>{lead.businessName}</span>
            <time className={styles.pickMeta} dateTime={lead.submittedAt}>{xaShortDate(lead.submittedAt)}</time>
            <span className={styles.pickLine} data-quiet={!fresh || undefined}>{lead.description || "Asked for work"}</span>
            {fresh ? <span className={styles.pickDot}><XaDot kind="waits" label="New" /></span> : null}
          </button></li>;
        }) : <li><p className={styles.quiet}>{view === "open" ? "Nothing open. Every request is a client or dismissed." : "Nothing done yet."}</p></li>}
      </ul>
      {current ? <LeadDetail key={current.lead.statusToken} row={current} snapshot={snapshot} agencyWorkspaceId={agencyWorkspaceId} disabled={disabled} message={message}
        client={knownClients.find(client => sameName(client.name, current.lead.businessName))}
        onBack={() => setOpened(false)}
        onStatus={status => void command({ ...terms(current.lead.statusToken), action: "status", status })}
        onConvert={() => void command({ ...terms(current.lead.statusToken), action: "convert" })}
        onNote={note => void command({ ...terms(current.lead.statusToken), action: "note", note })}
        formRef={node => { if (node) noteForms.current.set(current.lead.statusToken, node); else noteForms.current.delete(current.lead.statusToken); }} /> : null}
    </div>}
  </XaPlace>;
}

/** What Strelva says about one request, right above its actions: its state as a sentence, and what the one pill does. */
function leadSentence(row: LeadRow, conversionAvailable: boolean, client?: KnownClient): string {
  const { lead, workflow } = row;
  const name = lead.businessName;
  const changed = workflow.updatedAt ? xaDayPhrase(workflow.updatedAt) : null;
  if (workflow.status === "converted") return `${name} is a client${changed ? ` since ${xaShortDate(workflow.updatedAt!)}` : ""}.`;
  if (workflow.status === "converting") return `Adding ${name} as a client. Finish their details to start the scope.`;
  if (client) return `${name} is already your client. Open them to scope this request.`;
  if (workflow.status === "dismissed") return `Dismissed${changed ? ` ${changed}` : ""}. Move it back to new if they write again.`;
  if (!conversionAvailable) return `${name} asked ${xaDayPhrase(lead.submittedAt)}. Adding clients from here isn't open yet, so use Add a client in the sidebar.`;
  if (workflow.status === "contacted") return `Marked contacted${changed ? ` ${changed}` : ""}. Add ${name} as a client once you agree on scope and a deadline.`;
  return `${name} asked ${xaDayPhrase(lead.submittedAt)} and hasn't heard back yet. Add them as a client to start the scope.`;
}

function LeadDetail({ row, snapshot, agencyWorkspaceId, disabled, message, client, onBack, onStatus, onConvert, onNote, formRef }: {
  row: LeadRow; snapshot: Snapshot; agencyWorkspaceId: string; disabled: boolean; message: string; client?: KnownClient;
  onBack: () => void; onStatus: (status: "new" | "contacted" | "dismissed") => void; onConvert: () => void; onNote: (note: string) => void;
  formRef: (node: HTMLFormElement | null) => void;
}) {
  const { lead, workflow, legacyOwnership } = row;
  const token = lead.statusToken;
  const status = workflow.status;
  const contact = [lead.email, lead.phone, lead.location].filter(Boolean).join(" · ");
  const canConvert = snapshot.conversionAvailable && status !== "converted" && !client;
  const addClientHref = `/workspace/agency/clients/new?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`;
  const primary = client && status !== "converted" ? <XaButtonLink variant="primary" href={client.href}>Open {client.name}</XaButtonLink>
    : status === "converting" && snapshot.conversionAvailable
      ? disabled ? <XaButton variant="primary" disabled>Continue adding client</XaButton> : <XaButtonLink variant="primary" href={handoff(agencyWorkspaceId, token)}>Continue adding client</XaButtonLink>
      : <XaButton variant="primary" disabled={disabled || !canConvert} onClick={onConvert}>Add as client</XaButton>;
  return <section className={styles.detail} aria-label={`Service request from ${lead.businessName}`}>
    <span className={styles.backToList}><XaTextLink onClick={onBack}>Back to service requests</XaTextLink></span>
    <header className={styles.detailHead}>
      <XaInitial name={lead.businessName} shape="round" size={40} />
      <div className={styles.detailWho}>
        <h2 className={styles.detailName}>{lead.businessName}</h2>
        <span className={styles.detailMeta}>{contact}</span>
      </div>
    </header>
    <div className={styles.detailBody}>
      {lead.description ? <p className={styles.bubble}>{lead.description}</p> : <p className={styles.quiet}>They didn&apos;t write what they need.</p>}
      <XaAnswers labelWidth={150} rows={[
        ["Asked", <time key="r" dateTime={lead.submittedAt}>{xaShortDate(lead.submittedAt)}</time>],
        ...(lead.currentWebsite ? [["Their website now", lead.currentWebsite] as const] : []),
        ...(legacyOwnership ? [["Came in", `Before ${snapshot.agency.name}'s requests were kept separately`] as const] : []),
      ]} />
      {workflow.note ? <div className={styles.stack}><p className={styles.quiet}>Notes</p><p className={`${styles.body} ${styles.pre}`}>{workflow.note}</p></div> : null}
      <form className={styles.stack} ref={formRef} onSubmit={event => {
        event.preventDefault(); if (disabled) return;
        const note = String(new FormData(event.currentTarget).get("note") || "").trim();
        if (note && note.length <= 2000) onNote(note);
      }}>
        <XaTextArea name="note" label={`Add a note for ${lead.businessName}`} hint="Notes stay with this request. Up to 2,000 characters." maxLength={2000} required rows={3} disabled={disabled} />
        <span><XaButton type="submit" size="sm" disabled={disabled}>Add note</XaButton></span>
      </form>
    </div>
    <div className={styles.speaks} role={message ? "status" : undefined}>
      <XaPebbleAvatar size={32} />
      <p>{message ? `${message} ` : null}{leadSentence(row, snapshot.conversionAvailable, client)}{!snapshot.conversionAvailable && !client && status !== "converted" ? <> <XaTextLink href={addClientHref}>Add a client</XaTextLink></> : null}</p>
    </div>
    <footer className={styles.detailFoot}>
      {primary}
      {status === "new" ? <XaButton disabled={disabled} onClick={() => onStatus("contacted")}>Mark contacted</XaButton>
        : status === "contacted" || status === "dismissed" ? <XaButton disabled={disabled} onClick={() => onStatus("new")}>Mark new</XaButton> : null}
      {status !== "converted" && status !== "dismissed" ? <XaButton variant="quiet" disabled={disabled} onClick={() => onStatus("dismissed")}>Dismiss</XaButton> : null}
    </footer>
  </section>;
}
