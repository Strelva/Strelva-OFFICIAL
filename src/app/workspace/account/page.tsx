import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaces, type Workspace } from "@/platform/workspaces";
import { WorkspaceAccountView } from "@/experience/workspace/WorkspaceAccountView";

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


export default async function WorkspaceAccountPage() {
  // This route deliberately reads the verified server session directly. It
  // must never resolve a local/dev bypass into a personal identity page.
  const user = await getSessionUser() as UserIdentity | null;
  if (!user) redirect("/sign-in?next=%2Fworkspace");

  const normalizedEmail = user.email?.trim().toLowerCase() || "";
  const emailConfirmed = Boolean(user.email_confirmed_at && EMAIL_PATTERN.test(normalizedEmail));
  const releaseOpen = workspaceReleaseEnabled();
  const name = identityName(user);

  let workspaces: Workspace[] = [];
  let workspacesUnavailable = false;
  if (releaseOpen && emailConfirmed) {
    try {
      workspaces = await listWorkspaces({ userId: user.id, verifiedEmail: normalizedEmail });
    } catch {
      // The identity page remains useful when the optional workspace store is
      // unavailable. Do not expose database details or imply missing access.
      workspacesUnavailable = true;
    }
  }

  return <WorkspaceAccountView
    name={name}
    email={normalizedEmail}
    emailConfirmed={emailConfirmed}
    releaseOpen={releaseOpen}
    workspaces={workspaces}
    workspacesUnavailable={workspacesUnavailable}
  />;
}
