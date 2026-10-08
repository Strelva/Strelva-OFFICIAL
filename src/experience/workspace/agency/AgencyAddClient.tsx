"use client";

import { ArrowLeft, ArrowRight, Check, Copy, Globe2, Hammer, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { TextInput } from "@/components/ui/TextInput";
import type { AddAgencyClientResult, AgencyClientListItem, OwnerClaim } from "@/products/agency-clients/contracts";

/**
 * An agency adds a client (#259). The agency names a website or picks one of
 * its prospects; `POST /api/workspace/agency-clients` creates the business
 * with the agency's provider seat, seeds unconfirmed facts from the site and,
 * given the owner's address, returns the owner claim link once. Nothing is
 * emailed during the silent rollout (decision R08): the agency copies the link.
 */

interface Prospect { id: string; business: string; url: string | null; name: string; email: string; grade: string; score: number }

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new RequestError(response.status, typeof body.error === "string" ? body.error : fallback);
  return body as T;
}

const FACT_LABELS: Record<string, string> = { phone: "Phone", email: "Email", address: "Address" };

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function absolute(path: string) {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

export function AgencyAddClient({ agencyWorkspaceId, prospecting, initialProspectId }: { agencyWorkspaceId: string; prospecting: boolean; initialProspectId: string | null }) {
  const [source, setSource] = useState<"url" | "prospect">(initialProspectId && prospecting ? "prospect" : "url");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [prospectId, setProspectId] = useState<string | null>(initialProspectId);
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [prospectError, setProspectError] = useState("");
  const [clients, setClients] = useState<AgencyClientListItem[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [result, setResult] = useState<AddAgencyClientResult | null>(null);
  // One key per intended add, so a retry after a lost response replays instead of adding twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [listAttempt, setListAttempt] = useState(0);
  const id = useId().replace(/:/g, "");
  const agencyHref = `/workspace?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`;

  const loadClients = useCallback(async (signal?: AbortSignal) => {
    try {
      const body = await readJson<{ clients: AgencyClientListItem[] }>(await fetch(`/api/workspace/agency-clients/added?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`, { cache: "no-store", signal }), "Your clients couldn’t be loaded.");
      setClients(body.clients);
    } catch (cause) {
      if (signal?.aborted) return;
      if (cause instanceof RequestError && cause.status === 401) setSignedOut(true);
      setClients([]);
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
      .then((body) => setProspects(body.prospects))
      .catch((cause) => { if (!controller.signal.aborted) { setProspects([]); setProspectError(cause instanceof Error ? cause.message : "Your prospects couldn’t be loaded."); } });
    return () => controller.abort();
  }, [agencyWorkspaceId, prospecting]);

  const added = new Set((clients ?? []).map((client) => client.prospectId).filter(Boolean));
  const chosen = prospects?.find((prospect) => prospect.id === prospectId) ?? null;

  function choose(prospect: Prospect) {
    setProspectId(prospect.id);
    setOwnerEmail(prospect.email);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (source === "url" && !url.trim()) { setError("Enter the business’s website."); return; }
    if (source === "prospect" && !prospectId) { setError("Choose a prospect."); return; }
    setSubmitting(true); setError("");
    try {
      const body = await readJson<AddAgencyClientResult>(await fetch("/api/workspace/agency-clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add", agencyWorkspaceId, idempotencyKey,
          ...(source === "url" ? { url: url.trim() } : { prospectId }),
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(ownerEmail.trim() ? { ownerEmail: ownerEmail.trim() } : {}),
        }),
      }), "The client couldn’t be added.");
      setResult(body);
      void loadClients();
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) { setSignedOut(true); return; }
      setError(cause instanceof Error && cause.message ? cause.message : "The client couldn’t be added.");
    } finally {
      setSubmitting(false);
    }
  }

  function another() {
    setResult(null); setUrl(""); setName(""); setOwnerEmail(""); setProspectId(null); setError("");
    setIdempotencyKey(crypto.randomUUID());
  }

  if (signedOut) {
    return <Shell agencyHref={agencyHref}>
      <section className="mt-16 max-w-xl">
        <h1 className="font-display text-[32px] font-medium leading-tight">Sign in to add a client.</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-gray-muted">Use the account you run your agency with. You come straight back here.</p>
        <Link href={`/sign-in?next=${encodeURIComponent(`/workspace/agency/clients/new?workspaceId=${agencyWorkspaceId}`)}`} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-medium text-on-accent hover:bg-accent/85">Sign in<ArrowRight className="size-4" aria-hidden="true" /></Link>
      </section>
    </Shell>;
  }

  return <Shell agencyHref={agencyHref}>
    {result
      ? <AddedClient result={result} agencyWorkspaceId={agencyWorkspaceId} onAnother={another} agencyHref={agencyHref} onClaim={(claim) => { setResult({ ...result, ownerClaim: claim, ownerClaimError: null }); void loadClients(); }} />
      : <section className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" aria-labelledby={`${id}-title`}>
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent-text">New client</p>
          <h1 id={`${id}-title`} className="mt-3 font-display text-[40px] font-medium leading-tight">Add a client</h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">Start from the website they already have, or from someone who ran your check.</p>
          <form onSubmit={submit} className="mt-8 max-w-lg" noValidate aria-busy={submitting || undefined}>
            {prospecting ? <Tabs aria-label="Where this client comes from" variant="segment" value={source} onChange={(value) => { setSource(value as "url" | "prospect"); setError(""); }}
              items={[{ value: "url", label: "Website" }, { value: "prospect", label: "Prospect" }]} /> : null}
            <div className="mt-6 grid gap-5">
              {source === "url"
                ? <TextInput label="Their website" type="url" inputMode="url" autoComplete="url" autoFocus required maxLength={2048} placeholder="northsidebakery.com" value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} helperText="We read a few pages for their phone, email and address. Nothing on their site changes." />
                : <ProspectPicker prospects={prospects} error={prospectError} added={added} value={prospectId} onChoose={choose} />}
              <TextInput label="Business name" autoComplete="organization" maxLength={120} placeholder={source === "prospect" && chosen ? chosen.business : "Read from their site if left blank"} value={name} onChange={(event) => setName(event.target.value)} />
              <TextInput label="Owner’s email" type="email" autoComplete="email" maxLength={254} placeholder="owner@business.com" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} helperText="For their claim link. Strelva doesn’t email it yet; you’ll copy it." />
            </div>
            {error ? <p role="alert" className="mt-4 text-[13px] text-critical">{error}</p> : null}
            <Button type="submit" size="lg" loading={submitting} className="mt-6" icon={<ArrowRight className="size-4" />}>{submitting ? "Adding client" : "Add client"}</Button>
          </form>
        </div>
        <ol className="self-start border-t border-gray-border text-[13px] leading-relaxed text-gray-muted lg:mt-24" aria-label="What adding a client does">
          <li className="border-b border-gray-border py-4"><strong className="block font-medium text-warm-black">Their own business on Strelva</strong>The owner owns it. Your agency works in it through its seat, never as a member.</li>
          <li className="border-b border-gray-border py-4"><strong className="block font-medium text-warm-black">Details marked unconfirmed</strong>What we read from their site waits for the owner to confirm it.</li>
          <li className="border-b border-gray-border py-4"><strong className="block font-medium text-warm-black">A claim link for the owner</strong>It keeps working while they decide. Their site keeps running if they never sign in.</li>
        </ol>
      </section>}
    <ClientList clients={clients} onRetry={() => setListAttempt((value) => value + 1)} />
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

