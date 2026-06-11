import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import { getClientFallbackRoot, isClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getInvite } from "@/lib/invites";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";

export const metadata: Metadata = {
  title: "Dashboard access",
  description: "Sign in to a delivered Strelva dashboard, or request your build first.",
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

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<AuthSearchParams>;
}) {
  const params = await searchParams;
  const invite = await getInviteContext(params);
  if (invite) {
    const requestHeaders = await headers();
    const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
    const signInPath = withClientFallbackRoot(clientFallbackRoot, "/sign-in");
    const signUpPath = withClientFallbackRoot(clientFallbackRoot, "/sign-up");
    const signUpUrl = `${signUpPath}?email=${encodeURIComponent(invite.email)}`;

    return (
      <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
        <AuthDocumentTitle title="Sign in to your dashboard" />
        <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1120px] items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,420px)]">
          <section>
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-[color:var(--m-text-2)] transition-colors hover:text-[color:var(--m-text)]"
            >
              <ArrowLeft className="size-4" />
              Strelva
            </Link>
            <p className="mt-12 text-[14px] font-medium text-[color:var(--m-text-3)]">
              Invited dashboard access
            </p>
            <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-[color:var(--m-text)] sm:text-6xl">
              Sign in to manage {invite.siteName}.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-[color:var(--m-text-2)]">
              Use <strong>{invite.email}</strong> so Strelva can connect
              the pending invite, open the dashboard, and show what is working.
            </p>
          </section>

          <section className="rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
            <SignIn
              routing="path"
              path={signInPath}
              signUpUrl={signUpUrl}
              forceRedirectUrl="/account"
              fallbackRedirectUrl="/account"
              initialValues={{ emailAddress: invite.email }}
            />
          </section>
        </div>
      </main>
    );
  }

  const tenantAuth = await getTenantAuthContext();
  if (tenantAuth) {
    const signInPath = withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/sign-in");
    const signUpPath = withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/sign-up");
    const dashboardPath = withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/dashboard");

    return (
      <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
        <AuthDocumentTitle title={`Sign in to ${tenantAuth.siteName}`} />
        <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1120px] items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,420px)]">
          <section>
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-[color:var(--m-text-2)] transition-colors hover:text-[color:var(--m-text)]"
            >
              <ArrowLeft className="size-4" />
              Strelva
            </Link>
            <p className="mt-12 text-[14px] font-medium text-[color:var(--m-text-3)]">
              Client dashboard
            </p>
            <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-[color:var(--m-text)] sm:text-6xl">
              Sign in to manage {tenantAuth.siteName}.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-[color:var(--m-text-2)]">
              Use the email address connected to this site. After sign-in,
              Strelva will open the dashboard for {tenantAuth.siteName}.
            </p>
          </section>

          <section className="rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
            <SignIn
              routing="path"
              path={signInPath}
              signUpUrl={signUpPath}
              forceRedirectUrl={dashboardPath}
              fallbackRedirectUrl={dashboardPath}
            />
          </section>
        </div>
      </main>
    );
  }

  const title = "Dashboard sign-in is paused.";

  return (
    <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <AuthDocumentTitle title={title} />
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-40px)] max-w-[960px] flex-col justify-center py-16">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-[color:var(--m-text-2)] transition-colors hover:text-[color:var(--m-text)]"
        >
          <ArrowLeft className="size-4" />
          Strelva
        </Link>

        <section className="mt-12 overflow-hidden rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-6 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-8 md:p-10">
          <MailCheck className="size-9 text-[color:var(--m-accent)]" />
          <p className="mt-6 text-[14px] font-medium text-[color:var(--m-text-3)]">
            Temporary access handoff
          </p>
          <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-[color:var(--m-text)] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-[640px] text-[16px] leading-[1.7] text-[color:var(--m-text-2)]">
            Dashboard accounts open after your website exists. If your site is
            already live or in delivery, email Jacob and he will send the
            current access link or next step directly.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="mailto:jacob@strelva.com?subject=Strelva%20dashboard%20access"
              className="marketing-button-primary h-11 px-5 text-[14px]"
            >
              Email Jacob
              <ArrowRight className="size-4" />
            </a>
            <Link
              href="/access-request"
              className="marketing-button-secondary h-11 px-5 text-[14px]"
            >
              Request your build
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
