import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import { getClientFallbackRoot, isClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getInvite } from "@/lib/invites";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";

export const metadata: Metadata = {
  title: "Create dashboard access",
  description: "Create an invited Strelva dashboard account, or create an account for self-serve setup.",
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

function getSafeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
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
  const redirectUrl = getSafeRedirectPath(searchValue(params.redirect_url));
  const isSelfServeSignup = redirectUrl?.startsWith("/onboard") ?? false;

  if (invite) {
    const requestHeaders = await headers();
    const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
    const signUpPath = withClientFallbackRoot(clientFallbackRoot, "/sign-up");
    const signInPath = withClientFallbackRoot(clientFallbackRoot, "/sign-in");
    const signInUrl = `${signInPath}?email=${encodeURIComponent(invite.email)}`;

    return (
      <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
        <AuthDocumentTitle title="Create your dashboard account" />
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
              Dashboard invite confirmed
            </p>
            <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-[color:var(--m-text)] sm:text-6xl">
              Create access for {invite.siteName}.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-[color:var(--m-text-2)]">
              Use <strong>{invite.email}</strong> to connect this account to
              the dashboard Jacob prepared. After signup, Strelva will
              open the site dashboard automatically.
            </p>
          </section>

          <section className="rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
            <SignUp
              routing="path"
              path={signUpPath}
              signInUrl={signInUrl}
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
    const signUpPath = withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/sign-up");
    const signInPath = withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/sign-in");
    const dashboardPath = withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/dashboard");

    return (
      <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
        <AuthDocumentTitle title={`Create access for ${tenantAuth.siteName}`} />
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
              Create access for {tenantAuth.siteName}.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-[color:var(--m-text-2)]">
              Use the email Jacob connected to this site. After signup,
              Strelva will open the dashboard for {tenantAuth.siteName}.
            </p>
          </section>

          <section className="rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
            <SignUp
              routing="path"
              path={signUpPath}
              signInUrl={signInPath}
              forceRedirectUrl={dashboardPath}
              fallbackRedirectUrl={dashboardPath}
            />
          </section>
        </div>
      </main>
    );
  }

  if (isSelfServeSignup) {
    const requestHeaders = await headers();
    const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
    const signUpPath = withClientFallbackRoot(clientFallbackRoot, "/sign-up");
    const signInPath = withClientFallbackRoot(clientFallbackRoot, "/sign-in");

    return (
      <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
        <AuthDocumentTitle title="Create your Strelva account" />
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
              Self-serve setup
            </p>
            <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-[color:var(--m-text)] sm:text-6xl">
              Create the account. Then we prepare the site.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-[color:var(--m-text-2)]">
              After signup, you will return to the business setup you started.
              Strelva will use those details to create your dashboard,
              starter content, and subdomain.
            </p>
          </section>

          <section className="rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
            <SignUp
              routing="path"
              path={signUpPath}
              signInUrl={signInPath}
              forceRedirectUrl={redirectUrl}
              fallbackRedirectUrl={redirectUrl}
            />
          </section>
        </div>
      </main>
    );
  }

  const title = "Dashboard signup is paused.";

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
            Free-site requests stay email-first
          </p>
          <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-[color:var(--m-text)] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-[640px] text-[16px] leading-[1.7] text-[color:var(--m-text-2)]">
            We only create dashboard access once there is a website to manage.
            Request a free site first, and we will email your delivery-status
            link after the request is received.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/access-request"
              className="marketing-button-primary h-11 px-5 text-[14px]"
            >
              Request free site
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="mailto:jacob@strelva.com?subject=Strelva%20signup"
              className="marketing-button-secondary h-11 px-5 text-[14px]"
            >
              Email Jacob
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
