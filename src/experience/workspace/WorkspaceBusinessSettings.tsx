"use client";

import Link from "next/link";
import { Building2, ExternalLink, Globe2, Link2, UserRound } from "lucide-react";
import type { OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceSummary } from "./contracts";
import type { ManagedWorkSummary } from "./workspace-discovery";
import { sameAppHref } from "./workspace-discovery";
import { WebsiteAssignmentHandoff, type WorkspaceOfferingState } from "./WorkspaceOfferings";
import { WorkspaceAllowanceSummary } from "./WorkspaceAllowanceSummary";
import { WorkspacePayerTransition } from "./WorkspacePayerTransition";

type ManagedSettingsDestination = "business" | "connections" | "domains" | "subscription";
export type SiteAssignmentState = "known" | "loading" | "unavailable";

const DESTINATION_PATH: Record<ManagedSettingsDestination, string> = {
  business: "/dashboard/settings#profile",
  connections: "/dashboard/integrations",
  domains: "/dashboard/settings#domains",
  subscription: "/dashboard/settings#plan",
};

/** Build a link into the existing tenant-scoped dashboard without carrying tenant authority. */
export function managedSettingsHref(href: string, destination: ManagedSettingsDestination): string | null {
  const safe = sameAppHref(href);
  if (!safe) return null;
  const base = safe.split(/[?#]/, 1)[0];
  if (base === "/preview/strelva/website") return `${base}${DESTINATION_PATH[destination]}`;
  if (!base || !/\/dashboard\/?$/.test(base)) return null;
  return base.replace(/\/dashboard\/?$/, DESTINATION_PATH[destination]);
}

function settingLinks(site: ManagedWorkSummary) {
  return [
    { id: "business" as const, label: "Website profile", detail: "Public details and brand for this website", icon: Building2 },
    { id: "connections" as const, label: "Connections", detail: "Accounts and services connected to this website", icon: Link2 },
    { id: "domains" as const, label: "Domains", detail: "Verified website addresses and domain state", icon: Globe2 },
    { id: "subscription" as const, label: "Subscription", detail: "The plan and billing state for this website", icon: ExternalLink },
  ].flatMap((item) => {
    const href = managedSettingsHref(site.href, item.id);
    return href ? [{ ...item, href }] : [];
  });
}

export function WorkspaceBusinessSettings({
  workspace,
  sites,
  unassignedSites = [],
  siteAssignmentState,
  offerings,
  onWebsiteCommand,
  onRetryWebsiteAssignments,
  managedWorkUnavailable = false,
  accountHref,
}: {
  workspace?: WorkspaceSummary;
  sites: readonly ManagedWorkSummary[];
  unassignedSites?: readonly ManagedWorkSummary[];
  siteAssignmentState: SiteAssignmentState;
  offerings?: WorkspaceOfferingState;
  onWebsiteCommand?: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
  onRetryWebsiteAssignments?: () => void;
  managedWorkUnavailable?: boolean;
  accountHref: string;
}) {
  const readOnly = workspace?.access === "delegated_read";
  const business = workspace?.kind === "customer";
  const assignmentState: WorkspaceOfferingState = offerings ?? {
    status: "unavailable",
    reason: "Website assignment is not available from this workspace.",
  };

  return <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-8 lg:px-12 lg:py-12">
    <header className="border-b border-gray-border pb-8">
      <p className="text-sm font-medium text-accent-text">{workspace?.name || "Current workspace"}</p>
      <h1 className="mt-4 font-display text-4xl font-normal text-warm-black">Settings</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-muted">Business controls stay with the business and its authorized website. Your sign-in identity remains in your personal account.</p>
    </header>

    <section className="border-b border-gray-border py-8" aria-labelledby="business-settings-heading">
      <h2 id="business-settings-heading" className="text-base font-medium text-warm-black">Business</h2>
      {managedWorkUnavailable ? <p className="mt-4 text-sm text-gray-muted" role="status">Some website settings could not be loaded. No business setting was changed.</p> : null}
      {!business ? <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-muted">Choose a customer business workspace to manage business information, people, work, and website relationships.</p> : <div className="mt-6 space-y-8">
        <section aria-labelledby="business-information-heading">
          <h3 id="business-information-heading" className="text-sm font-medium text-warm-black">Business information</h3>
          <dl className="mt-4 grid gap-4 border-y border-gray-border py-4 sm:grid-cols-2">
            <div><dt className="text-xs text-gray-muted">Business</dt><dd className="mt-1 text-sm text-warm-black">{workspace?.name || "Current business"}</dd></div>
            <div><dt className="text-xs text-gray-muted">Your access</dt><dd className="mt-1 text-sm text-warm-black">{readOnly ? "Read-only access" : workspace?.role === "owner" ? "Owner" : workspace?.role === "admin" ? "Administrator" : "Business member"}</dd></div>
          </dl>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-gray-muted">Business identity and access remain available here whether or not a managed website is assigned.</p>
        </section>

        <section aria-labelledby="business-people-heading">
          <h3 id="business-people-heading" className="text-sm font-medium text-warm-black">People and access</h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-muted">Membership and workspace permissions belong to this business. {readOnly ? "The business owner controls changes to people and access." : "Open People & access from the workspace navigation to review or change them."}</p>
        </section>

        <section aria-labelledby="business-work-heading">
          <h3 id="business-work-heading" className="text-sm font-medium text-warm-black">Work</h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-muted">Applications, documents, trackers, requests, and other saved work stay with this business. A managed website is not required to create or return to business work.</p>
        </section>

        <section aria-labelledby="managed-websites-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 id="managed-websites-heading" className="text-sm font-medium text-warm-black">Managed websites</h3>
            {readOnly ? <span className="text-xs text-gray-muted">Read-only workspace</span> : null}
          </div>
          {sites.length ? <div className="mt-4 space-y-8">
            {sites.map((site) => {
              const links = settingLinks(site);
              return <section key={site.id} aria-labelledby={`settings-site-${site.id}`}>
              <h4 id={`settings-site-${site.id}`} className="text-sm font-medium text-warm-black">{site.title}</h4>
              <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">
                {links.map(({ id, label, detail, href, icon: Icon }) => <li key={id}>
                  <Link href={href} prefetch={false} className="flex min-h-16 items-center gap-4 px-2 py-3 text-left hover:bg-surface-raised">
                    <Icon className="h-5 w-5 shrink-0 text-accent-text" strokeWidth={1.5} aria-hidden="true" />
                    <span className="min-w-0 flex-1"><strong className="block text-sm font-medium text-warm-black">{label}</strong><small className="mt-1 block text-xs leading-relaxed text-gray-muted">{detail}</small></span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-gray-muted" aria-hidden="true" />
                  </Link>
                </li>)}
                {!links.length ? <li><Link href={site.href} prefetch={false} className="flex min-h-16 items-center gap-4 px-2 py-3 text-left hover:bg-surface-raised"><Globe2 className="h-5 w-5 shrink-0 text-accent-text" strokeWidth={1.5} aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block text-sm font-medium text-warm-black">Open website controls</strong><small className="mt-1 block text-xs text-gray-muted">Settings links are not available from this workspace entry.</small></span><ExternalLink className="h-4 w-4 shrink-0 text-gray-muted" aria-hidden="true" /></Link></li> : null}
              </ul>
            </section>;
            })}
          </div> : null}
          {unassignedSites.length ? <div className="mt-5"><WebsiteAssignmentHandoff businessName={workspace?.name || "this business"} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : assignmentState} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} /></div> : !sites.length && siteAssignmentState === "loading" ? <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-muted" role="status">Checking linked websites…</p> : !sites.length && siteAssignmentState === "unavailable" ? <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-muted" role="status">Linked website access is unavailable right now. No business setting was changed.</p> : !sites.length ? <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-muted">No managed website is linked or assigned to this business. Business information, people, work, and usage remain available here without one.</p> : null}
        </section>
      </div>}
    </section>

    <section id="workspace-usage" className="border-b border-gray-border py-8" aria-labelledby="workspace-usage-heading">
      <h2 id="workspace-usage-heading" className="text-base font-medium text-warm-black">Usage and limits</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-muted">Recorded operational allowances appear here when this business has one. They are separate from website subscription billing.</p>
      <div className="mt-5"><WorkspaceAllowanceSummary businessId={workspace?.id || ""} enabled={Boolean(business && workspace && !readOnly)} /></div>
      {business && workspace?.role === "owner" && !readOnly ? <WorkspacePayerTransition workspaceId={workspace.id} canPropose /> : null}
    </section>

    <section className="py-8" aria-labelledby="personal-account-heading">
      <h2 id="personal-account-heading" className="text-base font-medium text-warm-black">Personal account</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-muted">Your email, sign-in status, and workspace access belong to you, not to this business.</p>
      <Link href={accountHref} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-border px-4 py-2 text-sm font-medium text-warm-black hover:bg-surface-raised"><UserRound className="h-4 w-4" aria-hidden="true" />Open personal account</Link>
    </section>
  </div>;
}
