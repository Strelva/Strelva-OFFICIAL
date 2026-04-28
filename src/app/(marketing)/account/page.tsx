import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (await isSuperAdmin()) {
    redirect("/admin");
  }

  const user = await currentUser();
  const tenants = (user?.publicMetadata?.tenants as string[] | undefined) || [];

  if (tenants.length === 0) {
    return <NoAccessState />;
  }

  if (tenants.length === 1) {
    const tenantId = tenants[0];
    const config = await getTenantConfig(tenantId);

    if (config?.customDomains?.[0]) {
      redirect(`https://${config.customDomains[0]}/dashboard`);
    }

    const host = process.env.NODE_ENV === "production"
      ? `${tenantId}.scaffoldweb.com`
      : `${tenantId}.localhost:3000`;
    redirect(`${process.env.NODE_ENV === "production" ? "https" : "http"}://${host}/dashboard`);
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
    config: { siteName?: string; customDomains?: string[] } | undefined;
  }>;
}

function TenantPicker({ tenants }: TenantPickerProps) {
  const isProd = process.env.NODE_ENV === "production";

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
          You have access to multiple sites.
        </p>

        <div className="space-y-3">
          {tenants.map(({ id, config }) => {
            const domain = config?.customDomains?.[0];
            const href = domain
              ? `https://${domain}/dashboard`
              : `${isProd ? "https" : "http"}://${id}.${isProd ? "scaffoldweb.com" : "localhost:3000"}/dashboard`;

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
                  {domain || `${id}.scaffoldweb.com`}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
