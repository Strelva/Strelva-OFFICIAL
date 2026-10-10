"use client";

import { useEffect, useState } from "react";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import type { WebsiteHistoryItem, WebsiteRequestItem, WebsiteSystemDetail, WebsiteWaitingItem } from "./website-detail";
import { mergeWebsiteHistory } from "./website-detail";
import type { SystemHistoryRow } from "./model";
import styles from "./website-panels.module.css";

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
  return names.length ? <StNotice><span role="status">Couldn’t read {names.join(", ").toLowerCase()} just now. Nothing about them is shown.</span></StNotice> : null;
}

function WaitingRow({ item }: { item: WebsiteWaitingItem }) {
  return <StRow title={item.title} href={item.href ?? undefined} detail={item.detail} lead={<StState kind="need">Needs you</StState>} end={item.at ? <StMono as="time" dateTime={item.at}>{when(item.at)}</StMono> : null} />;
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
  const install = site.install ? [site.install.meta, site.install.script].filter(Boolean).join("\n") : "";
  return <StSection id={`${systemId}-connected`} title="Connected site" meta={<StState kind={verified ? "live" : "need"}>{verified ? "Connected" : "Not connected yet"}</StState>}>
    <p className={styles.description}>Your site stays where it is. Strelva fills in your confirmed details, takes its inquiries and counts visits. It never edits your pages.</p>
    {!verified ? site.install && !readOnly ? <div className={styles.connectSteps}>
      <StSurface label="Installation lines"><div className={styles.stack}>
        <h3 className={styles.stepTitle}>1. Add the installation lines</h3>
        <p className={styles.description}>Add these two lines to every page of {site.siteHost}. Most builders call this “custom code” or “header code”.</p>
        <pre className={styles.installCode} aria-label="Lines to add to your site">{install}</pre>
      </div></StSurface>
      <StSurface label="Verify your live site"><div className={styles.stack}>
        <h3 className={styles.stepTitle}>2. Publish the site, then check</h3>
        <p className={styles.description}>Strelva reads the live page to confirm it’s yours. Nothing is collected until the check passes.</p>
        <StPill variant="soft" busy={checking} onClick={() => void check()}>{checking ? "Checking…" : "Check now"}</StPill>
      </div></StSurface>
    </div> : <StNotice>An owner or admin of this business can finish connecting it.</StNotice> : <StRows label="Activity reported by your site">
      <StRow title={counts.length ? `Last 30 days: ${counts.join(", ")}.` : "Last 30 days"} detail={counts.length ? undefined : "No visits reported yet. They show here once people use the site."} end={site.lastEventAt ? <StMono>Last seen {when(site.lastEventAt)}</StMono> : null} />
    </StRows>}
    {message ? <StNotice tone={message.tone === "alert" ? "critical" : undefined}><span role={message.tone}>{message.text}</span></StNotice> : null}
    {site.inquiries.length ? <StRows label={`Inquiries from ${site.siteHost}`}>{site.inquiries.map(item => <StRow key={item.id} title={item.name} detail={<>{item.message ? <>{item.message.slice(0, 160)}<br /></> : null}{item.email}</>} end={<StMono as="time" dateTime={item.capturedAt}>{when(item.capturedAt)}</StMono>} />)}</StRows> : verified ? <StEmpty>No inquiries yet.</StEmpty> : null}
  </StSection>;
}

/**
 * Domains, Waiting on you, Requests and History for a website System. Every
 * list comes from the store that owns it (website-detail-server.ts); a list
 * that could not be read says so instead of reading as empty.
 */
