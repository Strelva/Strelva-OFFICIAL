import { redirect } from "next/navigation";
import { AccountNoBusiness, AccountPicker } from "@/experience/entry/AccountEntry";
import { claimPendingInviteForCurrentUser, getAuthUserId, getCurrentUserEmail, getCurrentUserTenants, isSuperAdmin } from "@/platform/infra/auth";
import { getTenantConfig, isActiveTenant } from "@/lib/tenants";
import { getTenantDashboardFallbackUrl } from "@/lib/tenant-urls";
import { getDevAccessTenant } from "@/platform/infra/dev-access";
import type { TenantConfig } from "@/lib/types";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { inquiryReleaseEnabled } from "@/products/inquiries/server";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { claimOwnerInvitationsOnSignIn } from "@/platform/owner-entry/server";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ managed?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const managedRequested = params?.managed === "1";
  const workspaceTarget = workspaceReleaseEnabled() && typeof params?.next === "string"
    ? workspaceReturnTarget(params.next)
    : null;
  const userId = await getAuthUserId();

  if (!userId) {
    const devTenant = getDevAccessTenant();
    if (devTenant) {
      const config = await getTenantConfig(devTenant);
      if (config && isActiveTenant(config)) redirect(getTenantDashboardFallbackUrl(config));
      redirect(`/dashboard?tenant=${devTenant}`);
    }
    redirect(workspaceTarget ? `/sign-in?next=${encodeURIComponent(workspaceTarget)}` : "/sign-in");
  }

  // Super admins go straight to the operator console — it already has
  // client-switching, so there's no reason to stop on a chooser first.
  if (await isSuperAdmin()) {
    redirect("/admin");
  }

  const claimedInvite = await claimPendingInviteForCurrentUser();
  // An owner whose business was converted for them gets in by signing in; nothing is sent.
  const [claimedOwnerWorkspace] = await claimOwnerInvitationsOnSignIn();
  if (claimedOwnerWorkspace && workspaceReleaseEnabled() && !workspaceTarget) redirect(`/workspace?workspaceId=${encodeURIComponent(claimedOwnerWorkspace)}`);
  if (inquiryReleaseEnabled() && !managedRequested) {
    if (workspaceTarget) redirect(workspaceTarget);
    redirect("/business");
  }
  // Claim an existing invitation before entering the shared environment. This
  // changes only the landing destination; membership and site gates still own
  // access. The explicit managed path keeps the existing recovery/chooser flow.
  if (workspaceReleaseEnabled() && !managedRequested) redirect(workspaceTarget || "/workspace");

  if (claimedInvite) {
    const config = await getTenantConfig(claimedInvite.tenant);
    if (config && isActiveTenant(config)) redirect(getTenantDashboardFallbackUrl(config));
  }

  const tenants = await getCurrentUserTenants();
  // The header names the signed-in address; a failed read only drops it.
  const email = await getCurrentUserEmail().catch(() => null);

  if (tenants.length === 0) {
    return <AccountNoBusiness email={email} />;
  }

  if (tenants.length === 1) {
    const tenantId = tenants[0]!;
    const config = await getTenantConfig(tenantId);

    if (config && isActiveTenant(config)) redirect(getTenantDashboardFallbackUrl(config));
    redirect("/no-access");
  }

  const tenantConfigs = await Promise.all(
    tenants.map(async (id) => ({
      id,
      config: await getTenantConfig(id).then((config) => config && isActiveTenant(config) ? config : undefined),
    }))
  );

  if (!tenantConfigs.some(({ config }) => config)) {
    return <AccountNoBusiness email={email} />;
  }

  return <TenantPicker tenants={tenantConfigs} email={email} />;
}

interface TenantPickerProps {
  tenants: Array<{
    id: string;
    config: TenantConfig | undefined;
  }>;
  email: string | null;
}

/** Each business by what people know it by (its public website), never its admin host. */
function TenantPicker({ tenants, email }: TenantPickerProps) {
  const businesses = tenants.flatMap(({ id, config }) => config ? [{
    id, name: config.siteName || id, site: config.productionDomain || config.customDomains?.[0] || null, href: getTenantDashboardFallbackUrl(config),
  }] : []);
  return <AccountPicker businesses={businesses} email={email} />;
}
