"use client";

import { useEffect, useState } from "react";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { Button } from "@/components/ui/Button";
import { SystemPanel as Panel } from "./SystemPanel";
import type { WebsiteHistoryItem, WebsiteRequestItem, WebsiteSystemDetail, WebsiteWaitingItem } from "./website-detail";
import { mergeWebsiteHistory } from "./website-detail";
import type { SystemHistoryRow } from "./model";
import styles from "./systems.module.css";

export type WebsiteDetailState =
  | { status: "loading" }
  | { status: "ready"; detail: WebsiteSystemDetail }
  | { status: "error"; message: string };

/** Reads GET /api/workspace/systems/website for one website System. A new `version` reads it again (after filing a Request). */
export function useWebsiteSystemDetail(workspaceId: string, systemId: string, enabled: boolean, version = 0): WebsiteDetailState | null {
  const request = useWorkspaceRequest();
  const [state, setState] = useState<{ key: string; value: WebsiteDetailState } | null>(null);
  const [shown, setShown] = useState<{ key: string; value: WebsiteDetailState } | null>(null);
  const key = `${workspaceId}:${systemId}`;
  const readKey = `${key}:${version}`;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      try {
        const response = await request(`/api/workspace/systems/website?${new URLSearchParams({ workspaceId, systemId })}`);
        const body = await response.json().catch(() => null) as { detail?: WebsiteSystemDetail; error?: string } | null;
        if (!active) return;
        const value: WebsiteDetailState = response.ok && body?.detail ? { status: "ready", detail: body.detail } : { status: "error", message: body?.error || "This website's details could not be loaded." };
        setState({ key: readKey, value });
        if (value.status === "ready") setShown({ key, value });
      } catch {
        if (active) setState({ key: readKey, value: { status: "error", message: "This website's details could not be reached." } });
      }
    })();
    return () => { active = false; };
  }, [enabled, key, readKey, request, systemId, workspaceId]);
  if (!enabled) return null;
  if (state?.key === readKey) return state.value;
  // A re-read keeps showing the last good lists instead of flashing to loading.
  return shown?.key === key ? shown.value : { status: "loading" };
}

function when(at: string | null): string {
  if (!at) return "";
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STAGE_LABEL: Record<WebsiteRequestItem["stage"], string> = {
  asked: "Asked", in_progress: "In progress", ready_for_review: "Ready for your review", done: "Done", declined: "Declined",
};

const SOURCE_LABEL: Record<WebsiteHistoryItem["source"], string> = {
  content: "Content", snapshot: "Saved copy", document: "Site revision", deploy: "Deploy", system: "Release",
};

function Unavailable({ names }: { names: readonly string[] }) {
  return names.length ? <p className="mt-3 text-xs text-gray-muted" role="status">Couldn&rsquo;t read {names.join(", ").toLowerCase()} just now. Nothing about them is shown.</p> : null;
}

function WaitingRow({ item }: { item: WebsiteWaitingItem }) {
  return <li>
    <span>{item.href ? <a href={item.href}>{item.title}</a> : item.title}</span>
    {item.detail ? <small>{item.detail}</small> : null}
    {item.at ? <small><time dateTime={item.at}>{when(item.at)}</time></small> : null}
  </li>;
}

const ACTIVITY_WORDS: Record<string, [string, string]> = {
  visit: ["visit", "visits"], call_click: ["call tap", "call taps"], email_click: ["email tap", "email taps"],
  booking_click: ["booking tap", "booking taps"], directions_click: ["directions tap", "directions taps"], form_submit: ["form sent", "forms sent"],
};

/** A connected site: prove the host, then what it reports and the inquiries it sent. Strelva never edits its pages. */
function ConnectedSitePanel({ workspaceId, systemId, site, readOnly }: { workspaceId: string; systemId: string; site: NonNullable<WebsiteSystemDetail["connectedSite"]>; readOnly: boolean }) {
  const request = useWorkspaceRequest();
  const [verified, setVerified] = useState(site.verified);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ tone: "status" | "alert"; text: string } | null>(null);
  async function check() {
    setChecking(true); setMessage(null);
    try {
      const response = await request("/api/workspace/connected-sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", workspaceId, siteId: site.siteId }) });
      const body = await response.json().catch(() => null) as { site?: { verifiedAt: string | null }; error?: string } | null;
      if (response.ok && body?.site?.verifiedAt) { setVerified(true); setMessage({ tone: "status", text: `${site.siteHost} is proven to be yours. Strelva now takes its inquiries.` }); }
      else setMessage({ tone: "alert", text: body?.error || "We couldn't check the site just now. Nothing changed." });
    } catch {
      setMessage({ tone: "alert", text: "We couldn't reach Strelva just now. Nothing changed." });
    } finally {
      setChecking(false);
    }
  }
  const counts = Object.entries(site.activity).filter(([kind]) => ACTIVITY_WORDS[kind]).map(([kind, n]) => `${n} ${ACTIVITY_WORDS[kind]![n === 1 ? 0 : 1]}`);
  return <Panel id={`${systemId}-connected`} title="Connected site" count={site.inquiries.length} intro="Your site stays where it is. Strelva fills in your confirmed details, takes its inquiries and counts visits. It never edits your pages.">
    {!verified ? <div className="mt-3 grid gap-2 text-sm">
      {site.install && !readOnly ? <>
        <p>1. Add these two lines to every page of {site.siteHost} (most builders call this “custom code” or “header code”).</p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-bg p-3 text-xs" aria-label="Lines to add to your site">{[site.install.meta, site.install.script].filter(Boolean).join("\n")}</pre>
        <p>2. Publish the site, then check. Strelva reads the live page to confirm it&rsquo;s yours.</p>
        <button type="button" className="justify-self-start underline" disabled={checking} onClick={() => void check()}>{checking ? "Checking…" : "Check now"}</button>
      </> : <p className="text-gray-muted">An owner or admin of this business can finish connecting it.</p>}
    </div> : <p className="mt-3 text-sm">{counts.length ? `Last 30 days: ${counts.join(", ")}.` : "No visits reported yet. They show here once people use the site."}{site.lastEventAt ? ` Last seen ${when(site.lastEventAt)}.` : ""}</p>}
    {message ? <p role={message.tone} className="mt-2 text-sm">{message.text}</p> : null}
    {site.inquiries.length ? <ul className={styles.panelList} aria-label={`Inquiries from ${site.siteHost}`}>{site.inquiries.map(item => <li key={item.id}>
      <span>{item.name}</span>
      {item.message ? <small>{item.message.slice(0, 160)}</small> : null}
      <small>{item.email ? `${item.email} · ` : ""}<time dateTime={item.capturedAt}>{when(item.capturedAt)}</time></small>
    </li>)}</ul> : verified ? <p className="mt-2 text-xs text-gray-muted">No inquiries yet.</p> : null}
  </Panel>;
}

