import Link from "next/link";
import type { ReactNode } from "react";
import type { Workspace } from "@/platform/workspaces";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";

export interface WorkspaceAccountViewProps {
  appBase?: string;
  signOut?: ReactNode;
  managedHref?: string;
  notice?: ReactNode;
  continuation?: ReactNode;
  payerInbox?: ReactNode;
  name: string | null;
  email: string;
  emailConfirmed: boolean;
  releaseOpen: boolean;
  workspaces: Pick<Workspace, "id" | "kind" | "name" | "access">[];
  workspacesUnavailable?: boolean;
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


/** Presentation only. The account route resolves verified identity and access. */
export function WorkspaceAccountView({ appBase, signOut, managedHref = "/account?managed=1", notice, continuation, payerInbox, name, email, emailConfirmed, releaseOpen, workspaces, workspacesUnavailable = false }: WorkspaceAccountViewProps) {
  return (
    <StrelvaShell appBase={appBase} signOut={signOut} notice={notice} active="account" title="Account" accountName={name || email || "Your account"} accountDetail={email || "Account & access"}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-8 lg:px-12 lg:py-12">
          <header className="border-b border-gray-border pb-8">
            <p className="text-[14px] font-medium leading-5 text-accent-text">Your account</p>
            <h1 className="mt-4 font-display text-[40px] font-normal leading-[48px] text-warm-black">
              Account
            </h1>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">
              {name ? `${name}, this is the identity and workspace access Strelva has for you.` : "This is the identity and workspace access Strelva has for you."}
            </p>
          </header>

          <section className="border-b border-gray-border py-8" aria-labelledby="identity-title">
            <h2 id="identity-title" className="text-[16px] font-medium leading-6 text-warm-black">
              Signed-in identity
            </h2>
            <dl className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <dt className="text-[14px] text-gray-muted">Email</dt>
                <dd className="mt-1 break-all text-[14px] text-warm-black">{email || "No email is available"}</dd>
              </div>
              <div>
                <dt className="text-[14px] text-gray-muted">Email status</dt>
                <dd className="mt-1 text-[14px] text-warm-black">
                  {emailConfirmed ? "Confirmed" : "Confirmation needed"}
                </dd>
              </div>
            </dl>
            {!emailConfirmed && (
              <p className="mt-6 max-w-xl text-[14px] leading-relaxed text-warning">
                Confirm this email before private workspace access can be shown.
              </p>
            )}
          </section>

          {continuation}

          <section className="border-b border-gray-border py-8" aria-labelledby="workspaces-title">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="workspaces-title" className="text-[16px] font-medium leading-6 text-warm-black">
                Workspace access
              </h2>
              {workspaces.length > 0 && <span className="text-[14px] text-gray-muted">{workspaces.length} available</span>}
            </div>

            {!releaseOpen ? (
              <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">
                Personal workspaces are not open in this environment yet. Your signed-in identity is unchanged.
              </p>
            ) : workspacesUnavailable ? (
              <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">
                Workspace access is temporarily unavailable. No access or billing state was changed.
              </p>
            ) : !emailConfirmed ? (
              <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">
                Workspace access will appear after your email is confirmed.
              </p>
            ) : workspaces.length === 0 ? (
              <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">
                No workspace access is associated with this identity yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">
                {workspaces.map((workspace) => (
                  <li key={workspace.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`${appBase || ""}/workspace?workspaceId=${encodeURIComponent(workspace.id)}`}
                        className="break-words text-[14px] font-medium text-warm-black underline underline-offset-4"
                      >{workspace.name}</Link>
                      <p className="mt-1 text-[14px] text-gray-muted">{workspaceKindLabel(workspace.kind)}</p>
                    </div>
                    <span className="shrink-0 text-[14px] text-gray-muted">
                      {workspace.access === "delegated_read" ? "Read-only access" : "Member access"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {releaseOpen && emailConfirmed && payerInbox ? <section className="border-b border-gray-border py-8" aria-labelledby="payer-requests-title">
            <h2 id="payer-requests-title" className="text-[16px] font-medium leading-6 text-warm-black">Payer requests</h2>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">Review financial responsibility addressed to this verified account. Accepting does not grant access to a business or its saved work.</p>
            {payerInbox}
          </section> : null}

          <section className="border-b border-gray-border py-8" aria-labelledby="managed-title">
            <h2 id="managed-title" className="text-[16px] font-medium leading-6 text-warm-black">
              Managed websites
            </h2>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">
              Your websites are part of your Strelva work. Each site keeps its own people, settings, and agreed service.
            </p>
            <Link href={managedHref} className="mt-6 inline-flex min-h-12 items-center rounded-xl border border-gray-border px-4 py-3 text-[14px] font-medium leading-6 text-warm-black transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Open managed websites
            </Link>
          </section>

          <section className="py-8" aria-labelledby="billing-title">
            <h2 id="billing-title" className="text-[16px] font-medium leading-6 text-warm-black">
              Billing
            </h2>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">
              Manage website billing from that site’s settings. New paid product plans are not available here yet; your existing service agreement still applies.
            </p>
          </section>
        </div>
      </div>
    </StrelvaShell>
  );
}
