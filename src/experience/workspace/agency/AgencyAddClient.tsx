"use client";

import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  XaAnswers, XaButton, XaButtonLink, XaField, XaHeadline, XaInitial, XaLabel, XaPebbleAvatar, XaRow, XaRows, XaSegmented, XaStatus, XaSystemTile, XaTextLink, XaWorking,
} from "@/components/ui/strelva/Xa";
import { AgencyFrame } from "./AgencyFrame";
import styles from "./agency-door.module.css";
import type { AddAgencyClientInput, AddAgencyClientResult, AgencyClientListItem, ClientAiCheck, OwnerClaim } from "@/products/agency-clients/contracts";
import { addAgencyClientInputSchema, agencyClientAdditionSchema, agencyClientListItemSchema, ownerClaimDeliveryCopy, ownerClaimSchema } from "@/products/agency-clients/contracts";

/**
 * An agency adds a client (#259). The agency names a website or picks one of
 * its prospects; `POST /api/workspace/agency-clients` creates the business
 * with the agency's provider seat, seeds unconfirmed facts, saves an AI
 * Visibility check in the agency and, given the owner's address, returns the owner claim link once. Nothing is
 * emailed during the silent rollout (decision R08): the agency copies the link.
 *
 * XA · A4 (the form, with what adding does beside it) and A5 (the client is on
 * Strelva; the claim link is the one object on the page). Every read and write
 * above is unchanged; only the presentation moved to the XA kit.
 */

interface Prospect { id: string; business: string; url: string | null; name: string; email: string; grade: string; score: number }
interface InitialLead { token: string; businessName: string; email: string; currentWebsite: string | null }

class RequestError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => {
    if (response.ok) throw new Error(fallback);
    return {};
  }) as { error?: unknown; code?: unknown };
  if (!response.ok) throw new RequestError(response.status, typeof body.error === "string" ? body.error : fallback, typeof body.code === "string" ? body.code : undefined);
  return body as T;
}

async function readClients(agencyWorkspaceId: string, signal?: AbortSignal) {
  const body = await readJson<{ clients: AgencyClientListItem[] }>(await fetch(`/api/workspace/agency-clients/added?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`, { cache: "no-store", signal }), "Your clients couldn’t be loaded.");
  const parsed = agencyClientListItemSchema.array().safeParse(body.clients);
  if (!parsed.success || parsed.data.some(client => client.agencyWorkspaceId !== agencyWorkspaceId)) throw new Error("Your client list could not be confirmed. Refresh to check it again.");
  return parsed.data;
}

