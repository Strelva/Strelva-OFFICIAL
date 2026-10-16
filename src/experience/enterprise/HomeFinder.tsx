"use client";
/**
 * Home Finder for a brokerage (XA, lane xs-apps-care). Story: which brokerage,
 * whose listings, the license and what still has to be confirmed before buyers
 * can use it. Object: the search as buyers see it on the brokerage website,
 * with the one yes ("Put it live") beside it. Data, commands, revisions and
 * retry-the-same-request behaviour are the existing /api/workspace/home-finder.
 */
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  XaAnswers, XaButton, XaChoices, XaDecision, XaEmpty, XaField, XaHeadline, XaPage, XaRow, XaRows, XaSheet, XaStatus, XaSystemTile, XaTextLink, XaWorking, XaYes,
} from "@/components/ui/strelva/Xa";
import { XaBlock, XaNote, XaObjectPage } from "@/experience/xa-object/XaObjectPage";
import { homeFinderBindingSchema, type HomeFinderBinding } from "@/products/home-finder/contracts";
import styles from "./home-finder.module.css";

const viewSchema = z.object({ bindings: z.array(homeFinderBindingSchema.extend({ changeNumber: z.number().int().positive() })), catalog: z.object({ name: z.string(), requirements: z.array(z.string()) }) });
type View = z.infer<typeof viewSchema>;
type Binding = View["bindings"][number];
type Agency = { id: string; name: string };

