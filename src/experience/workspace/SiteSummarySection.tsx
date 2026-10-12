"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Globe } from "lucide-react";
import { siteSummariesSchema, type SiteSummaries, type SiteSummary } from "@/platform/owner-entry/site-summary-contract";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import styles from "./business-home.module.css";

/**
 * Home's "From your site": what the old Today page showed beside the approval
 * queue (approvals are Needs you). Who found the site, who acted, who reached
 * out, and what Strelva did, per managed site, with links to Inquiries,
 * Results, Reviews and Recaps. Hidden unless owner entry is open for this
 * business (the route answers 503 and this renders nothing).
 */

export type SiteSummaryState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: SiteSummaries };

export function useSiteSummary(workspaceId: string | undefined) {
  const transport = useWorkspaceRequest();
  const [result, setResult] = useState<{ workspaceId: string; state: SiteSummaryState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    transport(`/api/workspace/site-summary?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: abort.signal }).then(async (response) => {
      if (response.status === 503 || response.status === 403 || response.status === 401) {
        if (!abort.signal.aborted) setResult({ workspaceId, state: { status: "disabled" } });
        return;
      }
      const parsed = siteSummariesSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) throw new Error("unreadable");
      if (!abort.signal.aborted) setResult({ workspaceId, state: { status: "ready", data: parsed.data } });
    }).catch(() => {
      if (!abort.signal.aborted) setResult({ workspaceId, state: { status: "error" } });
    });
    return () => abort.abort();
  }, [workspaceId, transport, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const state: SiteSummaryState = !workspaceId ? { status: "disabled" } : result?.workspaceId === workspaceId ? result.state : { status: "loading" };
  return { state, retry };
}

function WeekNumber({ value, noun }: { value: { total: number; thisWeek: number } | null; noun: string }) {
  if (!value) return <div className={styles.weekNumber}><dt>{noun}</dt><dd className={styles.weekUnknown}>Couldn&apos;t check</dd></div>;
  return <div className={styles.weekNumber}><dt>{noun} this week</dt><dd>{value.thisWeek.toLocaleString("en-US")}</dd><small>{value.total.toLocaleString("en-US")} in all</small></div>;
}

function SiteBlock({ site, href, multiple }: { site: SiteSummary; href: (path: string) => string; multiple: boolean }) {
  return <div className={styles.siteSummary}>
    {multiple ? <h3>{site.siteName}</h3> : null}
    <dl className={styles.weekNumbers} aria-label={`${site.siteName} this week`}>
      <WeekNumber value={site.visits} noun="People found you" />
      <WeekNumber value={site.actions} noun="Booked or called" />
      {site.leads ? <div className={styles.weekNumber}><dt>Reached out, last 30 days</dt><dd>{site.leads.count.toLocaleString("en-US")}</dd></div> : null}
    </dl>
    <ul className={styles.list} aria-label={`Who reached out through ${site.siteName}`}>
      {site.leads === null ? <li><p className={styles.muted}>Who reached out couldn&apos;t be checked just now.</p></li>
        : site.leads.recent.length ? site.leads.recent.map((lead) => <li key={lead.id}><a className={styles.row} href={href("/workspace/inquiries")}><span><strong>{lead.name}</strong><small>{lead.message ?? "Reached out through your site"}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)
        : <li><p className={styles.muted}>No one reached out in the last 30 days.</p></li>}
    </ul>
    {site.activity?.length ? <ul className={styles.list} aria-label={`What Strelva did on ${site.siteName}`}>
      {site.activity.map((item) => <li key={item.id}><p className={styles.muted}><strong>{item.label}</strong>{item.detail ? ` · ${item.detail}` : ""}</p></li>)}
    </ul> : null}
  </div>;
}

export function SiteSummarySection({ state, workspaceId, appBase = "", onRetry }: { state: SiteSummaryState; workspaceId: string; appBase?: string; onRetry: () => void }) {
  if (state.status === "disabled") return null;
  if (state.status === "ready" && state.data.sites.length === 0 && state.data.deniedSites.length === 0) return null;
  const href = (path: string) => `${appBase}${path}?workspaceId=${encodeURIComponent(workspaceId)}`;
  return <section className={styles.week} aria-labelledby="home-site">
    <header className={styles.sectionHeader}><h2 id="home-site" className={styles.eyebrow}><Globe size={14} aria-hidden="true" />From your site</h2></header>
    {state.status === "loading" ? <p role="status" className={styles.muted}>Checking your site…</p> : null}
    {state.status === "error" ? <p role="status" className={styles.notice}>Your site&apos;s numbers couldn&apos;t be loaded. Nothing about them changed. <button type="button" onClick={onRetry}>Check again</button></p> : null}
    {state.status === "ready" ? <>
      {state.data.deniedSites.length ? <p role="status" className={styles.muted}>Your account can&apos;t open {state.data.deniedSites.join(", ")} yet. Ask the owner to finish adding you.</p> : null}
      {state.data.sites.map((site) => <SiteBlock key={site.tenantId} site={site} href={href} multiple={state.data.sites.length > 1} />)}
      {state.data.sites.length ? <nav aria-label="Your site" className={styles.siteLinks}>
        <a className={styles.textAction} href={href("/workspace/inquiries")}>Inquiries<ArrowRight size={16} aria-hidden="true" /></a>
        <a className={styles.textAction} href={href("/workspace/results")}>Results and health<ArrowRight size={16} aria-hidden="true" /></a>
        <a className={styles.textAction} href={href("/workspace/reviews")}>Reviews<ArrowRight size={16} aria-hidden="true" /></a>
        <a className={styles.textAction} href={href("/workspace/recaps")}>Recaps<ArrowRight size={16} aria-hidden="true" /></a>
      </nav> : null}
    </> : null}
  </section>;
}
