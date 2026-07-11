"use client";

import { useState, useTransition } from "react";
import type { AdminReviewIntelligence } from "@/lib/reviews/intelligence";
import { draftReviewReplyForReview } from "./review-actions";

/**
 * Operator view of a client's reputation — the admin-only side of the review
 * intelligence. Surfaces the urgent-first "needs a reply" queue, sentiment
 * split, emerging concerns, and the at-risk flag. The client never sees any of
 * this; their dashboard shows only the positive summary.
 *
 * Each queued review carries an inline "Draft reply" that routes through the
 * governed `review_reply_draft` path (see review-actions.ts) — it queues a
 * PENDING draft for approval, never publishes to Google directly.
 */

const URGENCY_PILL: Record<"high" | "medium" | "low", string> = {
  high: "bg-critical0/15 text-critical border-critical0/30",
  medium: "bg-warning0/15 text-warning border-warning0/30",
  low: "bg-gray-bg text-gray-muted border-glass-border",
};

type DraftState = "idle" | "drafting" | "drafted" | "error";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="tabular-nums text-warning" aria-label={`${rating} stars`}>
      {"★".repeat(Math.max(0, Math.min(5, Math.round(rating))))}
      <span className="text-gray-faint">{"★".repeat(5 - Math.max(0, Math.min(5, Math.round(rating))))}</span>
    </span>
  );
}

function DraftReplyButton({ tenantId, reviewId }: { tenantId: string; reviewId: string }) {
  const [state, setState] = useState<DraftState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setState("drafting");
    setMessage(null);
    startTransition(async () => {
      const res = await draftReviewReplyForReview(tenantId, reviewId).catch(() => null);
      if (res?.ok && res.drafted) {
        setState("drafted");
        setMessage("Drafted. Approve in the queue");
      } else if (res?.ok && res.reason === "already_drafted") {
        setState("drafted");
        setMessage("Already drafted, in the queue");
      } else if (res?.ok && res.reason === "already_replied") {
        setState("drafted");
        setMessage("Already replied");
      } else {
        setState("error");
        setMessage("Draft failed. Try again");
      }
    });
  }

  if (state === "drafted") {
    return <span className="shrink-0 text-[11px] text-positive">{message} ✓</span>;
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        onClick={onClick}
        disabled={pending || state === "drafting"}
        className="rounded-md border border-glass-border bg-gray-bg px-2 py-0.5 text-[11px] font-medium text-warm-white transition-colors hover:border-warm-white/25 disabled:opacity-50"
      >
        {state === "drafting" ? "Drafting…" : "Draft reply"}
      </button>
      {state === "error" && message && (
        <span className="text-[10px] text-critical">{message}</span>
      )}
    </span>
  );
}

export function ReviewIntelPanel({
  intel,
  tenantId,
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
                    <DraftReplyButton tenantId={tenantId} reviewId={flag.reviewId} />
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