export function WebsiteSystemPanels({ workspaceId, systemId, state, onAsk, onAskChange, readOnly, includeHistory = true }: { workspaceId: string; systemId: string; state: WebsiteDetailState; onAsk: (request: string) => void; /** A managed site files a Request instead of prefilling the composer. */ onAskChange?: () => void; readOnly: boolean; includeHistory?: boolean }) {
  if (state.status === "loading") return <section className={styles.stack} aria-busy="true" aria-label="Website details"><p className={styles.description} role="status">Loading domains, requests and history…</p><StSkeleton width="60%" /><StSkeleton /><StSkeleton width="80%" /></section>;
  if (state.status === "error") return <section aria-label="Website details"><StNotice tone="critical">{state.message} The site itself is unchanged.</StNotice></section>;
  const { detail } = state;
  const unavailable = new Set(detail.unavailable);
  const domainsMissing = unavailable.has("Domains");
  const waitingMissing = ["Decisions", "Drafts", "Site review"].filter(name => unavailable.has(name));
  const requestsMissing = ["Requests and pending changes", "Service requests"].filter(name => unavailable.has(name));
  return <>
    {detail.connectedSite ? <ConnectedSitePanel workspaceId={workspaceId} systemId={systemId} site={detail.connectedSite} readOnly={readOnly} /> : null}
    {detail.domains.length || domainsMissing ? <StSection id={`${systemId}-domains`} title="Domains" meta={<StMono>{detail.domains.length}</StMono>}>
      <p className={styles.description}>Where the site answers, and whether each address is verified.</p>
      {detail.domains.length ? <StRows label="Domains">{detail.domains.map(domain => <StRow key={domain.hostname} title={<StMono tone="text">{domain.hostname}</StMono>} detail={domain.whoCanChange} end={<span className={styles.stackEnd}><StState kind={domain.state === "verified" ? "live" : ["misconfigured", "conflict", "error"].includes(domain.state) ? "down" : "need"}>{domain.label}</StState>{domain.lastCheckedAt ? <StMono>Checked {when(domain.lastCheckedAt)}</StMono> : null}</span>} />)}</StRows> : domainsMissing ? null : <StEmpty>No domain is recorded for this site yet.</StEmpty>}
      <Unavailable names={domainsMissing ? ["Domains"] : []} />
    </StSection> : null}
    {detail.waiting.length || waitingMissing.length ? <StSection id={`${systemId}-waiting`} title="Waiting on you" meta={<StMono>{detail.waiting.length}</StMono>}>
      <p className={styles.description}>Only the decisions that are yours. The same items as Needs you, for this site.</p>
      {detail.waiting.length ? <StRows label="Waiting on you">{detail.waiting.map(item => <WaitingRow key={item.id} item={item} />)}</StRows> : waitingMissing.length ? null : <StEmpty>Nothing is waiting on you for this site.</StEmpty>}
      <Unavailable names={waitingMissing} />
    </StSection> : null}
    {detail.requests.length || requestsMissing.length ? <StSection id={`${systemId}-requests`} title="Requests" meta={<StMono>{detail.requests.length}</StMono>}>
      <p className={styles.description}>Work asked for on this site, until it is done.</p>
      {detail.requests.length ? <StRows label="Requests">{detail.requests.map(item => <StRow key={item.id} title={item.title} href={item.href ?? undefined} detail={<StState kind={item.stage === "ready_for_review" ? "need" : item.stage === "done" ? "live" : "draft"}>{STAGE_LABEL[item.stage]}</StState>} end={<StMono as="time" dateTime={item.at}>{when(item.at)}</StMono>} />)}</StRows> : requestsMissing.length ? null : <StEmpty action={<StTextButton disabled={readOnly} onClick={() => onAskChange ? onAskChange() : onAsk("Change on the website: ")}>Ask for a change</StTextButton>}>No open requests.</StEmpty>}
      <Unavailable names={requestsMissing} />
    </StSection> : null}
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
  return <StRow title={item.title} detail={<span className={styles.stack}>
    <span>{SOURCE_LABEL[item.source]} · {item.by} · <StMono as="time" dateTime={item.at}>{when(item.at)}</StMono></span>
    {item.deployment ? <><span>Commit <StMono>{item.deployment.commitSha}</StMono> · <a href={item.deployment.url} target="_blank" rel="noopener noreferrer">Open deployment</a></span><StState kind={item.deployment.readBack === "confirmed" ? "live" : "need"}>{item.deployment.readBack === "confirmed" ? "Live page read back and confirmed" : item.deployment.readBack === "not_confirmed" ? "Published; live page not confirmed" : "Published; live page not checked"}</StState></> : null}
    <span>{item.undo ?? "No undo for this change."}</span>
    {notice ? <span role={notice.error ? "alert" : "status"}>{notice.text}</span> : null}
  </span>} end={canRestore && item.restore ? <StPill variant="soft" busy={busy} disabled={busy || notice !== null} onClick={() => void restore()}>{"kind" in item.restore && item.restore.kind === "snapshot" ? "Ask Strelva to restore" : "Prepare restore"}</StPill>
    : canRestore && item.restoreHref ? <StTextButton href={`${appBase}${item.restoreHref}`}>Restore from History</StTextButton>
      : canRestore && item.source === "deploy" && item.undo && onAskRestore ? <StTextButton onClick={onAskRestore}>Ask Strelva to restore</StTextButton> : null} align="start" />;
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
  return <StSection id={`${systemId}-history`} title="History" meta={<StMono>{history.length}</StMono>}>
    <p className={styles.description}>Every release of this site, newest first. Issued changes are never rewritten; undo is a new release.</p>
    {history.length ? <StRows label="History">{(showAll ? history : history.slice(0, 5)).map(item => <WebsiteHistoryRow key={item.id} item={item} workspaceId={workspaceId} systemId={systemId} canRestore={canRestore} appBase={appBase} onPrepared={onPrepared} onAskRestore={onAskRestore} />)}</StRows> : null}
    {history.length > 5 ? <StTextButton onClick={() => setShowAll(value => !value)}>{showAll ? "Show recent changes" : "Show more history"}</StTextButton> : null}
    <Unavailable names={missing} />
  </StSection>;
}
