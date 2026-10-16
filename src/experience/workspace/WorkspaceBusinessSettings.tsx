"use client";
import { PLACE_LABELS } from "@/platform/presentation/place-labels";

import { StPage, StHead, StSection, StRows, StRow, StSurface, StNotice, StEmpty, StSplit, StLabel, StTextButton } from "@/components/ui/strelva/Kit";
import type { OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceSummary } from "./contracts";
import type { ManagedWorkSummary } from "./workspace-discovery";
import { sameAppHref } from "./workspace-discovery";
import { WebsiteAssignmentHandoff, type WorkspaceOfferingState } from "./WorkspaceOfferings";
import { WorkspaceAllowanceSummary } from "./WorkspaceAllowanceSummary";
import { WorkspacePayerTransition } from "./WorkspacePayerTransition";
import { DecisionPolicySettings } from "./DecisionPolicySettings";

export type SiteAssignmentState = "known" | "loading" | "unavailable";

/**
 * Each managed website's settings, at their workspace homes. October 16: these
 * used to link `/dashboard/settings#profile|#domains|#plan`, which redirect a
 * moved owner to Business details (no domain or plan editing there), so they
 * led nowhere useful. The website opens through its own link (the dashboard
 * routes it to the Website System or keeps the page); Connections is the
 * workspace place; the web address is changed by Strelva on request; the plan
 * row lives under Plan and ownership below.
 */
export function managedSiteLinks(site: ManagedWorkSummary, workspaceId: string) {
  const place = (view: string) => `/workspace?${new URLSearchParams({ view, workspaceId })}`;
  const website = sameAppHref(site.href);
  return [
    ...(website ? [{ id: "website" as const, label: "Pages, photos and look", detail: "Change what visitors see on this website", href: website, end: "Open" }] : []),
    { id: "connections" as const, label: "Connections", detail: "Accounts and services connected to this website", href: place("connections"), end: "Open" },
    { id: "address" as const, label: site.domain ? `Web address: ${site.domain.replace(/^www\./, "")}` : "Web address", detail: "Strelva changes it when you ask", href: place("help"), end: "Ask" },
  ];
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
  needsYouReleased = false,
  assistantConnectionsReleased = false,
  exportSchema3 = false,
  businessBillingReleased = false,
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
  /** STRELVA_NEEDS_YOU_RELEASE: off renders this page exactly as before. */
  needsYouReleased?: boolean;
  assistantConnectionsReleased?: boolean;
  exportSchema3?: boolean;
  businessBillingReleased?: boolean;
}) {
  const readOnly = workspace?.access === "delegated_read" || workspace?.access === "provider_seat";
  const business = workspace?.kind === "customer";
  const assignmentState: WorkspaceOfferingState = offerings ?? {
    status: "unavailable",
    reason: "Website assignment is not available from this workspace.",
  };

  const href = (view: string) => `/workspace?${new URLSearchParams({ view, workspaceId: workspace?.id ?? "" })}`;
  return <StPage>
    <StHead title="Business details" meta={`What Strelva knows about ${workspace?.name || "this business"} and the websites it runs. Your own sign-in stays with you.`} />
    {managedWorkUnavailable ? <StNotice>Some website settings could not be loaded. No business setting was changed.</StNotice> : null}
    {!business ? <StEmpty>Choose your business to manage business information, people, work, and website relationships.</StEmpty> : <StSplit balance="aside" aside={<>
      <StSection title="Managed websites">
        {sites.map(site => <StSection key={site.id} title={site.title}><StRows>{managedSiteLinks(site, workspace?.id ?? "").map(({ id, label, detail, href, end }) => <StRow key={id} title={label} detail={detail} href={href} end={end} />)}</StRows></StSection>)}
        {unassignedSites.length ? <WebsiteAssignmentHandoff businessName={workspace?.name || "this business"} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : assignmentState} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} /> : !sites.length && siteAssignmentState === "loading" ? <StNotice>Checking linked websites…</StNotice> : !sites.length && siteAssignmentState === "unavailable" ? <StNotice>Linked website access is unavailable right now. No business setting was changed.</StNotice> : !sites.length ? <StEmpty>No managed website is linked or assigned to this business. Business information, people, work, and usage remain available here without one.</StEmpty> : null}
      </StSection>
      <StSection id="workspace-usage" title="Usage and limits"><StLabel>Recorded allowances are separate from website subscription billing.</StLabel><WorkspaceAllowanceSummary businessId={workspace?.id || ""} enabled={Boolean(business && workspace && !readOnly)} />{business && workspace?.role === "owner" && !readOnly ? <WorkspacePayerTransition workspaceId={workspace.id} canPropose /> : null}</StSection>
      <StSection title="Personal account"><StRows><StRow title="Your email, sign-in and access belong to you" detail="Your identity stays the same across businesses." href={accountHref} end="Open personal account" /></StRows></StSection>
    </>}>
      <StSurface label="Business information"><StLabel>Business information</StLabel><h2 className="mt-4 text-xl font-medium">{workspace?.name || "Current business"}</h2><p className="mt-3 text-sm">{readOnly ? "Read-only access" : workspace?.role === "owner" ? "You are the owner" : workspace?.role === "admin" ? "Administrator" : "Business member"}</p><StNotice>Business details hold shared facts such as hours and services. Each System declares which facts it reads; connected sites and independently edited content need their own update.</StNotice><StTextButton href={`/workspace/business-details?${new URLSearchParams({ workspaceId: workspace?.id ?? "" })}`}>Open the business record</StTextButton></StSurface>
      <StSection title={PLACE_LABELS.access}><StRows><StRow title="Who can see and change this business" detail={readOnly ? "The business owner controls changes to People & access." : "Membership and permissions belong to this business."} href={href("access")} end="Open" /></StRows></StSection>
      <StSection title="Systems and files"><StEmpty>Internal tools, documents, onboarding cases, requests, and other saved results stay with this business. A managed website is not required.</StEmpty></StSection>
      <StSection title="Plan and ownership"><StRows>{!readOnly && businessBillingReleased ? <StRow title="Plan and billing" href={`/workspace/billing?workspaceId=${encodeURIComponent(workspace?.id ?? "")}`} end="Open" /> : <StRow title="Plan and billing" detail="No plan price is published yet. Plan choices are not open here yet." />}<StRow title={exportSchema3 ? "Export workspace archive" : "Export available workspace snapshot"} href={`/workspace/export?workspaceId=${encodeURIComponent(workspace?.id ?? "")}`} end="Open" />{!readOnly && workspace?.role === "owner" ? <StRow title="Leaving Strelva" href={`/workspace/exit?workspaceId=${encodeURIComponent(workspace?.id ?? "")}`} end="Review" /> : null}</StRows></StSection>
    </StSplit>}
    {assistantConnectionsReleased && business && workspace ? <StSection title="Connected assistants"><StRows><StRow title="Read business facts and prepare website changes" detail="The business owner controls access." href={`/connect?workspaceId=${encodeURIComponent(workspace.id)}`} end="Manage assistant connections" /></StRows></StSection> : null}
    {workspace && (workspace.kind === "customer" || workspace.kind === "agency") ? <StSection title="Units"><StRows><StRow title="Businesses grouped under this organization" detail="Your membership controls what you can change." href={`/workspace/units?${new URLSearchParams({ workspaceId: workspace.id })}`} end="Open units" /></StRows></StSection> : null}
    {needsYouReleased && business && workspace && !readOnly ? <DecisionPolicySettings workspaceId={workspace.id} /> : null}
  </StPage>;
}
