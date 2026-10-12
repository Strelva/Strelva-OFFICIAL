"use client";

import { ArrowLeft, ArrowRight, Check, Copy, Globe2, Hammer, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { StPillLink, StTextButton } from "@/components/ui/strelva/Kit";
import { FirstClientHandoff } from "./FirstClientHandoff";
import { Tabs } from "@/components/ui/Tabs";
import { TextInput } from "@/components/ui/TextInput";
import type { AddAgencyClientInput, AddAgencyClientResult, AgencyClientListItem, ClientAiCheck, OwnerClaim } from "@/products/agency-clients/contracts";
import { addAgencyClientInputSchema, agencyClientAdditionSchema, agencyClientListItemSchema, ownerClaimSchema } from "@/products/agency-clients/contracts";

/**
 * An agency adds a client (#259). The agency names a website or picks one of
 * its prospects; `POST /api/workspace/agency-clients` creates the business
 * with the agency's provider seat, seeds unconfirmed facts, saves an AI
 * Visibility check in the agency and, given the owner's address, returns the owner claim link once. Nothing is
 * emailed during the silent rollout (decision R08): the agency copies the link.
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

export function AgencyAddClient({ agencyWorkspaceId, prospecting, initialProspectId, initialLead, initialConversion, conversionHeld = false, convertedBusinessWorkspaceId }: {
  agencyWorkspaceId: string; prospecting: boolean; initialProspectId: string | null; initialLead?: InitialLead;
  initialConversion?: AddAgencyClientInput | null; conversionHeld?: boolean; convertedBusinessWorkspaceId?: string;
}) {
  const [source, setSource] = useState<"url" | "prospect">(initialProspectId && prospecting ? "prospect" : "url");
  const [url, setUrl] = useState(initialConversion ? initialConversion.url ?? "" : initialLead?.currentWebsite ?? "");
  const [name, setName] = useState(initialConversion ? initialConversion.name ?? "" : initialLead?.businessName.slice(0, 120) ?? "");
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
        ...(ownerEmail.trim() ? { ownerEmail: ownerEmail.trim() } : {}),
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

  if (signedOut) {
    return <Shell agencyHref={agencyHref}>
      <section className="mt-16 max-w-xl">
        <h1 className="font-display text-[32px] font-medium leading-tight">Sign in to add a client.</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-gray-muted">Use the account you run your agency with. You come straight back here.</p>
        <Link href={`/sign-in?next=${encodeURIComponent(`/workspace/agency/clients/new?${new URLSearchParams({ workspaceId: agencyWorkspaceId, ...(initialLead ? { leadToken: initialLead.token } : {}) })}`)}`} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-medium text-on-accent hover:bg-accent/85">Sign in<ArrowRight className="size-4" aria-hidden="true" /></Link>
      </section>
    </Shell>;
  }

  return <Shell agencyHref={agencyHref}>
    {conversionHeld ? <section className="mt-12" aria-labelledby={`${id}-held-title`}>
      <h1 id={`${id}-held-title`} className="font-display text-[32px] font-medium leading-tight">{convertedBusinessWorkspaceId ? "This lead is already a client" : "This lead’s conversion is held"}</h1>
      <p role="status" className="mt-3 text-[14px] leading-relaxed text-gray-muted">{convertedBusinessWorkspaceId ? "The client business was created. Open it to continue." : "The person who started this conversion must confirm its outcome before another client can be added."}</p>
      {convertedBusinessWorkspaceId ? <div className="mt-6"><StPillLink href={`/workspace?workspaceId=${encodeURIComponent(convertedBusinessWorkspaceId)}`}>Open client workspace</StPillLink></div> : null}
      <StTextButton className="mt-6" href={`/workspace/leads?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`}>Back to leads</StTextButton>
    </section> : result
      ? <><AddedClient result={result} agencyWorkspaceId={agencyWorkspaceId} onAnother={another} allowAnother={!initialLead} agencyHref={agencyHref} currentClient={clients?.find(client => client.customerWorkspaceId === result.client.customerWorkspaceId)} onClaim={(claim) => { setResult({ ...result, ownerClaim: claim, ownerClaimError: null }); void loadClients(); }} />
        {result.leadConversion ? <div className="mt-6" role="status"><p className="text-[13px] text-gray-muted">{result.leadConversion.status === "converted" ? "Lead converted. The client business was created." : result.leadConversion.message ?? "The client was added, but its lead status has not been confirmed."}</p>
          {result.leadConversion.status === "unconfirmed" ? <StTextButton onClick={() => void submit()} disabled={submitting}>{submitting ? "Confirming conversion" : "Confirm lead conversion"}</StTextButton> : null}
          <StTextButton href={`/workspace/leads?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`}>Back to leads</StTextButton>
          {error ? <p role="alert" className="mt-3 text-[13px] text-critical">{error}</p> : null}
        </div> : null}</>
      : <section className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" aria-labelledby={`${id}-title`}>
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent-text">New client</p>
          <h1 id={`${id}-title`} className="mt-3 font-display text-[40px] font-medium leading-tight">Add a client</h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">{initialLead ? "Review the details from this lead. Adding their business confirms the conversion; nothing is emailed." : "Start from the website they already have, or from someone who ran your check."}</p>
          <form onSubmit={submit} className="mt-8 max-w-lg" noValidate aria-busy={submitting || undefined}>
            {prospecting && !initialLead ? <Tabs aria-label="Where this client comes from" variant="segment" value={source} onChange={(value) => { setSource(value as "url" | "prospect"); setError(""); }}
              items={[{ value: "url", label: "Website", disabled: requestHeld }, { value: "prospect", label: "Prospect", disabled: requestHeld }]} /> : null}
            <fieldset disabled={requestHeld || submitting} className="mt-6 grid min-w-0 gap-5">
              <legend className="sr-only">Client details</legend>
              {source === "url"
                ? <TextInput label="Their website" type="url" inputMode="url" autoComplete="url" autoFocus required={!initialLead} disabled={requestHeld || submitting} maxLength={2048} placeholder="northsidebakery.com" value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} helperText={initialLead ? "Optional. A business can be added before it has a website." : "We read their details and run an AI Visibility check saved in your agency. Nothing on their site changes."} />
                : <ProspectPicker prospects={prospects} error={prospectError} added={added} value={prospectId} onChoose={choose} />}
              <TextInput label="Business name" autoComplete="organization" required={Boolean(initialLead)} disabled={requestHeld || submitting} maxLength={120} placeholder={source === "prospect" && chosen ? chosen.business : "Read from their site if left blank"} value={name} onChange={(event) => setName(event.target.value)} />
              <TextInput label="Owner’s email" type="email" autoComplete="email" disabled={requestHeld || submitting} maxLength={254} placeholder="owner@business.com" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} helperText="For their claim link. Strelva doesn’t email it yet; you’ll copy it." />
            </fieldset>
            {error ? <p role="alert" className="mt-4 text-[13px] text-critical">{error}</p> : null}
            {requestHeld ? <p role="status" className="mt-4 text-[13px] text-gray-muted">This request is held with its original details. Retrying checks the same client addition.</p> : null}
            <Button type="submit" size="lg" loading={submitting} className="mt-6" icon={<ArrowRight className="size-4" />}>{submitting ? "Adding client" : requestHeld ? "Confirm client addition" : "Add client"}</Button>
          </form>
        </div>
        <ol className="self-start border-t border-gray-border text-[13px] leading-relaxed text-gray-muted lg:mt-24" aria-label="What adding a client does">
          <li className="border-b border-gray-border py-4"><strong className="block font-medium text-warm-black">Their own business on Strelva</strong>The owner owns it. Your agency works in it through its seat, never as a member.</li>
          <li className="border-b border-gray-border py-4"><strong className="block font-medium text-warm-black">Details marked unconfirmed</strong>What we read from their site waits for the owner to confirm it.</li>
          <li className="border-b border-gray-border py-4"><strong className="block font-medium text-warm-black">A claim link for the owner</strong>It keeps working while they decide. Their site keeps running if they never sign in.</li>
        </ol>
      </section>}
    <ClientList clients={clients} error={clientRead.workspaceId === agencyWorkspaceId ? clientRead.error : ""} loading={clientRead.workspaceId !== agencyWorkspaceId || clientRead.loading} onRetry={() => setListAttempt((value) => value + 1)} />
  </Shell>;
}

function Shell({ agencyHref, children }: { agencyHref: string; children: React.ReactNode }) {
  return <main data-dashboard className="min-h-dvh bg-surface-base px-6 py-12 text-warm-black md:px-8 lg:px-12">
    <div className="mx-auto max-w-[960px]">
      <a href={agencyHref} className="inline-flex min-h-11 items-center gap-2 text-[13px] text-gray-muted underline-offset-4 hover:text-warm-black hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Clients</a>
      {children}
    </div>
  </main>;
}

function ProspectPicker({ prospects, error, added, value, onChoose }: { prospects: Prospect[] | null; error: string; added: Set<string | null>; value: string | null; onChoose: (prospect: Prospect) => void }) {
  const labelId = useId();
  if (prospects === null) return <p role="status" className="flex items-center gap-2 text-[13px] text-gray-muted"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Loading your prospects</p>;
  if (error) return <p role="alert" className="text-[13px] text-critical">{error}</p>;
  if (!prospects.length) return <p className="text-[13px] leading-relaxed text-gray-muted">No prospects yet. People who run your agency’s check show up here.</p>;
  return <fieldset>
    <legend id={labelId} className="text-xs leading-4 text-gray-muted">Prospect</legend>
    <ul className="mt-2 max-h-72 divide-y divide-gray-border overflow-y-auto border-y border-gray-border" aria-labelledby={labelId}>
      {prospects.map((prospect) => {
        const isAdded = added.has(prospect.id);
        return <li key={prospect.id}>
          <label className={`flex min-h-16 items-center gap-3 px-1 py-3 ${isAdded ? "opacity-60" : "cursor-pointer hover:bg-surface"}`}>
            <input type="radio" name="prospect" className="size-4 accent-accent" checked={value === prospect.id} disabled={isAdded} onChange={() => onChoose(prospect)} />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[14px] font-medium">{prospect.business}</strong>
              <small className="mt-0.5 block truncate text-[12px] text-gray-muted">{prospect.url ?? "No website given"} · {prospect.name}</small>
            </span>
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-gray-muted">{isAdded ? "Added" : `${prospect.grade} · ${prospect.score}`}</span>
          </label>
        </li>;
      })}
    </ul>
  </fieldset>;
}

export function AddedClient({ result, agencyWorkspaceId, agencyHref, onAnother, allowAnother = true, onClaim, currentClient }: { currentClient?: AgencyClientListItem; result: AddAgencyClientResult; agencyWorkspaceId: string; agencyHref: string; onAnother: () => void; allowAnother?: boolean; onClaim: (claim: OwnerClaim) => void }) {
  const id = useId().replace(/:/g, "");
  const { client, scan } = result;
  const ownerClaim = currentOwnerClaim(result.ownerClaim, currentClient);
  return <section className="mt-12" aria-labelledby={`${id}-title`}>
    <p className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-positive"><Check className="size-4" aria-hidden="true" />Client added</p>
    <h1 id={`${id}-title`} className="mt-3 break-words font-display text-[40px] font-medium leading-tight">{client.name}</h1>
    <p className="mt-2 font-mono text-[12px] tabular-nums text-gray-muted">{currentClient?.ownerClaimed ? "Owner claimed the business" : currentClient ? "Owner has not claimed the business" : "Owner claim not yet checked"} · {currentClient?.seatActive === false ? "Agency seat ended" : "Agency client added"}{client.replayed ? " · this client was already added" : ""}</p>

    <div className="mt-8">
      <FirstClientHandoff status={result.website.rebuildOpenToAgency ? "Ready for a website draft" : currentClient?.ownerClaimed ? "Owner claimed the business" : "Waiting for the owner to claim the business"}
        detail={result.website.rebuildOpenToAgency ? "Build the private draft first. Review, ownership and a verified launch are separate steps; adding the client completes none of them." : "Agency rebuilding is not available here yet. The owner can start the draft in their business after accepting the claim."}
        draft="pending" review="pending" claim={currentClient?.ownerClaimed ? "done" : currentClient ? "pending" : "unverified"} live="pending"
        readiness="Publishing readiness has not been checked. A private draft does not put anything live."
        action={result.website.rebuildOpenToAgency
          ? <StPillLink href={result.website.rebuild}>Start website draft</StPillLink>
          : <StTextButton href={currentClient?.ownerClaimed ? `/workspace?workspaceId=${encodeURIComponent(client.customerWorkspaceId)}` : "#owner-link-title"}>{currentClient?.ownerClaimed ? "Open client workspace" : ownerClaim ? "Share owner claim link" : "Prepare owner claim link"}</StTextButton>} />
    </div>

    <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium">Website options</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">Already have a site to keep? Connect it instead. Publication still needs the current approval and publishing authority.</p>
        <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">
          <li><a href={result.website.connect} className="flex min-h-16 items-center gap-4 px-1 py-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
            <Globe2 className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
            <span className="min-w-0 flex-1"><strong className="block text-[14px] font-medium">Connect the site they have</strong><small className="mt-0.5 block text-[12px] text-gray-muted">One script tag. Their site stays where it is; forms and facts flow into Strelva.</small></span>
            <ArrowRight className="size-4 shrink-0 text-gray-muted" aria-hidden="true" />
          </a></li>
          <li>{result.website.rebuildOpenToAgency
            ? <a href={result.website.rebuild} className="flex min-h-16 items-center gap-4 px-1 py-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
              <Hammer className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="min-w-0 flex-1"><strong className="block text-[14px] font-medium">Rebuild it on Strelva</strong><small className="mt-0.5 block text-[12px] text-gray-muted">A new draft from their current pages, for the owner to review.</small></span>
              <ArrowRight className="size-4 shrink-0 text-gray-muted" aria-hidden="true" />
            </a>
            : <div className="flex min-h-16 items-center gap-4 px-1 py-4">
              <Hammer className="size-5 shrink-0 text-gray-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1"><strong className="block text-[14px] font-medium">Rebuild it on Strelva</strong><small className="mt-0.5 block text-[12px] text-gray-muted">The owner can start a rebuild once they claim the business. Agencies get this soon.</small></span>
            </div>}</li>
        </ul>

        {result.aiCheck ? <AgencyClientAiCheck check={result.aiCheck} /> : null}

        <h2 className="mt-10 text-[15px] font-medium">Details from their site</h2>
        {scan.status === "scanned" && scan.seeded.length
          ? <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border text-[13px]">
            {scan.seeded.map((key) => <li key={key} className="flex min-h-12 items-center justify-between gap-4 py-3"><span>{FACT_LABELS[key] ?? key}</span><span className="text-[12px] text-gray-muted">Unconfirmed</span></li>)}
          </ul>
          : <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">{scan.status === "unreachable" ? scan.message : scan.status === "scanned" ? "We didn’t find a phone, email or address on their site." : "No website given, so nothing was read."} The owner can add details when they sign in.</p>}
        <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">{client.factsSeeded} {client.factsSeeded === 1 ? "detail" : "details"} on the business record, including its name. Only the owner confirms them.</p>
      </div>

      <OwnerLink result={result} agencyWorkspaceId={agencyWorkspaceId} onClaim={onClaim} currentClient={currentClient} />
    </div>

    <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-gray-border pt-6">
      {allowAnother ? <Button variant="secondary" onClick={onAnother} icon={<RefreshCw className="size-4" />}>Add another client</Button> : null}
      <a href={agencyHref} className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium underline-offset-4 hover:underline">Back to clients<ArrowRight className="size-4" aria-hidden="true" /></a>
    </div>
  </section>;
}

/** Uses the existing private assessment work page for the full result. */
export function AgencyClientAiCheck({ check }: { check: ClientAiCheck }) {
  if (check.status === "not_requested") return <section className="mt-10" aria-label="AI Visibility check"><h2 className="text-[15px] font-medium">AI Visibility check</h2><p className="mt-2 text-[13px] leading-relaxed text-gray-muted">No website given, so no AI check was requested.</p></section>;
  return <section className="mt-10" aria-label="AI Visibility check">
    <h2 className="text-[15px] font-medium">AI Visibility check</h2>
    {check.status === "ready" ? <>
      {check.result.measurementStatus !== "unavailable" && check.result.readinessMeasured !== false ? <p className="mt-3 font-mono text-[14px] tabular-nums">{check.result.grade} · {check.result.score}/100</p> : null}
      {check.result.measurementNote ? <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">{check.result.measurementNote}</p> : null}
      <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">{check.result.citation.note} {check.result.citation.probed ? "Probe completed." : "Probe not completed."}</p>
      <p className="mt-2 text-[13px] leading-relaxed">{check.result.topFix}</p>
    </> : <p className="mt-2 text-[13px] leading-relaxed text-gray-muted" role="status">{check.message}</p>}
    <a href={check.href} className="mt-3 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">{check.status === "ready" ? "Open saved AI check" : "Open agency saved work"}<ArrowRight className="size-4" aria-hidden="true" /></a>
  </section>;
}

function OwnerLink({ result, agencyWorkspaceId, onClaim, currentClient }: { currentClient?: AgencyClientListItem; result: AddAgencyClientResult; agencyWorkspaceId: string; onClaim: (claim: OwnerClaim) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(result.ownerClaimError ?? "");
  const [copied, setCopied] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(Boolean(result.ownerClaimError));
  const [reconciled, setReconciled] = useState<{ source: AgencyClientListItem | undefined; client: AgencyClientListItem } | null>(null);
  const latestClient = reconciled && reconciled.source === currentClient ? reconciled.client : currentClient;
  const ownerClaimed = latestClient?.ownerClaimed ?? false;
  const issuedClaim = result.ownerClaim;
  const claim = currentOwnerClaim(issuedClaim, latestClient);
  const link = claim ? absolute(claim.claimPath) : "";

  async function reconcile() {
    const loaded = await readClients(agencyWorkspaceId);
    const client = loaded.find(item => item.customerWorkspaceId === result.client.customerWorkspaceId);
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
        body: JSON.stringify({ action: "owner_link", agencyWorkspaceId, customerWorkspaceId: result.client.customerWorkspaceId, ownerEmail: email.trim() }),
      }), "The owner link couldn’t be created.");
      if (!ownerClaimSchema.safeParse(body.ownerClaim).success || body.ownerClaim.customerWorkspaceId !== result.client.customerWorkspaceId || !/^\/workspace\/claim\/[A-Za-z0-9_-]+$/.test(body.ownerClaim.claimPath)) throw new Error("The issued owner link could not be confirmed.");
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

  return <aside className="self-start rounded-3xl border border-gray-border bg-surface p-6" aria-labelledby="owner-link-title">
    <h2 id="owner-link-title" className="text-[15px] font-medium">Owner claim link</h2>
    {ownerClaimed ? <p className="mt-2 text-[13px] leading-relaxed text-gray-muted" role="status">The owner has accepted their claim. No new owner link is needed.</p> : claim ? <>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">For {claim.recipientEmail}. The recipient signs in with that address and accepts to become the owner.</p>
      <label htmlFor="owner-link-value" className="sr-only">Owner claim link</label>
      <input id="owner-link-value" readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="mt-4 w-full min-h-10 truncate rounded-xl border border-gray-border bg-surface-inset px-4 py-2 font-mono text-[12px]" />
      <Button className="mt-3 w-full" onClick={() => void copy()} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>{copied ? "Copied" : "Copy link"}</Button>
      <p className="mt-4 text-[12px] leading-relaxed text-gray-muted" role="status"><strong className="font-medium text-warm-black">Not sent.</strong> Client email is off during the rollout, so send this yourself. Works until {dateLabel(claim.expiresAt)}.</p>
      <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">The link is shown once. Making a new one replaces it.</p>
    </> : <form onSubmit={create} noValidate className="mt-1">
      <p className="text-[13px] leading-relaxed text-gray-muted">{issuedClaim ? "The previously shown owner link is no longer current. Create a fresh link for the owner." : "Make a link for the owner to take their business."} Nothing is emailed; you send it.</p>
      {latestClient?.pendingClaim ? <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">An owner claim is pending for {latestClient.pendingClaim.recipientEmail}, until {dateLabel(latestClient.pendingClaim.expiresAt)}. Replacing its link ends the previous link.</p> : null}
      <div className="mt-4"><TextInput label="Owner’s email" type="email" autoComplete="email" maxLength={254} disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); if (!needsCheck) setError(""); }} /></div>
      <Button type="submit" className="mt-3 w-full" loading={busy} disabled={needsCheck || latestClient?.seatActive === false}>{latestClient?.pendingClaim ? "Replace pending owner link" : "Create owner link"}</Button>
    </form>}
    <StTextButton className="mt-3" onClick={() => void refresh()} disabled={busy}>Refresh owner claim</StTextButton>
    {error ? <p role="alert" className="mt-3 text-[13px] text-critical">{error}</p> : null}
  </aside>;
}

