import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, getTenantConfig } from "@/lib/tenants";
import { getTenantDashboardHost, getTenantDashboardUrl } from "@/lib/tenant-urls";
import type { TenantConfig } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (await isSuperAdmin()) {
    const tenants = await getAllTenants();
    return <TenantPicker tenants={tenants.map((config) => ({ id: config.id, config }))} isSuperAdmin />;
  }

  const user = await currentUser();
  const tenants = (user?.publicMetadata?.tenants as string[] | undefined) || [];

  if (tenants.length === 0) {
    return <NoAccessState />;
  }

  if (tenants.length === 1) {
    const tenantId = tenants[0];
    const config = await getTenantConfig(tenantId);

    if (config) redirect(getTenantDashboardUrl(config));
    redirect("/no-access");
  }

  const tenantConfigs = await Promise.all(
    tenants.map(async (id) => ({
      id,
      config: await getTenantConfig(id),
    }))
  );

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
          No sites yet
        </h1>
        <p
          className="text-[15px] leading-relaxed mb-8"
          style={{ color: "var(--m-text-2)" }}
        >
          You don&apos;t have access to any sites yet. Get started to have your business site built.
        </p>
        <Link
          href="/onboard"
          className="inline-block text-[14px] font-medium px-8 py-3 transition-colors"
          style={{
            background: "var(--m-text)",
            color: "var(--m-bg)",
          }}
        >
          Get started
        </Link>
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
            const href = getTenantDashboardUrl(config);
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
                  {domain}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
