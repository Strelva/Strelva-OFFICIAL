/**
 * A website request's status, opened from the email link with no account
 * (XA, lane xs-apps-care). One sentence says where it is; the steps below show
 * what is done, what is happening and what comes next, the way an order page
 * does. Every agency's requests, Strelva Agency's included, use this page with
 * the agency's own name (passed in from a live read) and "Runs on Strelva".
 * When the name can't be read the frame stays neutral: the business's name,
 * no agency named.
 */
import { XaHeadline, XaNote, XaSays } from "@/components/ui/strelva/Xa";
import { XaOutside, XaSteps } from "@/components/ui/strelva/Xa";
import { deliverySteps, getDeliveryStepIndex, type DeliveryStatus } from "@/platform/infra/delivery-contracts";

/** What each step means to the person who asked, in plain words. */
const STEP_DETAIL: Record<(typeof deliverySteps)[number]["id"], string> = {
  received: "Your business, current site and what you asked for are in.",
  reviewing: "Someone reads your business and what the site needs to do for it.",
  drafting: "The site is built around how people call, book and trust you.",
  owner_review: "You see the draft before anything is published.",
  launch_ready: "Your address and the handover are prepared.",
  launched: "Your site is live.",
};

export function SiteDeliveryStatus({ businessName, status, submittedAt, maskedEmail, agencyName, mode }: {
  businessName: string;
  status: DeliveryStatus;
  submittedAt: string;
  maskedEmail: string;
  /** The serving agency's current display name, or null when it can't be confirmed. */
  agencyName: string | null;
  mode?: "light" | "dark";
}) {
  const active = getDeliveryStepIndex(status);
  const paused = status === "paused";
  const current = deliverySteps[active]!;
  const submitted = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(submittedAt));
  const who = agencyName ?? "Your agency";
  return <XaOutside from={agencyName ?? businessName} credit={Boolean(agencyName)} meta="Website request" mode={mode} label={`${businessName} website request`}>
    <XaHeadline size="lg" quiet={paused ? `Paused. ${who} will be in touch before it goes on.` : status === "launched" ? "It's live." : `${current.label}. Step ${active + 1} of ${deliverySteps.length}.`}>{businessName}&apos;s website.</XaHeadline>
    <XaSteps label="Where your request is" steps={deliverySteps.map((step, index) => {
      const state = paused ? (index < active ? "done" : "pending") : index < active || status === "launched" ? "done" : index === active ? "active" : "pending";
      return { key: step.id, title: step.label, state, detail: state !== "done" ? STEP_DETAIL[step.id] : undefined };
    })} />
    <XaNote>Asked {submitted}. Updates go to {maskedEmail}.</XaNote>
    <XaSays>You don&apos;t need an account yet. When there is something for you to look at, the next email brings you back here.</XaSays>
  </XaOutside>;
}
