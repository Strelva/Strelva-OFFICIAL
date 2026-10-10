"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { StHead, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
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
  mode?: "light" | "dark";
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
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode={props.mode ?? "light"} className={styles.frame}>
    <header className={styles.bar}>
      <StHead crumb={{ label: props.siteLabel, href: systemPage }} title={SITE_TAB_LABEL[tab]} meta={props.workspaceName} actions={props.liveUrl ? <StTextButton href={props.liveUrl} target="_blank" rel="noreferrer">Visit site<ArrowUpRight size={14} aria-hidden="true" /></StTextButton> : undefined} />
      <nav className={styles.tabs} aria-label={`${props.siteLabel} pages`}>
        {tabs.map((item) => <a key={item} href={workspaceSiteHref({ workspaceId, systemId, tab: item }, workspaceBase)} aria-current={item === tab || (tab === "source" && item === "connections") ? "page" : undefined}>{SITE_TAB_LABEL[item]}</a>)}
      </nav>
    </header>
    {props.notice ? <div className={styles.notice}><StNotice>{props.notice}</StNotice></div> : null}
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
  return <div data-dashboard data-workspace-theme="linen" className={styles.frame}>
    <main><StPage><StHead title={title} meta={body} /><StTextButton href={href}>{action}</StTextButton></StPage></main>
  </div>;
}
