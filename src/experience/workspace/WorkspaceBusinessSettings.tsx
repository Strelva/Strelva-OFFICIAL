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
    { id: "business" as const, label: "Website profile", detail: "Public details and brand for this website" },
    { id: "connections" as const, label: "Connections", detail: "Accounts and services connected to this website" },
    { id: "domains" as const, label: "Domains", detail: "Verified website addresses and domain state" },
    { id: "subscription" as const, label: "Subscription", detail: "The plan and billing state for this website" },
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
    {!business ? <StEmpty>Choose your business workspace to manage business information, people, work, and website relationships.</StEmpty> : <StSplit balance="aside" aside={<>
      <StSection title="Managed websites">
        {sites.map(site => <StSection key={site.id} title={site.title}><StRows>{settingLinks(site).map(({ id, label, detail, href }) => <StRow key={id} title={label} detail={detail} href={href} end="Open" />)}{!settingLinks(site).length ? <StRow title="Open website controls" detail="Settings links are not available from this workspace entry." href={site.href} end="Open" /> : null}</StRows></StSection>)}
        {unassignedSites.length ? <WebsiteAssignmentHandoff businessName={workspace?.name || "this business"} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : assignmentState} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} /> : !sites.length && siteAssignmentState === "loading" ? <StNotice>Checking linked websites…</StNotice> : !sites.length && siteAssignmentState === "unavailable" ? <StNotice>Linked website access is unavailable right now. No business setting was changed.</StNotice> : !sites.length ? <StEmpty>No managed website is linked or assigned to this business. Business information, people, work, and usage remain available here without one.</StEmpty> : null}
      </StSection>
      <StSection id="workspace-usage" title="Usage and limits"><StLabel>Recorded allowances are separate from website subscription billing.</StLabel><WorkspaceAllowanceSummary businessId={workspace?.id || ""} enabled={Boolean(business && workspace && !readOnly)} />{business && workspace?.role === "owner" && !readOnly ? <WorkspacePayerTransition workspaceId={workspace.id} canPropose /> : null}</StSection>
      <StSection title="Personal account"><StRows><StRow title="Your email, sign-in and access belong to you" detail="Your identity stays the same across businesses." href={accountHref} end="Open personal account" /></StRows></StSection>
    </>}>
      <StSurface label="Business information"><StLabel>Business information</StLabel><h2 className="mt-4 text-xl font-medium">{workspace?.name || "Current business"}</h2><p className="mt-3 text-sm">{readOnly ? "Read-only access" : workspace?.role === "owner" ? "You are the owner" : workspace?.role === "admin" ? "Administrator" : "Business member"}</p><StNotice>Business details hold shared facts such as hours and services. Each System declares which facts it reads; connected sites and independently edited content need their own update.</StNotice><StTextButton href={`/workspace/business-details?${new URLSearchParams({ workspaceId: workspace?.id ?? "" })}`}>Open the business record</StTextButton></StSurface>
      <StSection title={PLACE_LABELS.access}><StRows><StRow title="Who can see and change this business" detail={readOnly ? "The business owner controls changes to People & access." : "Membership and permissions belong to this business."} href={href("access")} end="Open" /></StRows></StSection>
      <StSection title="Systems and files"><StEmpty>Internal tools, documents, onboarding cases, requests, and other saved results stay with this business. A managed website is not required.</StEmpty></StSection>
      <StSection title="Plan and ownership"><StRows>{!readOnly && businessBillingReleased ? <StRow title="Plan and billing" href={`/workspace/billing?workspaceId=${encodeURIComponent(workspace?.id ?? "")}`} end="Open" /> : <StRow title="Plan and billing" detail="Price shown before you pay. Plan choices are not open here yet." />}<StRow title={exportSchema3 ? "Export workspace archive" : "Export available workspace snapshot"} href={`/workspace/export?workspaceId=${encodeURIComponent(workspace?.id ?? "")}`} end="Open" />{!readOnly && workspace?.role === "owner" ? <StRow title="Leaving Strelva" href={`/workspace/exit?workspaceId=${encodeURIComponent(workspace?.id ?? "")}`} end="Review" /> : null}</StRows></StSection>
    </StSplit>}
    {assistantConnectionsReleased && business && workspace ? <StSection title="Connected assistants"><StRows><StRow title="Read business facts and prepare website changes" detail="The business owner controls access." href={`/connect?workspaceId=${encodeURIComponent(workspace.id)}`} end="Manage assistant connections" /></StRows></StSection> : null}
    {workspace && (workspace.kind === "customer" || workspace.kind === "agency") ? <StSection title="Units"><StRows><StRow title="Businesses grouped under this organization" detail="Your membership controls what you can change." href={`/workspace/units?${new URLSearchParams({ workspaceId: workspace.id })}`} end="Open units" /></StRows></StSection> : null}
    {needsYouReleased && business && workspace && !readOnly ? <DecisionPolicySettings workspaceId={workspace.id} /> : null}
  </StPage>;
}