const READINESS_WORD = { confirmed: "Confirmed", missing: "Missing", unverified: "Not confirmed yet", stale: "Out of date" } as const;
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
    void send(`/api/workspace/home-finder?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: "same-origin", signal: controller.signal }).then(async response => { const raw: unknown = await response.json(); if (!response.ok) throw new Error("Home Finder could not be loaded. Current business access and the release gate are required."); const value = viewSchema.parse(raw); if (value.bindings.some(b => b.workspaceId !== workspaceId)) throw new Error("The business changed."); if (!controller.signal.aborted) { setView(value); setError(""); } }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Home Finder is unavailable."); });
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
      setNotice(input.action === "install" ? "The brokerage's Home Finder is prepared as a draft. A licensed provider has to qualify it before it can go live." : input.action === "publish" ? "Home Finder is live. Grants, licensing and the listing feed are checked again on every new inquiry." : input.action === "configure" ? "Saved. New inquiries are paused until provider readiness is checked and it is put live again." : input.action === "pause" ? "New inquiries are paused. Inquiries already received keep their delivery." : input.action === "revoke" ? "The installation grant is revoked. Buyers can no longer start inquiries." : "The check is recorded. Its evidence is below.");
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
      {pending.current ? <XaButton variant="secondary" size="sm" disabled={busy} onClick={() => pending.current && void change(pending.current)}>Retry the same request</XaButton> : null}
      <XaButton variant="quiet" size="sm" disabled={busy} onClick={() => { pending.current = null; setAttempt(v => v + 1); }}>Reload current state</XaButton>
    </div>
  </div> : null;

  if (!view) return <XaObjectPage story={<><XaEmpty pose="fixing" title="Home Finder couldn't be read" job="Nothing changed. Buyers see what they saw before.">{error}</XaEmpty>{failure}</>} />;

  const installForm = agencies.length ? <InstallForm workspaceId={workspaceId} agencies={agencies} locked={locked} busy={busy && lastAction === "install"} onSubmit={change} onCancel={bindings.length ? () => setInstalling(false) : undefined} />
    : <XaNote>An agency owner or administrator with current access to this business prepares an installation. A platform support role grants no agency authority.</XaNote>;

  if (!selected || installing) {
    return <XaObjectPage label="Home Finder"
      story={<>
        <XaSystemTile kind="listing" size={56} label="Home Finder" />
        <XaHeadline quiet="The brokerage owns it, its inquiries and its exit. A licensed provider qualifies it before buyers can use it.">Home search on the brokerage&apos;s own website.</XaHeadline>
        {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
        {failure}
        {!bindings.length ? <XaNote>No brokerage installations yet.</XaNote> : <XaTextLink onClick={() => setInstalling(false)}>Back to {selected?.brokerageName ?? "the installation"}</XaTextLink>}
      </>}
      object={<XaDecision label="Prepare an installation" status={<XaStatus kind="draft">New installation</XaStatus>} meta="Stays a draft until it is qualified" yes={null}>{installForm}</XaDecision>} />;
  }

  return <XaObjectPage label={`Home Finder for ${selected.brokerageName}`}
    story={<>
      <XaSystemTile kind="listing" size={56} label="Home Finder" />
      <XaHeadline quiet={selected.status === "revoked" ? "The installation grant is revoked. Buyers can't start inquiries." : selected.lifecycle === "live" ? (selected.runtimeAllowed ? "Buyers are searching. Every new inquiry is checked again." : "Live, but new inquiries are held until the provider's grant is current.") : selected.lifecycle === "paused" ? "New inquiries are paused. Received inquiries keep their delivery." : "A draft. Buyers can't see it yet."}>
        Home Finder for {selected.brokerageName}.
      </XaHeadline>
      {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
      {failure}
      <XaAnswers labelWidth={130} rows={[
        ["Website", host(selected.approvedOrigin)],
        ["Listings from", selected.sourceName],
        ["License", `Until ${dateLabel(selected.licenseExpiresAt)}`],
        ["Inquiries go to", `${selected.brokerageName}, at its verified address`],
      ]} />
      <XaBlock label="Before buyers can use it">
        {selected.readiness?.length ? <XaRows label="Provider readiness">
          {selected.readiness.map(item => <XaRow key={item.requirement} title={item.requirement} detail={`${item.source} · ${item.responsibleParty}`} tone={item.state === "confirmed" ? undefined : "waits"}
            meta={item.state === "confirmed" ? READINESS_WORD.confirmed : <XaStatus kind="waits" size="sm">{READINESS_WORD[item.state]}</XaStatus>} />)}
        </XaRows> : <XaNote tone="waits">No provider qualification has been seen yet. Check provider readiness to read it.</XaNote>}
      </XaBlock>
      {selected.status === "active" ? <div className={styles.row}>
        <XaButton variant="secondary" size="sm" busy={busy && lastAction === "check"} disabled={locked} onClick={() => void change({ action: "check", workspaceId, bindingId: selected.id })}>Check provider readiness</XaButton>
        {selected.lifecycle === "live" ? <XaButton variant="secondary" size="sm" busy={busy && lastAction === "pause"} disabled={locked} onClick={() => void change({ action: "pause", workspaceId, bindingId: selected.id, expectedChange: selected.changeNumber })}>Pause new inquiries</XaButton> : null}
        <RevokeControl key={selected.id} binding={selected} locked={locked} onRevoke={() => void change({ action: "revoke", workspaceId, bindingId: selected.id, expectedRevision: selected.revision })} />
      </div> : null}
      {selected.status === "active" ? <HomeFinderConfiguration key={`${selected.id}:${selected.revision}`} binding={selected} changeNumber={selected.changeNumber} locked={locked} onChange={change} /> : null}
      {bindings.length > 1 ? <XaBlock label="Other brokerages">
        <XaRows label="Other brokerages">{bindings.filter(b => b.id !== selected.id).map(b => <XaRow key={b.id} lead={<XaSystemTile kind="listing" size={32} />} title={b.brokerageName} detail={host(b.approvedOrigin)} meta={b.lifecycle === "live" ? "Live" : b.lifecycle === "paused" ? "Paused" : "Draft"} onClick={() => setSelectedId(b.id)} />)}</XaRows>
      </XaBlock> : null}
      <p className={styles.quiet}>
        <XaTextLink href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&systemId=${encodeURIComponent(selected.systemId)}`}>Open this System</XaTextLink>
        {agencies.length ? <> · <XaTextLink onClick={() => setInstalling(true)}>Prepare another installation</XaTextLink></> : null}
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
    status={binding.status === "revoked" ? <XaStatus kind="down">Grant revoked</XaStatus> : live ? <XaStatus kind="live" breathe={binding.runtimeAllowed}>Live</XaStatus> : binding.lifecycle === "paused" ? <XaStatus kind="waits">Paused</XaStatus> : <XaStatus kind="draft">Draft</XaStatus>}
    meta={live && binding.runtimeAllowed ? <XaTextLink href={binding.approvedOrigin}>Open the brokerage website</XaTextLink> : "Buyers can't see it yet"}
    yes={canPublish ? <XaYes state={busy ? "going" : failed ? "failed" : "waiting"} onYes={onPublish} failure={error || "It did not go live. Buyers still can't search."}
      working={{ title: "Checking the provider and putting it live", steps: [{ id: "check", label: "Checking the license, grant and listing feed", state: "active" }] }}
      disabledReason={locked && !busy ? "Another change is still being confirmed." : blocked ? `${blocked.requirement} is ${READINESS_WORD[blocked.state].toLowerCase()}. Strelva checks it again when you press it.` : undefined} /> : null}>
    <XaPage address={`${host(binding.approvedOrigin)}/homes`} title="Find your home" flat>
      <p className={styles.pageSub}>{binding.brokerageName} · {binding.sourceName}</p>
      <div className={styles.fakeSearch} aria-hidden="true"><span>City, area or address</span><b>Search homes</b></div>
      <p className={styles.pageNote}>Buyers search current, permitted listings and ask {binding.brokerageName} about a home. Their details go to its verified inquiry address.</p>
    </XaPage>
  </XaDecision>;
}

