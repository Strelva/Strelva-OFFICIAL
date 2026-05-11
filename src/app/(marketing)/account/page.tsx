import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { UseInvitedEmailButton } from "@/components/auth/UseInvitedEmailButton";
import { isSuperAdmin, parseTenantAccessMetadata } from "@/lib/auth";
import { getAllTenants, getTenantConfig, isActiveTenant } from "@/lib/tenants";
import {
  getTenantDashboardFallbackUrl,
  getTenantDashboardHost,
} from "@/lib/tenant-urls";
import { getDevAccessTenant } from "@/lib/dev-access";
import type { TenantConfig } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { userId } = await auth();

  if (!userId) {
    const devTenant = getDevAccessTenant();
    if (devTenant) {
      const config = await getTenantConfig(devTenant);
      if (config && isActiveTenant(config)) redirect(getTenantDashboardFallbackUrl(config));
      redirect(`/dashboard?tenant=${devTenant}`);
    }
    redirect("/sign-in");
  }

  if (await isSuperAdmin()) {
    const tenants = (await getAllTenants()).filter(isActiveTenant);
    return <TenantPicker tenants={tenants.map((config) => ({ id: config.id, config }))} isSuperAdmin />;
  }

  const user = await currentUser();
  const tenants = parseTenantAccessMetadata(user?.publicMetadata).map((grant) => grant.tenant);

  if (tenants.length === 0) {
    return <NoAccessState />;
  }

  if (tenants.length === 1) {
    const tenantId = tenants[0];
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
          className="text-[24px] font-medium tracking-[-0.02em] mb-3"
          style={{ color: "var(--m-text)" }}
        >
          No invited sites on this account
        </h1>
        <p
          className="text-[15px] leading-relaxed mb-4"
          style={{ color: "var(--m-text-2)" }}
        >
          You&apos;re signed in, but this email is not connected to a Scaffold
          Web dashboard yet. Most access issues happen when the invite was sent
          to a different email address.
        </p>
        <p
          className="text-[14px] leading-relaxed mb-8"
          style={{ color: "var(--m-text-3)" }}
        >
          Use the exact email address that received your invite. The button
          below signs you out so you can choose that account. You can also email{" "}
          <a className="underline-offset-4 hover:underline" href="mailto:jacob@scaffoldweb.com">
            jacob@scaffoldweb.com
          </a>{" "}
          and we&apos;ll connect the right account.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <UseInvitedEmailButton
            className="text-[14px] font-medium px-8 py-3 transition-colors"
            style={{ background: "var(--m-text)", color: "var(--m-bg)" }}
          />
          <Link
            href="/onboard"
            className="text-[14px] font-medium px-8 py-3 border transition-colors hover:bg-white/5"
            style={{
              borderColor: "var(--m-rule)",
              color: "var(--m-text-2)",
            }}
          >
            Start a new site
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
          className="text-[24px] font-medium tracking-[-0.02em] mb-2 text-center"
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
                  Fallback via scaffoldweb.com
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
