import { redirect } from "next/navigation";
import { UseInvitedEmailButton } from "@/components/auth/UseInvitedEmailButton";
import { claimPendingInviteForCurrentUser, getAuthUserId, getCurrentUserTenants, isSuperAdmin } from "@/lib/auth";
import { getTenantConfig, isActiveTenant } from "@/lib/tenants";
import {
  getTenantDashboardFallbackUrl,
  getTenantDashboardHost,
} from "@/lib/tenant-urls";
import { getDevAccessTenant } from "@/lib/dev-access";
import type { TenantConfig } from "@/lib/types";
import Link from "next/link";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const userId = await getAuthUserId();

  if (!userId) {
    const devTenant = getDevAccessTenant();
    if (devTenant) {
      const config = await getTenantConfig(devTenant);
      if (config && isActiveTenant(config)) redirect(getTenantDashboardFallbackUrl(config));
      redirect(`/dashboard?tenant=${devTenant}`);
    }
    redirect("/sign-in");
  }

  // Super admins go straight to the operator console — it already has
  // client-switching, so there's no reason to stop on a chooser first.
  if (await isSuperAdmin()) {
    redirect("/admin");
  }

  const claimedInvite = await claimPendingInviteForCurrentUser();
  if (claimedInvite) {
    const config = await getTenantConfig(claimedInvite.tenant);
    if (config && isActiveTenant(config)) redirect(getTenantDashboardFallbackUrl(config));
  }

  const tenants = await getCurrentUserTenants();

  if (tenants.length === 0) {
    if (workspaceReleaseEnabled()) redirect("/workspace");
    return <NoAccessState />;
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
    return <NoAccessState />;
  }

  return <TenantPicker tenants={tenantConfigs} />;
}

function NoAccessState() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--m-bg)" }}
    >
      <div className="text-center max-w-md">
        <h1
          className="font-display text-[26px] font-normal mb-3"
          style={{ color: "var(--m-text)" }}
        >
          No invited sites on this account
        </h1>
        <p
          className="text-[15px] leading-relaxed mb-4"
          style={{ color: "var(--m-text-2)" }}
        >
          You&apos;re signed in, but this email is not connected to a Strelva
          dashboard yet. Most access issues happen when the invite was sent
          to a different email address.
        </p>
        <p
          className="text-[14px] leading-relaxed mb-8"
          style={{ color: "var(--m-text-3)" }}
        >
          Use the exact email address that received your invite. The button
          below signs you out so you can choose that account. You can also email{" "}
          <a className="underline-offset-4 hover:underline" href="mailto:jacob@strelva.com">
            jacob@strelva.com
          </a>{" "}
          and we&apos;ll connect the right account.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <UseInvitedEmailButton
            className="text-[14px] font-medium px-8 py-3 transition-colors"
            style={{ background: "var(--m-text)", color: "var(--m-bg)" }}
          />
          <Link
            href="/access-request"
            className="text-[14px] font-medium px-8 py-3 border transition-colors hover:bg-white/5"
            style={{
              borderColor: "var(--m-rule)",
              color: "var(--m-text-2)",
            }}
          >
            Request your build
          </Link>
        </div>
      </div>
    </div>
  );
}

interface TenantPickerProps {
  tenants: Array<{
    id: string;
    config: TenantConfig | undefined;
  }>;
  isSuperAdmin?: boolean;
}

function TenantPicker({ tenants, isSuperAdmin = false }: TenantPickerProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--m-bg)" }}
    >
      <div className="w-full max-w-md">
        <h1
          className="font-display text-[26px] font-normal mb-2 text-center"
          style={{ color: "var(--m-text)" }}
        >
          Choose a site
        </h1>
        <p
          className="text-[15px] mb-8 text-center"
          style={{ color: "var(--m-text-2)" }}
        >
          {isSuperAdmin
            ? "Super admin access lets you control every client dashboard."
            : "You have access to multiple sites."}
        </p>

        {isSuperAdmin && (
          <Link
            href="/admin"
            className="mb-4 block rounded-xl p-4 text-center transition-colors hover:brightness-110"
            style={{
              background: "var(--m-text)",
              color: "var(--m-bg)",
            }}
          >
            Open admin overview
          </Link>
        )}

        <div className="space-y-3">
          {tenants.map(({ id, config }) => {
            if (!config) return null;
            const href = getTenantDashboardFallbackUrl(config);
            const domain = getTenantDashboardHost(config);

            return (
              <a
                key={id}
                href={href}
                className="block rounded-xl p-4 transition-colors hover:brightness-110"
                style={{
                  background: "var(--m-surface)",
                  border: "1px solid var(--m-rule)",
                }}
              >
                <div
                  className="text-[15px] font-medium"
                  style={{ color: "var(--m-text)" }}
                >
                  {config?.siteName || id}
                </div>
                <div
                  className="text-[13px] mt-0.5"
                  style={{ color: "var(--m-text-3)" }}
                >
                  Fallback via strelva.com
                  <span className="block">{domain}</span>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