/**
 * Domains, Waiting on you, Requests and History for a website System. Every
 * list comes from the store that owns it (website-detail-server.ts); a list
 * that could not be read says so instead of reading as empty.
 */
export function WebsiteSystemPanels({ workspaceId, systemId, state, onAsk, onAskChange, readOnly, includeHistory = true }: { workspaceId: string; systemId: string; state: WebsiteDetailState; onAsk: (request: string) => void; /** A managed site files a Request instead of prefilling the composer. */ onAskChange?: () => void; readOnly: boolean; includeHistory?: boolean }) {
  if (state.status === "loading") return <section className={styles.panel} aria-busy="true" aria-label="Website details"><p role="status">Loading domains, requests and history…</p></section>;
  if (state.status === "error") return <section className={styles.panel} aria-label="Website details"><p role="alert">{state.message} The site itself is unchanged.</p></section>;
  const { detail } = state;
  const unavailable = new Set(detail.unavailable);
  const domainsMissing = unavailable.has("Domains");
  const waitingMissing = ["Decisions", "Drafts", "Site review"].filter(name => unavailable.has(name));
  const requestsMissing = ["Requests and pending changes", "Service requests"].filter(name => unavailable.has(name));
  return <>
    {detail.connectedSite ? <ConnectedSitePanel workspaceId={workspaceId} systemId={systemId} site={detail.connectedSite} readOnly={readOnly} /> : null}
    {detail.domains.length || domainsMissing ? <Panel id={`${systemId}-domains`} title="Domains" count={detail.domains.length} intro="Where the site answers, and whether each address is verified.">
      {detail.domains.length ? <ul className={styles.panelList} aria-label="Domains">{detail.domains.map(domain => <li key={domain.hostname} data-domain-state={domain.state}>
        <span>{domain.hostname}</span>
        <small>{domain.label}{domain.lastCheckedAt ? ` · checked ${when(domain.lastCheckedAt)}` : ""}</small>
        <small>{domain.whoCanChange}</small>
      </li>)}</ul> : domainsMissing ? null : <p className="mt-3">No domain is recorded for this site yet.</p>}
      <Unavailable names={domainsMissing ? ["Domains"] : []} />
    </Panel> : null}
    {detail.waiting.length || waitingMissing.length ? <Panel id={`${systemId}-waiting`} title="Waiting on you" count={detail.waiting.length} intro="Only the decisions that are yours. The same items as Needs you, for this site.">
      {detail.waiting.length ? <ul className={styles.panelList} aria-label="Waiting on you">{detail.waiting.map(item => <WaitingRow key={item.id} item={item} />)}</ul> : waitingMissing.length ? null : <p className="mt-3">Nothing is waiting on you for this site.</p>}
      <Unavailable names={waitingMissing} />
    </Panel> : null}
    {detail.requests.length || requestsMissing.length ? <Panel id={`${systemId}-requests`} title="Requests" count={detail.requests.length} intro="Work asked for on this site, until it is done.">
      {detail.requests.length ? <ul className={styles.panelList} aria-label="Requests">{detail.requests.map(item => <li key={item.id}>
        <span>{item.href ? <a href={item.href}>{item.title}</a> : item.title}</span>
        <small>{STAGE_LABEL[item.stage]} · <time dateTime={item.at}>{when(item.at)}</time></small>
      </li>)}</ul> : requestsMissing.length ? null : <p className="mt-3">No open requests. <button type="button" className="underline" disabled={readOnly} onClick={() => onAskChange ? onAskChange() : onAsk("Change on the website: ")}>Ask for a change</button></p>}
      <Unavailable names={requestsMissing} />
    </Panel> : null}
    {includeHistory ? <WebsiteHistoryPanel workspaceId={workspaceId} systemId={systemId} state={state} canRestore={!readOnly} /> : null}
  </>;
}

