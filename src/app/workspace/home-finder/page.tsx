import { redirect } from "next/navigation";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { customersReleaseEnabled } from "@/platform/customers/release";
import { HomeFinder } from "@/experience/enterprise/HomeFinder";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
export const dynamic = "force-dynamic";
export default async function HomeFinderPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled() || !customersReleaseEnabled()) redirect("/workspace");
  const actor = await workspaceHttpActor(); if (!actor) redirect("/sign-in");
  const workspaceId = (await searchParams).workspaceId, workspaces = await listWorkspaces(actor);
  if (!workspaces.some(w => w.id === workspaceId)) redirect("/workspace");
  const current = workspaces.find(w => w.id === workspaceId)!;
  return <StrelvaShell title="Home Finder" workspaceId={current.id} workspaceName={current.name} systemsReleased active="system">
    <HomeFinder workspaceId={current.id} agencies={workspaces.filter(w => w.kind === "agency" && (w.role === "owner" || w.role === "admin")).map(w => ({ id: w.id, name: w.name }))} />
  </StrelvaShell>;
}
