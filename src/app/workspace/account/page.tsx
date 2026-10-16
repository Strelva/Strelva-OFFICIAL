import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { ensurePersonalWorkspace, listWorkspaces, type Workspace } from "@/platform/workspaces";
import { WorkspaceAccountView } from "@/experience/workspace/WorkspaceAccountView";
import { PublicContinuationCard } from "@/experience/workspace/PublicContinuationCard";
import { cookies } from "next/headers";
import { openPublicContinuation, PUBLIC_CONTINUATION_COOKIE } from "@/lib/public-continuation";
import { readPublicContinuationImport } from "@/platform/public-continuations/repository";
import { XaButtonLink, XaHeadline, XaLabel, XaSays } from "@/components/ui/strelva/Xa";
import { AccountPayerInbox } from "@/experience/workspace/AccountPayerInbox";
import type { AccountSite } from "@/experience/workspace/WorkspaceAccountView";
import { getCurrentUserTenants } from "@/platform/infra/auth";
import { getTenantConfig, isActiveTenant } from "@/lib/tenants";
import { getTenantDashboardFallbackUrl, getTenantPrimaryDomain } from "@/lib/tenant-urls";

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


/**
 * The person's websites from before workspaces, named by domain. The same
 * memberships /account?managed=1 reads; a failed read returns undefined so
 * the page falls back to that chooser instead of claiming there are none.
 */
async function readAccountSites(): Promise<AccountSite[] | undefined> {
  try {
    const tenants = await getCurrentUserTenants();
    const configs = await Promise.all(tenants.map(id => getTenantConfig(id)));
    return configs.flatMap(config => config && isActiveTenant(config)
      ? [{ id: config.id, domain: getTenantPrimaryDomain(config) || config.siteName || "Your website", href: getTenantDashboardFallbackUrl(config) }]
      : []);
  } catch {
    return undefined;
  }
}

export default async function WorkspaceAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ continue?: string | string[] }>;
}) {
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

  const continuationView = importedContinuation ? <section aria-label="Public session saved"><XaLabel as="h2">Public session saved</XaLabel><XaHeadline as="h2" size="sm" quiet="It’s already private in the workspace that took it.">{continuation?.resultTitle}</XaHeadline><p style={{ marginTop: 16 }}><XaButtonLink variant="primary" href={`/workspace?workspaceId=${encodeURIComponent(importedContinuation.workspaceId)}&work=${encodeURIComponent(importedContinuation.workId)}&view=document`}>Open saved brief</XaButtonLink></p></section>
    : continuation && !continuationUnavailable ? <PublicContinuationCard brief={continuation} destinations={writableDestinations} actorEmail={normalizedEmail} />
    : continuing ? <section aria-label={emailConfirmed ? "Public session unavailable" : "Confirm your email to continue"}><XaLabel as="h2">{emailConfirmed ? "Public session unavailable" : "Confirm your email to continue"}</XaLabel><XaSays>{emailConfirmed ? "This session is missing, no longer open to this account, or couldn’t be restored. Go back to it, or use the brief you downloaded. No workspace changed." : "The brief you started stays hidden until this email is confirmed. No workspace changed."}</XaSays></section>
    : undefined;

  const sites = emailConfirmed ? await readAccountSites() : [];

  return <WorkspaceAccountView
    sites={sites}
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