const FACT_LABELS: Record<string, string> = { phone: "Phone", email: "Email", address: "Address" };

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function absolute(path: string) {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

function currentOwnerClaim(claim: OwnerClaim | null, client?: AgencyClientListItem) {
  return claim && Date.parse(claim.expiresAt) > Date.now() && (!client || client.pendingClaim?.claimId === claim.claimId) ? claim : null;
}

/** The route's frame: the agency's shell and sidebar around the add-client task. */
export function AgencyAddClientFrame({ agencyWorkspaceId, agencyName, children }: { agencyWorkspaceId: string; agencyName?: string; children: ReactNode }) {
  return <AgencyFrame agencyWorkspaceId={agencyWorkspaceId} agencyName={agencyName ?? "Your agency"} title="Add a client" active="clients">{children}</AgencyFrame>;
}

export function AgencyAddClient({ agencyWorkspaceId, agencyName = "your agency", prospecting, initialProspectId, initialClientId = null, initialLead, initialConversion, conversionHeld = false, convertedBusinessWorkspaceId, emailEnabled = false }: {
  emailEnabled?: boolean; agencyWorkspaceId: string; agencyName?: string; prospecting: boolean; initialProspectId: string | null; initialClientId?: string | null; initialLead?: InitialLead;
  initialConversion?: AddAgencyClientInput | null; conversionHeld?: boolean; convertedBusinessWorkspaceId?: string;
}) {
  const [source, setSource] = useState<"url" | "prospect">(initialProspectId && prospecting ? "prospect" : "url");
  const [url, setUrl] = useState(initialConversion ? initialConversion.url ?? "" : initialLead?.currentWebsite ?? "");
  const [name, setName] = useState(initialConversion ? initialConversion.name ?? "" : initialLead?.businessName.slice(0, 120) ?? "");
  const [sendOwnerEmail, setSendOwnerEmail] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState(initialConversion ? initialConversion.ownerEmail ?? "" : initialLead?.email ?? "");
  const [prospectId, setProspectId] = useState<string | null>(initialProspectId);
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [prospectError, setProspectError] = useState("");
  const [clientRead, setClientRead] = useState<{ workspaceId: string; clients: AgencyClientListItem[] | null; error: string; loading: boolean }>({ workspaceId: agencyWorkspaceId, clients: null, error: "", loading: true });
  const clientReadAttempt = useRef(0);
  const clients = clientRead.workspaceId === agencyWorkspaceId ? clientRead.clients : null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [result, setResult] = useState<AddAgencyClientResult | null>(null);
  // One key per intended add, so a retry after a lost response replays instead of adding twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => initialConversion?.idempotencyKey ?? crypto.randomUUID());
  const submittedBody = useRef<string | null>(initialConversion ? JSON.stringify(initialConversion) : null);
  const submittingNow = useRef(false);
  const [requestHeld, setRequestHeld] = useState(Boolean(initialConversion));
  const [listAttempt, setListAttempt] = useState(0);
  // The Queue links here with a client already chosen, so its fresh owner link form starts open.
  const [openClientId, setOpenClientId] = useState<string | null>(initialClientId);
  const id = useId().replace(/:/g, "");
  const agencyHref = `/workspace?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`;

  const loadClients = useCallback(async (signal?: AbortSignal) => {
    const attempt = ++clientReadAttempt.current;
    setClientRead(current => ({ workspaceId: agencyWorkspaceId, clients: current.workspaceId === agencyWorkspaceId ? current.clients : null, error: current.workspaceId === agencyWorkspaceId ? current.error : "", loading: true }));
    try {
      const loaded = await readClients(agencyWorkspaceId, signal);
      if (signal?.aborted || attempt !== clientReadAttempt.current) return;
      setClientRead({ workspaceId: agencyWorkspaceId, clients: loaded, error: "", loading: false });
    } catch (cause) {
      if (signal?.aborted || attempt !== clientReadAttempt.current) return;
      if (cause instanceof RequestError && cause.status === 401) setSignedOut(true);
      setClientRead(current => ({ ...current, error: cause instanceof Error ? cause.message : "Your clients couldn’t be loaded.", loading: false }));
    }
  }, [agencyWorkspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadClients(controller.signal);
    return () => controller.abort();
  }, [loadClients, listAttempt]);

  useEffect(() => {
    if (!prospecting) return;
    const controller = new AbortController();
    fetch(`/api/workspace/prospects?workspace=${encodeURIComponent(agencyWorkspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => readJson<{ prospects: Prospect[] }>(response, "Your prospects couldn’t be loaded."))
      .then((body) => {
        setProspects(body.prospects);
        // Arriving from a prospect's "Add as client": its contact is the likely owner.
        const linked = body.prospects.find((prospect) => prospect.id === initialProspectId);
        if (linked) setOwnerEmail((current) => current || linked.email);
      })
      .catch((cause) => { if (!controller.signal.aborted) { setProspects([]); setProspectError(cause instanceof Error ? cause.message : "Your prospects couldn’t be loaded."); } });
    return () => controller.abort();
  }, [agencyWorkspaceId, prospecting, initialProspectId]);

  const added = new Set((clients ?? []).map((client) => client.prospectId).filter(Boolean));
  const chosen = prospects?.find((prospect) => prospect.id === prospectId) ?? null;

  function choose(prospect: Prospect) {
    setProspectId(prospect.id);
    setOwnerEmail(prospect.email);
    setError("");
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submittingNow.current || conversionHeld) return;
    const isReplay = submittedBody.current !== null;
    if (!submittedBody.current && source === "url" && !url.trim() && !(initialLead && name.trim())) { setError(initialLead ? "Enter the business name or website." : "Enter the business’s website."); return; }
    if (source === "prospect" && !prospectId) { setError("Choose a prospect."); return; }
    if (!submittedBody.current) {
      const input = addAgencyClientInputSchema.safeParse({
        action: "add", agencyWorkspaceId, idempotencyKey,
        ...(source === "url" ? (url.trim() ? { url: url.trim() } : {}) : { prospectId }),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(ownerEmail.trim() ? { ownerEmail: ownerEmail.trim(), ...(emailEnabled && sendOwnerEmail ? { sendOwnerEmail: true } : {}) } : {}),
        ...(initialLead ? { leadToken: initialLead.token } : {}),
      });
      if (!input.success) { setError("Check the business name, website and owner email."); return; }
      submittedBody.current = JSON.stringify(input.data);
    }
    submittingNow.current = true;
    setRequestHeld(true);
    setSubmitting(true); setError("");
    try {
      const body = await readJson<AddAgencyClientResult>(await fetch("/api/workspace/agency-clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: submittedBody.current,
      }), "The client couldn’t be added.");
      const client = agencyClientAdditionSchema.safeParse(body.client);
      if (!client.success || client.data.agencyWorkspaceId !== agencyWorkspaceId
        || !body.scan || !Array.isArray(body.scan.seeded) || !body.website || typeof body.website.rebuildOpenToAgency !== "boolean"
        || (initialLead && !["converted", "unconfirmed"].includes(body.leadConversion?.status ?? ""))) {
        throw new Error("The client result could not be confirmed.");
      }
      setResult(body);
      void loadClients();
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) { setSignedOut(true); return; }
      const uncertain = !(cause instanceof RequestError) || cause.status >= 500;
      if (!uncertain && !isReplay && (!initialLead || (cause instanceof RequestError && cause.code === "agency_client_invalid"))) { submittedBody.current = null; setRequestHeld(false); }
      setError(`${uncertain ? "Outcome not confirmed. Retry this same request before starting another client. " : ""}${cause instanceof Error && cause.message ? cause.message : "The client couldn’t be added."}`);
    } finally {
      submittingNow.current = false;
      setSubmitting(false);
    }
  }

  function another() {
    if (initialLead) return;
    submittedBody.current = null; setRequestHeld(false);
    setResult(null); setUrl(""); setName(""); setOwnerEmail(""); setProspectId(null); setError("");
    setIdempotencyKey(crypto.randomUUID());
    // The owner may have claimed a client meanwhile; show the list as it is now.
    setListAttempt((value) => value + 1);
  }

  // The agency frame (shell and sidebar) is the route's: see AgencyAddClientFrame.
  const frame = (_title: string, children: ReactNode) => children;

  if (signedOut) {
    return frame("Add a client", <section className={styles.addPage}><div className={styles.addLead}>
      <XaHeadline quiet="Use the account you run your agency with. You come straight back here.">Sign in to add a client.</XaHeadline>
      <div><XaButtonLink variant="primary" size="lg" href={`/sign-in?next=${encodeURIComponent(`/workspace/agency/clients/new?${new URLSearchParams({ workspaceId: agencyWorkspaceId, ...(initialLead ? { leadToken: initialLead.token } : {}) })}`)}`}>Sign in</XaButtonLink></div>
    </div></section>);
  }

  const shownName = name.trim() || (source === "prospect" ? chosen?.business ?? "" : "");
  const site = siteLabel(url);
  const list = <ClientList agencyWorkspaceId={agencyWorkspaceId} emailEnabled={emailEnabled} openClientId={openClientId} onOpen={setOpenClientId} onClaimed={() => void loadClients()} clients={clients} error={clientRead.workspaceId === agencyWorkspaceId ? clientRead.error : ""} loading={clientRead.workspaceId !== agencyWorkspaceId || clientRead.loading} onRetry={() => setListAttempt((value) => value + 1)} />;

  if (conversionHeld) return frame("Add a client", <section className={styles.addPage} aria-labelledby={`${id}-held-title`}><div className={styles.addLead}>
    <XaHeadline id={`${id}-held-title`} quiet={<span role="status">{convertedBusinessWorkspaceId ? "The client business was created. Open it to continue." : "The person who started this conversion must confirm its outcome before another client can be added."}</span>}>{convertedBusinessWorkspaceId ? "This lead is already a client." : "This lead’s conversion is held."}</XaHeadline>
    <div className={styles.addActions}>
      {convertedBusinessWorkspaceId ? <XaButtonLink variant="primary" size="lg" href={`/workspace?workspaceId=${encodeURIComponent(convertedBusinessWorkspaceId)}`}>Open client workspace</XaButtonLink> : null}
      <XaTextLink href={`/workspace/leads?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`}>Back to leads</XaTextLink>
    </div>
  </div>{list}</section>);

  if (result) return frame(result.client.name, <section className={styles.addPage}>
    <AddedClient emailEnabled={emailEnabled} result={result} agencyWorkspaceId={agencyWorkspaceId} onAnother={another} allowAnother={!initialLead} agencyHref={agencyHref} currentClient={clients?.find(client => client.customerWorkspaceId === result.client.customerWorkspaceId)} onClaim={(claim) => { setResult({ ...result, ownerClaim: claim, ownerClaimError: null }); void loadClients(); }}
      leadNote={result.leadConversion ? <div role="status" className={styles.sentenceBlock}>
        <p className={styles.sentence}>{result.leadConversion.status === "converted" ? "Lead converted. The client business was created." : result.leadConversion.message ?? "The client was added, but its lead status has not been confirmed."}</p>
        <p className={styles.links}>
          {result.leadConversion.status === "unconfirmed" ? <XaButton size="sm" onClick={() => void submit()} disabled={submitting}>{submitting ? "Confirming conversion" : "Confirm lead conversion"}</XaButton> : null}
          <XaTextLink href={`/workspace/leads?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`}>Back to leads</XaTextLink>
        </p>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </div> : null} />
    {list}
  </section>);

  return frame("Add a client", <section className={styles.addPage} aria-labelledby={`${id}-title`}>
    <div className={styles.addSplit}>
      <div className={styles.addLead}>
        <XaHeadline id={`${id}-title`} quiet={initialLead ? "Check the details from this lead. Adding their business confirms the conversion." : "Their business, owned by them. You work inside it."}>Add a client.</XaHeadline>
        <form onSubmit={submit} className={styles.addForm} noValidate aria-busy={submitting || undefined}>
          {prospecting && !initialLead ? <XaSegmented label="Where this client comes from" value={source} onChange={(value) => { if (requestHeld) return; setSource(value); setError(""); }}
            options={[{ value: "url", label: "Their website", disabled: requestHeld }, { value: "prospect", label: "Someone who ran your check", disabled: requestHeld }]} /> : null}
          <fieldset disabled={requestHeld || submitting} className={styles.fields}>
            <legend className="sr-only">Client details</legend>
            {source === "url"
              ? <XaField label="Their website" type="url" inputMode="url" autoComplete="url" autoFocus required={!initialLead} maxLength={2048} placeholder="harbordental.com" value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} hint={initialLead ? "Optional. A business can be added before it has a website." : undefined} />
              : <ProspectPicker prospects={prospects} error={prospectError} added={added} value={prospectId} onChoose={choose} />}
            <XaField label="Business name" autoComplete="organization" required={Boolean(initialLead)} maxLength={120} placeholder={source === "prospect" && chosen ? chosen.business : "Read from their site if left blank"} value={name} onChange={(event) => setName(event.target.value)} />
            <XaField label="Owner’s email" type="email" autoComplete="email" maxLength={254} placeholder="owner@business.com" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} hint="For their claim link. Copy and share it after adding the client." />
            {emailEnabled ? <label className={styles.check}><input type="checkbox" checked={sendOwnerEmail} onChange={event => setSendOwnerEmail(event.target.checked)} />Email this owner their claim link if email is permitted</label> : null}
          </fieldset>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          {requestHeld && !submitting ? <p role="status" className={styles.sentence}>This request is held with its original details. Retrying checks the same client addition.</p> : null}
          <div><XaButton type="submit" variant="primary" size="lg" busy={submitting}>{submitting ? "Adding client" : requestHeld ? "Confirm client addition" : shownName ? `Add ${shownName}` : "Add client"}</XaButton></div>
        </form>
      </div>
      <aside className={styles.object} aria-label="What adding a client does">
        {submitting ? <XaWorking title={site ? `Reading ${site}` : `Adding ${shownName || "the client"}`} steps={[{ id: "add", label: site ? `Adding ${shownName || "the business"} and reading its pages` : `Adding ${shownName || "the business"}`, state: "active" }]} />
          : <p className={styles.objectHead}><XaStatus kind="draft" size="sm">{site ? `Reads ${site} when you add it` : "Reads their site when you add it"}</XaStatus><span className={styles.objectMeta}>Nothing is sent</span></p>}
        <hr className={styles.rule} />
        <XaAnswers labelWidth={96} rows={[
          ["Owner", <>The owner owns the business and its data.</>],
          ["You", <>Work inside it with the access the owner gives. Until they claim it, nothing you prepare goes live.</>],
          ["Their site", <>Keeps running the whole time. Nothing on it changes.</>],
          ["Their details", <>Read from the site and marked unconfirmed until the owner confirms them.</>],
        ]} />
        {!initialLead && source === "url" ? <p className={styles.objectNote}>Strelva also runs an AI Visibility check, saved in {agencyName}.</p> : null}
      </aside>
    </div>
    {list}
  </section>);
}

function siteLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try { return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function ProspectPicker({ prospects, error, added, value, onChoose }: { prospects: Prospect[] | null; error: string; added: Set<string | null>; value: string | null; onChoose: (prospect: Prospect) => void }) {
  const labelId = useId();
  if (prospects === null) return <p role="status" className={styles.sentence}><Loader2 className="mr-2 inline size-4 motion-safe:animate-spin" aria-hidden="true" />Loading your prospects</p>;
  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  if (!prospects.length) return <p className={styles.sentence}>No prospects yet. People who run your agency’s check show up here.</p>;
  return <fieldset className={styles.prospects}>
    <legend id={labelId} className={styles.fieldLegend}>Prospect</legend>
    <ul aria-labelledby={labelId}>
      {prospects.map((prospect) => {
        const isAdded = added.has(prospect.id);
        return <li key={prospect.id}>
          <label className={styles.prospect} data-added={isAdded || undefined}>
            <input type="radio" name="prospect" checked={value === prospect.id} disabled={isAdded} onChange={() => onChoose(prospect)} />
            <span className={styles.prospectText}><strong>{prospect.business}</strong><small>{prospect.url ?? "No website given"} · {prospect.name}</small></span>
            <span className={styles.prospectMeta}>{isAdded ? "Added" : `${prospect.grade} · ${prospect.score}`}</span>
          </label>
        </li>;
      })}
    </ul>
  </fieldset>;
}

/**
 * XA · A5. The client is on Strelva: what the agency does next with their site
 * on the left, and the owner's claim link as the page's one object on the
 * right. A prepared link is not an approval, an accepted claim or a launch, so
 * nothing here is shown as done that the server did not say is done.
 */
export function AddedClient({ emailEnabled = false, result, agencyWorkspaceId, agencyHref, onAnother, allowAnother = true, onClaim, currentClient, leadNote }: { emailEnabled?: boolean; currentClient?: AgencyClientListItem; result: AddAgencyClientResult; agencyWorkspaceId: string; agencyHref: string; onAnother: () => void; allowAnother?: boolean; onClaim: (claim: OwnerClaim) => void; leadNote?: ReactNode }) {
  const id = useId().replace(/:/g, "");
  const { client, scan } = result;
  const ownerClaim = currentOwnerClaim(result.ownerClaim, currentClient);
  const claimed = currentClient?.ownerClaimed === true;
  const rebuildOpen = result.website.rebuildOpenToAgency;
  const ownerState = claimed ? "Owner claimed the business" : currentClient ? "Owner has not claimed the business" : "Owner claim not yet checked";
  const handoff = rebuildOpen ? "Ready for a website draft" : claimed ? "Owner claimed the business" : "Waiting for the owner to claim the business";
  const source = siteLabel(client.sourceUrl ?? "");
  return <div className={styles.addSplit}>
    <section className={styles.addLead} aria-labelledby={`${id}-title`}>
      <XaInitial name={client.name} size={64} />
      <XaHeadline id={`${id}-title`} quiet={claimed ? "Its owner claimed it. You work inside the access they gave." : "It becomes the owner’s when they claim it."}>{client.name} is on Strelva.</XaHeadline>
      <p className={styles.sentence} role="status"><span className="sr-only">Client added. </span>{ownerState}{currentClient?.seatActive === false ? " · Agency seat ended" : ""}{client.replayed ? " · this client was already added, nothing was added twice" : ""}.</p>

      <div className={styles.block}>
        <XaLabel as="h2">{handoff}</XaLabel>
        <XaRows label="Their website">
          <XaRow lead={<XaSystemTile kind="website" size={40} />} title="Connect the site they have" detail="One script tag. Their site stays where it is; forms and facts flow into Strelva." meta="Connect" href={result.website.connect} />
          {rebuildOpen
            ? <XaRow lead={<XaPebbleAvatar size={40} />} title="Rebuild it on Strelva" detail="A private draft from their current pages, for the owner to review. Nothing goes live from a draft." meta="Start website draft" href={result.website.rebuild} />
            : <XaRow lead={<XaPebbleAvatar size={40} />} title="Rebuild it on Strelva" detail="Agency rebuilding is not available here yet. The owner can start the draft in their business after accepting the claim." />}
        </XaRows>
        {!rebuildOpen ? <p className={styles.sentence}>{claimed
          ? <XaTextLink href={`/workspace?workspaceId=${encodeURIComponent(client.customerWorkspaceId)}`}>Open client workspace</XaTextLink>
          : <XaTextLink href="#owner-link-title">{ownerClaim ? "Share owner claim link" : "Prepare owner claim link"}</XaTextLink>}</p> : null}
      </div>

      {result.aiCheck ? <AgencyClientAiCheck check={result.aiCheck} /> : null}
      {leadNote}

      <div className={styles.addActions}>
        {allowAnother ? <XaButton onClick={onAnother}><RefreshCw className="size-4" aria-hidden="true" />Add another client</XaButton> : null}
        <XaTextLink href={agencyHref}>Back to clients</XaTextLink>
      </div>
    </section>

    <div className={styles.objectColumn}>
      <OwnerLink emailEnabled={emailEnabled} subject={{ customerWorkspaceId: result.client.customerWorkspaceId, ownerClaim: result.ownerClaim, ownerClaimError: result.ownerClaimError }} agencyWorkspaceId={agencyWorkspaceId} onClaim={onClaim} currentClient={currentClient} primary
        found={<section aria-label="Details from their site" className={styles.found}>
          <XaLabel as="h2">{source ? `Read from ${source}` : "Details from their site"}</XaLabel>
          {scan.status === "scanned" && scan.seeded.length
            ? <dl className={styles.facts}>{scan.seeded.map((key) => <div key={key}><dt>{FACT_LABELS[key] ?? key}</dt><dd>Unconfirmed</dd></div>)}</dl>
            : <p className={styles.sentence}>{scan.status === "unreachable" ? scan.message : scan.status === "scanned" ? "We didn’t find a phone, email or address on their site." : "No website given, so nothing was read."} The owner can add details when they sign in.</p>}
          <p className={styles.objectNote}>{client.factsSeeded} {client.factsSeeded === 1 ? "detail" : "details"} on the business record, including its name. Only the owner confirms them.</p>
        </section>} />
    </div>
  </div>;
}

/** Uses the existing private assessment work page for the full result. */
export function AgencyClientAiCheck({ check }: { check: ClientAiCheck }) {
  if (check.status === "not_requested") return <section className={styles.block} aria-label="AI Visibility check"><XaLabel as="h2">AI Visibility check</XaLabel><p className={styles.sentence}>No website given, so no AI check was requested.</p></section>;
  return <section className={styles.block} aria-label="AI Visibility check">
    <XaLabel as="h2">AI Visibility check</XaLabel>
    {check.status === "ready" ? <>
      {check.result.measurementStatus !== "unavailable" && check.result.readinessMeasured !== false ? <p className={styles.grade}>{check.result.grade} · {check.result.score}/100</p> : null}
      {check.result.measurementNote ? <p className={styles.sentence}>{check.result.measurementNote}</p> : null}
      <p className={styles.sentence}>{check.result.citation.note} {check.result.citation.probed ? "Probe completed." : "Probe not completed."}</p>
      <p className={styles.sentenceStrong}>{check.result.topFix}</p>
    </> : <p className={styles.sentence} role="status">{check.message}</p>}
    <p><XaTextLink href={check.href}>{check.status === "ready" ? "Open saved AI check" : "Open agency saved work"}</XaTextLink></p>
  </section>;
}

interface OwnerLinkSubject { customerWorkspaceId: string; ownerClaim: OwnerClaim | null; ownerClaimError: string | null }

/** The one place an owner link is made, whether the client was just added or added earlier. */
/**
 * The one place an owner link is made. `primary` marks it as the page's one
 * object (A5): its main button is then the ink pill. Inside the client list it
 * stays secondary, so the page keeps one primary.
 */
function OwnerLink({ subject, agencyWorkspaceId, onClaim, currentClient, emailEnabled, headingId = "owner-link-title", primary = false, found }: { emailEnabled: boolean; currentClient?: AgencyClientListItem; subject: OwnerLinkSubject; agencyWorkspaceId: string; onClaim: (claim: OwnerClaim) => void; headingId?: string; primary?: boolean; found?: ReactNode }) {
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(subject.ownerClaimError ?? "");
  const [copied, setCopied] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(Boolean(subject.ownerClaimError));
  const [reconciled, setReconciled] = useState<{ source: AgencyClientListItem | undefined; client: AgencyClientListItem } | null>(null);
  const latestClient = reconciled && reconciled.source === currentClient ? reconciled.client : currentClient;
  const ownerClaimed = latestClient?.ownerClaimed ?? false;
  const issuedClaim = subject.ownerClaim;
  const claim = currentOwnerClaim(issuedClaim, latestClient);
  const link = claim ? absolute(claim.claimPath) : "";

  async function reconcile() {
    const loaded = await readClients(agencyWorkspaceId);
    const client = loaded.find(item => item.customerWorkspaceId === subject.customerWorkspaceId);
    if (!client) throw new Error("This client’s owner claim could not be checked. Refresh before creating a link.");
    setReconciled({ source: currentClient, client });
    if (!client.seatActive && !client.ownerClaimed) throw new Error("Your agency seat ended. No new owner link can be created.");
    setNeedsCheck(false);
    return client;
  }

  async function refresh() {
    setBusy(true);
    try { await reconcile(); setError(""); }
    catch (cause) { setNeedsCheck(true); setError(cause instanceof Error ? cause.message : "The owner claim could not be checked."); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || needsCheck) return;
    if (!email.trim()) { setError("Enter the owner’s email."); return; }
    setBusy(true); setError("");
    let issuing = false;
    try {
      // This read never replays a write. A newly discovered claim needs a
      // separate, explicitly labelled replacement action from the agency.
      const current = await reconcile();
      if (current.ownerClaimed) return;
      if (current.pendingClaim?.claimId !== latestClient?.pendingClaim?.claimId) {
        setError("The owner claim changed. Review the current claim before replacing its link.");
        return;
      }
      issuing = true;
      const body = await readJson<{ ownerClaim: OwnerClaim }>(await fetch("/api/workspace/agency-clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "owner_link", agencyWorkspaceId, customerWorkspaceId: subject.customerWorkspaceId, ownerEmail: email.trim(), ...(emailEnabled && sendEmail ? { sendEmail: true } : {}) }),
      }), "The owner link couldn’t be created.");
      if (!ownerClaimSchema.safeParse(body.ownerClaim).success || body.ownerClaim.customerWorkspaceId !== subject.customerWorkspaceId || !/^\/workspace\/claim\/[A-Za-z0-9_-]+$/.test(body.ownerClaim.claimPath)) throw new Error("The issued owner link could not be confirmed.");
      setReconciled(null);
      onClaim(body.ownerClaim);
    } catch (cause) {
      setNeedsCheck(true);
      setError(`${issuing ? "Outcome not confirmed. Refresh the owner claim before creating or replacing a link. " : ""}${cause instanceof Error && cause.message ? cause.message : "The owner link couldn’t be created."}`);
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!currentOwnerClaim(issuedClaim, latestClient)) { setError("The owner link is no longer current. Create a fresh link before sharing."); return; }
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2400); }
    catch { setError("Copy didn’t work here. Select the link and copy it."); }
  }

  const variant = primary ? "primary" : "secondary";
  const delivery = claim ? ownerClaimDeliveryCopy(claim.delivery) : null;
  return <aside className={styles.object} data-flat={primary ? undefined : true} aria-labelledby={headingId}>
    <p className={styles.objectHead}>
      <span id={headingId} className={styles.objectTitle}>{ownerClaimed ? <XaStatus kind="live" size="sm">Owner claimed</XaStatus> : <XaStatus kind="waits" size="sm">Owner claim link{claim ? ` for ${claim.recipientEmail}` : ""}</XaStatus>}</span>
      {claim && claim.delivery.status !== "accepted" ? <span className={styles.objectMeta}>Not sent</span> : null}
    </p>
    {ownerClaimed ? <p className={styles.sentence} role="status">The owner has accepted their claim. No new owner link is needed.</p> : claim ? <>
      <p className={styles.sentenceStrong}>{claim.delivery.status === "accepted" ? "Email accepted for delivery. You can also share the link yourself." : "Nothing sends by itself. Share it the way you already talk to the owner."}</p>
      <p className={styles.sentence}>The recipient signs in with {claim.recipientEmail} and accepts to become the owner.</p>
      <div className={styles.linkRow}>
        <label htmlFor={`${headingId}-value`} className="sr-only">Owner claim link</label>
        <input id={`${headingId}-value`} readOnly value={link} onFocus={(event) => event.currentTarget.select()} className={styles.linkField} />
        <XaButton variant={variant} onClick={() => void copy()}>{copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{copied ? "Copied" : "Copy link"}</XaButton>
      </div>
      <p className={styles.objectNote} role="status">{delivery!.headline} {delivery!.next} Works until {dateLabel(claim.expiresAt)}. The link is shown once. Making a new one replaces it.</p>
    </> : <form onSubmit={create} noValidate className={styles.fields}>
      <p className={styles.sentence}>{issuedClaim ? "The previously shown owner link is no longer current. Create a fresh link for the owner." : "Make a link for the owner to take their business."} Copy and share it yourself{emailEnabled ? ", or ask Strelva to email it when that is allowed" : ""}.</p>
      {latestClient?.pendingClaim ? <p className={styles.sentence}>An owner claim is pending for {latestClient.pendingClaim.recipientEmail}, until {dateLabel(latestClient.pendingClaim.expiresAt)}. Replacing its link ends the previous link.</p> : null}
      <XaField label="Owner’s email" type="email" autoComplete="email" maxLength={254} disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); if (!needsCheck) setError(""); }} />
      {emailEnabled ? <label className={styles.check}><input type="checkbox" disabled={busy} checked={sendEmail} onChange={event => setSendEmail(event.target.checked)} />Email the owner this new link if permitted</label> : null}
      <XaButton type="submit" variant={variant} block busy={busy} disabled={needsCheck || latestClient?.seatActive === false}>{latestClient?.pendingClaim ? "Replace pending owner link" : "Create owner link"}</XaButton>
    </form>}
    <p className={styles.links}><XaTextLink onClick={() => { if (!busy) void refresh(); }}>Refresh owner claim</XaTextLink></p>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {found ? <><hr className={styles.rule} />{found}</> : null}
  </aside>;
}

function claimStatus(client: AgencyClientListItem): string {
  if (!client.seatActive) return "Seat ended";
  if (client.ownerClaimed) return "Owner signed in";
  const claim = client.pendingClaim;
  if (!claim) return "No owner link";
  return `${ownerClaimDeliveryCopy(claim.delivery).headline} Link for ${claim.recipientEmail}`;
}

/** A fresh link for a client added earlier; the old one was shown once and cannot be copied again. */
function ClientOwnerLink({ client, agencyWorkspaceId, emailEnabled, onClaimed }: { client: AgencyClientListItem; agencyWorkspaceId: string; emailEnabled: boolean; onClaimed: () => void }) {
  const [claim, setClaim] = useState<OwnerClaim | null>(null);
  return <OwnerLink emailEnabled={emailEnabled} agencyWorkspaceId={agencyWorkspaceId} currentClient={client} headingId={`owner-link-${client.additionId}`}
    subject={{ customerWorkspaceId: client.customerWorkspaceId, ownerClaim: claim, ownerClaimError: null }} onClaim={(issued) => { setClaim(issued); onClaimed(); }} />;
}

/** Clients this agency added, with a fresh owner link opening in place under the one it is for. */
function ClientList({ clients, error, loading, onRetry, agencyWorkspaceId, emailEnabled, openClientId, onOpen, onClaimed }: { clients: AgencyClientListItem[] | null; error: string; loading: boolean; onRetry: () => void; agencyWorkspaceId: string; emailEnabled: boolean; openClientId: string | null; onOpen: (id: string | null) => void; onClaimed: () => void }) {
  return <section className={styles.addedList} aria-labelledby="added-clients-title">
    <div className={styles.listHead}>
      <XaLabel as="h2" id="added-clients-title">Clients your agency added</XaLabel>
      <XaButton variant="quiet" size="sm" onClick={onRetry} disabled={loading}><RefreshCw className="size-3.5" aria-hidden="true" />Refresh</XaButton>
    </div>
    {loading ? <p role="status" className={styles.sentence}><Loader2 className="mr-2 inline size-4 motion-safe:animate-spin" aria-hidden="true" />{clients ? "Refreshing your agency’s clients" : "Loading your agency’s clients"}</p> : null}
    {error ? <p role="alert" className={styles.error}>{error} {clients ? "Last successful read; these clients and their claim status may have changed." : "No successful client read yet."}</p> : null}
    {clients?.length === 0 && !error && !loading ? <p className={styles.sentence}>No clients added yet.</p> : null}
    {clients?.length ? <ul className={styles.addedRows} aria-label="Clients your agency added">
      {clients.map((client) => {
        const canLink = client.seatActive && !client.ownerClaimed;
        const open = canLink && openClientId === client.customerWorkspaceId;
        const status = claimStatus(client);
        return <li key={client.additionId}>
          <div className={styles.addedRow}>
            <XaInitial name={client.name} size={32} />
            <span className={styles.addedText}><strong>{client.name}</strong><small>{client.sourceUrl ? siteLabel(client.sourceUrl) || client.sourceUrl : "No website"} · added {dateLabel(client.addedAt)}</small></span>
            <span className={styles.addedState} data-tone={client.ownerClaimed ? "live" : client.seatActive ? "waits" : undefined}>{status}</span>
            {canLink ? <XaButton size="sm" variant="quiet" aria-expanded={open} onClick={() => onOpen(open ? null : client.customerWorkspaceId)}>{open ? "Close owner link" : "New owner link"}</XaButton> : null}
          </div>
          {open ? <div className={styles.inline}><ClientOwnerLink client={client} agencyWorkspaceId={agencyWorkspaceId} emailEnabled={emailEnabled} onClaimed={onClaimed} /></div> : null}
        </li>;
      })}
    </ul> : null}
  </section>;
}
