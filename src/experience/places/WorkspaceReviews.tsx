import { buildGoogleReviewLink, buildReviewShareMessage } from "@/lib/reviews/reputation";
import type { ReviewView, SiteReviews, WorkspaceReviews } from "@/products/google-listing/client";
import { StEmpty, StLabel, StMono, StNotice, StRow, StRows, StSection, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { PublishingPage, type PublishingState } from "@/experience/publishing/PublishingPage";
import styles from "@/experience/publishing/publishing.module.css";
import { whenLabel } from "./WorkspacePlace";
import { ReviewReplyForm } from "./ReviewReplyForm";

const SOURCE: Record<ReviewView["source"], string> = { google: "Google", yelp: "Yelp", manual: "Added by hand" };

export function reviewSummary(reviews: readonly ReviewView[]): { count: number; average: number | null; waiting: number } {
  const rated = reviews.filter(review => review.rating > 0);
  const average = rated.length ? Math.round((rated.reduce((sum, review) => sum + review.rating, 0) / rated.length) * 10) / 10 : null;
  return { count: reviews.length, average, waiting: reviews.filter(review => !review.reply).length };
}

function draftLine(review: ReviewView, mode: SiteReviews["replyMode"]): string {
  if (!review.draft) return "";
  if (review.draft.autoPostAt && mode === "auto") return `Strelva drafted this reply. It posts by itself on ${whenLabel(review.draft.autoPostAt, true)} unless you change it.`;
  return "Strelva drafted this reply. It waits for your okay here or in Needs you.";
}

/** Used by both the listing System and its complete reviews place. */
export function ReviewRows({ workspaceId, site, publishing = false, readOnly = false, request }: { workspaceId: string; site: SiteReviews; publishing?: boolean; readOnly?: boolean; request?: typeof fetch }) {
  if (site.unavailable) return <StNotice tone="critical">Reviews for {site.siteName} couldn&apos;t be read right now. Nothing changed on your listing.</StNotice>;
  if (!site.reviews.length) return <StEmpty>No reviews yet. {site.googleConnected ? "New Google reviews appear here after Strelva reads them." : "Once your Google listing is connected, reviews show up here with a drafted reply. The business owner connects it on the Google page."}</StEmpty>;
  const firstPending = site.reviews.find(review => !review.reply)?.id;
  const holder = site.autoPostHeld ? site.autoPostHeld.name ?? (site.autoPostHeld.by === "operator" ? "A Strelva operator" : "Strelva") : null;
  return <>{holder ? <StNotice>{holder} holds automatic replies for this business. Every reply waits for your okay.</StNotice> : null}<StRows label={`Reviews for ${site.siteName}`}>{site.reviews.map(review => <StRow key={review.id} align="start" title={<span className={styles.reviewHead}><span>{review.author}</span><span aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span><StMono as="time" dateTime={review.date}>{whenLabel(review.date)}</StMono></span>}>
    <article aria-label={`${SOURCE[review.source]} review by ${review.author}`} className={styles.stack}>
      <p className={styles.copy}>{review.text || "A rating with no written review."}</p>
      {review.reply ? <div className={styles.draft}><StLabel>Your reply{review.repliedAt ? ` · ${whenLabel(review.repliedAt)}` : ""}</StLabel><p className={styles.copy}>{review.reply}</p>{publishing && review.source === "google" && review.externalId ? <StTextButton href={`/workspace/google?${new URLSearchParams({ workspaceId, reviewId: review.externalId, replyText: review.reply })}`}>Edit or withdraw on Google</StTextButton> : null}</div> : <>
        {review.draft?.autoPostAt && site.replyMode === "auto" ? <p className={styles.copy}>{draftLine(review, site.replyMode)}</p> : null}
        <ReviewReplyForm workspaceId={workspaceId} tenantId={site.tenantId} reviewId={review.id} author={review.author} initial={review.draft?.reply ?? ""} postsToGoogle={review.source === "google" && site.googleConnected} readOnly={readOnly} primary={review.id === firstPending} request={request} />
      </>}
    </article>
  </StRow>)}</StRows></>;
}

export function WorkspaceReviewsView({ workspaceId, state, publishing = false }: { workspaceId: string; state: PublishingState<WorkspaceReviews>; publishing?: boolean }) {
  const data = state.kind === "ready" ? state.data : null;
  return <PublishingPage workspaceId={workspaceId} title="Reviews" meta="What customers said about you, with your replies. Replies can be drafted for your review." state={state} errorTitle="Reviews couldn't load" errorBody="Nothing changed on your listing. Reload the page to try again.">
    {data?.denied.length ? <StNotice>Your account can&apos;t open {data.denied.map(site => site.siteName).join(", ")} yet. Ask the owner to finish adding you.</StNotice> : null}
    {data && !data.sites.length && !data.denied.length ? <StEmpty>No site is connected to this business yet. Reviews show here once a site and its Google listing are connected.</StEmpty> : null}
    {data?.sites.map(site => {
      const summary = reviewSummary(site.reviews);
      const url = buildGoogleReviewLink(site.googlePlaceId);
      return <StSection key={site.tenantId} title={site.siteName} meta={site.unavailable ? "Read unavailable" : summary.count ? `${summary.average ?? "No"} average from ${summary.count} reviews · ${summary.waiting} without a reply` : "No reviews yet"}>
        <StState kind={site.googleConnected ? "live" : "down"}>{site.googleConnected ? "Google listing connected" : "Google listing not connected"}</StState>
        <ReviewRows workspaceId={workspaceId} site={site} publishing={publishing} />
        {url ? <details className={styles.disclosure}><summary>Get more reviews</summary><StSurface label="Review invitation"><p className={styles.copy}>{buildReviewShareMessage(url)}</p><a href={url} target="_blank" rel="noopener noreferrer">Open your Google review form</a></StSurface></details> : null}
      </StSection>;
    })}
  </PublishingPage>;
}
