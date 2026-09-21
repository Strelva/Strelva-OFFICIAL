import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { inspectWorkParticipation, readContributionTarget } from "@/platform/work-participation";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { WorkAuthorityPanel } from "@/experience/operations/WorkAuthorityPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contribute to work", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ContributionPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  if (!workspaceReleaseEnabled()) return <StrelvaShell title="Work contribution"><div className="mx-auto max-w-3xl p-6"><h1 className="font-display text-2xl">Work contributions are not open yet.</h1><Link href="/account" className="mt-4 inline-block underline">Open your account</Link></div></StrelvaShell>;
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(`/workspace/contribute/${workId}`)}`);
  const actor = { userId: user.id, verifiedEmail: user.email.toLowerCase() };
  const validId = z.string().uuid().safeParse(workId);
  if (!validId.success) return <StrelvaShell title="Work contribution"><p className="p-6">This contribution link is invalid.</p></StrelvaShell>;
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
      <div className="mx-auto max-w-3xl p-4 sm:p-6"><p className="text-sm text-gray-muted">Scoped contribution · Current work version {access.workRevision}</p><h1 className="mt-3 font-display text-2xl">{title}</h1>{text !== undefined ? <section aria-label="Current document" className="mt-6 border-y border-gray-border py-5"><h2 className="mb-3 text-sm font-medium">Current document</h2><p className="whitespace-pre-wrap break-words text-sm">{text || "This document is empty."}</p></section> : <p className="mt-4 text-sm text-gray-muted">Your assignment and proposal history are below. Only this work has been shared with you.</p>}</div>
      <WorkAuthorityPanel workId={workId} canManage={access.canManage} sources={[]} initiallyOpen />
    </StrelvaShell>;
  } catch (error) {
    return <StrelvaShell title="Work contribution"><div className="mx-auto max-w-3xl p-6"><h1 className="font-display text-2xl">{error instanceof WorkspaceAccessError ? "This work is not available to your account." : "This work could not be opened."}</h1><p className="mt-4 text-sm text-gray-muted">{error instanceof WorkspaceAccessError ? "Access may have expired or been revoked. Use the verified account that received the grant." : "Your proposal has not changed. Reload this page to try again."}</p><Link href="/workspace" className="mt-5 inline-block underline">Return to your work</Link></div></StrelvaShell>;
  }
}