function RevokeControl({ binding, locked, onRevoke }: { binding: HomeFinderBinding; locked: boolean; onRevoke: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <XaButton variant="quiet" size="sm" disabled={locked} onClick={() => setOpen(true)}>Revoke installation grant</XaButton>
    <XaSheet open={open} onClose={() => setOpen(false)} title={`Stop Home Finder for ${binding.brokerageName}?`}
      actions={<><XaButton variant="primary" size="lg" onClick={() => { setOpen(false); onRevoke(); }}>Revoke the grant</XaButton><XaButton variant="quiet" size="lg" onClick={() => setOpen(false)}>Keep it</XaButton></>}>
      <p className={styles.sheetText}>Buyers can no longer start inquiries. Inquiries already received keep their delivery and receipts. To use it again, prepare a new installation.</p>
    </XaSheet>
  </>;
}

function InstallForm({ workspaceId, agencies, locked, busy, onSubmit, onCancel }: { workspaceId: string; agencies: Agency[]; locked: boolean; busy: boolean; onSubmit: (input: Record<string, unknown>) => Promise<void>; onCancel?: () => void }) {
  const [agencyId, setAgencyId] = useState<string | null>(agencies.length === 1 ? agencies[0]!.id : null), [name, setName] = useState(""), [installation, setInstallation] = useState(""), [brokerage, setBrokerage] = useState(""), [origin, setOrigin] = useState(""), [license, setLicense] = useState(""), [expiry, setExpiry] = useState(""), [source, setSource] = useState("");
  return <form className={styles.stack} aria-label="Prepare an installation" onSubmit={event => { event.preventDefault(); if (!locked && agencyId) void onSubmit({ action: "install", workspaceId, agencyId, name, externalInstallationId: installation, brokerageName: brokerage, approvedOrigin: origin, licenseReference: license, licenseExpiresAt: new Date(expiry).toISOString(), sourceName: source, commandId: crypto.randomUUID() }); }}>
    <p className={styles.formLede}>Use the references the brokerage signed with its listings provider. Preparing it does not mean the provider approved it.</p>
    {agencies.length > 1 ? <XaChoices label="Installing agency" value={agencyId} onChange={setAgencyId} options={agencies.map(a => ({ value: a.id, label: a.name }))} /> : <XaNote>Installing agency: {agencies[0]!.name}</XaNote>}
    <div className={styles.grid}>
      <XaField label="Brokerage name" value={brokerage} required maxLength={500} disabled={locked} onChange={e => setBrokerage(e.target.value)} />
      <XaField label="System name" value={name} required maxLength={500} disabled={locked} onChange={e => setName(e.target.value)} placeholder="Home Finder" />
    </div>
    <XaField label="Brokerage website" type="url" value={origin} required maxLength={500} disabled={locked} onChange={e => setOrigin(e.target.value)} placeholder="https://" hint="The HTTPS address buyers open it from." />
    <XaField label="Listing feed name" value={source} required maxLength={500} disabled={locked} onChange={e => setSource(e.target.value)} hint="Exactly as the license names it." />
    <XaField label="Provider installation reference" value={installation} required maxLength={500} disabled={locked} onChange={e => setInstallation(e.target.value)} />
    <div className={styles.grid}>
      <XaField label="Signed license reference" value={license} required maxLength={500} disabled={locked} onChange={e => setLicense(e.target.value)} />
      <XaField label="License ends" type="datetime-local" required value={expiry} disabled={locked} onChange={e => setExpiry(e.target.value)} />
    </div>
    <div className={styles.row}>
      <XaButton type="submit" variant="primary" size="lg" busy={busy} disabled={locked || !agencyId}>Prepare the brokerage&apos;s Home Finder</XaButton>
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
      <XaNote tone="waits">Saving pauses new inquiries and clears the provider&apos;s qualification. The business, agency and provider installation stay the same. Inquiries already received keep their receipts.</XaNote>
      <XaField label="Brokerage name" required value={brokerageName} maxLength={160} disabled={locked} onChange={e => setBrokerage(e.target.value)} />
      <XaField label="Brokerage website" required value={approvedOrigin} disabled={locked} onChange={e => setOrigin(e.target.value)} />
      <XaField label="Signed license reference" required value={licenseReference} maxLength={500} disabled={locked} onChange={e => setLicense(e.target.value)} />
      <XaField label="License ends (UTC)" type="datetime-local" required value={licenseExpiresAt} disabled={locked} onChange={e => setExpiry(e.target.value)} />
      <XaField label="Listing feed name" required value={sourceName} maxLength={200} disabled={locked} onChange={e => setSource(e.target.value)} />
      <div className={styles.row}><XaButton type="submit" variant="secondary" disabled={locked}>Save and ask for qualification again</XaButton><XaButton variant="quiet" disabled={locked} onClick={() => setOpen(false)}>Cancel</XaButton></div>
    </form>
  </XaBlock>;
}
