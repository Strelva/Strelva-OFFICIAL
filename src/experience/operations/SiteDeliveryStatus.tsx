/**
 * A website request's status, opened from the email link with no account
 * (XA; lane results, October 16). One sentence says where it is and who has
 * it, then the one change that mattered (the last move, with whoever made it
 * and when) and what comes next. No order-tracker steps: the person who asked
 * needs where it is now, not a checklist of six stages. Every agency's
 * requests, Strelva Agency's included, use this page with the agency's own
 * name (passed in from a live read) and "Runs on Strelva". When the name
 * can't be read the frame stays neutral: the business's name, no agency
 * named.
 */
import { XaButtonLink, XaHeadline, XaNote, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaOutside } from "@/components/ui/strelva/Xa";
import { XaChangeLine, XaLead } from "@/experience/places/XaPlace";
import type { DeliveryStatus } from "@/platform/infra/delivery-contracts";

const day = (iso: string, year = false) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(date);
};

/** Where it is now, in one sentence that names who has it. `draft` says whether this page can open the draft. */
export function deliveryNow(status: DeliveryStatus, who: string, businessName: string, draft = false): string {
  switch (status) {
    case "received": return `${who} has your request and reads it next.`;
    case "reviewing": return `${who} is checking what ${businessName}'s site needs to do.`;
    case "drafting": return `${who} is building the draft now.`;
    case "owner_review": return draft ? "The draft is ready for you to look at." : `The draft is ready. ${who} is sending it to you by email.`;
    case "launch_ready": return `${who} is getting your address ready for the switch.`;
    case "launched": return "It's live.";
    case "paused": return "The work is on hold.";
  }
}

/** The last move, with whoever made it. `on` is the day it happened, when known; never invented. */
export function deliveryLastMove(status: DeliveryStatus, who: string, on: string | null): string {
  const when = on ? ` on ${on}` : "";
  switch (status) {
    case "received": return `You sent the request${when}.`;
    case "reviewing": return `${who} started reading it${when}.`;
    case "drafting": return `${who} started the draft${when}.`;
    case "owner_review": return `${who} finished the draft${when}. Nothing is published before you say yes.`;
    case "launch_ready": return `The draft was approved, and ${who} started the handover${when}.`;
    case "launched": return `${who} made the site live${when}.`;
    // The request record keeps no reason for a pause, so the page says so rather than guess one.
    case "paused": return `${who} paused it${when}. No reason was recorded here.`;
  }
}

/** What happens next, in one quiet sentence. Null once it is live or while it is paused. */
export function deliveryNext(status: DeliveryStatus): string | null {
  switch (status) {
    case "received": case "reviewing": return "Next, the draft gets built. You see it before anything is published.";
    case "drafting": return "Next, you see the draft. Nothing is published before you say yes.";
    case "owner_review": return null;
    case "launch_ready": return "Next, your address points to the new site.";
    case "launched": case "paused": return null;
  }
}

/** Pebble's one job on this page, which changes with where the request is. */
export function deliveryPebble(status: DeliveryStatus, who: string, draft: boolean): string {
  switch (status) {
    case "received": return "Nothing is needed from you yet, and you don't need an account to follow along.";
    case "reviewing": return `If ${who} needs anything about your business, they ask by email.`;
    case "drafting": return "The draft stays private until you say yes.";
    case "owner_review": return draft ? `Look it over, then reply to ${who} with anything you'd change.` : `Reply to ${who}'s email with anything you'd change.`;
    case "launch_ready": return `If the switch needs anything from you, ${who} asks by email first.`;
    case "launched": return `For the next change, write to ${who}.`;
    case "paused": return `Ask ${who} why it paused and what would start it again.`;
  }
}

/**
 * The day of the last move, or null when the record can't say. A legacy record
 * with no status time reads back with the request's own submitted time (the
 * fallback in access-request-delivery), which is not a move, so it is left out.
 */
export function deliveryMovedOn(status: DeliveryStatus, submittedAt: string, updatedAt: string | null | undefined): string | null {
  if (status === "received") return day(submittedAt);
  if (!updatedAt || updatedAt === submittedAt) return null;
  return day(updatedAt);
}

export function SiteDeliveryStatus({ businessName, status, submittedAt, updatedAt, maskedEmail, agencyName, agencyEmail, draftUrl, mode }: {
  businessName: string;
  status: DeliveryStatus;
  submittedAt: string;
  /** When the status last changed, from the request's own record. */
  updatedAt?: string | null;
  maskedEmail: string;
  /** The serving agency's current display name, or null when it can't be confirmed. */
  agencyName: string | null;
  /** The agency's reply-to address from its live brand, when it set one. */
  agencyEmail?: string | null;
  /** The draft's link from the request record, when the agency added one. */
  draftUrl?: string | null;
  mode?: "light" | "dark";
}) {
  const submitted = day(submittedAt, true) ?? "";
  const who = agencyName ?? "Your agency";
  const draft = status === "owner_review" && Boolean(draftUrl);
  const next = deliveryNext(status);
  const write = agencyEmail ? <XaTextLink href={`mailto:${agencyEmail}?subject=${encodeURIComponent(`${businessName} website request`)}`}>Write to {who}</XaTextLink> : null;
  return <XaOutside from={agencyName ?? businessName} credit={Boolean(agencyName)} meta="Website request" mode={mode} label={`${businessName} website request`}>
    <XaHeadline size="lg">{businessName}&apos;s website.</XaHeadline>
    <XaLead>{deliveryNow(status, who, businessName, draft)}</XaLead>
    {draft && draftUrl ? <div><XaButtonLink variant="primary" href={draftUrl}>See the draft</XaButtonLink></div> : null}
    <XaChangeLine label="The last change">{deliveryLastMove(status, who, deliveryMovedOn(status, submittedAt, updatedAt))}</XaChangeLine>
    {next ? <XaNote>{next}</XaNote> : null}
    <XaNote>Asked {submitted}. Updates go to {maskedEmail}.</XaNote>
    <XaSays links={status === "paused" || status === "owner_review" ? (write ? [write] : undefined) : undefined}>{deliveryPebble(status, who, draft)}{status === "paused" && !write ? " Reply to their last email." : ""}</XaSays>
  </XaOutside>;
}
