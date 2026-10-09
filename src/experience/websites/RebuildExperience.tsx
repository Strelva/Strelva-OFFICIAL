"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, CircleAlert, ExternalLink, Globe, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput, SelectInput } from "@/components/ui/TextInput";
import { createWebsiteRequestId } from "./contracts";
import { serverRebuildTransport, parseRebuildView, type RebuildTransport, type RebuildView } from "./rebuild-transport";
import { WebsiteConnectionSelector } from "./WebsiteConnections";
import { WebsiteRebuildReport } from "./WebsiteRebuildReport";
import { WebsiteRebuildSharing } from "./WebsiteRebuildSharing";
import { WebsiteCutoverUndo, WebsiteDomainRequest } from "./WebsiteRecoveryControls";
import { SITES_PATH_ORIGIN } from "@/platform/infra/brand";
import styles from "./rebuild-experience.module.css";

export interface RebuildExperienceProps {
  workspaceId: string;
  workId?: string;
  readOnly?: boolean;
  managed?: boolean;
  /** Intake supplies business facts; it never grants editing or publication authority. */
  allowIntake?: boolean;
  operator?: boolean;
  /** Current business owner; the publication endpoint still checks exact authority. */
  canPublish?: boolean;
  agency?: boolean;
  initialRequest?: string;
  initialRecord?: RebuildView;
  transport?: RebuildTransport;
  onSaved?: (workId: string) => void;
}
export function flaggedFacts(record: RebuildView) {
  return Object.entries(record.candidate?.facts ?? {}).filter(([, fact]) => fact.origin !== "owner_confirmed" && (fact.highRisk || !fact.verification?.supported));
}
const skippedReason = {
  robots: "The site's robots.txt blocks reading this page.",
  external: "This page belongs to another website.",
  limit: "This page is beyond the rebuild's page, size or time limit.",
  unreachable: "This page could not be opened.",
  javascript_only: "This page needs a browser to read.",
  not_html: "This address is a file rather than a website page.",
};
function WebsiteFactEditor({ text, origin, disabled, onSave, onRemove }: {
  text: string; origin: string; disabled: boolean; onSave(text: string): Promise<boolean>; onRemove?: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [focusAttempt, setFocusAttempt] = useState(0);
  const editRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const focusRemove = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasEditing = useRef(false);
  const lastFocusAttempt = useRef(0);
  useEffect(() => {
    if (disabled) return;
    if (focusRemove.current && !editing) { removeRef.current?.focus(); focusRemove.current = false; }
    else if (editing && (!wasEditing.current || focusAttempt !== lastFocusAttempt.current)) inputRef.current?.focus();
    else if (!editing && wasEditing.current) editRef.current?.focus();
    wasEditing.current = editing;
    lastFocusAttempt.current = focusAttempt;
  }, [disabled, editing, focusAttempt]);
  const removeButton = onRemove ? <Button ref={removeRef} type="button" size="sm" variant="danger" disabled={disabled} onClick={async () => {
    if (disabled) return;
    if (!await onRemove()) {
      focusRemove.current = !editing;
      setFocusAttempt(value => value + 1);
    }
  }}>Remove contact</Button> : null;
  return <article className={styles.fact} aria-label={text}>
    <p className={styles.tag}>{origin === "owner_confirmed" ? "Confirmed in review" : origin === "owner_stated" ? "Provided by the business" : "From the website source"}</p>
    {editing ? <form onSubmit={async event => {
      event.preventDefault();
      if (disabled || !draft.trim() || draft.trim() === text) return;
      if (await onSave(draft.trim())) setEditing(false);
      else setFocusAttempt(value => value + 1);
    }}>
      <TextArea ref={inputRef} label="Corrected fact" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} required disabled={disabled} helperText="Saving creates a new private preview. Review and approve it before publishing." />
      <div className={styles.actions}><Button type="submit" size="sm" disabled={disabled || !draft.trim() || draft.trim() === text}>Save correction</Button><Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setEditing(false)}>Cancel</Button>{removeButton}</div>
    </form> : <><p className={styles.factText}>{text}</p><Button ref={editRef} type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => { setDraft(text); setEditing(true); }}>Edit fact</Button>{removeButton}</>}
  </article>;
}
export function RebuildExperience({ workspaceId, workId, readOnly = false, managed = false, allowIntake = false, operator = false, canPublish = false, agency = false, initialRequest = "", initialRecord, transport = serverRebuildTransport, onSaved }: RebuildExperienceProps) {
  const [record, setRecord] = useState<RebuildView | null>(initialRecord ?? null);
  const [loading, setLoading] = useState(Boolean(workId && !initialRecord));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [allowAgencyPublish, setAllowAgencyPublish] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [descriptionMode, setDescriptionMode] = useState(Boolean(initialRequest));
  const [url, setUrl] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [description, setDescription] = useState(initialRequest);
  const [domain, setDomain] = useState("");
  const [undoTarget, setUndoTarget] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const factsSummaryRef = useRef<HTMLElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const removedContactFocus = useRef(false);
  const requestId = useRef(createWebsiteRequestId());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!workId || initialRecord) return;
    const controller = new AbortController();
    setLoading(true);
    transport.read(workspaceId, workId, controller.signal).then(next => { if (!controller.signal.aborted) { setRecord(next); setError(""); } }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "This website could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, initialRecord, transport, workId, workspaceId]);
  useEffect(() => {
    if (!record || record.status !== "building") return;
    const controller = new AbortController();
    const timer = setInterval(() => { transport.read(workspaceId, record.workId, controller.signal).then(next => { if (!controller.signal.aborted) setRecord(next); }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Progress could not be refreshed."); }); }, 2500);
    return () => { clearInterval(timer); controller.abort(); };
  }, [record, transport, workspaceId]);
  useEffect(() => {
    if (!record || !record.publishedUrl || !record.domain || record.domain.status === "verified") return;
    const controller = new AbortController();
    const timer = setInterval(() => { transport.read(workspaceId, record.workId, controller.signal).then(next => { if (!controller.signal.aborted) setRecord(next); }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Domain status could not be refreshed."); }); }, 60000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [record, transport, workspaceId]);
  useEffect(() => {
    const renderedHash = previewRef.current?.contentDocument?.querySelector('meta[name="strelva-site-hash"]')?.getAttribute("content");
    const loaded = Boolean(renderedHash);
    setPreviewLoaded(loaded);
    setPreviewFailed(Boolean(loaded && transport === serverRebuildTransport && renderedHash !== record?.candidate?.contentHash));
  }, [record?.candidate?.contentHash, previewAttempt, transport]);
  useEffect(() => {
    if (!record?.candidate || previewLoaded) return;
    const timer = setTimeout(() => setPreviewFailed(true), 15000);
    return () => clearTimeout(timer);
  }, [record?.candidate, previewLoaded, previewAttempt]);
  async function run(operation: () => Promise<RebuildView>, success: string) {
    if (inFlight.current || busy || readOnly || loading) return false;
    inFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    try { const next = await operation(); if (mounted.current) { setRecord(next); setNotice(success); setEditing(null); onSaved?.(next.workId); } return true; }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "The change could not be saved. Your review is preserved."); return false; }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    if (busy || !removedContactFocus.current) return;
    removedContactFocus.current = false;
    (factsSummaryRef.current ?? reviewHeadingRef.current)?.focus();
  }, [record,busy]);
  const decisions = record ? flaggedFacts(record) : [];
  const decisionIds = new Set(decisions.map(([id]) => id));
  const ordinaryFacts = Object.entries(record?.candidate?.facts ?? {}).filter(([id]) => !decisionIds.has(id));
  const startReady = descriptionMode ? Boolean(businessName.trim() && description.trim()) : Boolean(url.trim());
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  const disabled = !ready || busy || readOnly || loading || record?.status === "building";
  const candidate = record?.candidate;
  const agencyPermission = record?.agencyPublishPermission;
  const pathHosted = Boolean(SITES_PATH_ORIGIN && record?.publishedUrl?.startsWith(`${SITES_PATH_ORIGIN}/sites/`));
  useEffect(() => { setAllowAgencyPublish(false); }, [record?.workId, agencyPermission?.agencyWorkspaceId]);
  const previewHref = candidate?.previewHref;
  const safePreview = Boolean(previewHref?.startsWith("/") && !previewHref.startsWith("//"));
  const previousDocuments = record?.documentRevisions.filter(item => item.revision < (candidate?.revision ?? 0)).sort((a, b) => b.revision - a.revision) ?? [];
  const canCreate = !managed || operator || allowIntake;
  return <section className={styles.root} aria-label="Website rebuild" aria-busy={busy || loading || undefined}>
    <header className={styles.header}>
      <p className={styles.eyebrow}>{operator ? "Managed delivery" : "Website"}</p>
      <h1 className="font-display">{record?.title ?? (managed && !operator ? "Your website preview" : "Your business. A new website.")}</h1>
      <p>{record ? "Review the preview and the decisions below. Every saved change clears the earlier approval." : managed && !operator ? allowIntake ? "Share your current website or describe your business to prepare a private preview. Review it before authorizing publication." : "Your preview will appear here when it is ready for your judgment. Delivery requires a separately authorized provider." : "Start with your current website. We read its content, compose a new site and show you what needs your judgment."}</p>
    </header>
    {readOnly ? <p className={styles.notice}><ShieldCheck size={18} aria-hidden="true" />You have read-only access. An owner or authorized operator can make changes.</p> : null}
    {error ? <div className={styles.error} role="alert"><CircleAlert size={18} aria-hidden="true" /><div>{error}<p>Your inputs and saved work remain available.</p></div></div> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {loading ? <p className={styles.notice} role="status"><Loader2 size={18} className="motion-safe:animate-spin" aria-hidden="true" />Opening the saved website…</p>
      : workId && !record ? <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Try loading again</Button>
      : !record ? canCreate ? <form className={styles.intake} onSubmit={event => { event.preventDefault(); if (startReady) void run(() => transport.start({ workspaceId, requestId: requestId.current, ...(descriptionMode ? { businessName: businessName.trim(), description: description.trim() } : { url: url.trim() }) }), "Website work saved. Follow its progress below."); }}>
        {descriptionMode ? <><TextInput label="Business name" value={businessName} onChange={event => setBusinessName(event.target.value)} required maxLength={160} disabled={disabled} /><TextArea label="Describe your business" helperText="Tell us what you do and how customers should reach you. These details will be marked as provided by you." value={description} onChange={event => setDescription(event.target.value)} maxLength={4000} required disabled={disabled} /></>
          : <TextInput label="Your current website" inputMode="url" autoComplete="url" placeholder="https://your-business.com" value={url} onChange={event => setUrl(event.target.value)} required maxLength={2048} disabled={disabled} />}
        <div className={styles.actions}><Button type="submit" loading={busy} disabled={disabled || !startReady} icon={<Globe size={18} />}>Build a private preview</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setDescriptionMode(value => !value)}>{descriptionMode ? "Use an existing website" : "No site yet? Describe your business"}</Button></div>
        <p className={styles.meta}>Your preview stays private. Publishing requires an owner&apos;s approval.</p>
      </form> : <p className={styles.notice}>No website preview is waiting for review. Choose an agency with an active provider seat to request website work.</p>
      : <>
        <ol className={styles.progress} aria-label="Website build progress" aria-live="polite">
          {record.stages.map(stage => <li key={stage.stage} data-status={stage.status}><span className={styles.stageIcon}>{stage.status === "completed" ? <Check size={16} aria-label="Completed" /> : stage.status === "running" ? <Loader2 size={16} className="motion-safe:animate-spin" aria-label="Running" /> : stage.status === "failed" ? <CircleAlert size={16} aria-label="Failed" /> : <span aria-label="Pending">○</span>}</span><div><strong>{stage.stage.replace(/_/g, " ")}</strong><p>{stage.message ?? stage.status}</p></div></li>)}
        </ol>
        {record.skippedPaths.length ? <section className={styles.domain} aria-labelledby="rebuild-skipped-heading"><h2 id="rebuild-skipped-heading">Pages we could not read</h2><p>These pages are absent from the preview. Add their missing business details, or start a request with your business description instead.</p><ul className="grid gap-3 break-all text-sm">{record.skippedPaths.map((page, index) => <li key={`${page.url}:${page.reason}:${index}`}><strong>{page.url}</strong><p>{skippedReason[page.reason]}</p></li>)}</ul></section> : null}
        {record.status === "failed" ? <div className={styles.error} role="alert"><div><p>{record.error ?? "The last stage needs attention. Earlier stages are saved."}</p><Button variant="secondary" disabled={disabled} loading={busy} onClick={() => void run(() => transport.mutate(record, "retry"), "Retry requested. Earlier stages are retained.")}>Retry failed stage</Button></div></div> : null}
        {candidate ? <div className={styles.reviewLayout}>
          <section className={styles.preview} aria-label="Private website preview">
            <div className={styles.previewBar}><div><strong>Private preview</strong><p>Revision {candidate.revision} · {candidate.pageCount} pages · Forms disabled</p></div>{safePreview ? <a href={previewHref} target="_blank" rel="noopener noreferrer">Open preview <ExternalLink size={16} aria-hidden="true" /></a> : null}</div>
            {safePreview ? <><iframe ref={previewRef} key={`${candidate.contentHash}:${previewAttempt}`} title={`Private website preview for ${record.title}`} src={previewHref} sandbox="allow-same-origin" onLoad={event => {
              try {
                const renderedHash = event.currentTarget.contentDocument?.querySelector('meta[name="strelva-site-hash"]')?.getAttribute("content");
                const valid = Boolean(renderedHash && (transport !== serverRebuildTransport || renderedHash === candidate.contentHash));
                setPreviewFailed(!valid); setPreviewLoaded(true);
              } catch { setPreviewFailed(true); setPreviewLoaded(true); }
            }} onError={() => setPreviewFailed(true)} />{!previewLoaded ? <p className={styles.meta} role="status">Loading the private preview…</p> : null}{previewFailed ? <div className={styles.error} role="alert"><p>The preview has not opened. Your review decisions are saved.</p><Button variant="secondary" onClick={() => setPreviewAttempt(value => value + 1)}>Reload preview</Button></div> : null}</> : <p className={styles.notice}>The preview address is unavailable. Refresh the saved website before approving.</p>}
          </section>
          <aside className={styles.decisions} aria-labelledby="rebuild-decisions-heading"><div className={styles.sectionHeader}><h2 ref={reviewHeadingRef} tabIndex={-1} id="rebuild-decisions-heading">{decisions.length ? `${decisions.length} ${decisions.length === 1 ? "decision needs" : "decisions need"} you` : "Ready for your review"}</h2><p>Only uncertain facts and sensitive claims appear here.</p></div>
            {decisions.length === 0 ? <p className={styles.notice}><Check size={18} aria-hidden="true" />All flagged facts have been resolved. Review the full site before approving.</p> : decisions.map(([id, fact]) => <article key={id} className={styles.fact}><p className={styles.tag}>{fact.highRisk ? "Sensitive claim · confirmation required" : "Could not confirm"}</p><p className={styles.factText}>{fact.text}</p><div className={styles.source}><strong>Source</strong>{fact.sources.length ? fact.sources.map((source, index) => <blockquote key={index}>“{source.quote}”<span>{source.sourceId.split("#sha256=")[0]}</span></blockquote>) : <p>No source found.</p>}</div>
              {editing === id ? <form onSubmit={event => { event.preventDefault(); if (editedText.trim()) void run(() => transport.mutate(record, "edit", { factId: id, text: editedText.trim() }), "Fact updated in a new revision. Review the changed preview."); }}><TextArea label="Corrected fact" value={editedText} onChange={event => setEditedText(event.target.value)} maxLength={500} disabled={disabled} required /><div className={styles.actions}><Button type="submit" size="sm" disabled={disabled || !editedText.trim()}>Save correction</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div></form>
                : <div className={styles.actions}><Button size="sm" variant="secondary" disabled={disabled} onClick={() => void run(() => transport.mutate(record, "confirm", { factId: id }), "Fact confirmed in a new revision.")}>Confirm</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={() => { setEditing(id); setEditedText(fact.text); }}>Edit</Button><Button size="sm" variant="danger" disabled={disabled} onClick={() => void run(() => transport.mutate(record, "remove", { factId: id }), "Fact removed in a new revision.")}>Remove</Button></div>}
            </article>)}
            {candidate.unmappedPages.length ? <div className={styles.fact}><h3>Old pages not carried over</h3><ul>{candidate.unmappedPages.map(path => <li key={path}>{path}</li>)}</ul><p>Review these pages before authorizing publication.</p></div> : null}
            <div className={styles.approval}><p>{record.status === "published" ? "This revision has been published." : record.approved ? "This exact preview is approved." : decisions.length ? "Resolve the flagged facts before approving." : "Approval applies to this exact revision and its content."}</p>
              {agencyPermission && !agencyPermission.granted && record.status !== "published" ? <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" checked={allowAgencyPublish} disabled={disabled} onChange={event => setAllowAgencyPublish(event.target.checked)} /><span>Allow {agencyPermission.agencyName} to publish this website after I approve each change.<span className="mt-1 block text-gray-muted">Each new preview still needs your approval. This does not authorize domain changes.</span></span></label> : null}
              {agencyPermission?.granted ? <p>{agencyPermission.agencyName} can publish this website after you approve each exact preview.</p> : null}
              {(!record.approved || (allowAgencyPublish && agencyPermission && !agencyPermission.granted)) && record.status !== "published" ? <Button disabled={disabled || decisions.length > 0 || !safePreview || previewFailed || !previewLoaded || record.status === "building"} loading={busy} onClick={() => void run(() => transport.mutate(record, "approve", allowAgencyPublish && agencyPermission ? { allowAgencyPublish: true, agencyWorkspaceId: agencyPermission.agencyWorkspaceId } : undefined), allowAgencyPublish && agencyPermission ? `This exact preview is approved. ${agencyPermission.agencyName} may publish this website after your approval of each change.` : "This exact preview is approved.")}>{record.approved ? "Approve preview and allow agency publishing" : "Approve this preview"}</Button> : null}
              {record.approved && record.status !== "published" && (!managed || operator || canPublish) ? <Button disabled={disabled} loading={busy} onClick={() => void run(() => transport.mutate(record, "launch"), "Publish result saved. Check its verification below.")}>Publish approved website</Button> : null}
              {record.approved && managed && !operator && !canPublish && record.status !== "published" ? <p>{agencyPermission ? agencyPermission.granted ? `${agencyPermission.agencyName} can publish this approved preview.` : `Authorize ${agencyPermission.agencyName} above if you want them to publish this website.` : "No agency publication authority is shown here. Choose and authorize an agency before requesting delivery. Domain changes require separate permission."}</p> : null}
              <a className={styles.link} href={`/api/websites/${encodeURIComponent(record.workId)}/export?${new URLSearchParams({ workspaceId, revision: String(candidate.revision), contentHash: candidate.contentHash })}`}>Export website and evidence</a>
              {operator ? <a className={styles.link} href={`/workspace?${new URLSearchParams({ workspaceId, view: "websites", work: record.workId })}`}>Owner review link</a> : null}
            </div>
          </aside>
        </div> : <p className={styles.notice} role="status">Your preview will appear here after the saved build stages finish.</p>}
        {candidate && ordinaryFacts.length ? <details className={styles.domain}>
          <summary ref={factsSummaryRef} className="min-h-11 cursor-pointer py-3 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Edit website facts</summary>
          <p>Change the wording in this website without changing what is live. Each saved correction needs a new preview approval. Removing a contact changes this private preview and needs approval too.</p>
          {ordinaryFacts.map(([id, fact]) => <WebsiteFactEditor key={id} text={fact.text} origin={fact.origin} disabled={disabled} onSave={text => run(() => transport.mutate(record, "edit", { factId: id, text }), "Fact updated in a new revision. Review the changed preview before approving.")} onRemove={fact.kind === "contact" ? () => run(async () => {
            const next = await transport.mutate(record,"remove",{ factId: id });
            removedContactFocus.current = true;
            return next;
          },"Contact removed in a new private preview. Review and approve it before publishing.") : undefined} />)}
        </details> : null}
        {candidate && (!managed || operator || canPublish) && transport === serverRebuildTransport ? <WebsiteConnectionSelector key={`${record.workId}:${record.revision}`} workspaceId={workspaceId} workId={record.workId} revision={record.revision} selected={record.capabilitySelection} hasForms={candidate.hasForms} hosted disabled={disabled} onBusyChange={setBusy} onSaved={value => { const next = parseRebuildView(value); setRecord(next); setNotice("Visitor forms saved in a new preview. Review and approve it before publishing."); onSaved?.(next.workId); }} /> : null}
        {record.audit ? <section className={styles.domain} aria-labelledby="rebuild-audit-heading"><h2 id="rebuild-audit-heading">Before and after</h2><p>HTML checks compare the original homepage with the planned rebuilt homepage. Checked {new Date(record.audit.checkedAt).toLocaleString()}.</p><div className={styles.records}><table><caption>HTML scores out of 100 · original → rebuilt</caption><thead><tr><th>Category</th><th>Scores</th><th aria-label="Change">+/−</th></tr></thead><tbody>{record.audit.after.categories.map(after => { const before = record.audit!.before.categories.find(item => item.slug === after.slug); const change = before ? after.score - before.score : null; return <tr key={after.slug}><th scope="row">{after.name}</th><td className="whitespace-nowrap">{before?.score ?? "Unavailable"} → {after.score}</td><td>{change === null ? "Unavailable" : change > 0 ? `+${change}` : change}</td></tr>; })}</tbody></table></div><div className="mt-4 space-y-3">{record.audit.after.categories.map(after => <details key={after.slug}><summary className="cursor-pointer py-2 text-sm text-warm-black">{after.name} · item by item</summary><ul className="mt-3 divide-y divide-gray-border">{after.checks.map((check, index) => { const before = record.audit!.before.categories.find(item => item.slug === after.slug)?.checks.find(item => item.name === check.name); return <li key={`${check.name}:${index}`} className="py-3 text-sm text-gray-muted"><strong className="text-warm-black">{check.name}</strong><p>{before?.status ?? "Not measured"} → {check.status}</p><p>{check.message}</p></li>; })}</ul></details>)}</div><p>These HTML results do not establish a complete live-site audit. Not measured here:</p><ul className="list-disc space-y-2 pl-5 text-sm text-gray-muted">{record.audit.unavailable.map(item => <li key={item}>{item}</li>)}</ul></section> : null}
        {operator && candidate ? <details className={styles.domain}><summary className="cursor-pointer py-2 text-base font-medium text-warm-black">All recorded fact checks</summary><p className={styles.meta}>Recorded confidence describes source support. It does not independently prove a claim.</p><ul className="mt-4 divide-y divide-gray-border">{Object.entries(candidate.facts).map(([id, fact]) => <li key={id} className="py-3 text-sm text-gray-muted"><p className="text-warm-black">{fact.text}</p><p>{fact.origin.replace(/_/g, " ")} · {fact.highRisk ? "Sensitive claim" : "Ordinary fact"} · {fact.verification ? `${fact.verification.supported ? "Source supported" : "Flagged"}, confidence ${fact.verification.confidence.toFixed(2)}` : "No verification recorded"}</p></li>)}</ul></details> : null}
        {record.history.length ? <section className={styles.domain} aria-labelledby="rebuild-history-heading"><h2 id="rebuild-history-heading">Revision history</h2><ol className="mt-4 divide-y divide-gray-border">{record.history.slice().reverse().map((entry, index) => <li key={`${entry.revision}:${entry.kind}:${index}`} className="py-3 text-sm text-gray-muted">Revision {entry.revision} · {entry.kind.replace(/_/g, " ")} · <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time></li>)}</ol></section> : null}
        {agency && candidate && record.status !== "published" ? <WebsiteRebuildSharing workId={record.workId} readOnly={readOnly} /> : null}
        {record.publishedUrl ? <WebsiteRebuildReport key={record.workId} workId={record.workId} fixture={transport !== serverRebuildTransport} /> : null}
        {record.publishedUrl ? <section className={styles.domain} aria-labelledby="rebuild-domain-heading"><h2 id="rebuild-domain-heading">Your website</h2>{record.publishedUrl ? <a className={styles.link} href={record.publishedUrl} target="_blank" rel="noopener noreferrer">{record.publishedUrl} <ExternalLink size={16} aria-hidden="true" /></a> : null}<p>{record.readBack === "verified" ? "The published document was verified." : record.readBack === "failed" ? "Published, but readback failed. Verification is required before calling this confirmed; checking does not republish the site." : "Publication recorded. Verification is pending."}</p>
          {record.domain ? <><h3>{record.domain.hostname}</h3><p>Status: {record.domain.status} · Last checked: {record.domain.checkedAt ? new Date(record.domain.checkedAt).toLocaleString() : "Not checked yet"}</p>{record.domain.error ? <div role="alert" className={styles.error}>{record.domain.error}</div> : null}{record.domain.records.length ? <div className={styles.records}><table className={styles.dns}><caption>DNS records returned by the domain provider</caption><thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead><tbody>{record.domain.records.map((dns, index) => <tr key={index}><td>{dns.type}</td><td>{dns.name}</td><td>{dns.value}</td></tr>)}</tbody></table></div> : <p>No DNS records have been returned yet.</p>}</> : null}
          {operator && !readOnly && transport === serverRebuildTransport ? <WebsiteDomainRequest workId={record.workId} /> : null}
          {(!managed || operator) && !readOnly ? <form className={styles.domainForm} onSubmit={event => { event.preventDefault(); if (domain.trim() || record.domain) void run(() => transport.mutate(record, "domain", { domain: domain.trim() || record.domain?.hostname }), "Domain status refreshed."); }}><TextInput label="Your domain" placeholder="your-business.com" value={domain} onChange={event => setDomain(event.target.value)} disabled={busy} /><Button type="submit" variant="secondary" disabled={busy || (!domain.trim() && !record.domain)} loading={busy}>{record.domain ? "Check domain status" : "Connect domain"}</Button></form> : <p>{pathHosted && !record.domain ? (agencyPermission ? `This publication uses a hosted address. Ask ${agencyPermission.agencyName} about a custom domain.` : "This publication uses a hosted address. Custom domain setup requires separate authority.") : (agencyPermission ? `Ask ${agencyPermission.agencyName} about domain setup and verification.` : "Domain setup and verification require separate authority.")}</p>}
          {!readOnly && !operator && record.tenantId && (!pathHosted || record.domain) && transport === serverRebuildTransport ? <WebsiteCutoverUndo key={`${record.workId}:${candidate?.contentHash}`} record={record} /> : null}
          {(!managed || operator) && !readOnly && previousDocuments.length ? <div className={styles.domainForm}><SelectInput label="Revision to restore" value={undoTarget || String(previousDocuments[0]!.revision)} onChange={event => setUndoTarget(event.target.value)} options={previousDocuments.map(item => ({ value: String(item.revision), label: `Revision ${item.revision} · ${new Date(item.createdAt).toLocaleDateString()}` }))} disabled={busy} /><Button variant="secondary" disabled={busy} onClick={() => void run(() => transport.mutate(record, "undo", { targetRevision: Number(undoTarget || previousDocuments[0]!.revision) }), "The selected document is restored as a new revision. Review and approve it before publishing.")}>Restore for review</Button></div> : null}
        </section> : null}
      </>}
  </section>;
}
