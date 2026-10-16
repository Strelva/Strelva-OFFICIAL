"use client";
/**
 * Home Finder for a brokerage (XA, lane xs-apps-care). Story: which brokerage,
 * whose listings, the license and what still has to be confirmed before buyers
 * can use it. Object: the search as buyers see it on the brokerage website,
 * with the one yes ("Make it live") beside it. Data, commands, revisions and
 * retry-the-same-request behaviour are the existing /api/workspace/home-finder.
 */
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  XaButton, XaChoices, XaDecision, XaEmpty, XaField, XaHeadline, XaPage, XaRow, XaRows, XaSheet, XaStatus, XaSystemTile, XaTextLink, XaWorking, XaYes,
} from "@/components/ui/strelva/Xa";
import { XaBlock, XaNote, XaObjectPage } from "@/components/ui/strelva/Xa";
import { homeFinderBindingSchema, type HomeFinderBinding } from "@/products/home-finder/contracts";
import styles from "./home-finder.module.css";

const viewSchema = z.object({ bindings: z.array(homeFinderBindingSchema.extend({ changeNumber: z.number().int().positive() })), catalog: z.object({ name: z.string(), requirements: z.array(z.string()) }) });
type View = z.infer<typeof viewSchema>;
type Binding = View["bindings"][number];
type Agency = { id: string; name: string };

type ReadinessState = "confirmed" | "missing" | "unverified" | "stale";

/** One unmet requirement as one plain sentence that names who has to act. */
export function readinessSentence(item: { requirement: string; state: ReadinessState; source: string; responsibleParty: string }, brokerage: string): string {
  const what = item.requirement.toLowerCase();
  const who = /provider|feed/i.test(item.responsibleParty) ? "The listings feed" : /brokerage/i.test(item.responsibleParty) ? brokerage : item.source || item.responsibleParty;
  const stale = item.state === "stale";
  if (/inquir/.test(what)) return stale ? `Where ${brokerage}'s inquiries go is out of date.` : `${who} hasn't confirmed where inquiries go.`;
  if (/licen/.test(what)) return stale ? `${brokerage}'s signed license is out of date.` : `${who} hasn't confirmed the signed license.`;
  if (/grant|provider|feed|listing/.test(what)) return stale ? `The listings feed's permission for ${brokerage} is out of date.` : `${who} hasn't confirmed ${brokerage} may show its listings.`;
  return `${item.requirement} ${stale ? "is out of date" : item.state === "missing" ? "is missing" : "isn't confirmed yet"}.`;
}
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const host = (origin: string) => { try { return new URL(origin).host; } catch { return origin; } };

export function HomeFinder({ workspaceId, agencies, request }: { workspaceId: string; agencies: Agency[]; request?: typeof fetch }) {
  return <HomeFinderLoader key={workspaceId} workspaceId={workspaceId} agencies={agencies} request={request} />;
}

