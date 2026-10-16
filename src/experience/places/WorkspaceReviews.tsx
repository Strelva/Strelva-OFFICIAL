import type { ComponentProps } from "react";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import { buildGoogleReviewLink, buildReviewShareMessage } from "@/lib/reviews/reputation";
import type { ReviewView, SiteReviews, WorkspaceReviews } from "@/products/google-listing/client";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaEmpty, XaStatus, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import type { PublishingState } from "@/experience/publishing/PublishingPage";
import { whenLabel } from "./WorkspacePlace";
import { ReviewReplyForm } from "./ReviewReplyForm";
import { ReviewsInbox, type ReviewItem } from "./ReviewsInbox";
import { XaNote, XaPlace, XaPlaceHead, XaPlaceLoading, XaPlaceNotMember, XaPlaceTrouble, XaStars, xaShortDate } from "./XaPlace";
import styles from "./xa-place.module.css";

export const REVIEW_SOURCE: Record<ReviewView["source"], string> = { google: "Google", yelp: "Yelp", manual: "Added by hand" };

export function reviewSummary(reviews: readonly ReviewView[]): { count: number; average: number | null; waiting: number } {
  const rated = reviews.filter(review => review.rating > 0);
  const average = rated.length ? Math.round((rated.reduce((sum, review) => sum + review.rating, 0) / rated.length) * 10) / 10 : null;
  return { count: reviews.length, average, waiting: reviews.filter(review => !review.reply).length };
}

/** Said once, beside the draft: who wrote it, and when (or why not) it posts. */
export function draftLine(review: ReviewView, mode: SiteReviews["replyMode"], holder?: string | null): string {
  if (!review.draft) return "";
  if (holder) return `Strelva drafted this reply. ${holder} holds automatic replies, so it waits for your okay.`;
  if (review.draft.autoPostAt && mode === "auto") return `Strelva drafted this reply. It posts by itself on ${whenLabel(review.draft.autoPostAt, true)} unless you change it.`;
  return "Strelva drafted this reply. It waits for your okay.";
}

export function replyHolder(site: SiteReviews): string | null {
  return site.autoPostHeld ? site.autoPostHeld.name ?? (site.autoPostHeld.by === "operator" ? "A Strelva operator" : "Strelva") : null;
}

/**
 * Used by the listing System (Google page): the same reviews as open rows with the reply in place.
 * `quiet` keeps every reply action secondary, for a screen whose one primary is elsewhere (the Google listing's yes).
 */
export function ReviewRows({ workspaceId, site, publishing = false, readOnly = false, request, quiet = false }: { workspaceId: string; site: SiteReviews; publishing?: boolean; readOnly?: boolean; request?: typeof fetch; quiet?: boolean }) {
  if (site.unavailable) return <XaNote tone="trouble" pebble role="alert">Reviews for {site.siteName} couldn&apos;t be read right now. Nothing changed on your listing.</XaNote>;
  if (!site.reviews.length) return <XaNote pebble>No reviews yet. {site.googleConnected ? "New Google reviews appear here after Strelva reads them." : "Once your Google listing is connected, reviews show up here with a drafted reply. The business owner connects it on the Google page."}</XaNote>;
  const firstPending = site.reviews.find(review => !review.reply)?.id;
  const holder = replyHolder(site);
  return <div className={styles.stack}>
    <ul className={styles.reviewList} aria-label={`Reviews for ${site.siteName}`}>{site.reviews.map(review => <li key={review.id}>
      <article aria-label={`${REVIEW_SOURCE[review.source]} review by ${review.author}`} className={styles.stack}>
        <p className={styles.reviewLine}><b>{review.author}</b><XaStars rating={review.rating} /><time dateTime={review.date}>{xaShortDate(review.date)}</time></p>
        <p className={styles.body}>{review.text || "A rating with no written review."}</p>
        {review.reply ? <div className={styles.stack}><p className={styles.quiet}>Your reply{review.repliedAt ? ` · ${xaShortDate(review.repliedAt)}` : ""}</p><p className={styles.said}>{review.reply}</p>
          {publishing && review.source === "google" && review.externalId ? <span><XaTextLink href={`/workspace/google?${new URLSearchParams({ workspaceId, reviewId: review.externalId, replyText: review.reply })}`}>Edit or withdraw on Google</XaTextLink></span> : null}</div> : <>
          {review.draft && (holder || (review.draft.autoPostAt && site.replyMode === "auto")) ? <XaNote pebble>{draftLine(review, site.replyMode, holder)}</XaNote> : null}
          <ReviewReplyForm workspaceId={workspaceId} tenantId={site.tenantId} reviewId={review.id} author={review.author} initial={review.draft?.reply ?? ""} postsToGoogle={review.source === "google" && site.googleConnected} readOnly={readOnly} primary={!quiet && review.id === firstPending} request={request} sentAs={site.siteName} />
        </>}
      </article>
    </li>)}</ul>
  </div>;
}

type ShellChrome = Partial<Omit<ComponentProps<typeof StrelvaShell>, "children">>;

/**
 * Reviews (XA · S3 Inbox shape): every review on the left, the one picked
 * on the right with its reply. Waiting for a reply comes first; the one ink
 * pill posts the reply that is open.
 */
export function WorkspaceReviewsView({ workspaceId, state, publishing = false, chrome, request, initialOpen = false }: { workspaceId: string; state: PublishingState<WorkspaceReviews>; publishing?: boolean; chrome?: ShellChrome; request?: typeof fetch; initialOpen?: boolean }) {
  return <StrelvaShell title="Reviews" workspaceId={workspaceId} active="system" {...chrome}>
    <XaPlace label="Reviews"><ReviewsBody workspaceId={workspaceId} state={state} publishing={publishing} request={request} initialOpen={initialOpen} /></XaPlace>
  </StrelvaShell>;
}

