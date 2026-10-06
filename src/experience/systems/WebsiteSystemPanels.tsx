"use client";

import { useEffect, useState } from "react";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { SystemPanel as Panel } from "./SystemPanel";
import type { WebsiteHistoryItem, WebsiteRequestItem, WebsiteSystemDetail, WebsiteWaitingItem } from "./website-detail";
import styles from "./systems.module.css";

export type WebsiteDetailState =
  | { status: "loading" }
  | { status: "ready"; detail: WebsiteSystemDetail }
  | { status: "error"; message: string };

/** Reads GET /api/workspace/systems/website for one website System. */
export function useWebsiteSystemDetail(workspaceId: string, systemId: string, enabled: boolean): WebsiteDetailState | null {
  const request = useWorkspaceRequest();
  const [state, setState] = useState<{ key: string; value: WebsiteDetailState } | null>(null);
  const key = `${workspaceId}:${systemId}`;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      try {
        const response = await request(`/api/workspace/systems/website?${new URLSearchParams({ workspaceId, systemId })}`);
        const body = await response.json().catch(() => null) as { detail?: WebsiteSystemDetail; error?: string } | null;
        if (!active) return;
        setState({ key, value: response.ok && body?.detail ? { status: "ready", detail: body.detail } : { status: "error", message: body?.error || "This website's details could not be loaded." } });
      } catch {
        if (active) setState({ key, value: { status: "error", message: "This website's details could not be reached." } });
      }
    })();
    return () => { active = false; };
  }, [enabled, key, request, systemId, workspaceId]);
  if (!enabled) return null;
  return state?.key === key ? state.value : { status: "loading" };
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
  content: "Content", snapshot: "Saved copy", document: "Site revision", deploy: "Deploy",
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

/**
 * Domains, Waiting on you, Requests and History for a website System. Every
 * list comes from the store that owns it (website-detail-server.ts); a list
 * that could not be read says so instead of reading as empty.
 */
export function WebsiteSystemPanels({ systemId, state, onAsk, readOnly }: { systemId: string; state: WebsiteDetailState; onAsk: (request: string) => void; readOnly: boolean }) {
  if (state.status === "loading") return <section className={styles.panel} aria-busy="true" aria-label="Website details"><p role="status">Loading domains, requests and history…</p></section>;
  if (state.status === "error") return <section className={styles.panel} aria-label="Website details"><p role="alert">{state.message} The site itself is unchanged.</p></section>;
  const { detail } = state;
  const unavailable = new Set(detail.unavailable);
  const domainsMissing = unavailable.has("Domains");
  const waitingMissing = ["Decisions", "Drafts", "Site review"].filter(name => unavailable.has(name));
  const requestsMissing = ["Requests and pending changes", "Service requests"].filter(name => unavailable.has(name));
  const historyMissing = ["Content history", "Saved copies", "Site revisions", "Site replacements"].filter(name => unavailable.has(name));
  return <>
    <Panel id={`${systemId}-domains`} title="Domains" count={detail.domains.length} intro="Where the site answers, and whether each address is verified.">
      {detail.domains.length ? <ul className={styles.panelList} aria-label="Domains">{detail.domains.map(domain => <li key={domain.hostname} data-domain-state={domain.state}>
        <span>{domain.hostname}</span>
        <small>{domain.label}{domain.lastCheckedAt ? ` · checked ${when(domain.lastCheckedAt)}` : ""}</small>
        <small>{domain.whoCanChange}</small>
      </li>)}</ul> : domainsMissing ? null : <p className="mt-3">No domain is recorded for this site yet.</p>}
      <Unavailable names={domainsMissing ? ["Domains"] : []} />
    </Panel>
    <Panel id={`${systemId}-waiting`} title="Waiting on you" count={detail.waiting.length} intro="Only the decisions that are yours. The same items as Needs you, for this site.">
      {detail.waiting.length ? <ul className={styles.panelList} aria-label="Waiting on you">{detail.waiting.map(item => <WaitingRow key={item.id} item={item} />)}</ul> : waitingMissing.length ? null : <p className="mt-3">Nothing is waiting on you for this site.</p>}
      <Unavailable names={waitingMissing} />
    </Panel>
    <Panel id={`${systemId}-requests`} title="Requests" count={detail.requests.length} intro="Work asked for on this site, until it is done.">
      {detail.requests.length ? <ul className={styles.panelList} aria-label="Requests">{detail.requests.map(item => <li key={item.id}>
        <span>{item.href ? <a href={item.href}>{item.title}</a> : item.title}</span>
        <small>{STAGE_LABEL[item.stage]} · <time dateTime={item.at}>{when(item.at)}</time></small>
      </li>)}</ul> : requestsMissing.length ? null : <p className="mt-3">No open requests. <button type="button" className="underline" disabled={readOnly} onClick={() => onAsk("Change on the website: ")}>Ask for a change</button></p>}
      <Unavailable names={requestsMissing} />
    </Panel>
    <Panel id={`${systemId}-history`} title="History" count={detail.history.length} intro="Every release of this site, newest first. Issued changes are never rewritten; undo is a new release.">
      {detail.history.length ? <ol className={styles.panelList} aria-label="History">{detail.history.map(item => <li key={item.id}>
        <span>{item.title}</span>
        <small>{SOURCE_LABEL[item.source]} · {item.by} · <time dateTime={item.at}>{when(item.at)}</time></small>
        <small>{item.undo ?? "No undo for this change."}</small>
      </li>)}</ol> : historyMissing.length ? null : <p className="mt-3">No releases are recorded for this site yet.</p>}
      <Unavailable names={historyMissing} />
    </Panel>
  </>;
}
