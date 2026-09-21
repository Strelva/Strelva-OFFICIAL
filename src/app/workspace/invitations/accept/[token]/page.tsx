import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceInvitationAcceptance } from "@/experience/workspace/WorkspaceInvitationAcceptance";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const metadata: Metadata = { title: "Workspace invitation | Strelva", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function WorkspaceInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  if (!workspaceReleaseEnabled()) notFound();
  return <WorkspaceInvitationAcceptance token={(await params).token} />;
}
