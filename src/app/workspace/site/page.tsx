import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/server-client";
import { hasTenantAccess, isSuperAdmin } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { readExistingSystemsSnapshot } from "@/platform/systems/from-existing";
import { listWorkspaces } from "@/platform/workspaces";
import { askReleaseMayBeOn } from "@/platform/ask/release";
import { NATIVE_TABS, REQUEST_TABS, isSiteTab, workspaceDashboardHref, workspaceSiteHref, type SiteTab } from "@/lib/workspace-site-places";
import { loadBrandKitSettings, loadCollectionsData, loadGoogleBusinessData, loadSiteEditorData, siteFrameFor } from "@/lib/website-page-data";
import { getTenantPrimaryDomain } from "@/lib/tenant-urls";
import { resolveWorkspaceSite } from "@/products/websites/server";
import { WorkspaceSiteFrame, WorkspaceSiteMessage } from "@/experience/websites/WorkspaceSiteFrame";
import { WebsiteChangeRequests } from "@/experience/websites/WebsiteChangeRequests";
import { AskStrelva } from "@/experience/ask/AskStrelva";
import { ContentWorkspace } from "@/components/dashboard/ContentWorkspace";
import { PhotoLibrary } from "@/components/dashboard/PhotoLibrary";
import { BrandKitPanel } from "@/components/dashboard/BrandKitPanel";
import { CollectionsManager } from "@/components/dashboard/CollectionsManager";
import { ConnectionsPage } from "@/components/dashboard/ConnectionsPage";
import { ConnectionDetailPage } from "@/components/dashboard/ConnectionDetailPage";
import { GoogleBusinessPanel } from "@/components/dashboard/GoogleBusinessPanel";
import { SiteHistoryContent } from "@/components/dashboard/SiteHistoryContent";
import Link from "next/link";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { ConnectSiteExperience } from "@/experience/connected-sites/ConnectSiteExperience";
import { connectedSitesReleasedFor, readConnectedSites } from "@/products/connected-sites/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SOURCE_ID = /^[a-z0-9_-]{1,64}$/i;

/**
 * A managed website's own pages in the workspace (owner-entry spec §5): the
 * workspace home of `/dashboard/site`, `/assets`, `/brand-kit`,
 * `/collections`, `/history`, `/integrations`, `/sources/[id]` and `/google`.
 * A site that reads its content from Strelva opens the editor; a repo-only
 * site opens "Ask for a change". Behind the workspace and Systems releases.
 *
 * Without `system`, the same route is where a business brings the website it
 * already has (connected sites, `ConnectedSitesPage` below).
 */