function AddedClient({ result, agencyWorkspaceId, agencyHref, onAnother, onClaim }: { result: AddAgencyClientResult; agencyWorkspaceId: string; agencyHref: string; onAnother: () => void; onClaim: (claim: OwnerClaim) => void }) {
  const id = useId().replace(/:/g, "");
  const { client, scan } = result;
  return <section className="mt-12" aria-labelledby={`${id}-title`}>
    <p className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-positive"><Check className="size-4" aria-hidden="true" />Client added</p>
    <h1 id={`${id}-title`} className="mt-3 break-words font-display text-[40px] font-medium leading-tight">{client.name}</h1>
    <p className="mt-2 font-mono text-[12px] tabular-nums text-gray-muted">Owner not signed in yet · your agency holds its seat{client.replayed ? " · this client was already added" : ""}</p>

    <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium">Their website</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">Pick one now or later. Either way the owner approves before anything goes live.</p>
        <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">
          <li><a href={result.website.connect} className="flex min-h-16 items-center gap-4 px-1 py-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
            <Globe2 className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
            <span className="min-w-0 flex-1"><strong className="block text-[14px] font-medium">Connect the site they have</strong><small className="mt-0.5 block text-[12px] text-gray-muted">One script tag. Their site stays where it is; forms and facts flow into Strelva.</small></span>
            <ArrowRight className="size-4 shrink-0 text-gray-muted" aria-hidden="true" />
          </a></li>
          <li><a href={result.website.rebuild} className="flex min-h-16 items-center gap-4 px-1 py-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
            <Hammer className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
            <span className="min-w-0 flex-1"><strong className="block text-[14px] font-medium">Rebuild it on Strelva</strong><small className="mt-0.5 block text-[12px] text-gray-muted">A new draft from their current pages, for the owner to review.</small></span>
            <ArrowRight className="size-4 shrink-0 text-gray-muted" aria-hidden="true" />
          </a></li>
        </ul>

        <h2 className="mt-10 text-[15px] font-medium">Details from their site</h2>
        {scan.status === "scanned" && scan.seeded.length
          ? <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border text-[13px]">
            {scan.seeded.map((key) => <li key={key} className="flex min-h-12 items-center justify-between gap-4 py-3"><span>{FACT_LABELS[key] ?? key}</span><span className="text-[12px] text-gray-muted">Unconfirmed</span></li>)}
          </ul>
          : <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">{scan.status === "unreachable" ? scan.message : scan.status === "scanned" ? "We didn’t find a phone, email or address on their site." : "No website given, so nothing was read."} The owner can add details when they sign in.</p>}
        <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">{client.factsSeeded} {client.factsSeeded === 1 ? "detail" : "details"} on the business record, including its name. Only the owner confirms them.</p>
      </div>

      <OwnerLink result={result} agencyWorkspaceId={agencyWorkspaceId} onClaim={onClaim} />
    </div>

    <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-gray-border pt-6">
      <Button variant="secondary" onClick={onAnother} icon={<RefreshCw className="size-4" />}>Add another client</Button>
      <a href={agencyHref} className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium underline-offset-4 hover:underline">Back to clients<ArrowRight className="size-4" aria-hidden="true" /></a>
    </div>
  </section>;
}

function OwnerLink({ result, agencyWorkspaceId, onClaim }: { result: AddAgencyClientResult; agencyWorkspaceId: string; onClaim: (claim: OwnerClaim) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(result.ownerClaimError ?? "");
  const [copied, setCopied] = useState(false);
  const claim = result.ownerClaim;
  const link = claim ? absolute(claim.claimPath) : "";

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) { setError("Enter the owner’s email."); return; }
    setBusy(true); setError("");
    try {
      const body = await readJson<{ ownerClaim: OwnerClaim }>(await fetch("/api/workspace/agency-clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "owner_link", agencyWorkspaceId, customerWorkspaceId: result.client.customerWorkspaceId, ownerEmail: email.trim() }),
      }), "The owner link couldn’t be created.");
      onClaim(body.ownerClaim);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "The owner link couldn’t be created.");
    } finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2400); }
    catch { setError("Copy didn’t work here. Select the link and copy it."); }
  }

  return <aside className="self-start rounded-3xl border border-gray-border bg-surface p-6" aria-labelledby="owner-link-title">
    <h2 id="owner-link-title" className="text-[15px] font-medium">Owner link</h2>
    {claim ? <>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">For {claim.recipientEmail}. Whoever signs in with that address becomes the owner.</p>
      <label htmlFor="owner-link-value" className="sr-only">Owner claim link</label>
      <input id="owner-link-value" readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="mt-4 w-full min-h-10 truncate rounded-xl border border-gray-border bg-surface-inset px-4 py-2 font-mono text-[12px]" />
      <Button className="mt-3 w-full" onClick={() => void copy()} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>{copied ? "Copied" : "Copy link"}</Button>
      <p className="mt-4 text-[12px] leading-relaxed text-gray-muted" role="status"><strong className="font-medium text-warm-black">Not sent.</strong> Client email is off during the rollout, so send this yourself. Works until {dateLabel(claim.expiresAt)}.</p>
      <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">The link is shown once. Making a new one replaces it.</p>
    </> : <form onSubmit={create} noValidate className="mt-1">
      <p className="text-[13px] leading-relaxed text-gray-muted">Make a link for the owner to take their business. Nothing is emailed; you send it.</p>
      <div className="mt-4"><TextInput label="Owner’s email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} /></div>
      <Button type="submit" className="mt-3 w-full" loading={busy}>Create owner link</Button>
    </form>}
    {error ? <p role="alert" className="mt-3 text-[13px] text-critical">{error}</p> : null}
  </aside>;
}

