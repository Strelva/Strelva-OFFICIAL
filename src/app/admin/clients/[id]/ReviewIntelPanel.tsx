"use client";

import type { AdminReviewIntelligence } from "@/lib/reviews/intelligence";
import { StTextButton } from "@/components/ui/strelva/Kit";

/**
 * Operator view of a client's reputation — the admin-only side of the review
 * intelligence. Surfaces the urgent-first "needs a reply" queue, sentiment
 * split, emerging concerns, and the at-risk flag. The client never sees any of
 * this; their dashboard shows only the positive summary.
 *
 * Reviews remain available for support inspection. Drafting and publication
 * require ordinary owner or agency access in the business workspace.
 */

const URGENCY_PILL: Record<"high" | "medium" | "low", string> = {
  high: "bg-critical0/15 text-critical border-critical0/30",
  medium: "bg-warning0/15 text-warning border-warning0/30",
  low: "bg-gray-bg text-gray-muted border-glass-border",
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="tabular-nums text-warning" aria-label={`${rating} stars`}>
      {"★".repeat(Math.max(0, Math.min(5, Math.round(rating))))}
      <span className="text-gray-faint">{"★".repeat(5 - Math.max(0, Math.min(5, Math.round(rating))))}</span>
    </span>
  );
}

export function ReviewIntelPanel({
  intel,
}: {
  intel: AdminReviewIntelligence;
  tenantId: string;
}) {
  const { totalReviews, sentimentBreakdown, needsResponse, unansweredNegative, concerns, atRisk, atRiskReason } = intel;

  return (
    <div id="reviews-operator" className="rounded-2xl border border-glass-border bg-glass p-5 scroll-mt-24">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Reviews: operator view</h2>
          <p className="mt-0.5 text-xs text-gray-muted">
            {totalReviews === 0
              ? "No reviews pulled in yet."
              : `${totalReviews} review${totalReviews === 1 ? "" : "s"} · ${sentimentBreakdown.positive} positive · ${sentimentBreakdown.negative} negative`}
          </p>
        </div>
        {atRisk && (
          <span
            className="shrink-0 rounded-full border border-critical0/30 bg-critical0/15 px-2.5 py-1 text-[11px] font-medium text-critical"
            title={atRiskReason}
          >
            At risk
          </span>
        )}
      </div>

      {totalReviews > 0 && (
        <>
          {atRiskReason && <p className="mt-2 text-[11px] text-critical/90">{atRiskReason}</p>}

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-warm-white">Needs a reply</h3>
              <span className="text-[11px] text-gray-faint">
                {needsResponse.length} pending · {unansweredNegative} unanswered negative
              </span>
            </div>

            {needsResponse.length === 0 ? (
              <p className="mt-2 text-xs text-gray-muted">All caught up. Nothing waiting on a reply.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {needsResponse.slice(0, 5).map((flag) => (
                  <li key={flag.reviewId} className="flex items-start gap-2.5 text-xs">
                    <span
                      className={`mt-px shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${URGENCY_PILL[flag.urgency]}`}
                    >
                      {flag.urgency}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-warm-white">{flag.author}</span>{" "}
                      <Stars rating={flag.rating} />
                      <span className="block text-[11px] text-gray-muted">{flag.reason}</span>
                    </span>
                    <StTextButton href="/workspace">Open workspace</StTextButton>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {concerns.length > 0 && (
            <div className="mt-4 border-t border-glass-border pt-3">
              <h3 className="text-xs font-semibold text-warm-white">Emerging concerns</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {concerns.map((c) => (
                  <span
                    key={c.topic}
                    className="rounded-full border border-glass-border bg-gray-bg px-2 py-0.5 text-[11px] text-gray-muted"
                  >
                    {c.label} · {c.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
