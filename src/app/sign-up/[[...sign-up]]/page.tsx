import type { Metadata } from "next";
import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import { getClientFallbackRoot, isClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getInvite } from "@/lib/invites";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";

export const metadata: Metadata = {
  title: "Create dashboard access",
  description: "Create an invited Strelva dashboard account, or request your build first.",
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
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<AuthSearchParams>;
}) {
  const params = await searchParams;
  const invite = await getInviteContext(params);

  if (invite) {
    return (
      <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
        <AuthDocumentTitle title="Create your dashboard account" />
        <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1120px] items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,420px)]">
          <section>
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-m-text-2 transition-colors hover:text-m-text"
            >
              <ArrowLeft className="size-4" />
              Strelva
            </Link>
            <p className="mt-12 text-[14px] font-medium text-m-text-3">
              Dashboard invite confirmed
            </p>
            <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-m-text sm:text-6xl">
              Create access for {invite.siteName}.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-m-text-2">
              Sign in with <strong>{invite.email}</strong> — the email your
              invite was sent to. Strelva opens your site dashboard
              automatically.
            </p>
          </section>

          <section className="rounded-[28px] border border-m-rule bg-m-paper p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
            <SupabaseSignIn next="/account" prefillEmail={invite.email} />
          </section>
        </div>
      </main>
    );
  }

  const tenantAuth = await getTenantAuthContext();
  if (tenantAuth) {
    const dashboardPath = withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/dashboard");

    return (
      <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
        <AuthDocumentTitle title={`Create access for ${tenantAuth.siteName}`} />
        <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1120px] items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,420px)]">
          <section>
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-m-text-2 transition-colors hover:text-m-text"
            >
              <ArrowLeft className="size-4" />
              Strelva
            </Link>
            <p className="mt-12 text-[14px] font-medium text-m-text-3">
              Client dashboard
            </p>
            <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-m-text sm:text-6xl">
              Create access for {tenantAuth.siteName}.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-m-text-2">
              Sign in with the email your invite was sent to. Strelva opens
              the dashboard for {tenantAuth.siteName}.
            </p>
          </section>

          <section className="rounded-[28px] border border-m-rule bg-m-paper p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
            <SupabaseSignIn next={dashboardPath} />
          </section>
        </div>
      </main>
    );
  }

  const title = "Dashboard access is invite-only.";

  return (
    <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <AuthDocumentTitle title={title} />
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-40px)] max-w-[960px] flex-col justify-center py-16">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-m-text-2 transition-colors hover:text-m-text"
        >
          <ArrowLeft className="size-4" />
          Strelva
        </Link>

        <section className="mt-12 overflow-hidden rounded-[28px] border border-m-rule bg-m-paper p-6 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-8 md:p-10">
          <p className="text-[14px] font-medium text-m-text-3">
            Dashboards are created from your build
          </p>
          <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-m-text sm:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-[640px] text-[16px] leading-[1.7] text-m-text-2">
            Your dashboard opens when your site does. Already have access? Sign
            in with the email connected to your site. No site yet? Request your
            build and we will get you set up.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/access-request"
              className="marketing-button-primary h-11 px-5 text-[14px]"
            >
              Request your build
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/sign-in"
              className="marketing-button-secondary h-11 px-5 text-[14px]"
            >
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
