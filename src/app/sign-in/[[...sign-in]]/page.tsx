import type { Metadata } from "next";
import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import { LogoFull } from "@/components/Logo";
import Link from "next/link";
import { headers } from "next/headers";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import { getClientFallbackRoot, isClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getInvite } from "@/lib/invites";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
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

function workspaceReturnTarget(value: string | null): string | null {
  if (value === "/workspace") return value;
  if (!value?.startsWith("/workspace?")) return null;
  const query = new URLSearchParams(value.slice("/workspace?".length));
  const resultId = query.get("save");
  if (query.size !== 1 || !resultId || resultId.length > 256 || !/^scan_[a-z0-9]+$/i.test(resultId)) return null;
  return `/workspace?save=${encodeURIComponent(resultId)}`;
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
  const workspaceOpen = workspaceReleaseEnabled();
  const workspaceTarget = workspaceReturnTarget(searchValue(params.next));
  if (workspaceOpen && workspaceTarget) return <WorkspaceSignIn next={workspaceTarget} />;
  const invite = await getInviteContext(params);
  if (invite) {
    return (
      <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
        <AuthDocumentTitle title="Sign in to your dashboard" />
        <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1120px] items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,420px)]">
          <section>
            <Link
              href="/"
              className="inline-flex w-fit items-center transition-opacity hover:opacity-80"
            >
              <LogoFull />
            </Link>
            <p className="mt-12 text-[14px] font-medium text-m-text-3">
              Invited dashboard access
            </p>
            <h1 className="mt-4 max-w-[720px] font-display text-3xl font-normal leading-[1.05] text-m-text sm:text-4xl">
              Sign in to manage {invite.siteName}.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-m-text-2">
              Use <strong>{invite.email}</strong> so Strelva can connect
              the pending invite, open the dashboard, and show what is working.
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
        <AuthDocumentTitle title={`Sign in to ${tenantAuth.siteName}`} />
        <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1120px] items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,420px)]">
          <section>
            <Link
              href="/"
              className="inline-flex w-fit items-center transition-opacity hover:opacity-80"
            >
              <LogoFull />
            </Link>
            <p className="mt-12 text-[14px] font-medium text-m-text-3">
              Client dashboard
            </p>
            <h1 className="mt-4 max-w-[720px] font-display text-3xl font-normal leading-[1.05] text-m-text sm:text-4xl">
              Sign in to manage {tenantAuth.siteName}.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-m-text-2">
              Use the email address connected to this site. After sign-in,
              Strelva will open the dashboard for {tenantAuth.siteName}.
            </p>
          </section>

          <section className="rounded-[28px] border border-m-rule bg-m-paper p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
            <SupabaseSignIn next={dashboardPath} />
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <AuthDocumentTitle title="Sign in to your Strelva work" />
      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1120px] items-center gap-10 py-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,420px)]">
        <section>
          <Link
            href="/"
            className="inline-flex w-fit items-center transition-opacity hover:opacity-80"
          >
            <LogoFull />
          </Link>
          <p className="mt-12 text-[14px] font-medium text-m-text-3">Your Strelva work</p>
          <h1 className="mt-4 max-w-[720px] font-display text-3xl font-normal leading-[1.05] text-m-text sm:text-4xl">
            Sign in to your work.
          </h1>
          <p className="mt-6 max-w-[620px] text-[16px] leading-[1.7] text-m-text-2">
            Use the email connected to your Strelva account to continue. If you
            manage a Strelva website, we&apos;ll open its existing dashboard. New
            here?{" "}
            <Link href="/ai-visibility" className="text-m-text underline underline-offset-2 hover:text-m-text-2">
              Try the free AI Visibility audit
            </Link>
            .
          </p>
        </section>

        <section className="rounded-[28px] border border-m-rule bg-m-paper p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-6">
          {searchValue(params.error) === "auth_callback" && (
            <p className="mb-4 rounded-[12px] border border-[color:var(--m-danger,#d33)]/30 bg-[color:var(--m-danger,#d33)]/10 px-4 py-3 text-[13px] leading-[1.6] text-[color:var(--m-danger,#d33)]">
              Sign-in didn&apos;t complete. Please try again.
              {searchValue(params.reason) ? (
                <span className="mt-1 block font-mono text-[11px] opacity-80">{searchValue(params.reason)}</span>
              ) : null}
            </p>
          )}
          <SupabaseSignIn next={workspaceOpen ? "/workspace" : "/account"} />
        </section>
      </div>
    </main>
  );
}
