import { PLACE_LABELS } from "@/platform/presentation/place-labels";
import { StPage, StHead, StSection, StRows, StRow, StNotice, StEmpty, StMono, StTextButton } from "@/components/ui/strelva/Kit";
import { BusinessDetailsForm } from "./BusinessDetailsForm";
import { ListingsSyncPanel } from "@/experience/listings-sync/ListingsSyncPanel";
import { recordSource } from "./business-details-presentation";
import { RecordPublishingFields } from "@/experience/publishing/RecordPublishingFields";
import type { RecordGoogleSummary } from "@/products/publishing/client";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { EDITABLE_DETAILS, detailsWriteSource, type EditableDetail } from "@/platform/business-record/details";
import type { DetailsSaveOutcome } from "@/platform/business-record/details-save";
import type { LinkedSite } from "@/platform/owner-entry/linked-sites";
import { type PlaceState } from "./WorkspacePlace";

/**
 * Business details, in the business menu: the home of /dashboard/settings.
 * The business record's facts (editable by the owner), who gets Strelva's
 * email, the people on the record, and where the rest of the old Settings
 * went. Each old `#anchor` (business, ownership, plan, domains…) has a
 * section here so a redirected link still lands somewhere that says so.
 */

export interface BusinessDetailsData {
  record: BusinessRecord;
  googleApprovalCopy?: string | null;
  publishing?: boolean;
  operator: boolean;
  /** Listings in sync is on for this business. */
  listings?: boolean;
  sites: LinkedSite[];
  denied: LinkedSite[];
}

const OUTCOME: Record<DetailsSaveOutcome, { tone: "status" | "alert"; text: string }> = {
  saved: { tone: "status", text: "Saved to your business record. To change what your site or Google listing shows, ask Strelva from Home." },
  unchanged: { tone: "status", text: "Nothing changed." },
  conflict: { tone: "alert", text: "Someone changed these details while you were editing. Nothing was saved. Here is the latest; make your change again." },
  invalid: { tone: "alert", text: "That wasn't saved." },
  denied: { tone: "alert", text: "Only the owner can change these details. Nothing was saved." },
  failed: { tone: "alert", text: "We couldn't confirm whether the save completed. Reload the page and review the latest details before saving again." },
};

const INVALID_HINT: Partial<Record<EditableDetail, string>> = {
  phone: "Use a phone number with 7 to 15 digits.",
  email: "Use a full email address.",
  owner_recipient: "Use a full email address. Strelva needs one to send your reports and alerts.",
};

