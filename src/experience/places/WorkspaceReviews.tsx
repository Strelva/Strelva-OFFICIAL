import { Card } from "@/components/ui/Card";
import { buildGoogleReviewLink, buildReviewShareMessage } from "@/lib/reviews/reputation";
import type { ReviewView, SiteReviews, WorkspaceReviews } from "@/products/google-listing/linked-reviews";
import { NoSiteCard, SiteHeading, WorkspacePlace, whenLabel, type PlaceState } from "./WorkspacePlace";
import { ReviewReplyForm } from "./ReviewReplyForm";

/**
 * Reviews on the Google listing, in the workspace: the home of
 * /dashboard/reviews. Each review with its reply, the reply Strelva drafted
 * when one is waiting, and a way to reply.
 */

const SOURCE: Record<ReviewView["source"], string> = { google: "Google", yelp: "Yelp", manual: "Added by hand" };

export function reviewSummary(reviews: readonly ReviewView[]): { count: number; average: number | null; waiting: number } {
  const rated = reviews.filter((review) => review.rating > 0);
  const average = rated.length ? Math.round((rated.reduce((sum, review) => sum + review.rating, 0) / rated.length) * 10) / 10 : null;
  return { count: reviews.length, average, waiting: reviews.filter((review) => !review.reply).length };
}

function Stars({ rating }: { rating: number }) {
  return <span aria-label={`${rating} out of 5 stars`} className="tracking-[0.1em]">{"★".repeat(rating)}<span className="text-gray-border">{"★".repeat(5 - rating)}</span></span>;
}

function draftLine(review: ReviewView, mode: SiteReviews["replyMode"]): string {
  if (!review.draft) return "";
  if (review.draft.autoPostAt && mode === "auto") return `Strelva drafted this reply. It posts by itself on ${whenLabel(review.draft.autoPostAt, true)} unless you change it.`;
  return "Strelva drafted this reply. It waits for your okay here or in Needs you.";
}

function ReviewCard({ workspaceId, site, review, publishing }: { workspaceId: string; site: SiteReviews; review: ReviewView; publishing: boolean }) {
  const postsToGoogle = review.source === "google" && site.googleConnected;
  return (
    <Card padding="md">
      <article aria-labelledby={`review-${review.id}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={`review-${review.id}`} className="truncate text-[15px] font-medium">{review.author}</h3>
            <p className="mt-1 text-xs text-gray-muted"><Stars rating={review.rating} /> · {SOURCE[review.source]} · <time dateTime={review.date}>{whenLabel(review.date)}</time></p>
          </div>
        </div>
        {review.text ? <p className="mt-3 whitespace-pre-line text-sm leading-6">{review.text}</p> : <p className="mt-3 text-sm text-gray-muted">A rating with no written review.</p>}
        {review.reply ? (
          <div className="mt-4 rounded-lg border border-gray-border p-3">
            <p className="text-xs font-medium text-gray-muted">Your reply{review.repliedAt ? ` · ${whenLabel(review.repliedAt)}` : ""}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6">{review.reply}</p>
            {publishing && review.source === "google" && review.externalId ? <a className="mt-2 inline-block text-sm underline" href={`/workspace/google?${new URLSearchParams({ workspaceId, reviewId: review.externalId, replyText: review.reply })}`}>Edit or withdraw on Google</a> : null}
          </div>
        ) : (
          <>
            {review.draft ? <p className="mt-4 text-xs text-gray-muted">{draftLine(review, site.replyMode)}</p> : null}
            <ReviewReplyForm workspaceId={workspaceId} tenantId={site.tenantId} reviewId={review.id} author={review.author} initial={review.draft?.reply ?? ""} postsToGoogle={postsToGoogle} />
          </>
        )}
      </article>
    </Card>
  );
}

function ReviewLink({ placeId }: { placeId: string | null }) {
  const url = buildGoogleReviewLink(placeId);
  if (!url) return null;
  return (
    <Card padding="md" className="mb-4">
      <h3 className="text-sm font-medium">Get more reviews</h3>
      <p className="mt-1 text-sm leading-6 text-gray-muted">Send a happy customer this message. The link opens straight to your Google review form.</p>
      <p className="mt-2 rounded-lg border border-gray-border px-3 py-2 text-sm leading-6">{buildReviewShareMessage(url)}</p>
      <a className="mt-2 block truncate text-xs text-gray-muted underline-offset-4 hover:underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
    </Card>
  );
}

export function WorkspaceReviewsView({ workspaceId, state, publishing = false }: { workspaceId: string; state: PlaceState<WorkspaceReviews>; publishing?: boolean }) {
  const data = state.kind === "ready" ? state.data : null;
  return (
    <WorkspacePlace workspaceId={workspaceId} eyebrow="Google listing" title="Reviews"
      intro="What customers said about you, with your replies. Strelva drafts a reply for each new review."
      state={state} denied={data?.denied.map((site) => site.siteName)}
      errorTitle="Reviews couldn't load" errorBody="Nothing changed on your listing. Reload the page to try again.">
      {data && data.sites.length === 0 && data.denied.length === 0 ? <NoSiteCard body="Reviews show here once Strelva runs a site and its Google listing for this business." /> : null}
      {data?.sites.map((site) => {
        const summary = reviewSummary(site.reviews);
        return (
          <section key={site.tenantId} className="mt-8" aria-labelledby={`site-${site.tenantId}`}>
            <SiteHeading id={`site-${site.tenantId}`} name={site.siteName} multiple={data.sites.length > 1} />
            {site.unavailable ? (
              <Card padding="lg" role="status"><p className="text-sm leading-6 text-gray-muted">Reviews for {site.siteName} couldn&apos;t be read right now. Nothing changed on your listing.</p></Card>
            ) : (
              <>
                <p className="mb-4 text-sm text-gray-muted">
                  {summary.count ? `${summary.average ?? "No"} average from ${summary.count} ${summary.count === 1 ? "review" : "reviews"} · ${summary.waiting} without a reply` : "No reviews yet"}
                  {" · "}{site.googleConnected ? "Google listing connected" : "Google listing not connected"}
                </p>
                <ReviewLink placeId={site.googlePlaceId} />
                {site.reviews.length === 0 ? (
                  <Card padding="lg">
                    <h3 className="text-base font-medium">No reviews yet</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-muted">{site.googleConnected ? "New Google reviews show up here within a day, each with a drafted reply." : "Once your Google listing is connected, reviews show up here with a drafted reply. Ask Strelva to connect it."}</p>
                  </Card>
                ) : (
                  <div className="grid gap-3">{site.reviews.map((review) => <ReviewCard publishing={publishing} key={review.id} workspaceId={workspaceId} site={site} review={review} />)}</div>
                )}
              </>
            )}
          </section>
        );
      })}
    </WorkspacePlace>
  );
}