export function hasWebsiteDetail(state: WebsiteDetailState | null): boolean {
  return Boolean(state && (state.status !== "ready" || state.detail.connectedSite || state.detail.domains.length || state.detail.waiting.length
    || state.detail.requests.length || state.detail.history.length || state.detail.unavailable.length));
}

function WebsiteHistoryRow({ item, workspaceId, systemId, canRestore, appBase, onPrepared, onAskRestore }: {
  item: WebsiteHistoryItem; workspaceId: string; systemId: string; canRestore: boolean; appBase: string; onPrepared?: () => void; onAskRestore?: () => void;
}) {
  const request = useWorkspaceRequest();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  async function restore() {
    if (!item.restore || busy) return;
    setBusy(true); setNotice(null);
    try {
      const response = await request("/api/workspace/systems/website/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, systemId, ...item.restore }) });
      const body = await response.json().catch(() => null) as { status?: string; message?: string; error?: string } | null;
      if (!response.ok || (body?.status !== "queued" && body?.status !== "requested")) throw new Error(body?.error || "The restore could not be confirmed. Reload before trying again.");
      setNotice({ error: false, text: body.message || "The earlier content is prepared for review. Your live site is unchanged." });
      onPrepared?.();
    } catch (error) {
      const message = error instanceof Error && !(error instanceof TypeError) ? error.message : "The restore could not be confirmed.";
      setNotice({ error: true, text: message.includes("Reload before trying again") ? message : `${message} Reload before trying again.` });
    }
    finally { setBusy(false); }
  }
  return <li>
    <span>{item.title}</span>
    <small>{SOURCE_LABEL[item.source]} · {item.by} · <time dateTime={item.at}>{when(item.at)}</time></small>
    {item.deployment ? <small>Commit {item.deployment.commitSha} · <a href={item.deployment.url} target="_blank" rel="noopener noreferrer">Open deployment</a></small> : null}
    <small>{item.undo ?? "No undo for this change."}</small>
    {canRestore && item.restore ? <Button size="sm" variant="secondary" loading={busy} disabled={busy || notice !== null} onClick={() => void restore()}>{"kind" in item.restore && item.restore.kind === "snapshot" ? "Ask Strelva to restore" : "Prepare restore"}</Button>
      : canRestore && item.restoreHref ? <a href={`${appBase}${item.restoreHref}`} className="text-sm underline underline-offset-4">Restore from History</a>
        : canRestore && item.source === "deploy" && item.undo && onAskRestore ? <Button size="sm" variant="secondary" onClick={onAskRestore}>Ask Strelva to restore</Button> : null}
    {notice ? <small role={notice.error ? "alert" : "status"}>{notice.text}</small> : null}
  </li>;
}

/** One History, after Connections and Possibilities, with five recent rows. */
export function WebsiteHistoryPanel({ workspaceId, systemId, state, systemHistory = [], canRestore, appBase = "", onPrepared, onAskRestore }: {
  workspaceId: string; systemId: string; state: WebsiteDetailState; systemHistory?: SystemHistoryRow[]; canRestore: boolean;
  appBase?: string; onPrepared?: () => void; onAskRestore?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (state.status !== "ready") return null;
  const detail = state.detail;
  const missing = detail.unavailable.filter(name => ["Content history", "Saved copies", "Site revisions", "Site replacements", "Repo deploy history", "System release history"].includes(name));
  const history = mergeWebsiteHistory(detail.history, systemHistory);
  if (!history.length && !missing.length) return null;
  return <Panel id={`${systemId}-history`} title="History" count={history.length} intro="Every release of this site, newest first. Issued changes are never rewritten; undo is a new release.">
    {history.length ? <ol className={styles.panelList} aria-label="History">{(showAll ? history : history.slice(0, 5)).map(item => <WebsiteHistoryRow key={item.id} item={item} workspaceId={workspaceId} systemId={systemId} canRestore={canRestore} appBase={appBase} onPrepared={onPrepared} onAskRestore={onAskRestore} />)}</ol> : null}
    {history.length > 5 ? <button type="button" className="mt-3 min-h-11 text-sm underline underline-offset-4" onClick={() => setShowAll(value => !value)}>{showAll ? "Show recent changes" : "Show more history"}</button> : null}
    <Unavailable names={missing} />
  </Panel>;
}
