import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { inspectWorkParticipation, readContributionTarget } from "@/platform/work-participation";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { WorkAuthorityPanel } from "@/experience/operations/WorkAuthorityPanel";
import { ContributionClosed, ContributionPage as SharedWork } from "@/experience/operations/ContributionPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contribute to work", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ContributionPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  if (!workspaceReleaseEnabled()) return <StrelvaShell title="Work contribution"><ContributionClosed kind="off" /></StrelvaShell>;
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(`/workspace/contribute/${workId}`)}`);
  const actor = { userId: user.id, verifiedEmail: user.email.toLowerCase() };
  const validId = z.string().uuid().safeParse(workId);
  if (!validId.success) return <StrelvaShell title="Work contribution"><ContributionClosed kind="invalid" /></StrelvaShell>;
  try {
    const access = await inspectWorkParticipation(actor, workId);
    let title = "Your contribution";
    let text: string | undefined;
    try {
      const target = await readContributionTarget(actor, workId);
      title = target.title;
      const payload = target.payload as { text?: unknown } | null;
      if (typeof payload?.text === "string") text = payload.text;
    } catch (error) { if (!(error instanceof WorkspaceAccessError)) throw error; }
    return <StrelvaShell title={title} accountName={user.email}>
      <SharedWork title={title} text={text}><WorkAuthorityPanel workId={workId} canManage={access.canManage} sources={[]} initiallyOpen /></SharedWork>
    </StrelvaShell>;
  } catch (error) {
    return <StrelvaShell title="Work contribution"><ContributionClosed kind={error instanceof WorkspaceAccessError ? "denied" : "error"} /></StrelvaShell>;
  }
}