function HomeFinderLoader({ workspaceId, agencies, request }: { workspaceId: string; agencies: Agency[]; request?: typeof fetch }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [installing, setInstalling] = useState(false), [lastAction, setLastAction] = useState<string | null>(null);
  const pending = useRef<Record<string, unknown> | null>(null), inflight = useRef(false);
  const send = (input: string, init?: RequestInit) => (request ?? fetch)(input, init);
  useEffect(() => {
    const controller = new AbortController();
    void send(`/api/workspace/home-finder?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: "same-origin", signal: controller.signal }).then(async response => { const raw: unknown = await response.json(); if (!response.ok) throw new Error("Home Finder couldn't be opened for your account."); const value = viewSchema.parse(raw); if (value.bindings.some(b => b.workspaceId !== workspaceId)) throw new Error("The business changed."); if (!controller.signal.aborted) { setView(value); setError(""); } }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Home Finder is unavailable."); });
    return () => controller.abort();
    // `send` reads the current request prop; reloading is keyed on attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, attempt]);
  async function change(input: Record<string, unknown>) {
    if (inflight.current) return; inflight.current = true; pending.current = input; setBusy(true); setError(""); setNotice(""); setLastAction(String(input.action));
    try {
      const response = await send("/api/workspace/home-finder", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result: unknown = await response.json(); if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The operation could not be confirmed. Reload current state before changing it.");
      pending.current = null; setInstalling(false);
      setNotice(input.action === "install" ? "Home Finder is set up as a draft. The listings feed confirms it before it can be made live." : input.action === "publish" ? "Home Finder is live. Strelva checks the license and the feed again on every new inquiry." : input.action === "configure" ? "Saved. New inquiries are paused until the feed confirms it again and it is made live." : input.action === "pause" ? "New inquiries are paused. Inquiries already received keep their delivery." : input.action === "revoke" ? "Home Finder is stopped. Buyers can no longer ask about homes." : "Checked again.");
      setAttempt(v => v + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The operation could not be confirmed."); }
    finally { inflight.current = false; setBusy(false); }
  }
  const locked = busy || Boolean(pending.current);
  const bindings = view?.bindings ?? [];
  const selected = bindings.find(b => b.id === selectedId) ?? bindings[0] ?? null;

  if (!view && !error) return <XaObjectPage story={<XaWorking title="Reading Home Finder" steps={[{ id: "read", label: "Checking this brokerage's installations", state: "active" }]} />} />;

  const failure = error ? <div role="alert" className={styles.stack}>
    <XaNote tone="down">{error}</XaNote>
    <div className={styles.row}>
      {pending.current ? <XaButton variant="secondary" size="sm" disabled={busy} onClick={() => pending.current && void change(pending.current)}>Send the same change again</XaButton> : null}
      <XaButton variant="quiet" size="sm" disabled={busy} onClick={() => { pending.current = null; setAttempt(v => v + 1); }}>Check again</XaButton>
    </div>
  </div> : null;

  if (!view) return <XaObjectPage story={<><XaEmpty pose="fixing" title="Home Finder couldn't be read" job="Nothing changed. Buyers see what they saw before.">{error}</XaEmpty>{failure}</>} />;

  const installForm = agencies.length ? <InstallForm workspaceId={workspaceId} agencies={agencies} locked={locked} busy={busy && lastAction === "install"} onSubmit={change} onCancel={bindings.length ? () => setInstalling(false) : undefined} />
    : <XaNote>An owner or admin at the brokerage&apos;s agency sets this up.</XaNote>;

  if (!selected || installing) {
    return <XaObjectPage label="Home Finder"
      phone="object-first"
      head={<><XaSystemTile kind="listing" size={48} label="Home Finder" /><XaHeadline quiet="The brokerage keeps its inquiries. The listings feed confirms it before buyers can use it.">Home search on the brokerage&apos;s own website.</XaHeadline></>}
      story={<>
        {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
        {failure}
        {!bindings.length ? <XaNote>No brokerage has Home Finder yet.</XaNote> : <XaTextLink onClick={() => setInstalling(false)}>Back to {selected?.brokerageName ?? "Home Finder"}</XaTextLink>}
      </>}
      object={<XaDecision label="Set up Home Finder" status={<XaStatus kind="draft">Draft</XaStatus>} meta="Stays a draft until the feed confirms it" yes={null}>{installForm}</XaDecision>} />;
  }

  const unmet = selected.readiness?.filter(item => item.state !== "confirmed") ?? [];
  return <XaObjectPage label={`Home Finder for ${selected.brokerageName}`} phone="object-first"
    head={<><XaSystemTile kind="listing" size={48} label="Home Finder" /><XaHeadline quiet={selected.status === "revoked" ? "It's stopped. Buyers can't ask about homes." : selected.lifecycle === "live" ? (selected.runtimeAllowed ? "Buyers are searching." : "Live, but new inquiries wait until the feed confirms it again.") : selected.lifecycle === "paused" ? "New inquiries are paused." : "A draft. Buyers can't see it yet."}>
        Home Finder for {selected.brokerageName}.
      </XaHeadline></>}
    story={<>
      {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
      {failure}
      {selected.status === "active" && selected.lifecycle !== "live" ? unmet.length || !selected.readiness?.length ? <XaBlock label="Before buyers can use it">
        {unmet.map(item => <XaNote key={item.requirement} tone="waits">{readinessSentence(item, selected.brokerageName)}</XaNote>)}
        {!selected.readiness?.length ? <XaNote tone="waits">The listings feed hasn&apos;t confirmed anything yet.</XaNote> : null}
      </XaBlock> : <XaNote tone="done">The license, the feed and the inquiry address are all confirmed.</XaNote> : null}
      <XaNote>On {host(selected.approvedOrigin)}, with listings from {selected.sourceName}. Licensed until {dateLabel(selected.licenseExpiresAt)}. Inquiries go to {selected.brokerageName}.</XaNote>
      {selected.status === "active" ? <div className={styles.quiet}>
        <XaTextLink onClick={() => void change({ action: "check", workspaceId, bindingId: selected.id })}>{busy && lastAction === "check" ? "Checking" : "Check with the feed again"}</XaTextLink>
        {selected.lifecycle === "live" ? <> · <XaTextLink onClick={() => void change({ action: "pause", workspaceId, bindingId: selected.id, expectedChange: selected.changeNumber })}>Pause new inquiries</XaTextLink></> : null}
        {" · "}<RevokeControl key={selected.id} binding={selected} locked={locked} onRevoke={() => void change({ action: "revoke", workspaceId, bindingId: selected.id, expectedRevision: selected.revision })} />
      </div> : null}
      {selected.status === "active" ? <HomeFinderConfiguration key={`${selected.id}:${selected.revision}`} binding={selected} changeNumber={selected.changeNumber} locked={locked} onChange={change} /> : null}
      {bindings.length > 1 ? <XaBlock label="Other brokerages">
        <XaRows label="Other brokerages">{bindings.filter(b => b.id !== selected.id).map(b => <XaRow key={b.id} lead={<XaSystemTile kind="listing" size={32} />} title={b.brokerageName} detail={b.lifecycle === "paused" ? "Paused" : b.lifecycle === "live" ? undefined : "Draft"} onClick={() => setSelectedId(b.id)} />)}</XaRows>
      </XaBlock> : null}
      <p className={styles.quiet}>
        <XaTextLink href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&systemId=${encodeURIComponent(selected.systemId)}`}>Open this System</XaTextLink>
        {agencies.length ? <> · <XaTextLink onClick={() => setInstalling(true)}>Set up another brokerage</XaTextLink></> : null}
      </p>
    </>}
    object={<BuyerPreview binding={selected} busy={busy && lastAction === "publish"} failed={Boolean(error) && lastAction === "publish"} error={error} locked={locked}
      onPublish={() => void change({ action: "publish", workspaceId, bindingId: selected.id, expectedChange: selected.changeNumber })} />} />;
}

/** The search as a buyer sees it on the brokerage's site, with the one yes beside it. */
function BuyerPreview({ binding, busy, failed, error, locked, onPublish }: { binding: Binding; busy: boolean; failed: boolean; error: string; locked: boolean; onPublish: () => void }) {
  const live = binding.lifecycle === "live";
  const canPublish = binding.status === "active" && !live;
  const blocked = binding.readiness?.find(item => item.state !== "confirmed");
  return <XaDecision label={`${binding.brokerageName} Home Finder, as buyers see it`}
    status={binding.status === "revoked" ? <XaStatus kind="down">Stopped</XaStatus> : live ? <XaStatus kind="live" breathe={binding.runtimeAllowed}>Live</XaStatus> : binding.lifecycle === "paused" ? <XaStatus kind="waits">Paused</XaStatus> : <XaStatus kind="draft">Draft</XaStatus>}
    meta={live && binding.runtimeAllowed ? <XaTextLink href={binding.approvedOrigin}>Open the brokerage website</XaTextLink> : "Buyers can't see it yet"}
    yes={canPublish ? <XaYes state={busy ? "going" : failed ? "failed" : "waiting"} onYes={onPublish} failure={error || "It didn't go live. Buyers still can't search."}
      working={{ title: "Checking the feed and making it live", steps: [{ id: "check", label: "Checking the license, the feed and the inquiry address", state: "active" }] }}
      disabledReason={locked && !busy ? "Another change is still being confirmed." : blocked ? `${readinessSentence(blocked, binding.brokerageName)} Strelva checks again when you press it.` : undefined} /> : null}>
    <XaPage address={`${host(binding.approvedOrigin)}/homes`} title="Find your home" flat>
      <p className={styles.pageSub}>{binding.brokerageName} · {binding.sourceName}</p>
      <div className={styles.fakeSearch} aria-hidden="true"><span>City, area or address</span><span className={styles.fakeButton}>Search homes</span></div>
      <p className={styles.pageNote}>Buyers search {binding.brokerageName}&apos;s listings and ask about a home. Their details go straight to {binding.brokerageName}.</p>
    </XaPage>
  </XaDecision>;
}

function RevokeControl({ binding, locked, onRevoke }: { binding: HomeFinderBinding; locked: boolean; onRevoke: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <XaTextLink onClick={() => { if (!locked) setOpen(true); }}>Stop Home Finder</XaTextLink>
    <XaSheet open={open} onClose={() => setOpen(false)} title={`Stop Home Finder for ${binding.brokerageName}?`}
      actions={<><XaButton variant="primary" size="lg" onClick={() => { setOpen(false); onRevoke(); }}>Stop it</XaButton><XaButton variant="quiet" size="lg" onClick={() => setOpen(false)}>Keep it</XaButton></>}>
      <p className={styles.sheetText}>Buyers can no longer ask about homes. Inquiries already received still reach {binding.brokerageName}. To use it again, set it up again.</p>
    </XaSheet>
  </>;
}

function InstallForm({ workspaceId, agencies, locked, busy, onSubmit, onCancel }: { workspaceId: string; agencies: Agency[]; locked: boolean; busy: boolean; onSubmit: (input: Record<string, unknown>) => Promise<void>; onCancel?: () => void }) {
  const [agencyId, setAgencyId] = useState<string | null>(agencies.length === 1 ? agencies[0]!.id : null), [name, setName] = useState(""), [installation, setInstallation] = useState(""), [brokerage, setBrokerage] = useState(""), [origin, setOrigin] = useState(""), [license, setLicense] = useState(""), [expiry, setExpiry] = useState(""), [source, setSource] = useState("");
  return <form className={styles.stack} aria-label="Prepare an installation" onSubmit={event => { event.preventDefault(); if (!locked && agencyId) void onSubmit({ action: "install", workspaceId, agencyId, name, externalInstallationId: installation, brokerageName: brokerage, approvedOrigin: origin, licenseReference: license, licenseExpiresAt: new Date(expiry).toISOString(), sourceName: source, commandId: crypto.randomUUID() }); }}>
    <p className={styles.formLede}>Use the details from the brokerage&apos;s signed agreement with its listings feed. Setting it up doesn&apos;t mean the feed has confirmed it.</p>
    {agencies.length > 1 ? <XaChoices label="Agency setting it up" value={agencyId} onChange={setAgencyId} options={agencies.map(a => ({ value: a.id, label: a.name }))} /> : <XaNote>Set up by {agencies[0]!.name}.</XaNote>}
    <div className={styles.grid}>
      <XaField label="Brokerage name" value={brokerage} required maxLength={500} disabled={locked} onChange={e => setBrokerage(e.target.value)} />
      <XaField label="Name" value={name} required maxLength={500} disabled={locked} onChange={e => setName(e.target.value)} placeholder="Home Finder" />
    </div>
    <XaField label="Brokerage website" type="url" value={origin} required maxLength={500} disabled={locked} onChange={e => setOrigin(e.target.value)} placeholder="https://" hint="The HTTPS address buyers open it from." />
    <XaField label="Listing feed name" value={source} required maxLength={500} disabled={locked} onChange={e => setSource(e.target.value)} hint="Exactly as the license names it." />
    <XaField label="The feed's reference for this brokerage" value={installation} required maxLength={500} disabled={locked} onChange={e => setInstallation(e.target.value)} />
    <div className={styles.grid}>
      <XaField label="License number" value={license} required maxLength={500} disabled={locked} onChange={e => setLicense(e.target.value)} />
      <XaField label="License ends" type="datetime-local" required value={expiry} disabled={locked} onChange={e => setExpiry(e.target.value)} />
    </div>
    <div className={styles.row}>
      <XaButton type="submit" variant="primary" size="lg" busy={busy} disabled={locked || !agencyId}>Set it up as a draft</XaButton>
      {onCancel ? <XaButton variant="quiet" size="lg" disabled={locked} onClick={onCancel}>Not now</XaButton> : null}
    </div>
  </form>;
}

function HomeFinderConfiguration({ binding, changeNumber, locked, onChange }: { binding: HomeFinderBinding; changeNumber: number; locked: boolean; onChange: (value: Record<string, unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [brokerageName, setBrokerage] = useState(binding.brokerageName), [approvedOrigin, setOrigin] = useState(binding.approvedOrigin), [licenseReference, setLicense] = useState(binding.licenseReference), [licenseExpiresAt, setExpiry] = useState(binding.licenseExpiresAt.slice(0, 16)), [sourceName, setSource] = useState(binding.sourceName);
  if (!open) return <p className={styles.quiet}><XaTextLink onClick={() => setOpen(true)}>Renew the license or change its details</XaTextLink></p>;
  return <XaBlock label="Renew the license or change its details">
    <form className={styles.stack} aria-label="Renew the license or change its details" onSubmit={event => { event.preventDefault(); const date = new Date(`${licenseExpiresAt}:00Z`); if (!locked && Number.isFinite(date.valueOf())) void onChange({ action: "configure", workspaceId: binding.workspaceId, bindingId: binding.id, expectedRevision: binding.revision, expectedChange: changeNumber, commandId: crypto.randomUUID(), brokerageName, approvedOrigin, licenseReference, licenseExpiresAt: date.toISOString(), sourceName }); }}>
      <XaNote tone="waits">Saving pauses new inquiries until the feed confirms it again. Inquiries already received still reach the brokerage.</XaNote>
      <XaField label="Brokerage name" required value={brokerageName} maxLength={160} disabled={locked} onChange={e => setBrokerage(e.target.value)} />
      <XaField label="Brokerage website" required value={approvedOrigin} disabled={locked} onChange={e => setOrigin(e.target.value)} />
      <XaField label="License number" required value={licenseReference} maxLength={500} disabled={locked} onChange={e => setLicense(e.target.value)} />
      <XaField label="License ends (UTC)" type="datetime-local" required value={licenseExpiresAt} disabled={locked} onChange={e => setExpiry(e.target.value)} />
      <XaField label="Listing feed name" required value={sourceName} maxLength={200} disabled={locked} onChange={e => setSource(e.target.value)} />
      <div className={styles.row}><XaButton type="submit" variant="secondary" disabled={locked}>Save and ask the feed again</XaButton><XaButton variant="quiet" disabled={locked} onClick={() => setOpen(false)}>Cancel</XaButton></div>
    </form>
  </XaBlock>;
}