export default async function WorkspaceSitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const params = await searchParams;
  const one = (key: string) => typeof params[key] === "string" ? params[key] as string : null;
  const workspaceId = one("workspaceId");
  const systemId = one("system");
  // No System named: the business's connected-site entry (bring the website it already has).
  if (workspaceId && UUID.test(workspaceId) && systemId === null) return <ConnectedSitesPage workspaceId={workspaceId} />;
  if (!workspaceId || !UUID.test(workspaceId) || !systemId || !UUID.test(systemId)) redirect("/workspace");
  const requestedTab: SiteTab | null = isSiteTab(one("tab")) ? one("tab") as SiteTab : null;
  const source = one("source");
  const selectedRequest = one("request") ?? undefined;
  const here = workspaceSiteHref({ workspaceId, systemId, tab: requestedTab ?? undefined, source: source ?? undefined, request: selectedRequest });

  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
  const home = `/workspace?${new URLSearchParams({ workspaceId })}`;

  const state = await resolveWorkspaceSite({
    systemsReleased: (id, viewer) => systemsReleaseEnabledForWorkspace(id, viewer),
    listWorkspaces: (current) => listWorkspaces(current),
    readSystems: (current, id) => readExistingSystemsSnapshot(current, id),
    tenantConfig: (tenantId) => getTenantConfig(tenantId),
    hasTenantAccess: (tenantId) => hasTenantAccess(tenantId),
    isOperator: () => isSuperAdmin(),
  }, actor, workspaceId, systemId);

  if (state.kind === "off") return <WorkspaceSiteMessage title="This isn't open for this business yet." body="Websites in the workspace open with Systems. The site, its content and its requests are unchanged." href={home} action="Back to Home" />;
  if (state.kind === "permission") return <WorkspaceSiteMessage title="This business is unavailable to your account." body="It may belong to another account, or your access may have changed. Nothing about the site was changed." href="/workspace" action="Open your workspace" />;
  if (state.kind === "not_found") return <WorkspaceSiteMessage title="This website isn't connected to this business." body="It may belong to another business, or its link was removed. Nothing about the site was changed." href={home} action="Back to Home" />;
  if (state.kind === "error") return <WorkspaceSiteMessage title="The website didn't open." body="Strelva couldn't read this site's details just now. Nothing was changed. Try again in a moment." href={here} action="Try again" />;

  const { site, editing, operator } = state;
  const tabs = editing === "native" ? NATIVE_TABS : REQUEST_TABS;
  const tab: SiteTab = requestedTab && (tabs.includes(requestedTab) || (requestedTab === "source" && tabs.includes("connections")) || requestedTab === "request") ? requestedTab : tabs[0]!;
  const visibleTabs = editing === "native" && tab === "request" ? [...tabs, "request" as const] : tabs;

  const requestHeaders = await headers();
  // On a client admin host the proxy already names this tenant; elsewhere its APIs are reached through /client/<tenant>.
  const tenantRoot = requestHeaders.get("x-tenant") === site.tenantId ? "" : `/client/${site.tenantId}`;
  const requestHost = requestHeaders.get("host") || "";
  const requestProto = requestHeaders.get("x-forwarded-proto") || (requestHost.includes("localhost") ? "http" : "https");
  const config = await getTenantConfig(site.tenantId).catch(() => undefined);
  const frame = siteFrameFor(site.tenantId, config, { clientFallbackRoot: tenantRoot || "", requestHost, requestProto });
  const domain = config ? getTenantPrimaryDomain(config) : null;
  const siteLabel = domain ? domain.replace(/^www\./, "") : site.siteName;
  // Past the `off` state Systems is on for this workspace, so Ask is on here when it may be on at all.
  const askReleased = askReleaseMayBeOn();
  const readOnly = !state.canChange;
  const dashboardHref = workspaceDashboardHref({ workspaceId, systemId, tenantRoot, askReleased });

  // The tenant's own pages need the tenant's permission too (owners get both memberships; Strelva operators have it).
  const needsTenant = tab !== "request";
  let panel: React.ReactNode;
  const notice: string | undefined = readOnly ? "You can see this site. Only an owner or admin of this business can change it." : undefined;
  if (needsTenant && !state.tenantAccess) {
    panel = <WorkspaceSiteMessageInline title="Your account can't open this site's editor yet." body={`Your place in ${state.workspaceName} doesn't include ${siteLabel}'s own tools. Ask Strelva for the change instead, or ask the owner to add you.`} href={workspaceSiteHref({ workspaceId, systemId, tab: "request" })} action="Ask for a change" />;
  } else if (tab === "edit" && readOnly) {
    // The editor's own read-only screen is written for the public demo; a member gets this instead.
    panel = <WorkspaceSiteMessageInline title="Only an owner or admin can edit this site." body={`You can see ${siteLabel}'s history, photos and connections here. To change something, ask an owner or admin of ${state.workspaceName}.`} href={workspaceSiteHref({ workspaceId, systemId, tab: "history" })} action="See what changed" />;
  } else if (tab === "edit") {
    const data = await loadSiteEditorData(site.tenantId);
    panel = <ContentWorkspace siteName={data.siteName} ownerName={data.ownerName} sectionData={data.sectionData} timestamps={data.timestamps}
      assistant={askReleased ? <AskStrelva compact workspaceId={workspaceId} businessName={state.workspaceName} systemId={systemId} systemName={siteLabel} readOnly={readOnly} readOnlyReason={readOnly ? "Only an owner or admin can ask for changes here." : undefined} /> : undefined} />;
  } else if (tab === "photos") {
    panel = <PhotoLibrary />;
  } else if (tab === "look") {
    panel = <BrandKitPanel initialSettings={await loadBrandKitSettings(site.tenantId)} />;
  } else if (tab === "collections") {
    const data = await loadCollectionsData(site.tenantId);
    panel = <CollectionsManager types={data.types} initialType={data.initialType} initialEntries={data.initialEntries} />;
  } else if (tab === "history") {
    panel = <div className="px-4 py-6 sm:px-8 sm:py-8"><SiteHistoryContent tenant={site.tenantId} dashboardHref={dashboardHref} historyHref={here} selectedRequestId={selectedRequest} heading={false} /></div>;
  } else if (tab === "connections") {
    panel = <ConnectionsPage />;
  } else if (tab === "source") {
    panel = source && SOURCE_ID.test(source) ? <ConnectionDetailPage connectionId={source} /> : <ConnectionsPage />;
  } else if (tab === "google") {
    const data = await loadGoogleBusinessData(site.tenantId);
    panel = <GoogleBusinessPanel connected={data.connected} state={data.state} />;
  } else {
    panel = <WebsiteChangeRequests workspaceId={workspaceId} systemId={systemId} siteLabel={siteLabel} editing={editing} canAsk={!readOnly} canDecide={state.role === "owner"} operator={operator} />;
  }

  return <WorkspaceSiteFrame workspaceId={workspaceId} systemId={systemId} workspaceName={state.workspaceName} siteLabel={siteLabel} tab={tab} tabs={visibleTabs}
    tenantRoot={tenantRoot} tenantId={site.tenantId} askReleased={askReleased} readOnly={readOnly} liveUrl={domain ? `https://${domain}` : frame.siteUrl || undefined}
    site={frame} notice={notice}>
    {panel}
  </WorkspaceSiteFrame>;
}

