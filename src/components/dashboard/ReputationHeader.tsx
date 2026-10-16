"use client";

import { XaHeadline, XaLede } from "@/components/ui/strelva/Xa";
import type { ReviewItem } from "@/lib/types";
import { buildReputationSummary } from "@/lib/reviews/reputation";

interface ReputationHeaderProps {
  reviews: ReviewItem[];
  /** True when Google Business is live — replies publish straight to the listing. */
  gbpConnected: boolean;
  /** Where a copied reply should be pasted ("Google"/"Yelp"/"the platform"). */
  copyDest: string;
}

/**
 * The reviews verdict in one short headline, then what waits. Reads the
 * client-safe summary only (no admin intelligence). The rating, the count and
 * what patients mention most are said in sentences; there is no stat table
 * and no star histogram. The review that waits for a reply, open below, is
 * the page's one object.
 */
export function ReputationHeader({ reviews, gbpConnected, copyDest }: ReputationHeaderProps) {
  const rep = buildReputationSummary(reviews);
  const { summary } = rep;
  const total = summary.totalReviews;
  const waiting = reviews.filter((review) => !review.reply);
  const headline = summary.averageRating > 0
    ? `${summary.averageRating.toFixed(1)} stars from ${total} ${total === 1 ? "review" : "reviews"}.`
    : "No reviews yet.";
  const quiet = waiting.length === 1 ? "A reply waits for you."
    : waiting.length > 1 ? `${waiting.length} replies wait for you.`
      : total > 0 ? "You have replied to every one." : undefined;
  const loved = rep.lovedFor.length > 0 && summary.averageRating >= 4 ? rep.lovedFor.slice(0, 2).map((theme) => theme.label.toLowerCase()) : [];
  // Velocity only when it asks for something: few reviews, or fewer than before.
  const velocity = rep.lowData ? "Let's get more: send the review link below to a happy patient."
    : rep.velocity.trend === "down" ? `${rep.velocity.prior} came in the 30 days before. The share link brings them back.` : null;
  const lede = [
    velocity,
    loved.length ? `Patients mention ${loved.join(" and ")} most.` : null,
    waiting.length ? gbpConnected ? "Strelva wrote the reply in your voice; your yes posts it on Google." : `Strelva wrote the reply in your voice; say yes, then copy it into ${copyDest}.` : null,
  ].filter(Boolean).join(" ");

  return (
    <header className="flex flex-col gap-3">
      <XaHeadline size="sm" quiet={quiet}>{headline}</XaHeadline>
      {lede ? <XaLede>{lede}</XaLede> : null}
    </header>
  );
}