export function WorkspaceBusinessDetails({ workspaceId, state, result, googleResult, field, action, listingsSync = false }: {
  workspaceId: string;
  state: PlaceState<BusinessDetailsData>;
  result?: DetailsSaveOutcome | null;
  googleResult?: RecordGoogleSummary | null;
  field?: EditableDetail | null;
  /** The server action; absent in previews and tests. */
  action?: (formData: FormData) => Promise<void>;
  /** Show "Where your details appear". Off unless Listings in sync is on for this business. */
  listingsSync?: boolean;
}) {
  const data = state.kind === "ready" ? state.data : null;
  const workspaceHref = (view: string) => `/workspace?view=${view}&workspaceId=${encodeURIComponent(workspaceId)}`;
  const readOnly = !data || !detailsWriteSource(data.record.access, data.operator) || !action;
  const notice = result ? OUTCOME[result] : null;
  const services = data?.record.services.filter((service) => service.active) ?? [];
  const people = data?.record.people.filter((person) => person.active) ?? [];
  const remainingFacts = Object.entries(data?.record.facts ?? {}).filter(([key]) => !(EDITABLE_DETAILS as readonly string[]).includes(key));
  return <StPage>
    <StHead crumb={{ label: "Business details", href: workspaceHref("settings") }} title="The business record" meta="What Strelva knows about your business. Each fact keeps its source." />
    {state.kind === "permission" ? <StEmpty action={<StTextButton href="/workspace">Open your workspace</StTextButton>}>This belongs to another business. Ask its owner to invite you.</StEmpty> : state.kind === "error" ? <StNotice tone="critical">Business details couldn’t load. {result === "failed" ? OUTCOME.failed.text : "Nothing changed. Reload the page to try again."}</StNotice> : null}
    {notice ? <StNotice tone={notice.tone === "alert" ? "critical" : undefined}>{notice.text}{result === "invalid" && field && INVALID_HINT[field] ? ` ${INVALID_HINT[field]}` : ""}</StNotice> : null}
    {data?.denied.length ? <StNotice>Your account can’t open {data.denied.map(site => site.siteName).join(", ")} yet. Ask the owner to finish adding you.</StNotice> : null}
    {data ? <>
      <StSection id="business" title="About the business"><BusinessDetailsForm key={data.record.revision} record={data.record} workspaceId={workspaceId} readOnly={readOnly} approvalCopy={data.googleApprovalCopy} action={action} /></StSection>
      {listingsSync ? <ListingsSyncPanel workspaceId={workspaceId} viewerIsOwner={data.record.access === "owner"} businessName={String((data.record.facts.display_name?.value as string | undefined) ?? "this business")} /> : null}
      <span id="notifications" />
      {remainingFacts.length ? <StSection title="Other recorded facts"><StRows>{remainingFacts.map(([key, fact]) => fact ? <StRow key={key} title={key.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase())} value={<StMono tone="text">{typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)}</StMono>} detail={`${recordSource(fact.source)} · ${fact.verified ? "Confirmed" : "Not confirmed"}`} end="Usage not recorded" /> : null)}</StRows></StSection> : null}
      {data.publishing ? <StSection id="publishing-facts" title="Hours and website"><RecordPublishingFields record={data.record} approvalCopy={data.googleApprovalCopy} readOnly={readOnly || data.record.access !== "owner"} /></StSection> : null}
      {data.publishing && googleResult ? <StNotice>{{ needs_approval: "Record saved. Google changes are waiting for your approval.", confirmed: "Record saved. Google changes read back successfully.", unconfirmed: "Record saved. Google accepted the changes; confirmation is pending.", failed: "Record saved. At least one Google change did not land; each result is kept separately.", unavailable: "Record saved. Google listings could not be read; no Google update is confirmed." }[googleResult]} <StTextButton href={`/workspace/google?workspaceId=${encodeURIComponent(workspaceId)}`}>Review each Google change and receipt</StTextButton></StNotice> : null}
      <StSection id="services" title="Services and prices"><StRows>{services.map(service => <StRow key={service.id} title={service.name} value={service.priceText || "Price not recorded"} detail={`${recordSource(service.source)} · ${service.verified ? "Confirmed" : "Not confirmed"}`} />)}</StRows>{!services.length ? <StEmpty>No services have been recorded yet.</StEmpty> : null}</StSection>
      <StSection id="people" title={PLACE_LABELS.access}><StRows>{people.map(person => <StRow key={person.id} title={person.name} detail={person.roleTitle} />)}<StRow title="Who can open this business and what they can do" href={workspaceHref("access")} end="Open People & access" /></StRows></StSection>
      <StSection id="account" title="Your account"><StRows><StRow title="The email you sign in with" detail="It stays the same across every business you can open." href="/workspace/account?continue=public" end="Open your account" /></StRows></StSection>
      <StSection id="plan" title="Plan, export and leaving"><span id="ownership" /><StRows><StRow title="What you pay and what you own" detail="Export your business data or review how to leave." href={workspaceHref("settings")} end="Open plan and ownership" /></StRows></StSection>
      <StSection id="website" title="Your website"><span id="domains" /><span id="branding" /><span id="site-config" /><span id="dependencies" /><span id="shortcuts" /><StRows>{data.sites.map(site => <StRow key={site.tenantId} title={site.siteName} />)}<StRow title="Results and site health" detail="Open the website System for its connections and publishing access." href={`/workspace/results?workspaceId=${encodeURIComponent(workspaceId)}`} end="Open" /></StRows>{!data.sites.length ? <StEmpty>No website is connected to this business yet.</StEmpty> : null}</StSection>
    </> : null}
  </StPage>;
}
