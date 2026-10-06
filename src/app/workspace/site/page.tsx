import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaces } from "@/platform/workspaces";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { ConnectSiteExperience } from "@/experience/connected-sites/ConnectSiteExperience";
import { connectedSitesReleaseEnabled, readConnectedSites } from "@/products/connected-sites/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Where a new business brings the website it already has (connected sites,
 * the working default for decision 3). Presentation only: every read and
 * write below is authorized again by SQL. Off unless
 * STRELVA_CONNECTED_SITES_RELEASE=1.
 */
export default async function WorkspaceSitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled() || !connectedSitesReleaseEnabled()) redirect("/workspace");
  const params = await searchParams;
  const workspaceId = typeof params.workspaceId === "string" && UUID.test(params.workspaceId) ? params.workspaceId : null;
  if (!workspaceId) redirect("/workspace");
  const next = `/workspace/site?workspaceId=${workspaceId}`;
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
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
