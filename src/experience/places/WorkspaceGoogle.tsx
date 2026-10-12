import type { ReactNode } from "react";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import { StEmpty, StLabel, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { PublishingPage, type PublishingState } from "@/experience/publishing/PublishingPage";
import styles from "@/experience/publishing/publishing.module.css";
import { ReviewRows } from "./WorkspaceReviews";
import type { SiteReviews } from "@/products/google-listing/server";
import type { readWorkspaceGoogle } from "@/products/google-listing/server";

type Listings = Awaited<ReturnType<typeof readWorkspaceGoogle>>;
/** Missing from the current listing projection; supplied only by labeled preview fixtures. */
export interface GoogleListingPreview { category: string; rating: string; reviews: number; googleHours: string; recordHours: string; fixLabel: string; pendingReview: string }
function Context({ workspaceId, listing }: { workspaceId: string; listing: Listings[number] }) {
  return <><input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="tenantId" value={listing.tenantId} /><input type="hidden" name="locationId" value={listing.locationId} /><input type="hidden" name="commandId" value={crypto.randomUUID()} /></>;
}
export function WorkspaceGoogle({ workspaceId, state, result, action, reviewId, replyText, reviews, listingPreview, reviewRequest, connect }: { workspaceId: string; state: PublishingState<Listings>; result?: string; action: (form: FormData) => Promise<void>; reviewId?: string; replyText?: string; reviews?: PublishingState<SiteReviews[]>; listingPreview?: GoogleListingPreview; reviewRequest?: typeof fetch; connect?: ReactNode }) {
  const listings = state.kind === "ready" ? state.data : [];
  return <PublishingPage workspaceId={workspaceId} title="Google listing" meta="Your business on Google Search and Maps · Strelva drafts, you approve, Google publishes" state={state} errorTitle="Google listing couldn't load" errorBody="Your drafts and receipts are kept. Reload to try again.">
    {result ? <p role="status" className={styles.copy}>{result}</p> : null}
    {state.kind === "ready" && connect ? connect : null}
    {!listings.length && state.kind === "ready" && !connect ? <StEmpty>No Google listing is connected here yet. The business owner connects it with their own Google account.</StEmpty> : null}
    {listings.map(listing => {
      const blocked = listing.control.paused || !listing.connected || listing.control.accessPending;
      const site = reviews?.kind === "ready" ? reviews.data.find(site => site.tenantId === listing.tenantId && listings.filter(item => item.tenantId === listing.tenantId).length === 1) : undefined;
      return <section key={`${listing.tenantId}:${listing.locationId}`} className={styles.stack} aria-label={listing.name}>
        <div className={styles.columns}>
          <div className={styles.stack}>
            {site ? <ReviewRows workspaceId={workspaceId} site={site} publishing readOnly={!listing.canManage || blocked} request={reviewRequest} /> : reviews?.kind === "error" ? <StNotice tone="critical">Reviews couldn&apos;t load. Nothing changed on your listing.</StNotice> : reviews?.kind === "permission" ? <StNotice>Your account can&apos;t read this listing&apos;s reviews.</StNotice> : <StEmpty>Reviews are available in <StTextButton href={`/workspace/reviews?workspaceId=${encodeURIComponent(workspaceId)}`}>Reviews</StTextButton>.</StEmpty>}
            {listing.drafts.length ? <StSection title="Waiting for approval">{listing.drafts.map(draft => <StSurface key={draft.id} label={draft.title} tone="need"><div className={styles.stack}><StLabel>{draft.title}</StLabel><StState kind="need">Draft · not sent to Google</StState><p className={styles.copy}>{draft.body}</p>{listing.canManage ? <form action={action} className={styles.actions}><Context workspaceId={workspaceId} listing={listing} /><input type="hidden" name="eventId" value={draft.id} /><StPill variant="soft" type="submit" name="action" value="approve" disabled={blocked}>Make it live</StPill><StTextButton type="submit" name="action" value="decline">Not yet</StTextButton></form> : null}</div></StSurface>)}</StSection> : <StEmpty>No changes are waiting.</StEmpty>}
          </div>
          <aside className={styles.aside} aria-label="Google listing details">
            <StSection title={listing.name}>
              {listingPreview ? <><p className={styles.copy}>{listingPreview.category}</p><p className={styles.copy}>{listingPreview.rating} ★★★★★ · <StMono>{listingPreview.reviews}</StMono> reviews</p></> : <p className={styles.copy}>Listing name from the connected Google account. Its public appearance hasn&apos;t been read here.</p>}
              <StState kind={listing.control.paused ? "draft" : "live"}>{listing.control.paused ? "Paused" : "Live"}</StState>
              {!listing.connected ? <StNotice tone="critical">Google disconnected. Reconnect Google to continue. Your drafts and receipts stay here.</StNotice> : listing.control.accessPending ? <StNotice tone="need">Waiting for Google to approve API access. Your drafts are kept. Nothing was sent. Strelva cannot promise an approval date; an owner must approve again when access is ready.</StNotice> : <StLabel>Google connected</StLabel>}
            </StSection>
            {listingPreview ? <><StRows label="Hours comparison"><StRow title="Hours on Google" end={<StMono tone="need">{listingPreview.googleHours}</StMono>} /><StRow title="Your business record" end={<StMono tone="text">{listingPreview.recordHours}</StMono>} /></StRows>{listing.canManage ? <form action={action}><Context workspaceId={workspaceId} listing={listing} /><StPill variant="soft" block type="submit" name="action" value="hours" disabled={blocked}>{listingPreview.fixLabel}</StPill></form> : null}<StNotice>{listingPreview.pendingReview}</StNotice></> : null}
            {listing.canManage ? <form action={action}><Context workspaceId={workspaceId} listing={listing} /><StTextButton type="submit" name="action" value={listing.control.paused ? "resume" : "pause"}>{listing.control.paused ? "Resume Google listing" : "Pause Google listing"}</StTextButton></form> : <StNotice>Only an authorized owner can prepare, approve or undo changes.</StNotice>}
            <p className={styles.copy}>{listing.control.paused ? "Reviews still sync; Strelva stops drafting replies and changing Google." : "Every change waits for approval, except replies covered by your automatic reply setting."}</p>
          </aside>
        </div>
        {listing.canManage && !listing.control.paused ? <StSection title="Hours, business info and posts">
          <p className={styles.copy}>Prepare the hours, holiday hours, phone, website link and description saved in Business details. Preparing a draft changes nothing on Google.</p>
          <form action={action} className={styles.actions}><Context workspaceId={workspaceId} listing={listing} /><StPill variant="soft" type="submit" name="action" value="hours">Prepare hours</StPill><StPill variant="soft" type="submit" name="action" value="info">Prepare business info</StPill></form>
        <details className={styles.disclosure}><summary className="cursor-pointer text-sm font-medium">Compose a Google post</summary>
          <form action={action} className="mt-3 grid gap-3"><Context workspaceId={workspaceId} listing={listing} />
            <SelectInput label="Post type" name="topicType" options={[{ value: "STANDARD", label: "Update" }, { value: "EVENT", label: "Event" }, { value: "OFFER", label: "Offer" }]} />
            <TextArea label="Post copy" name="summary" required maxLength={1500} rows={4} />
            <SelectInput label="Button" name="actionType" options={[{ value: "", label: "No button" }, ...["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"].map(value => ({ value, label: value.replaceAll("_", " ").toLowerCase() }))]} />
            <TextInput label="Button link" type="url" name="ctaUrl" />
            <fieldset className="grid gap-3"><legend className="text-sm text-gray-muted">Events and offers</legend><TextInput label="Title" name="eventTitle" maxLength={58} /><div className="grid gap-3 sm:grid-cols-2"><TextInput label="Start date" type="date" name="startDate" /><TextInput label="End date" type="date" name="endDate" /></div><TextInput label="Coupon code" name="couponCode" maxLength={58} /><TextInput label="Redeem link" name="redeemOnlineUrl" type="url" /><TextArea label="Offer terms" name="termsConditions" maxLength={5000} /></fieldset>
            <StPill variant="soft" type="submit" name="action" value="post">Keep draft for review</StPill>
          </form></details>

        </StSection> : null}
        {listing.canManage && reviewId ? <StSurface label="Edit or withdraw your published reply"><div className={styles.stack}><StLabel>Edit or withdraw your published reply</StLabel><p className={styles.copy}>Approving an edit replaces the reply on this Google listing. Withdraw removes it. The receipt keeps the previous text for undo.</p><form action={action} className={styles.stack}><Context workspaceId={workspaceId} listing={listing} /><input type="hidden" name="reviewId" value={reviewId} /><TextArea label="Reply text" name="replyText" defaultValue={replyText} maxLength={4096} rows={4} /><div className={styles.actions}><StPill variant="soft" type="submit" name="action" value="reply" disabled={blocked}>Make it live</StPill><StTextButton tone="danger" type="submit" name="action" value="withdraw" disabled={blocked}>Withdraw reply</StTextButton></div></form></div></StSurface> : null}
        <StSection title="What changed">
          {listing.receipts.length ? <StRows label="Google receipts">{listing.receipts.map(receipt => <StRow key={receipt.id} title={receipt.headline}><div id={`google-receipt-${receipt.id}`} className={styles.stack}><details className={styles.disclosure}><summary>What changed and who approved</summary><pre>{JSON.stringify({ before: receipt.before, after: receipt.after, authority: receipt.authority, readback: receipt.readback }, null, 2)}</pre></details>{receipt.undo && listing.canManage ? <form action={action}><Context workspaceId={workspaceId} listing={listing} /><input type="hidden" name="receiptId" value={receipt.id} /><StPill variant="soft" type="submit" name="action" value="undo" disabled={blocked}>Undo Google change</StPill></form> : null}</div></StRow>)}</StRows> : <StEmpty>No Google changes have been sent yet.</StEmpty>}
        </StSection>
      </section>;
    })}
  </PublishingPage>;
}
