import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorkspaceExit } from "@/experience/workspace/WorkspaceExit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leave workspace", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const workspaceId = (await searchParams).workspaceId;
  if (typeof workspaceId !== "string") redirect("/workspace");
  return <WorkspaceExit workspaceId={workspaceId} />;
}
