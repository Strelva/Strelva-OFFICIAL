import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { ensurePersonalWorkspace, listWorkspaces, type Workspace } from "@/platform/workspaces";
import { WorkspaceAccountView } from "@/experience/workspace/WorkspaceAccountView";
import { PublicContinuationCard } from "@/experience/workspace/PublicContinuationCard";
import { cookies } from "next/headers";
import { openPublicContinuation, PUBLIC_CONTINUATION_COOKIE } from "@/lib/public-continuation";
import { readPublicContinuationImport } from "@/platform/public-continuations/repository";
import Link from "next/link";
import { AccountPayerInbox } from "@/experience/workspace/AccountPayerInbox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UserIdentity = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function identityName(user: UserIdentity): string | null {
  const metadata = user.user_metadata;
  if (!metadata) return null;
  for (const key of ["full_name", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}


export default async function WorkspaceAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ continue?: string | string[] }>;
} = {}) {
  // This route deliberately reads the verified server session directly. It
  // must never resolve a local/dev bypass into a personal identity page.
  const user = await getSessionUser() as UserIdentity | null;
  const continuing = (await searchParams)?.continue === "public";
  if (!user) redirect(continuing ? "/sign-in?next=%2Fworkspace%2Faccount%3Fcontinue%3Dpublic" : "/sign-in?next=%2Fworkspace");

  const normalizedEmail = user.email?.trim().toLowerCase() || "";
  const emailConfirmed = Boolean(user.email_confirmed_at && EMAIL_PATTERN.test(normalizedEmail));
  const releaseOpen = workspaceReleaseEnabled();
  const name = identityName(user);

  let workspaces: Workspace[] = [];
  let workspacesUnavailable = false;
  if (releaseOpen && emailConfirmed) {
    try {
      // The workspace entry route establishes this same one-per-person
      // destination. Establish it here too so a newly confirmed account can
      // choose where to save a public brief without silently creating or
      // selecting a customer business.
      await ensurePersonalWorkspace({ userId: user.id, verifiedEmail: normalizedEmail });
      workspaces = await listWorkspaces({ userId: user.id, verifiedEmail: normalizedEmail });
    } catch {
      // The identity page remains useful when the optional workspace store is
      // unavailable. Do not expose database details or imply missing access.
      workspacesUnavailable = true;
    }
  }

  const continuation = continuing && emailConfirmed
    ? openPublicContinuation((await cookies()).get(PUBLIC_CONTINUATION_COOKIE)?.value)
    : null;
  const writableDestinations = workspaces
    .filter((workspace) => workspace.access === "member")
    .map(({ id, name: workspaceName, kind }) => ({ id, name: workspaceName, kind }));
  let importedContinuation: { workId: string; workspaceId: string } | null = null;
  let continuationUnavailable = false;
  if (continuation && emailConfirmed) {
    try {
      importedContinuation = await readPublicContinuationImport(
        { userId: user.id, verifiedEmail: normalizedEmail },
        continuation.id,
      );
    } catch {
      continuationUnavailable = true;
    }
  }

  const continuationView = importedContinuation ? <section className="border-b border-gray-border py-8"><p className="text-[14px] font-medium text-accent-text">Public session saved</p><h2 className="mt-2 text-[20px] font-medium text-warm-black">{continuation?.resultTitle}</h2><p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">This brief is already private in the workspace that accepted it.</p><Link className="mt-5 inline-flex min-h-12 items-center rounded-xl border border-gray-border px-4 py-3 text-[14px] font-medium text-warm-black underline underline-offset-4" href={`/workspace?workspaceId=${encodeURIComponent(importedContinuation.workspaceId)}&work=${encodeURIComponent(importedContinuation.workId)}&view=document`}>Open saved brief</Link></section>
    : continuation && !continuationUnavailable ? <PublicContinuationCard brief={continuation} destinations={writableDestinations} actorEmail={normalizedEmail} />
    : continuing ? <section className="border-b border-gray-border py-8"><h2 className="text-[16px] font-medium text-warm-black">{emailConfirmed ? "Public session unavailable" : "Confirm your email to continue"}</h2><p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">{emailConfirmed ? "This continuation is missing, no longer accessible to this account, or could not be restored. Return to the public session or use a downloaded brief. No workspace was changed." : "The retained brief stays hidden until this account email is confirmed. No workspace was changed."}</p></section>
    : undefined;

  return <WorkspaceAccountView
    name={name}
    email={normalizedEmail}
    emailConfirmed={emailConfirmed}
    releaseOpen={releaseOpen}
    workspaces={workspaces}
    workspacesUnavailable={workspacesUnavailable}
    continuation={continuationView}
    payerInbox={<AccountPayerInbox />}
  />;
}
