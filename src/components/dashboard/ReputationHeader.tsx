"use client";

import { Star, MessageSquare, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ReviewItem } from "@/lib/types";
import { buildReputationSummary } from "@/lib/reviews/reputation";

/** A rating tile with stars — StatTile-styled but carrying the star row that a
 *  plain number tile can't. Matches the glass card the other tiles use. */
function RatingTile({ rating, total }: { rating: number; total: number }) {
  const filled = Math.round(Math.min(5, Math.max(0, rating)));
  return (
    <div className="rounded-xl border border-glass-border bg-glass p-4">
      <div className="mb-3 flex items-center gap-2 text-gray-muted">
        <Star className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em]">Overall rating</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[28px] font-semibold leading-none tabular-nums text-warm-black">
          {rating > 0 ? rating.toFixed(1) : "—"}
        </p>
        <div className="flex items-center gap-0.5" aria-label={`${filled} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-3.5 w-3.5 ${n <= filled ? "fill-accent text-accent" : "text-gray-border"}`}
              strokeWidth={1.5}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">
        {total} {total === 1 ? "review" : "reviews"}
      </p>
    </div>
  );
}

/** A StatTile-styled metric. Kept local so the reputation header stays a single
 *  self-contained surface; mirrors StatTile's card/eyebrow/number rhythm. */
function MetricTile({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-glass-border bg-glass p-4">
      <div className="mb-3 flex items-center gap-2 text-gray-muted">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="text-[28px] font-semibold leading-none tabular-nums text-warm-black">{value}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{detail}</p>
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

  const velocityValue = velocity.recent.toString();
  let velocityDetail: string;
  let velocityIcon: React.ReactNode;
  if (rep.lowData) {
    velocityDetail = "Let's get more — share your review link";
    velocityIcon = <TrendingUp className="h-4 w-4" strokeWidth={1.5} />;
  } else if (velocity.trend === "up") {
    velocityDetail = `Up from ${velocity.prior} the 30 days before`;
    velocityIcon = <TrendingUp className="h-4 w-4 text-positive" strokeWidth={1.5} />;
  } else if (velocity.trend === "down") {
    velocityDetail = `${velocity.prior} came in the 30 days before — the share link brings them back`;
    velocityIcon = <TrendingDown className="h-4 w-4" strokeWidth={1.5} />;
  } else {
    velocityDetail = "Steady with the 30 days before";
    velocityIcon = <Minus className="h-4 w-4" strokeWidth={1.5} />;
  }

  return (
    <div className="mb-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
        Reputation
      </p>
      <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-[24px] font-normal leading-snug tracking-[-0.01em] text-warm-black sm:text-[30px]">
        {rep.verdict}
      </h1>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RatingTile rating={summary.averageRating} total={summary.totalReviews} />
        <MetricTile
          label="Response rate"
          value={`${summary.replyCoverage}%`}
          detail={rep.responseNote}
          icon={<MessageSquare className="h-4 w-4" strokeWidth={1.5} />}
        />
        <MetricTile
          label="Last 30 days"
          value={velocityValue}
          detail={velocityDetail}
          icon={velocityIcon}
        />
      </div>

      {rep.lovedFor.length > 0 && summary.averageRating >= 4 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-gray-muted">Customers love your</span>
          {rep.lovedFor.slice(0, 3).map((t) => (
            <span
              key={t.topic}
              className="rounded-full bg-accent-dim px-2.5 py-0.5 text-[12px] font-medium text-accent"
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      <p className="mt-4 text-[14px] leading-relaxed text-gray-muted">
        {gbpConnected
          ? "Draft a warm, on-brand reply for any review below — Google reviews publish straight to your listing."
          : `Draft a warm, on-brand reply for any review below, then copy it into ${copyDest}.`}
      </p>
    </div>
  );
}