function WorkspaceSiteMessageInline({ title, body, href, action }: { title: string; body: string; href: string; action: string }) {
  return <div className="mx-auto mt-[12vh] flex max-w-[560px] flex-col gap-3 px-6">
    <h1 className="font-display text-[24px] font-medium">{title}</h1>
    <p className="text-[15px] leading-6 text-gray-muted">{body}</p>
    <a className="underline underline-offset-4" href={href}>{action}</a>
  </div>;
}

/**
 * Where a new business brings the website it already has (connected sites,
 * the working default for decision 3). Presentation only: every read and
 * write below is authorized again by SQL. Off unless
 * STRELVA_CONNECTED_SITES_RELEASE=1 and Systems is on for this business.
 */
async function ConnectedSitesPage({ workspaceId }: { workspaceId: string }) {
  const next = `/workspace/site?workspaceId=${workspaceId}`;
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
  // Per workspace: connected sites open where Systems is on for this business.
  if (!(await connectedSitesReleasedFor(actor, workspaceId).catch(() => false))) redirect(`/workspace?${new URLSearchParams({ workspaceId })}`);
  const workspace = (await listWorkspaces(actor).catch(() => [])).find(item => item.id === workspaceId && item.kind === "customer");
  let overview: Awaited<ReturnType<typeof readConnectedSites>> | null = null;
  let failure: string | null = workspace ? null : "This business isn't available to your account.";
  if (workspace) {
    try { overview = await readConnectedSites(actor, workspaceId); }
    catch (error) { failure = error instanceof WorkspaceAccessError ? "This business isn't available to your account." : "Your website couldn't be loaded just now. Nothing changed."; }
  }
  const canManage = workspace?.access === "member" && (workspace.role === "owner" || workspace.role === "admin");
  const body = failure || !overview ? <Unavailable message={failure ?? "Your website couldn't be loaded just now. Nothing changed."} />
    : <ConnectSiteExperience workspaceId={workspaceId} canManage={canManage}
      initialSites={overview.sites.map(site => ({ id: site.id, siteHost: site.siteHost, siteUrl: site.siteUrl, status: site.status, verifiedAt: site.verifiedAt, systemId: site.systemId, snippet: site.snippet }))} />;
  return <StrelvaShell title="Website" workspaceId={workspaceId} accountName={user.email}><div className="min-h-0 flex-1 overflow-y-auto">{body}</div></StrelvaShell>;
}

function Unavailable({ message }: { message: string }) {
  return <div className="mx-auto w-full max-w-2xl px-4 py-12 md:px-8">
    <p role="alert" className="text-sm">{message}</p>
    <Link href="/workspace" className="mt-6 inline-block text-sm underline">Back to your workspace</Link>
  </div>;
}
