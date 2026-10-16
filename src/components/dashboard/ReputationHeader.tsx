"use client";

import { XaAnswers, XaHeadline, XaLabel } from "@/components/ui/strelva/Xa";
import type { ReviewItem } from "@/lib/types";
import { buildReputationSummary } from "@/lib/reviews/reputation";

/** The canonical reviews viz — a 5→1 star breakdown, each row a bar sized to the
 *  busiest bucket. Built from the reviews already on the page; hidden under a
 *  handful of reviews (one lopsided bar reads as a glitch, not a distribution). */
function RatingDistribution({ reviews }: { reviews: ReviewItem[] }) {
  const counts = [0, 0, 0, 0, 0]; // index 0 = 1★ … 4 = 5★
  for (const r of reviews) {
    const s = Math.round(r.rating);
    if (s >= 1 && s <= 5) counts[s - 1]! += 1;
  }
  if (reviews.length < 4) return null;
  const max = Math.max(1, ...counts);

  return (
    <div className="flex max-w-[420px] flex-col gap-2" aria-label="How many reviews gave each rating">
      <div className="space-y-2">
        {[5, 4, 3, 2, 1].map((star) => {
          const c = counts[star - 1]!;
          return (
            <div key={star} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[13px] tabular-nums text-[var(--st-text-2)]">{star} {star === 1 ? "star" : "stars"}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--st-inset)]">
                <div className="h-full rounded-full bg-[var(--st-accent)]" style={{ width: `${(c / max) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-[13px] tabular-nums text-[var(--st-text-2)]">{c}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ReputationHeaderProps {
  reviews: ReviewItem[];
  /** True when Google Business is live — replies publish straight to the listing. */
  gbpConnected: boolean;
  /** Where a copied reply should be pasted ("Google"/"Yelp"/"the platform"). */
  copyDest: string;
}

/**
 * Verdict-first reputation summary above the review list. Reads the client-safe
 * `getClientReviewSummary` (via `buildReputationSummary`) only — no admin
 * intelligence. Frames a low response rate as an opportunity, not shame, and
 * few reviews as "let's get more".
 */
export function ReputationHeader({ reviews, gbpConnected, copyDest }: ReputationHeaderProps) {
  const rep = buildReputationSummary(reviews);
  const { summary, velocity } = rep;

  let velocityDetail: string;
  if (rep.lowData) velocityDetail = "Let's get more. Share your review link";
  else if (velocity.trend === "up") velocityDetail = `Up from ${velocity.prior} the 30 days before`;
  else if (velocity.trend === "down") velocityDetail = `${velocity.prior} came in the 30 days before. The share link brings them back`;
  else velocityDetail = "Steady with the 30 days before";

  return (
    <header className="flex flex-col gap-6">
      <XaHeadline size="sm" quiet={gbpConnected
        ? "Strelva writes a reply for every review in your voice. Google replies post once you say yes."
        : `Strelva writes a reply for every review in your voice. Say yes, then copy it into ${copyDest}.`}>{rep.verdict}</XaHeadline>
      <section className="flex flex-col gap-3" aria-labelledby="reputation-label">
        <XaLabel id="reputation-label">Reputation</XaLabel>
        <XaAnswers labelWidth={140} rows={[
          ["Rating", summary.averageRating > 0 ? `${summary.averageRating.toFixed(1)} from ${summary.totalReviews} ${summary.totalReviews === 1 ? "review" : "reviews"}` : "No rating yet"],
          ["Response rate", `${summary.replyCoverage}%. ${rep.responseNote}`],
          ["Last 30 days", `${velocity.recent} new. ${velocityDetail}`],
          ...(rep.lovedFor.length > 0 && summary.averageRating >= 4 ? [["Mentioned most", rep.lovedFor.slice(0, 3).map((t) => t.label).join(", ")] as const] : []),
        ]} />
        <RatingDistribution reviews={reviews} />
      </section>
    </header>
  );
}
