import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaces, type Workspace } from "@/platform/workspaces";
import { WorkspaceSignOutButton } from "@/experience/workspace/WorkspaceSignOutButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UserIdentity = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function identityName(user: UserIdentity): string | null {
  const metadata = user.user_metadata;
  if (!metadata) return null;
  for (const key of ["full_name", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function workspaceKindLabel(kind: Workspace["kind"]): string {
  switch (kind) {
    case "agency":
      return "Agency workspace";
    case "customer":
      return "Customer workspace";
    default:
      return "Personal workspace";
  }
}

export default async function WorkspaceAccountPage() {
  // This route deliberately reads the verified server session directly. It
  // must never resolve a local/dev bypass into a personal identity page.
  const user = await getSessionUser() as UserIdentity | null;
  if (!user) redirect("/sign-in?next=%2Fworkspace");

  const normalizedEmail = user.email?.trim().toLowerCase() || "";
  const email = normalizedEmail || "No email is available";
  const emailConfirmed = Boolean(user.email_confirmed_at && EMAIL_PATTERN.test(normalizedEmail));
  const releaseOpen = workspaceReleaseEnabled();
  const name = identityName(user);

  let workspaces: Workspace[] = [];
  let workspacesUnavailable = false;
  if (releaseOpen && emailConfirmed) {
    try {
      workspaces = await listWorkspaces({ userId: user.id, verifiedEmail: normalizedEmail });
    } catch {
      // The identity page remains useful when the optional workspace store is
      // unavailable. Do not expose database details or imply missing access.
      workspacesUnavailable = true;
    }
  }

  return (
    <main data-dashboard className="min-h-dvh bg-surface-base text-warm-black">
      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8 sm:py-10">
        <nav className="flex items-center justify-between gap-4 text-[12px] text-gray-muted" aria-label="Account navigation">
          <Link href="/workspace" className="rounded-md underline-offset-4 hover:text-warm-black hover:underline">
            ← Your work
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/account" className="rounded-md underline-offset-4 hover:text-warm-black hover:underline">
              Managed websites
            </Link>
            <WorkspaceSignOutButton className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-border px-3 text-[12px] text-gray-muted transition-colors hover:border-accent/40 hover:text-warm-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
          </div>
        </nav>

        <header className="border-b border-gray-border pb-8 pt-16 sm:pt-24">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent-text">Personal account</p>
          <h1 className="mt-4 font-display text-[34px] font-medium leading-tight text-warm-black sm:text-[42px]">
            Account
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">
            {name ? `${name}, this is the identity and workspace access Strelva has for you.` : "This is the identity and workspace access Strelva has for you."}
          </p>
        </header>

        <section className="border-b border-gray-border py-8" aria-labelledby="identity-title">
          <h2 id="identity-title" className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Signed-in identity
          </h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-[12px] text-gray-muted">Email</dt>
              <dd className="mt-1 break-all text-[14px] text-warm-black">{email}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-gray-muted">Email status</dt>
              <dd className="mt-1 text-[14px] text-warm-black">
                {emailConfirmed ? "Confirmed" : "Confirmation needed"}
              </dd>
            </div>
          </dl>
          {!emailConfirmed && (
            <p className="mt-5 max-w-xl text-[13px] leading-relaxed text-warning">
              Confirm this email before private workspace access can be shown.
            </p>
          )}
        </section>

        <section className="border-b border-gray-border py-8" aria-labelledby="workspaces-title">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="workspaces-title" className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
              Workspace access
            </h2>
            {workspaces.length > 0 && <span className="text-[12px] text-gray-muted">{workspaces.length} available</span>}
          </div>

          {!releaseOpen ? (
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-gray-muted">
              Personal workspaces are not open in this environment yet. Your signed-in identity is unchanged.
            </p>
          ) : workspacesUnavailable ? (
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-gray-muted">
              Workspace access is temporarily unavailable. No access or billing state was changed.
            </p>
          ) : !emailConfirmed ? (
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-gray-muted">
              Workspace access will appear after your email is confirmed.
            </p>
          ) : workspaces.length === 0 ? (
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-gray-muted">
              No workspace access is associated with this identity yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">
              {workspaces.map((workspace) => (
                <li key={workspace.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-warm-black">{workspace.name}</p>
                    <p className="mt-1 text-[12px] text-gray-muted">{workspaceKindLabel(workspace.kind)}</p>
                  </div>
                  <span className="shrink-0 text-[12px] text-gray-muted">
                    {workspace.access === "delegated_read" ? "Read-only access" : "Member access"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-b border-gray-border py-8" aria-labelledby="managed-title">
          <h2 id="managed-title" className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Managed websites
          </h2>
          <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-gray-muted">
            Managed websites remain in the existing client account flow. This account page does not change site access or tenant permissions.
          </p>
          <Link href="/account" className="mt-5 inline-flex min-h-10 items-center rounded-lg border border-gray-border px-3 text-[12px] font-medium text-warm-black transition-colors hover:border-accent/40">
            Open managed websites
          </Link>
        </section>

        <section className="py-8" aria-labelledby="billing-title">
          <h2 id="billing-title" className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Billing
          </h2>
          <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-gray-muted">
            Personal workspace billing settings are not available here. Existing managed services keep their current billing path.
          </p>
        </section>
      </div>
    </main>
  );
}
