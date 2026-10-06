import type { Metadata } from "next";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { listWorkspaces } from "@/platform/workspaces";
import { OperatorRebuildEntry } from "@/experience/websites/OperatorRebuildEntry";
import { websiteRebuildReleaseMayBeOn, websiteRebuildReleasedFor } from "@/products/websites/rebuild-release";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website rebuilds", robots: { index: false, follow: false } };
export default async function WebsiteRebuildsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; workId?: string }> }) {
  if (!websiteRebuildReleaseMayBeOn()) return <p role="status">Website rebuilds are not enabled. Existing managed-site work remains available.</p>;
  const query = await searchParams;
  const actor = await workspaceHttpActor();
  const workspaces = actor ? await listWorkspaces(actor).catch(() => null) : null;
  if (!actor || !workspaces) return <p role="alert">Authorized business workspaces could not be loaded. Reopen this page after workspace access is available.</p>;
  // Under STRELVA_WEBSITE_REBUILD_RELEASE=workspace, only businesses whose row is on (or `operators`) are offered.
  const managed = workspaces.filter(item => item.access === "member" && item.role !== "member");
  const released = await Promise.all(managed.map(item => websiteRebuildReleasedFor(actor, item.id).catch(() => false)));
  return <OperatorRebuildEntry initialWorkspaceId={query.workspaceId} initialWorkId={query.workId} workspaces={managed.filter((_item, index) => released[index]).map(item => ({ id: item.id, name: item.name }))} />;
}
