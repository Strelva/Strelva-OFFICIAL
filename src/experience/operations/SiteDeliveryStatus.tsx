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
import { XaHeadline, XaNote, XaSays } from "@/components/ui/strelva/Xa";
import { XaOutside } from "@/components/ui/strelva/Xa";
import { XaChangeLine } from "@/experience/places/XaPlace";
import type { DeliveryStatus } from "@/platform/infra/delivery-contracts";

const day = (iso: string, year = false) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(date);
};

/** Where it is now, in one sentence that names who has it. */
export function deliveryNow(status: DeliveryStatus, who: string, businessName: string): string {
  switch (status) {
    case "received": return `${who} has your request and reads it next.`;
    case "reviewing": return `${who} is checking what ${businessName}'s site needs to do.`;
    case "drafting": return `${who} is building the draft now.`;
    case "owner_review": return "The draft is ready for you to look at.";
    case "launch_ready": return `${who} is getting your address ready for the switch.`;
    case "launched": return "It's live.";
    case "paused": return `Paused. ${who} will be in touch before it goes on.`;
  }
}

/** The last move, with whoever made it. `on` is the day it happened, when known. */
export function deliveryLastMove(status: DeliveryStatus, who: string, on: string | null): string {
  const when = on ? ` on ${on}` : "";
  switch (status) {
    case "received": return `You sent the request${when}.`;
    case "reviewing": return `${who} started reading it${when}.`;
    case "drafting": return `${who} started the draft${when}.`;
    case "owner_review": return `${who} finished the draft${when}. Nothing is published before you say yes.`;
    case "launch_ready": return `The draft was approved, and ${who} started the handover${when}.`;
    case "launched": return `${who} made the site live${when}.`;
    case "paused": return `${who} paused the work${when}.`;
  }
}

/** What happens next, in one quiet sentence. Null once it is live. */
export function deliveryNext(status: DeliveryStatus): string | null {
  switch (status) {
    case "received": case "reviewing": return "Next, the draft gets built. You see it before anything is published.";
    case "drafting": return "Next, you see the draft. Nothing is published before you say yes.";
    case "owner_review": return "The next email brings you to the draft.";
    case "launch_ready": return "Next, your address points to the new site.";
    case "launched": case "paused": return null;
  }
}

export function SiteDeliveryStatus({ businessName, status, submittedAt, updatedAt, maskedEmail, agencyName, mode }: {
  businessName: string;
  status: DeliveryStatus;
  submittedAt: string;
  /** When the status last changed, from the request's own record. */
  updatedAt?: string | null;
  maskedEmail: string;
  /** The serving agency's current display name, or null when it can't be confirmed. */
  agencyName: string | null;
  mode?: "light" | "dark";
}) {
  const submitted = day(submittedAt, true) ?? "";
  const who = agencyName ?? "Your agency";
  const movedOn = status === "received" ? day(submittedAt) : updatedAt ? day(updatedAt) : null;
  const next = deliveryNext(status);
  return <XaOutside from={agencyName ?? businessName} credit={Boolean(agencyName)} meta="Website request" mode={mode} label={`${businessName} website request`}>
    <XaHeadline size="lg" quiet={deliveryNow(status, who, businessName)}>{businessName}&apos;s website.</XaHeadline>
    <XaChangeLine label="The last change">{deliveryLastMove(status, who, movedOn)}</XaChangeLine>
    {next ? <XaNote>{next}</XaNote> : null}
    <XaNote>Asked {submitted}. Updates go to {maskedEmail}.</XaNote>
    <XaSays>You don&apos;t need an account yet. When there is something for you to look at, the next email brings you back here.</XaSays>
  </XaOutside>;
}