function ClientList({ clients, onRetry }: { clients: AgencyClientListItem[] | null; onRetry: () => void }) {
  if (clients === null) return <p role="status" className="mt-16 flex items-center gap-2 text-[13px] text-gray-muted"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Loading clients you added</p>;
  if (!clients.length) return null;
  return <section className="mt-16" aria-labelledby="added-clients-title">
    <div className="flex items-center justify-between gap-3">
      <h2 id="added-clients-title" className="text-[15px] font-medium">Clients you added</h2>
      <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-2 text-[13px] text-gray-muted underline-offset-4 hover:text-warm-black hover:underline"><RefreshCw className="size-3.5" aria-hidden="true" />Refresh</button>
    </div>
    <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">
      {clients.map((client) => <li key={client.additionId} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3">
        <span className="min-w-0"><strong className="block truncate text-[14px] font-medium">{client.name}</strong><small className="mt-0.5 block truncate text-[12px] text-gray-muted">{client.sourceUrl ?? "No website"} · added {dateLabel(client.addedAt)}</small></span>
        <span className={`text-right text-[12px] ${client.ownerClaimed ? "text-positive" : "text-gray-muted"}`}>{!client.seatActive ? "Seat ended" : client.ownerClaimed ? "Owner signed in" : client.pendingClaim ? `Link for ${client.pendingClaim.recipientEmail}` : "No owner link"}</span>
      </li>)}
    </ul>
  </section>;
}
