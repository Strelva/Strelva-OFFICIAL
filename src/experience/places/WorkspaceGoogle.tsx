import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WorkspacePlace, type PlaceState } from "./WorkspacePlace";
import type { readWorkspaceGoogle } from "@/products/google-listing/workspace";

type Listings = Awaited<ReturnType<typeof readWorkspaceGoogle>>;
function Context({ workspaceId, listing }: { workspaceId: string; listing: Listings[number] }) {
  return <><input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="tenantId" value={listing.tenantId} /><input type="hidden" name="locationId" value={listing.locationId} /></>;
}
const inputClass = "mt-1 block w-full rounded-lg border border-gray-border bg-surface px-3 py-2 text-sm";
export function WorkspaceGoogle({ workspaceId, state, result, action, reviewId, replyText }: { workspaceId: string; state: PlaceState<Listings>; result?: string; action: (form: FormData) => Promise<void>; reviewId?: string; replyText?: string }) {
  const listings = state.kind === "ready" ? state.data : [];
  return <WorkspacePlace workspaceId={workspaceId} eyebrow="Google listing" title="Your business on Google" intro="Review changes, approve them, and keep the evidence here." state={state} errorTitle="Google listing couldn't load" errorBody="Your drafts and receipts are kept. Reload to try again.">
    {result ? <p role="status" className="mb-4 text-sm">{result}</p> : null}
    {!listings.length && state.kind === "ready" ? <Card padding="lg"><p>No Google listing is connected here. Ask Strelva to connect Google; access needs the business owner&apos;s consent.</p></Card> : null}
    {listings.map(listing => <section key={`${listing.tenantId}:${listing.locationId}`} aria-labelledby={`listing-${listing.locationId}`} className="mb-8 space-y-4">
      <h2 id={`listing-${listing.locationId}`} className="font-display text-xl">{listing.name}</h2>
      <Card padding="md">
        <p className="text-sm">{listing.control.paused ? "Paused. Reviews still sync; Strelva stops drafting replies and changing Google." : "Live. Every change waits for approval, except replies covered by your auto reply setting."}</p>
        {listing.control.accessPending ? <p className="mt-2 text-sm text-gray-muted">Waiting for Google to approve API access. Your drafts are kept. Nothing was sent. Strelva cannot promise an approval date; an owner must approve again when access is ready.</p> : null}
        {!listing.connected ? <p className="mt-2 text-sm text-gray-muted">Google disconnected. Reconnect Google to continue. Your drafts and receipts stay here.</p> : null}
        {listing.canManage ? <form action={action} className="mt-3"><Context workspaceId={workspaceId} listing={listing} /><Button variant="secondary" name="action" value={listing.control.paused ? "resume" : "pause"}>{listing.control.paused ? "Resume Google listing" : "Pause Google listing"}</Button></form> : <p className="mt-2 text-xs text-gray-muted">Only an authorized owner can prepare, approve or undo changes.</p>}
      </Card>
      {listing.canManage && !listing.control.paused ? <Card padding="md">
        <h3 className="text-base font-medium">Hours and business info</h3><p className="mt-2 text-sm text-gray-muted">Prepare the hours, holiday hours, phone, website link and description saved in Business details. Preparing a draft changes nothing on Google.</p>
        <form action={action} className="mt-3 flex flex-wrap gap-2"><Context workspaceId={workspaceId} listing={listing} /><Button variant="secondary" name="action" value="hours">Prepare hours</Button><Button variant="secondary" name="action" value="info">Prepare business info</Button></form>
        <details className="mt-5"><summary className="cursor-pointer text-sm font-medium">Compose a Google post</summary>
          <form action={action} className="mt-3 grid gap-3"><Context workspaceId={workspaceId} listing={listing} />
            <label className="text-sm">Post type<select name="topicType" className={inputClass}><option value="STANDARD">Update</option><option value="EVENT">Event</option><option value="OFFER">Offer</option></select></label>
            <label className="text-sm">Post copy<textarea name="summary" required maxLength={1500} rows={4} className={inputClass} /></label>
            <label className="text-sm">Button<select name="actionType" className={inputClass}><option value="">No button</option>{["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
            <label className="text-sm">Button link<input type="url" name="ctaUrl" className={inputClass} /></label>
            <fieldset className="grid gap-3"><legend className="text-sm text-gray-muted">Events and offers</legend><label className="text-sm">Title<input name="eventTitle" maxLength={58} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Start date<input type="date" name="startDate" className={inputClass} /></label><label className="text-sm">End date<input type="date" name="endDate" className={inputClass} /></label></div><label className="text-sm">Coupon code<input name="couponCode" maxLength={58} className={inputClass} /></label><label className="text-sm">Redeem link<input name="redeemOnlineUrl" type="url" className={inputClass} /></label><label className="text-sm">Offer terms<textarea name="termsConditions" maxLength={5000} className={inputClass} /></label></fieldset>
            <Button name="action" value="post">Keep draft for review</Button>
          </form></details>
      </Card> : null}
      {listing.canManage && reviewId ? <Card padding="md"><h3 className="text-base font-medium">Edit or withdraw your published reply</h3><p className="mt-2 text-sm text-gray-muted">Approving an edit replaces the reply on this Google listing. Withdraw removes it. The receipt keeps the previous text for undo.</p><form action={action} className="mt-3 grid gap-3"><Context workspaceId={workspaceId} listing={listing} /><input type="hidden" name="reviewId" value={reviewId} /><label className="text-sm">Reply text<textarea name="replyText" defaultValue={replyText} maxLength={4096} rows={4} className={inputClass} /></label><div className="flex flex-wrap gap-2"><Button name="action" value="reply" disabled={listing.control.paused || !listing.connected}>Approve reply edit</Button><Button variant="danger" name="action" value="withdraw" disabled={listing.control.paused || !listing.connected}>Withdraw reply</Button></div></form></Card> : null}
      <h3 className="text-base font-medium">Waiting for approval</h3>
      {listing.drafts.length ? listing.drafts.map(draft => <Card padding="md" key={draft.id}><h4 className="font-medium">{draft.title}</h4><pre className="mt-3 whitespace-pre-wrap break-words text-sm">{draft.body}</pre>{listing.canManage ? <form action={action} className="mt-4 flex flex-wrap gap-2"><Context workspaceId={workspaceId} listing={listing} /><input type="hidden" name="eventId" value={draft.id} /><Button name="action" value="approve" disabled={listing.control.paused || !listing.connected}>Approve Google change</Button><Button name="action" value="decline" variant="ghost">Decline</Button></form> : null}</Card>) : <p className="text-sm text-gray-muted">No changes are waiting.</p>}
      <h3 className="text-base font-medium">Receipts</h3>
      {listing.receipts.length ? listing.receipts.map(receipt => <Card padding="md" key={receipt.id}><p className="text-sm">{receipt.headline}</p><details className="mt-3 text-sm"><summary className="cursor-pointer">What changed and who approved</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify({ before: receipt.before, after: receipt.after, authority: receipt.authority, readback: receipt.readback }, null, 2)}</pre></details>{receipt.undo && listing.canManage ? <form action={action} className="mt-3"><Context workspaceId={workspaceId} listing={listing} /><input type="hidden" name="receiptId" value={receipt.id} /><Button variant="secondary" name="action" value="undo" disabled={listing.control.paused || !listing.connected}>Undo Google change</Button></form> : null}</Card>) : <p className="text-sm text-gray-muted">No Google changes have been sent yet.</p>}
    </section>)}
  </WorkspacePlace>;
}
