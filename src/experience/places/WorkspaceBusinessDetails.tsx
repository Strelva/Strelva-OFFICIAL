import { PLACE_LABELS } from "@/platform/presentation/place-labels";
import { XaButtonLink, XaEmpty, XaHeadline, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { BusinessDetailsForm, type RecordReaders } from "./BusinessDetailsForm";
import { ListingsSyncPanel } from "@/experience/listings-sync/ListingsSyncPanel";
import { RecordPublishingFields } from "@/experience/publishing/RecordPublishingFields";
import { RecordTrouble } from "@/experience/record/RecordStates";
import styles from "@/experience/record/record.module.css";
import type { RecordGoogleSummary } from "@/products/publishing/client";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { detailText, detailsWriteSource, EDITABLE_DETAILS, type EditableDetail } from "@/platform/business-record/details";
import type { DetailsSaveOutcome } from "@/platform/business-record/details-save";
import type { LinkedSite } from "@/platform/owner-entry/linked-sites";
import { type PlaceState } from "./WorkspacePlace";

/**
 * XA · R1 Business record (the home of /dashboard/settings). The record's
 * details as open rows, each edited in place; who said each one and when;
 * one sentence from Strelva about what saving does. Hours open XA · R2 on
 * the same route (`edit=hours`). Each old `#anchor` keeps an id here so a
 * redirected link still lands on this page.
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

const OUTCOME: Record<DetailsSaveOutcome, string> = {
  saved: "Saved to your business record.",
  unchanged: "Nothing changed.",
  conflict: "Someone changed these details while you were editing. Nothing was saved. Here is the latest; make your change again.",
  invalid: "That wasn't saved.",
  denied: "Only the owner can change these details. Nothing was saved.",
  failed: "I couldn't confirm whether the save completed. Reload the page and check the latest details before saving again.",
};

const INVALID_HINT: Partial<Record<EditableDetail, string>> = {
  phone: "Use a phone number with 7 to 15 digits.",
  email: "Use a full email address.",
  owner_recipient: "Use a full email address. Strelva needs one to send your reports and alerts.",
  insurance_accepted: "List up to 60 plans, one per line, each under 120 characters.",
};

/** After a save that reached Google. Undoing here would leave Google behind, so the way back is said instead. */
const GOOGLE_RESULT: Record<RecordGoogleSummary, string> = {
  needs_approval: "Saved. The Google change waits for your yes; change it back here to undo.",
  confirmed: "Saved. Google shows the change; I read it back. Change it back here to undo.",
  unconfirmed: "Saved. Google accepted the change; I'm still waiting to read it back.",
  failed: "Saved here, but at least one Google change did not land.",
  unavailable: "Saved here. I couldn't read your Google listing, so no Google change is confirmed.",
};

const UNDO_RESULT = {
  done: "Undone. That detail is back to what it was.",
  conflict: "Someone changed the record since, so I didn't undo it. Change the detail here instead.",
  failed: "I couldn't undo that. The saved detail is still there.",
} as const;

export function WorkspaceBusinessDetails({ workspaceId, state, result, googleResult, field, action, undoAction, undo, savedSequence, listingsSync = false, showInsurance = false, edit, readers, agencyName, now, hours }: {
  workspaceId: string;
  state: PlaceState<BusinessDetailsData>;
  result?: DetailsSaveOutcome | null;
  googleResult?: RecordGoogleSummary | null;
  field?: EditableDetail | null;
  /** The server action; absent in previews and tests. */
  action?: (formData: FormData) => Promise<void>;
  /** Undo the save just made (a new revision restoring the prior values). */
  undoAction?: (formData: FormData) => Promise<void>;
  /** What the last Undo did. */
  undo?: keyof typeof UNDO_RESULT | null;
  /** The record sequence of the save just made, when it changed nothing outside Strelva. */
  savedSequence?: number | null;
  /** Show "Where your details appear". Off unless Listings in sync is on for this business. */
  listingsSync?: boolean;
  /** Dental intake may be on for this deployment; shows the insurance row. */
  showInsurance?: boolean;
  /** `hours` opens XA · R2 for this record. */
  edit?: "hours" | null;
  /** Which Systems read each detail, from the System graph. Without it the column is not drawn. */
  readers?: RecordReaders;
  agencyName?: string | null;
  now?: Date;
  /** Hours screen options: previews pass a stub request; links may open a mode or date. */
  hours?: { request?: typeof fetch; initialMode?: "week" | "day"; initialDate?: string; now?: Date };
}) {
  const data = state.kind === "ready" ? state.data : null;
  const query = (extra: Record<string, string> = {}) => `?${new URLSearchParams({ workspaceId, ...extra })}`;
  const workspaceHref = (view: string) => `/workspace${query({ view })}`;
  const readOnly = !data || !detailsWriteSource(data.record.access, data.operator) || !action;

  if (state.kind === "permission") return <div className={styles.screen}>
    <XaEmpty pose="waving" title="This belongs to another business." job="Pebble keeps each business's details apart" action={<XaButtonLink href="/workspace">Go to Home</XaButtonLink>}>Ask its owner to invite you.</XaEmpty>
  </div>;
  if (state.kind === "error" || !data) return <RecordTrouble title="Your business record didn't load." quiet="Your Systems keep running on the last saved details." retry={{ label: "Try again", href: `/workspace/business-details${query()}` }}>
    {result === "failed" ? OUTCOME.failed : null}
  </RecordTrouble>;

  const businessName = String((data.record.facts.display_name?.value as string | undefined) ?? "this business");
  const ownerOnHours = data.publishing && !readOnly && data.record.access === "owner";
  const hoursHref = ownerOnHours ? `/workspace/business-details${query({ edit: "hours" })}` : undefined;

  if (edit === "hours" && data.publishing) return <RecordPublishingFields record={data.record} approvalCopy={data.googleApprovalCopy} readOnly={!ownerOnHours} backHref={`/workspace/business-details${query()}`} listingConnected={Boolean(data.googleApprovalCopy) || listingsSync} readers={readers?.hours} {...hours} />;

  const recorded = EDITABLE_DETAILS.filter(key => key !== "display_name" && detailText(data.record, key)).length + (data.record.facts.hours ? 1 : 0) + (data.record.facts.address ? 1 : 0) + (data.record.services.some(service => service.active) ? 1 : 0);
  const empty = recorded === 0;
  const hasReaders = Boolean(readers && Object.keys(readers).length);
  const listingReads = hasReaders && Object.values(readers ?? {}).some(list => list?.some(item => item.kind === "listing"));

  const outcome = result ? `${OUTCOME[result]}${result === "invalid" && field && INVALID_HINT[field] ? ` ${INVALID_HINT[field]}` : ""}` : null;
  const google = data.publishing && googleResult ? GOOGLE_RESULT[googleResult] : null;
  const canUndo = result === "saved" && !google && Boolean(savedSequence) && Boolean(undoAction) && !readOnly;
  const said = undo ? UNDO_RESULT[undo] : google && result === "saved" ? google : outcome ?? google;
  const saidLinks = [
    ...(google ? [<XaTextLink key="google" href={`/workspace/google${query()}`}>See it</XaTextLink>] : []),
    ...(canUndo ? [<button key="undo" type="submit" form="record-undo" className={styles.inlineLink}>Undo</button>] : []),
  ];

  // Strelva's one line under the table: what saving does, said only as far as it is known.
  const pebble = readOnly ? "Only the owner changes these details. I keep who said each one and when."
    : empty ? null
    : listingReads ? "Change a detail here and I update every place that reads it, then read Google's copy back."
    : hasReaders ? "Change a detail here and every System beside it reads the new one."
    : data.publishing && data.googleApprovalCopy ? "Change a detail here and I keep who said it and when. Saving also puts it on your Google listing."
    : data.publishing ? "Change a detail here and I keep who said it and when. Google gets a draft that waits for your yes."
    : "Change a detail here and I keep who said it and when.";

  return <div className={styles.screen} id="business">
    <XaHeadline quiet={hasReaders ? "The Systems beside each detail read it from here." : "Who said each detail, and when, stays beside it."}>Said once, here.</XaHeadline>
    {said ? <div role="status"><XaSays links={saidLinks.length ? saidLinks : undefined}>{said}</XaSays></div> : null}
    {canUndo ? <form id="record-undo" action={undoAction} hidden><input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="sequence" value={String(savedSequence)} /></form> : null}
    {data.denied.length ? <p className={styles.quietNote}>Your account can’t open {data.denied.map(site => site.siteName).join(", ")} yet. Ask the owner to finish adding you.</p> : null}
    <span id="notifications" />
    {empty && !readOnly ? <XaSays links={hoursHref ? [<XaTextLink key="hours" href={hoursHref}>Add your hours</XaTextLink>] : undefined}>{`Nothing about ${businessName} is recorded yet. Start with your hours; they are what people look for most.`}</XaSays> : null}
    <BusinessDetailsForm key={data.record.revision} record={data.record} workspaceId={workspaceId} readOnly={readOnly} approvalCopy={data.googleApprovalCopy} action={action} showInsurance={showInsurance}
      readers={readers} hoursHref={hoursHref} agencyName={agencyName} now={now}
      invalid={result === "invalid" && field ? { field, message: INVALID_HINT[field] ?? "That value isn't allowed." } : null} />
    {pebble ? <XaSays>{pebble}</XaSays> : null}
    {listingsSync ? <ListingsSyncPanel workspaceId={workspaceId} viewerIsOwner={data.record.access === "owner"} businessName={businessName} /> : null}
    <nav className={styles.more} id="people" aria-label={`More about ${businessName}`}>
      <span id="account" /><span id="plan" /><span id="ownership" /><span id="website" /><span id="domains" /><span id="branding" /><span id="site-config" /><span id="dependencies" /><span id="shortcuts" />
      <p className={styles.quietNote}>
        <XaTextLink href={workspaceHref("access")}>{PLACE_LABELS.access}</XaTextLink>{" · "}
        <XaTextLink href={`/workspace/export${query()}`}>Take it with you</XaTextLink>{" · "}
        <XaTextLink href="/workspace/account?continue=public">The email you sign in with</XaTextLink>
        {data.sites.length ? <>{" · "}<XaTextLink href={`/workspace/results${query()}`}>{data.sites.length === 1 ? `${data.sites[0]!.siteName} results` : "Website results"}</XaTextLink></> : null}
      </p>
    </nav>
  </div>;
}