function ReviewsBody({ workspaceId, state, publishing, request, initialOpen }: { workspaceId: string; state: PublishingState<WorkspaceReviews>; publishing: boolean; request?: typeof fetch; initialOpen: boolean }) {
  const art = <XaSystemTile kind="reviews" size={56} />;
  const back = { href: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`, label: `Back to ${XA_PLACE_LABELS.today}` };
  if (state.kind === "loading") return <><XaPlaceHead art={art} title="Reviews" back={back} /><XaPlaceLoading label="Loading Reviews" /></>;
  if (state.kind === "permission") return <><XaPlaceHead art={art} title="Reviews" back={back} /><XaPlaceNotMember /></>;
  if (state.kind === "error") return <><XaPlaceHead art={art} title="Reviews" back={back} /><XaPlaceTrouble title="Reviews couldn't load." action={<XaTextLink href="">Reload the page</XaTextLink>}><p>Nothing changed on your listing. Reload the page to try again.</p></XaPlaceTrouble></>;

  const data = state.data;
  const all = data.sites.flatMap(site => site.reviews);
  const summary = reviewSummary(all);
  const disconnected = data.sites.filter(site => !site.googleConnected);
  const googleHref = `/workspace/google?workspaceId=${encodeURIComponent(workspaceId)}`;
  const items: ReviewItem[] = data.sites.flatMap(site => site.reviews.map(review => ({ site, review })));
  const shareUrl = data.sites.map(site => buildGoogleReviewLink(site.googlePlaceId)).find(Boolean) ?? null;

  const status = <>
    {summary.waiting ? <XaStatus kind="waits">{summary.waiting === 1 ? "1 waits for a reply" : `${summary.waiting} wait for a reply`}</XaStatus> : null}
    {summary.count ? <span>{summary.average === null ? "No" : summary.average.toFixed(1)} average from {summary.count === 1 ? "1 review" : `${summary.count} reviews`}</span> : null}
    {disconnected.length ? <span><XaStatus kind="draft">Google listing not connected</XaStatus> <XaTextLink href={googleHref}>Connect it on the Google page</XaTextLink></span> : null}
  </>;

  const notes = <>
    {data.denied.length ? <XaNote pebble>Your account can&apos;t open {data.denied.map(site => site.siteName).join(", ")} yet. Ask the owner to finish adding you.</XaNote> : null}
    {data.sites.filter(site => site.unavailable).map(site => <XaNote key={site.tenantId} tone="trouble" pebble role="alert">Reviews for {site.siteName} couldn&apos;t be read right now. Nothing changed on your listing.</XaNote>)}
  </>;

  if (!data.sites.length) return <><XaPlaceHead art={art} title="Reviews" back={back} />{notes}
    {!data.denied.length ? <XaEmpty pose="website" title="No site is connected to this business yet." job="Pebble is ready to read your Google reviews">Reviews show here once a site and its Google listing are connected.</XaEmpty> : null}</>;

  const getMore = shareUrl ? <details className={styles.disclosure}><summary>Get more reviews</summary><p>{buildReviewShareMessage(shareUrl)}</p><a href={shareUrl} target="_blank" rel="noopener noreferrer">Open your Google review form</a></details> : null;

  if (!items.length) return <><XaPlaceHead art={art} title="Reviews" status={status} back={back} />{notes}
    <XaEmpty pose="resting" title="No reviews yet." job={disconnected.length ? "Pebble is waiting for your Google listing" : "Pebble reads new Google reviews as they arrive"}
      secondary={getMore}>{disconnected.length ? "Once your Google listing is connected, reviews show up here with a drafted reply. The business owner connects it on the Google page." : "New Google reviews appear here after Strelva reads them, each with a drafted reply."}</XaEmpty></>;

  return <ReviewsInbox initialOpen={initialOpen} head={{ status, back }} notes={notes} getMore={getMore} items={items.map(item => ({
    ...item,
    detail: <ReviewDetail workspaceId={workspaceId} site={item.site} review={item.review} publishing={publishing} primary request={request} multiSite={data.sites.length > 1} />,
  }))} />;
}

function ReviewDetail({ workspaceId, site, review, publishing, primary, request, multiSite }: { workspaceId: string; site: SiteReviews; review: ReviewView; publishing: boolean; primary: boolean; request?: typeof fetch; multiSite: boolean }) {
  return <article className={styles.detailBody} aria-label={`${REVIEW_SOURCE[review.source]} review by ${review.author}`}>
    <p className={styles.bubble}>{review.text || "A rating with no written review."}</p>
    {review.reply ? <div className={styles.stack}>
      <p className={styles.quiet}>Your reply{review.repliedAt ? ` · ${xaShortDate(review.repliedAt)}` : ""}</p>
      <p className={styles.said}>{review.reply}</p>
      {publishing && review.source === "google" && review.externalId ? <span><XaTextLink href={`/workspace/google?${new URLSearchParams({ workspaceId, reviewId: review.externalId, replyText: review.reply })}`}>Edit or withdraw on Google</XaTextLink></span> : null}
    </div> : <>
      {review.draft ? <XaNote pebble>{draftLine(review, site.replyMode, replyHolder(site))}</XaNote> : null}
      <ReviewReplyForm workspaceId={workspaceId} tenantId={site.tenantId} reviewId={review.id} author={review.author} initial={review.draft?.reply ?? ""} postsToGoogle={review.source === "google" && site.googleConnected} primary={primary} request={request} sentAs={site.siteName} />
    </>}
    {multiSite ? <p className={styles.quiet}>On {site.siteName}</p> : null}
  </article>;
}
