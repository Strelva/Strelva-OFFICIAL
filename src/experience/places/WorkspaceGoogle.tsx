import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaButtonLink, XaField, XaSays, XaStatus, XaSystemTile, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { Clay } from "@/experience/connections/Clay";
import { googleChangeLines } from "@/experience/connections/owner-words";
import type { PublishingState } from "@/experience/publishing/PublishingPage";
import styles from "@/experience/connections/xa-connections.module.css";
import { GoogleDrafts } from "./GoogleDrafts";
import { ReviewRows } from "./WorkspaceReviews";
import type { SiteReviews } from "@/products/google-listing/server";
import type { readWorkspaceGoogle } from "@/products/google-listing/server";

/**
 * The Google listing place (XA · S1 composition): the listing's head and its
 * one waiting decision on the left, what Strelva may do on the right. The
 * frame stays the same when nothing is connected or the listing can't load,
 * so the connect action or the bad news sits where the listing will be.
 * Every write is the existing server action; approval is the one yes (XaYes)
 * inside GoogleDrafts.
 */
type Listings = Awaited<ReturnType<typeof readWorkspaceGoogle>>;
type Listing = Listings[number];
/** Missing from the current listing projection; supplied only by labeled preview fixtures. */
export interface GoogleListingPreview { category: string; rating: string; reviews: number; googleHours: string; recordHours: string; fixLabel: string; pendingReview: string }

function Context({ workspaceId, listing }: { workspaceId: string; listing: Listing }) {
  return <><input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="tenantId" value={listing.tenantId} /><input type="hidden" name="locationId" value={listing.locationId} /><input type="hidden" name="commandId" value={crypto.randomUUID()} /></>;
}

const RECEIPT_STATE: Record<string, { kind: "waits" | "down" | "draft"; text: string } | undefined> = {
  posted_unverified: { kind: "waits", text: "Google accepted it; not read back yet" },
  held_by_google: { kind: "waits", text: "Google is holding it for review" },
  failed: { kind: "down", text: "Google refused it" },
  undone: { kind: "draft", text: "Undone" },
};
function approvedBy(authority: unknown): string {
  const kind = (authority as { kind?: string } | null)?.kind;
  return kind === "owner_approval" ? "You approved it" : kind === "auto_reply_policy" ? "Your automatic reply setting sent it" : kind === "owner_undo" ? "You undid it" : kind === "operator_instruction" || kind === "operator_undo" ? "Strelva did it on your instruction" : "Sent before Strelva named who approved";
}

/** What Strelva may do on Google, and who decides. Platform rules, true before and after a listing connects. */
function NeverWithoutYou({ paused }: { paused?: boolean }) {
  return <>
    <p className={styles.groupLabel}>Never, without you</p>
    <ul className={styles.group} data-locked>
      <li className={styles.groupRow}><Lock className={styles.lock} size={14} aria-hidden="true" /><span className={styles.groupText}><span className={styles.groupTitle}>Change hours, info or posts</span></span><span className={styles.groupEnd}>Your yes</span></li>
      <li className={styles.groupRow}><Lock className={styles.lock} size={14} aria-hidden="true" /><span className={styles.groupText}><span className={styles.groupTitle}>Reply to reviews</span></span><span className={styles.groupEnd}>{paused ? "Paused" : "Your setting"}</span></li>
    </ul>
  </>;
}

