import { XaButton, XaButtonLink, XaEmpty, XaSays, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "@/experience/connections/xa-connections.module.css";
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
  /** A validated same-origin path to go back to after connecting (for example the claim review). */
  returnTo?: string | null;
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

/** Strelva speaks one plain sentence about what just happened; bad news keeps Pebble in frame. */
function Notice({ message }: { message?: { text: string; tone?: "critical" } }) {
  return message ? <div role="status"><XaSays>{message.text}</XaSays></div> : null;
}

export function GoogleConnect({ workspaceId, viewer, enabled, hasListing, params, choices, foundFacts = [], actions, agencyRequest, returnTo }: GoogleConnectProps) {
  const hidden = <input type="hidden" name="workspaceId" value={workspaceId} />;
  const back = returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null;
  const owner = viewer === "owner" && enabled;
  const choosing = !hasListing && owner && params.connect === "choose" && Boolean(choices);
  return <div className={styles.main}>
    <Notice message={params.connect ? CONNECT_MESSAGES[params.connect] : undefined} />
    <Notice message={params.read ? READ_MESSAGES[params.read] : undefined} />
    <Notice message={params.fact ? FACT_MESSAGES[params.fact] : undefined} />
    {hasListing && returnTo ? <div className={styles.actions}><XaButtonLink href={returnTo} variant="secondary">Continue where you were</XaButtonLink></div> : null}

    {choosing && choices ? <section className={styles.section} aria-labelledby="google-choose">
      <div className={styles.sectionHead}><h2 id="google-choose" className={styles.sectionTitle}>Choose your listing</h2><span className={styles.sectionMeta}>{choices.googleEmail}</span></div>
      <p className={styles.quiet}>These are the listings this Google account manages. Connect the one for this business. Google asks you to confirm once more.</p>
      <ul className={styles.group} aria-label="Listings on this Google account">{choices.listings.map(listing => <li key={`${listing.accountId}/${listing.locationId}`} className={styles.groupRow}>
        <span className={styles.groupText}><span className={styles.groupTitle}>{listing.title}</span>{listing.address ? <span className={styles.groupDetail}>{listing.address}</span> : null}</span>
        <form action={actions.choose} className={styles.groupEnd}>{hidden}<input type="hidden" name="accountId" value={listing.accountId} /><input type="hidden" name="locationId" value={listing.locationId} /><XaButton size="sm" type="submit">Connect this listing</XaButton></form>
      </li>)}</ul>
      {choices.more ? <p className={styles.small}>This account manages more listings than fit here. Only the first {choices.listings.length} are shown.</p> : null}
      <form action={actions.start}>{hidden}{back}<button type="submit" className={styles.textButton}>Use a different Google account</button></form>
    </section> : null}

    {!hasListing && !enabled ? <XaEmpty pose="alone" size="sm" title="Connect Google · Coming soon" job="Your listing keeps working on Google meanwhile"
      action={<XaButtonLink href="https://business.google.com/" variant="secondary" target="_blank" rel="noopener noreferrer">Open Google Business Profile</XaButtonLink>}
      secondary={viewer === "owner" ? <XaTextLink href={`/workspace/business-details?${new URLSearchParams({ workspaceId })}`}>Update business details in Strelva</XaTextLink> : undefined}>
      Connecting your Google Business Profile in Strelva is not open for this business yet. You can manage your listing directly on Google today.
    </XaEmpty> : !hasListing && !choosing ? owner ? <XaEmpty pose="adds" title="Bring in your Google listing." job="Pebble reads hours, phone, website, description and categories once you sign in"
      action={<form action={actions.start}>{hidden}{back}{/* One click, never a GET: link scanners and prefetch can't start a Google sign-in. */}<XaButton variant="primary" size="lg" type="submit">Connect Google</XaButton></form>}
      secondary={returnTo ? <XaTextLink href={returnTo}>Skip for now</XaTextLink> : undefined}>
      Sign in with the Google account that runs your Business Profile. Strelva reads your listing for you to confirm. Nothing changes on Google until you approve it.
    </XaEmpty> : viewer === "agency" && enabled ? <section className={styles.section} aria-labelledby="google-agency">
      <h2 id="google-agency" className={styles.sectionTitle}>Google isn&apos;t connected yet</h2>
      <p className={styles.quiet}>Check how Google is available for this business. Your agency can connect its own account when it holds access, or copy a link for the owner. Strelva doesn&apos;t send it.</p>
      <AgencyConnectLinkButton workspaceId={workspaceId} request={agencyRequest} />
    </section> : <XaSays>No Google listing is connected here yet. The business owner connects it with their own Google account.</XaSays> : null}

    {foundFacts.length ? <section className={styles.section} aria-labelledby="google-found">
      <div className={styles.sectionHead}><h2 id="google-found" className={styles.sectionTitle}>Found on your Google listing</h2>{owner ? <form action={actions.reread}>{hidden}<button type="submit" className={styles.textButton}>Read again</button></form> : null}</div>
      <p className={styles.quiet}>Not in your record until you add it.</p>
      <ul className={styles.group} aria-label="Found on Google">{foundFacts.map(fact => <li key={fact.id} className={styles.groupRow}>
        <span className={styles.groupText}><span className={styles.groupDetail}>{LABEL[fact.key]}</span><span className={styles.groupTitle}>{foundFactText(fact)}</span><span className={styles.groupDetail}>From Google · <time dateTime={fact.foundAt}>{new Date(fact.foundAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</time></span></span>
        <span className={styles.groupEnd}>{owner ? fact.key === "categories" ? <XaStatus kind="draft" size="sm">For reference</XaStatus>
          : <form action={actions.decide} className={styles.actions}>{hidden}<input type="hidden" name="factId" value={fact.id} /><input type="hidden" name="commandId" value={crypto.randomUUID()} />
            <XaButton size="sm" type="submit" name="decision" value="confirm">Add to your record</XaButton><button type="submit" className={styles.textButton} name="decision" value="dismiss">Not right</button></form>
          : <XaStatus kind="waits" size="sm">Waiting for the owner</XaStatus>}</span>
      </li>)}</ul>
    </section> : hasListing && owner ? <section className={styles.section} aria-labelledby="google-read">
      <div className={styles.sectionHead}><h2 id="google-read" className={styles.sectionTitle}>Your listing and your record</h2><form action={actions.reread}>{hidden}<button type="submit" className={styles.textButton}>Read details from Google</button></form></div>
      <p className={styles.quiet}>Strelva can read the hours, phone, website and description on Google, so you can add what&apos;s right to your business record.</p>
    </section> : null}
  </div>;
}
