"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { resolveRelationship } from "@/platform/relationships";
import { SITE_TAB_LABEL, workspaceDashboardHref, workspaceSiteHref, type SiteTab } from "@/platform/workspaces/site-places";
import styles from "./workspace-site.module.css";

export interface WorkspaceSiteFrameProps {
  workspaceId: string;
  systemId: string;
  workspaceName: string;
  /** The site by its address, as the System page names it. */
  siteLabel: string;
  tab: SiteTab;
  tabs: readonly SiteTab[];
  /** `/client/<tenant>` on the app host; "" where the host already names the tenant. */
  tenantRoot: string;
  tenantId: string;
  workspaceBase?: string;
  askReleased: boolean;
  /** Members read; owners and admins change. The tenant APIs enforce it too. */
  readOnly: boolean;
  liveUrl?: string;
  site?: { siteUrl: string; previewUrl: string; liveSyncEnabled: boolean; siteModel: string; autoPublish: boolean };
  /** One sentence above the panel (who can change what), when it matters. */
  notice?: string;
  children: ReactNode;
}

/**
 * A managed website's own pages inside the workspace: the editor, photos,
 * look, blog and collections, history and connections. The panels are the
 * dashboard's own components, reused under a provider whose links stay in
 * the workspace and whose API calls reach the tenant through `/client/<tenant>`.
 */
export function WorkspaceSiteFrame(props: WorkspaceSiteFrameProps) {
  const { workspaceId, systemId, tab, tabs, tenantRoot, workspaceBase = "", askReleased } = props;
  const resolveHref = useMemo(() => workspaceDashboardHref({ workspaceId, systemId, tenantRoot, workspaceBase, askReleased }), [askReleased, systemId, tenantRoot, workspaceBase, workspaceId]);
  const systemPage = `${workspaceBase}/workspace?${new URLSearchParams({ workspaceId, view: "system", system: systemId })}`;
  const relationship = useMemo(() => resolveRelationship({ context: { kind: "tenant", tenantId: props.tenantId }, serviceRelationship: "managed_client" }), [props.tenantId]);
  return <div data-dashboard className={styles.frame}>
    <header className={styles.bar}>
      <div className={styles.titleRow}>
        <a className={styles.back} href={systemPage}><ArrowLeft size={16} aria-hidden="true" />{props.siteLabel}</a>
        <p className={styles.business}>{props.workspaceName}</p>
        {props.liveUrl ? <a className={styles.visit} href={props.liveUrl} target="_blank" rel="noreferrer">Visit site<ArrowUpRight size={14} aria-hidden="true" /></a> : null}
      </div>
      <nav className={styles.tabs} aria-label={`${props.siteLabel} pages`}>
        {tabs.map((item) => <a key={item} href={workspaceSiteHref({ workspaceId, systemId, tab: item }, workspaceBase)} aria-current={item === tab || (tab === "source" && item === "connections") ? "page" : undefined}>{SITE_TAB_LABEL[item]}</a>)}
      </nav>
    </header>
    {props.notice ? <p role="status" className={styles.notice}>{props.notice}</p> : null}
    <main id="workspace-site-main" className={styles.panel} data-tab={tab}>
      <DashboardProvider
        tenantId={props.tenantId}
        dashboardBasePath={tenantRoot}
        resolveHref={resolveHref}
        siteUrl={props.site?.siteUrl ?? props.liveUrl ?? ""}
        previewUrl={props.site?.previewUrl ?? ""}
        liveSyncEnabled={props.site?.liveSyncEnabled ?? false}
        siteModel={props.site?.siteModel ?? "wellness"}
        autoPublish={props.site?.autoPublish ?? false}
        relationship={relationship}
        readOnly={props.readOnly}
      >
        {props.children}
      </DashboardProvider>
    </main>
  </div>;
}

/** The same frame's states when there is no site to show. */
export function WorkspaceSiteMessage({ title, body, href, action }: { title: string; body: string; href: string; action: string }) {
  return <div data-dashboard className={styles.frame}>
    <main className={styles.message}>
      <h1 className="font-display">{title}</h1>
      <p>{body}</p>
      <a href={href}>{action}</a>
    </main>
  </div>;
}
