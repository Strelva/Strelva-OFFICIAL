import { redirect } from "next/navigation";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { Units } from "@/experience/enterprise/Units";
export const dynamic = "force-dynamic";
export default async function UnitsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const actor = await workspaceHttpActor(); if (!actor) redirect("/sign-in");
  const workspaceId = (await searchParams).workspaceId, workspaces = await listWorkspaces(actor), workspace = workspaces.find(w => w.id === workspaceId);
  if (!workspace) redirect("/workspace");
  return <Units organizationId={workspace.id} businesses={workspaces.filter(w => w.access === "member").map(w => ({ id: w.id, name: w.name, role: w.role }))} canManage={workspace.role === "owner" || workspace.role === "admin"} />;
}