export function WorkspaceGoogle({ workspaceId, state, result, action, reviewId, replyText, reviews, listingPreview, reviewRequest, connect }: { workspaceId: string; state: PublishingState<Listings>; result?: string; action: (form: FormData) => Promise<void>; reviewId?: string; replyText?: string; reviews?: PublishingState<SiteReviews[]>; listingPreview?: GoogleListingPreview; reviewRequest?: typeof fetch; connect?: ReactNode }) {
  const listings = state.kind === "ready" ? state.data : [];
  const said = result ? <p role="status" className={styles.result}>{result}</p> : null;

  if (state.kind === "loading") return <div className={styles.place} aria-busy="true">
    <div className={styles.main}><Head title="Google listing" meta={<span>Loading Google listing</span>} /><StSkeleton label="Loading Google listing" width="65%" /><StSkeleton width="90%" /></div>
    <aside className={styles.side} aria-label="Google listing details"><NeverWithoutYou /></aside>
  </div>;
  if (state.kind === "permission") return <div className={styles.place} data-single><div className={styles.main}>
    <Head title="Google listing" meta={<span>Another business</span>} />
    <div className={styles.object}>
      <div className={styles.objectText}><h2 className={styles.objectTitle}>This belongs to another business.</h2><p className={styles.quiet}>Your account isn&apos;t a member of it, so Strelva showed nothing from it. Ask its owner to invite you.</p>
        <div className={styles.objectActions}><XaButtonLink href="/workspace" variant="secondary">Open your workspace</XaButtonLink></div></div>
      <Clay pose="alone" width={200} decorative />
    </div>
  </div></div>;
  if (state.kind === "error") return <div className={styles.place}>
    <div className={styles.main}>
      <Head title="Google listing" meta={<XaStatus kind="down" size="sm">Couldn&apos;t load</XaStatus>} />
      <div className={styles.object} role="alert">
        <div className={styles.objectText}><p className={styles.objectLabel}>Google listing</p><h2 className={styles.objectTitle}>Your listing couldn&apos;t load.</h2>
          <p className={styles.quiet}>Nothing changed on Google. Your drafts and what changed are kept; Pebble is checking the connection.</p>
          <div className={styles.objectActions}><XaButtonLink href="" variant="secondary">Reload the page</XaButtonLink></div></div>
        <Clay pose="fixing" width={240} label="Pebble checking the Google connection" />
      </div>
    </div>
    <aside className={styles.side} aria-label="Google listing details"><NeverWithoutYou /></aside>
  </div>;

  if (!listings.length) return <div className={styles.place}>
    <div className={styles.main}>
      <Head title="Google listing" meta={<XaStatus kind="draft" size="sm">Not connected</XaStatus>} />
      {said}
      {connect ?? <XaSays>No Google listing is connected here yet. The business owner connects it with their own Google account.</XaSays>}
    </div>
    <aside className={styles.side} aria-label="Google listing details">
      <NeverWithoutYou />
      <XaSays>Once it&apos;s connected, every change waits for your yes, except replies your automatic reply setting covers.</XaSays>
    </aside>
  </div>;

  return <>{listings.map(listing => {
    const blocked = listing.control.paused || !listing.connected || listing.control.accessPending;
    const blockedReason = !listing.connected ? "Google is disconnected. Reconnect Google to continue; your drafts are kept." : listing.control.accessPending ? "Google hasn't approved access yet. Your draft is kept and nothing was sent." : listing.control.paused ? "This listing is paused. Resume it to put changes on Google." : undefined;
    const site = reviews?.kind === "ready" ? reviews.data.find(item => item.tenantId === listing.tenantId && listings.filter(other => other.tenantId === listing.tenantId).length === 1) : undefined;
    const status = !listing.connected ? <XaStatus kind="down" size="sm">Disconnected</XaStatus> : listing.control.accessPending ? <XaStatus kind="waits" size="sm">Waiting for Google</XaStatus> : listing.control.paused ? <XaStatus kind="draft" size="sm">Paused</XaStatus> : <XaStatus kind="live" size="sm">Live</XaStatus>;
    return <div key={`${listing.tenantId}:${listing.locationId}`} className={styles.place} aria-label={listing.name} role="region">
      <div className={styles.main}>
        <Head title={listing.name} meta={<>{status}<span>{listingPreview ? `${listingPreview.category} · ${listingPreview.rating} from ${listingPreview.reviews} reviews` : "On Google Search and Maps"}</span></>} />
        {said}
        {listing.drafts.length ? <GoogleDrafts drafts={listing.drafts} listingName={listing.name} canManage={listing.canManage} blockedReason={blocked ? blockedReason : undefined} action={action}
          context={{ workspaceId, tenantId: listing.tenantId, locationId: listing.locationId }} /> : null}
        {connect}

        {listing.canManage && reviewId ? <section className={styles.section} aria-label="Edit or withdraw your published reply">
          <h2 className={styles.sectionTitle}>Edit or withdraw your published reply</h2>
          <p className={styles.quiet}>Your yes replaces the reply on Google. Withdraw removes it. Strelva keeps the previous text so you can undo.</p>
          <form action={action} className={styles.section}><Context workspaceId={workspaceId} listing={listing} /><input type="hidden" name="reviewId" value={reviewId} />
            <XaTextArea label="Reply text" name="replyText" defaultValue={replyText} maxLength={4096} rows={4} />
            <div className={styles.actions}><XaButton type="submit" name="action" value="reply" disabled={blocked}>Put the reply on Google</XaButton><button type="submit" className={styles.danger} name="action" value="withdraw" disabled={blocked}>Withdraw reply</button></div>
          </form>
        </section> : null}

        <section className={styles.section} aria-labelledby={`google-reviews-${listing.locationId}`}>
          <div className={styles.sectionHead}><h2 id={`google-reviews-${listing.locationId}`} className={styles.sectionTitle}>Reviews</h2>{site ? null : <XaTextLink href={`/workspace/reviews?workspaceId=${encodeURIComponent(workspaceId)}`}>Open Reviews</XaTextLink>}</div>
          {site ? <ReviewRows workspaceId={workspaceId} site={site} publishing readOnly={!listing.canManage || blocked} request={reviewRequest} quiet={listing.drafts.length > 0} />
            : reviews?.kind === "error" ? <p className={styles.quiet}>Reviews couldn&apos;t load. Nothing changed on your listing.</p>
              : reviews?.kind === "permission" ? <p className={styles.quiet}>Your account can&apos;t read this listing&apos;s reviews.</p>
                : <p className={styles.quiet}>Reviews and their drafted replies live in Reviews.</p>}
        </section>

        {listing.canManage && !listing.control.paused ? <section className={styles.section} aria-labelledby={`google-prepare-${listing.locationId}`}>
          <h2 id={`google-prepare-${listing.locationId}`} className={styles.sectionTitle}>Prepare a change</h2>
          <p className={styles.quiet}>Strelva prepares it from your business record and shows it to you first. Preparing changes nothing on Google.</p>
          <form action={action} className={styles.actions}><Context workspaceId={workspaceId} listing={listing} /><XaButton size="sm" type="submit" name="action" value="hours">Prepare hours</XaButton><XaButton size="sm" type="submit" name="action" value="info">Prepare business info</XaButton></form>
          <details className={styles.disclosure}><summary>Write a Google post</summary>
            <form action={action} className={styles.disclosureBody}><Context workspaceId={workspaceId} listing={listing} />
              <label className={styles.fieldLabel}>Kind of post<select className={styles.select} name="topicType" defaultValue="STANDARD"><option value="STANDARD">Update</option><option value="EVENT">Event</option><option value="OFFER">Offer</option></select></label>
              <XaTextArea label="What the post says" name="summary" required maxLength={1500} rows={4} />
              <div className={styles.twoUp}>
                <label className={styles.fieldLabel}>Button<select className={styles.select} name="actionType" defaultValue=""><option value="">No button</option>{["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"].map(value => <option key={value} value={value}>{value.charAt(0) + value.slice(1).replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
                <XaField label="Button link" type="url" name="ctaUrl" placeholder="https://" />
              </div>
              <p className={styles.small}>For an event or an offer</p>
              <XaField label="Title" name="eventTitle" maxLength={58} />
              <div className={styles.twoUp}><XaField label="Starts" type="date" name="startDate" /><XaField label="Ends" type="date" name="endDate" /></div>
              <div className={styles.twoUp}><XaField label="Coupon code" name="couponCode" maxLength={58} /><XaField label="Redeem link" name="redeemOnlineUrl" type="url" /></div>
              <XaTextArea label="Offer terms" name="termsConditions" maxLength={5000} rows={3} />
              <div><XaButton type="submit" name="action" value="post">Keep it for your review</XaButton></div>
            </form>
          </details>
        </section> : null}

        <section className={styles.section} aria-labelledby={`google-changed-${listing.locationId}`}>
          <h2 id={`google-changed-${listing.locationId}`} className={styles.sectionTitle}>What changed on Google</h2>
          {listing.receipts.length ? <ul className={styles.group} aria-label="Google changes">{listing.receipts.map(receipt => {
            const exception = RECEIPT_STATE[receipt.status];
            const changed = googleChangeLines(receipt.before, receipt.after);
            return <li key={receipt.id} id={`google-receipt-${receipt.id}`} className={styles.groupRow}>
              <span className={styles.groupText}><span className={styles.groupTitle}>{receipt.headline}</span>
                {changed.map(line => <span key={line} className={styles.changeLine}>{line}</span>)}
                <span className={styles.groupDetail}>{approvedBy(receipt.authority)}{receipt.readback === "matched" ? " · it shows on Google" : receipt.readback === "differs" ? " · Google shows something different" : ""}</span></span>
              <span className={styles.groupEnd}>{exception ? <XaStatus kind={exception.kind} size="sm">{exception.text}</XaStatus> : null}
                {receipt.undo && listing.canManage ? <form action={action}><Context workspaceId={workspaceId} listing={listing} /><input type="hidden" name="receiptId" value={receipt.id} /><button type="submit" className={styles.textButton} name="action" value="undo" disabled={blocked}>Undo</button></form> : null}</span>
            </li>;
          })}</ul> : <p className={styles.quiet}>No Google changes have been sent yet.</p>}
        </section>
      </div>

      <aside className={styles.side} aria-label="Google listing details">
        {blocked && blockedReason ? <XaSays>{blockedReason}</XaSays> : null}
        {listingPreview ? <ul className={styles.group}><li className={styles.groupRow}><span className={styles.groupText}><span className={styles.groupTitle}>Hours on Google</span><span className={styles.groupDetail} data-tone="waits">{listingPreview.googleHours}</span><span className={styles.groupDetail}>Your record says {listingPreview.recordHours}</span></span></li></ul> : null}
        {listingPreview && listing.canManage ? <form action={action}><Context workspaceId={workspaceId} listing={listing} /><XaButton size="sm" block type="submit" name="action" value="hours" disabled={blocked}>{listingPreview.fixLabel}</XaButton></form> : null}
        <NeverWithoutYou paused={listing.control.paused} />
        {listing.canManage ? <form id={`google-pause-${listing.locationId}`} action={action} hidden><Context workspaceId={workspaceId} listing={listing} /></form> : null}
        {listing.canManage ? <XaSays links={[<button key="pause" type="submit" form={`google-pause-${listing.locationId}`} className={styles.textButton} name="action" value={listing.control.paused ? "resume" : "pause"}>{listing.control.paused ? "Resume Google listing" : "Pause Google listing"}</button>]}>
          {listing.control.paused ? "Paused. Reviews still sync; I stop drafting replies and changing Google." : "Every change waits for your yes, except replies your automatic reply setting covers."}
        </XaSays> : <XaSays>Only an authorized owner can prepare, approve or undo changes.</XaSays>}
        {listingPreview ? <p className={styles.small}>{listingPreview.pendingReview}</p> : null}
      </aside>
    </div>;
  })}</>;
}

function Head({ title, meta }: { title: ReactNode; meta: ReactNode }) {
  return <header className={styles.head}>
    <XaSystemTile kind="listing" size={56} />
    <div className={styles.headText}><h1 className={styles.headTitle}>{title}</h1><p className={styles.headMeta}>{meta}</p></div>
  </header>;
}
