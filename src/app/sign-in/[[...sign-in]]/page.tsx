import { accountReturnTarget, workspaceInvitationReturnTarget, workspaceReturnTarget } from "@/platform/workspaces/location";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { getClientFallbackRoot, isClientFallbackRoot } from "@/lib/client-fallback";
import { getInvite } from "@/lib/invites";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { tenantSignInNext } from "@/platform/owner-entry/env";
import { WorkspaceSignIn } from "@/experience/workspace/WorkspaceSignIn";

export const metadata: Metadata = {
  title: "Sign in to your Strelva work",
  description: "Sign in to Strelva to continue your work or open your managed website.",
};

export const dynamic = "force-dynamic";

type AuthSearchParams = Record<string, string | string[] | undefined>;

function searchValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizeEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function getInviteContext(searchParams: AuthSearchParams) {
  const email = normalizeEmail(searchValue(searchParams.email));
  if (!email) return null;

  const invite = await getInvite(email);
  if (!invite) return null;

  const tenantConfig = await getTenantConfig(invite.tenant);
  if (!tenantConfig || tenantConfig.active === false) return null;

  return {
    email,
    siteName: tenantConfig.siteName || invite.tenant,
  };
}

async function getTenantAuthContext() {
  const requestHeaders = await headers();
  const tenant =
    requestHeaders.get("x-tenant") ||
    requestHeaders.get("x-client-fallback-root")?.match(/^\/client\/([a-z0-9-]+)$/)?.[1] ||
    null;

  if (!tenant) return null;

  const tenantConfig = await getTenantConfig(tenant);
  if (tenantConfig && tenantConfig.active === false) return null;

  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  return {
    tenant,
    clientFallbackRoot: isClientFallbackRoot(clientFallbackRoot) ? clientFallbackRoot : `/client/${tenant}`,
    siteName: getTenantSiteName(tenant, tenantConfig || undefined),
    host: requestHeaders.get("host") || undefined,
  };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<AuthSearchParams>;
}) {
  const params = await searchParams;
  const workspaceOpen = workspaceReleaseEnabled();
  const requestedNext = searchValue(params.next);
  const workspaceTarget = workspaceReturnTarget(requestedNext);
  const invitationTarget = workspaceOpen ? workspaceInvitationReturnTarget(requestedNext) : null;
  const accountTarget = workspaceOpen ? accountReturnTarget(requestedNext) : null;
  const inviteNext = workspaceTarget
    ? `/account?next=${encodeURIComponent(workspaceTarget)}`
    : accountTarget || "/account";
  const invite = await getInviteContext(params);
  if (invite) {
    return <WorkspaceSignIn title={`Sign in to manage ${invite.siteName}`} description={`Use ${invite.email}, the email your invitation was sent to.`} next={inviteNext} prefillEmail={invite.email} />;
  }

  // Public product starts also serve returning customers. Revalidate the user
  // with Auth before continuing; cookie presence is not authentication. Keep
  // explicit email selection and callback failure on the sign-in surface.
  // The bounded destination still performs its own resource authorization.
  const resumeTarget = workspaceTarget || invitationTarget || accountTarget;
  if (workspaceOpen && resumeTarget && typeof params.next === "string"
    && params.email === undefined && params.error === undefined) {
    const user = await getSessionUser().catch(() => null);
    if (user?.id && user.email && user.email_confirmed_at) redirect(resumeTarget);
  }

  if (workspaceOpen && (workspaceTarget || invitationTarget)) return <WorkspaceSignIn next={workspaceTarget || invitationTarget!} failed={searchValue(params.error) === "auth_callback"} />;

  const tenantAuth = await getTenantAuthContext();
  if (tenantAuth) {
    const dashboardPath = tenantSignInNext(tenantAuth.clientFallbackRoot);

    return <WorkspaceSignIn title={`Manage ${tenantAuth.siteName}`} description={`For the people ${tenantAuth.siteName} added. Visitors looking for the business should open its public website.`} next={dashboardPath} brand={tenantAuth.siteName} host={tenantAuth.host} />;
  }
  return <WorkspaceSignIn next={invitationTarget || accountTarget || (workspaceOpen ? "/workspace" : "/account")} failed={searchValue(params.error) === "auth_callback"} />;
}
