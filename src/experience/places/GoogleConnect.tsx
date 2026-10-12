import { StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "@/experience/publishing/publishing.module.css";
import { AgencyConnectLinkButton } from "./AgencyConnectLink";

/**
 * Connect Google for a business that has no listing connected yet, and the
 * found facts read from a connected one. Neutral by design (ADR 0015): the
 * owner connects with their own Google account; an agency holding the Google
 * area can copy a link for the owner. Nothing here routes a business to any
 * agency, Strelva Agency included.
 */

export type GoogleConnectViewer = "owner" | "agency" | "member";
export interface GoogleConnectChoice { accountId: string; locationId: string; title: string; address?: string }
export interface GoogleFoundFactView { id: string; key: "hours" | "phone" | "website" | "description" | "categories"; value: unknown; foundAt: string }
type Action = (form: FormData) => Promise<void>;
export interface GoogleConnectProps {
  workspaceId: string;
  viewer: GoogleConnectViewer;
  /** Off: the panels say what's true without offering a connect action. */
  enabled: boolean;
  hasListing: boolean;
  params: { connect?: string; read?: string; fact?: string };
  choices?: { googleEmail: string; listings: GoogleConnectChoice[]; more: boolean } | null;
  foundFacts?: GoogleFoundFactView[];
  actions: { start: Action; choose: Action; reread: Action; decide: Action };
  agencyRequest?: typeof fetch;
}

const CONNECT_MESSAGES: Record<string, { text: string; tone?: "critical" }> = {
  connected: { text: "Google is connected. Nothing on your listing changed." },
  access_pending: { text: "Google hasn't opened its Business Profile access to Strelva yet, so listings can't be read right now. Nothing changed. Try again later." },
  no_listings: { text: "That Google account doesn't manage a Business Profile. Connect again and choose the account that runs your listing." },
  cancelled: { text: "Google sign-in was cancelled. Nothing changed." },
  expired: { text: "That Google sign-in expired. Start again.", tone: "critical" },
  unavailable: { text: "Connecting Google isn't available right now. Nothing changed.", tone: "critical" },
  failed: { text: "Google couldn't be connected. Nothing changed. Start again.", tone: "critical" },
};
const READ_MESSAGES: Record<string, { text: string; tone?: "critical" }> = {
  found: { text: "Strelva read your listing. What it found is below, waiting for you to confirm." },
  access_pending: { text: "Your Google connection is saved. Google hasn't opened listing details to Strelva yet, so nothing was read. Try again later." },
  refused: { text: "Google didn't let this account read the listing. Reconnect Google with the account that runs it.", tone: "critical" },
  unavailable: { text: "Your listing couldn't be read just now. Your Google connection is kept. Try again later.", tone: "critical" },
  not_connected: { text: "No Google listing is connected yet." },
};
const FACT_MESSAGES: Record<string, { text: string; tone?: "critical" }> = {
  confirmed: { text: "Added to your business record." },
  dismissed: { text: "Left out of your record." },
  needs_timezone: { text: "Hours need your time zone first. Add your hours and time zone in Business details, then add these.", tone: "critical" },
  no_record_fact: { text: "Your business record has no place for this yet. It stays here for reference." },
  failed: { text: "That couldn't be saved. Nothing changed. Reload and try again.", tone: "critical" },
};

const LABEL: Record<GoogleFoundFactView["key"], string> = { hours: "Hours", phone: "Phone", website: "Website", description: "Description", categories: "Categories" };
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function foundFactText(fact: Pick<GoogleFoundFactView, "key" | "value">): string {
  if (fact.key === "hours") {
    const weekly = (fact.value as { weekly?: Array<{ day: number; opens: string; closes: string }> })?.weekly ?? [];
    return weekly.map(item => `${DAY[item.day] ?? "?"} ${item.opens}–${item.closes}`).join(" · ") || "Closed every day";
  }
  if (fact.key === "categories") return Array.isArray(fact.value) ? fact.value.join(", ") : "";
  return typeof fact.value === "string" ? fact.value : "";
}

function Notice({ message }: { message?: { text: string; tone?: "critical" } }) {
  return message ? <StNotice tone={message.tone}><p role="status" className={styles.copy}>{message.text}</p></StNotice> : null;
}

export function GoogleConnect({ workspaceId, viewer, enabled, hasListing, params, choices, foundFacts = [], actions, agencyRequest }: GoogleConnectProps) {
  const hidden = <input type="hidden" name="workspaceId" value={workspaceId} />;
  const owner = viewer === "owner" && enabled;
  return <div className={styles.stack}>
    <Notice message={params.connect ? CONNECT_MESSAGES[params.connect] : undefined} />
    <Notice message={params.read ? READ_MESSAGES[params.read] : undefined} />
    <Notice message={params.fact ? FACT_MESSAGES[params.fact] : undefined} />

    {!hasListing && owner && params.connect === "choose" && choices ? <StSection title="Choose your listing" meta={choices.googleEmail}>
      <p className={styles.copy}>These are the listings this Google account manages. Connect the one for this business. Google asks you to confirm once more.</p>
      <StRows label="Listings on this Google account">{choices.listings.map(listing => <StRow key={`${listing.accountId}/${listing.locationId}`} title={listing.title} detail={listing.address}
        end={<form action={actions.choose}>{hidden}<input type="hidden" name="accountId" value={listing.accountId} /><input type="hidden" name="locationId" value={listing.locationId} /><StPill variant="soft" type="submit">Connect this listing</StPill></form>} />)}</StRows>
      {choices.more ? <p className={styles.copy}>This account manages more listings than fit here. Only the first {choices.listings.length} are shown.</p> : null}
    </StSection> : null}

    {!hasListing ? owner ? <StSection title="Connect Google">
      <p className={styles.copy}>Sign in with the Google account that runs your Business Profile. Strelva reads your listing&apos;s hours, phone, website, description and categories for you to confirm. Nothing changes on Google until you approve it.</p>
      <form action={actions.start}>{hidden}<StPill type="submit">Connect Google</StPill></form>
    </StSection> : viewer === "agency" && enabled ? <StSection title="Google isn't connected yet">
      <p className={styles.copy}>The owner connects Google with their own account. Copy a link and send it to them yourself; Strelva doesn&apos;t send it.</p>
      <AgencyConnectLinkButton workspaceId={workspaceId} request={agencyRequest} />
    </StSection> : <StEmpty>No Google listing is connected here yet. The business owner connects it with their own Google account.</StEmpty> : null}

    {foundFacts.length ? <StSection title="Found on your Google listing" meta="Not in your record until you add it" action={owner ? <form action={actions.reread}>{hidden}<StTextButton type="submit">Read again</StTextButton></form> : undefined}>
      <StRows label="Found on Google">{foundFacts.map(fact => <StRow key={fact.id} title={LABEL[fact.key]} detail={<>{foundFactText(fact)}<br /><StMono>From Google · {fact.foundAt.slice(0, 10)}</StMono></>} align="start"
        end={owner ? fact.key === "categories" ? <StState kind="draft">For reference</StState> : <form action={actions.decide} className={styles.actions}>{hidden}<input type="hidden" name="factId" value={fact.id} /><input type="hidden" name="commandId" value={crypto.randomUUID()} />
          <StPill variant="soft" type="submit" name="decision" value="confirm">Add to your record</StPill><StTextButton type="submit" name="decision" value="dismiss">Not right</StTextButton></form>
          : <StState kind="draft">Waiting for the owner</StState>} />)}</StRows>
    </StSection> : hasListing && owner ? <form action={actions.reread} className={styles.actions}>{hidden}<StTextButton type="submit">Read details from Google</StTextButton></form> : null}
  </div>;
}