function ClientList({ clients, error, loading, onRetry }: { clients: AgencyClientListItem[] | null; error: string; loading: boolean; onRetry: () => void }) {
  return <section className="mt-16" aria-labelledby="added-clients-title">
    <div className="flex items-center justify-between gap-3">
      <h2 id="added-clients-title" className="text-[15px] font-medium">Clients your agency added</h2>
      <StTextButton onClick={onRetry} disabled={loading}><RefreshCw className="size-3.5" aria-hidden="true" />Refresh</StTextButton>
    </div>
    {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-[13px] text-gray-muted"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />{clients ? "Refreshing your agency’s clients" : "Loading your agency’s clients"}</p> : null}
    {error ? <p role="alert" className="mt-3 text-[13px] text-critical">{error} {clients ? "Last successful read; these clients and their claim status may have changed." : "No successful client read yet."}</p> : null}
    {clients?.length === 0 && !error && !loading ? <p className="mt-3 text-[13px] text-gray-muted">No clients added yet.</p> : null}
    <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">
      {clients?.map((client) => <li key={client.additionId} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3">
        <span className="min-w-0"><strong className="block truncate text-[14px] font-medium">{client.name}</strong><small className="mt-0.5 block truncate text-[12px] text-gray-muted">{client.sourceUrl ?? "No website"} · added {dateLabel(client.addedAt)}</small></span>
        <span className={`text-right text-[12px] ${client.ownerClaimed ? "text-positive" : "text-gray-muted"}`}>{!client.seatActive ? "Seat ended" : client.ownerClaimed ? "Owner signed in" : client.pendingClaim ? `Link for ${client.pendingClaim.recipientEmail}` : "No owner link"}</span>
      </li>)}
    </ul>
  </section>;
}
