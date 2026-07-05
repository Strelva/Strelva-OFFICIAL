/**
 * Scaffold Web reviews-showcase block for custom-repo client sites.
 *
 * Renders a client's reviews as a clean card grid with star ratings and a source
 * badge — the block that puts the "4.9★ / 40 reviews" social proof ON the live
 * client site, not just in the dashboard. Pass reviews as props (fetch them
 * server-side however you like and hand them in); this component only renders.
 *
 * Server-safe on purpose: NO "use client". It renders the same deterministic
 * markup on the server and the client, so there is no hydration mismatch and no
 * client JS is shipped for it. Self-contained: imports only React (no
 * `@/lib/...`), a true single-file drop-in — the same contract the other starter
 * components follow.
 *
 * Data note: the v1 contract has NO public reviews endpoint today (the control
 * plane's `/api/reviews` is authenticated/admin-side), so this block is
 * intentionally prop-driven. The `ScaffoldReview` shape mirrors the control
 * plane's `ReviewItem` so a future public feed can drop straight in.
 *
 * Honesty / fail-silent rules (never risk the client site):
 *   - A non-array or empty `reviews` renders the empty state (or nothing) — it
 *     never throws.
 *   - When there are no reviews and no `emptyMessage` is passed it renders
 *     nothing, so a fresh site never shows a "no reviews yet" line that would
 *     undercut its own social proof.
 *   - Ratings are clamped to 0–5; a garbage rating can't render 200 stars.
 *
 * Usage (server component, e.g. a section on the home page):
 *
 *   import { ScaffoldReviews } from "@/components/ScaffoldReviews";
 *
 *   <ScaffoldReviews
 *     title="What our clients say"
 *     reviews={[
 *       { author: "Dana R.", rating: 5, text: "Best haircut in Buffalo.",
 *         date: "2024-05-01", source: "google" },
 *     ]}
 *   />
 */

import type { ReactElement } from "react";

/** One review. Mirrors the control plane's `ReviewItem` (source/author/rating/text/date). */
export interface ScaffoldReview {
  author: string;
  rating: number;
  text: string;
  /** ISO date string (e.g. "2024-05-01"). Optional; rendered when present. */
  date?: string;
  /** e.g. "google" | "yelp" | "manual" — shown as a badge. Optional. */
  source?: string;
}

/** Aggregate social-proof numbers. */
export interface ReviewSummary {
  count: number;
  /** Mean rating, rounded to one decimal (e.g. 4.9). 0 when there are none. */
  average: number;
  hasReviews: boolean;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Clamp any number to an integer 0–5. Never throws. */
export function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return 0;
  return Math.min(5, Math.max(0, Math.round(rating)));
}

/**
 * Compute the aggregate rating + count for the social-proof header. Pure +
 * exported so it is unit-testable without rendering. A non-array input is
 * treated as empty.
 */
export function summarizeReviews(reviews: ScaffoldReview[] | undefined | null): ReviewSummary {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { count: 0, average: 0, hasReviews: false };
  }
  const valid = reviews.filter((r) => r && Number.isFinite(r.rating));
  if (valid.length === 0) return { count: reviews.length, average: 0, hasReviews: true };
  const sum = valid.reduce((acc, r) => acc + r.rating, 0);
  const average = Math.round((sum / valid.length) * 10) / 10;
  return { count: reviews.length, average, hasReviews: true };
}

/** Split a rating into filled/empty star counts (total 5). Pure + testable. */
export function starParts(rating: number): { full: number; empty: number } {
  const full = clampRating(rating);
  return { full, empty: 5 - full };
}

/** Human label for a source id ("google" → "Google"). Empty/unknown → "". */
export function formatSource(source: string | undefined): string {
  const s = source?.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Deterministic, locale-independent date label ("2024-05-01" → "May 2024").
 * Uses UTC getters + a fixed month table so server and client agree (no
 * hydration drift). Falls back to the raw string if it can't parse.
 */
export function formatReviewDate(date: string | undefined): string {
  const raw = date?.trim();
  if (!raw) return "";
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A row of 5 stars for `rating`, labelled for screen readers. */
function Stars({ rating }: { rating: number }): ReactElement {
  const { full, empty } = starParts(rating);
  return (
    <span role="img" aria-label={`${full} out of 5 stars`}>
      <span aria-hidden="true">{"★".repeat(full)}{"☆".repeat(empty)}</span>
    </span>
  );
}

export interface ScaffoldReviewsProps {
  reviews: ScaffoldReview[];
  /** Heading above the grid. Omit for no heading. */
  title?: string;
  /**
   * Show the aggregate "4.9 ★ · 40 reviews" line above the grid. Default true.
   */
  showSummary?: boolean;
  /** Cap how many cards render (newest-first order is the caller's job). */
  maxItems?: number;
  /**
   * Shown when there are no reviews. If omitted, an empty list renders NOTHING
   * (so a fresh site never advertises that it has no reviews yet).
   */
  emptyMessage?: string;
  /** Class hooks so you style it with the client site's own CSS. */
  className?: string;
  titleClassName?: string;
  summaryClassName?: string;
  gridClassName?: string;
  cardClassName?: string;
  starsClassName?: string;
  textClassName?: string;
  authorClassName?: string;
  sourceClassName?: string;
}

/**
 * Renders a review card grid with stars + a source badge, plus an optional
 * aggregate social-proof line. Server-safe, self-contained, fail-silent.
 */
export function ScaffoldReviews({
  reviews,
  title,
  showSummary = true,
  maxItems,
  emptyMessage,
  className,
  titleClassName,
  summaryClassName,
  gridClassName,
  cardClassName,
  starsClassName,
  textClassName,
  authorClassName,
  sourceClassName,
}: ScaffoldReviewsProps): ReactElement | null {
  const list = Array.isArray(reviews) ? reviews : [];
  const summary = summarizeReviews(list);

  if (!summary.hasReviews) {
    if (!emptyMessage) return null;
    return (
      <section className={className}>
        {title ? <h2 className={titleClassName}>{title}</h2> : null}
        <p role="status">{emptyMessage}</p>
      </section>
    );
  }

  const shown = typeof maxItems === "number" && maxItems >= 0 ? list.slice(0, maxItems) : list;

  return (
    <section className={className}>
      {title ? <h2 className={titleClassName}>{title}</h2> : null}

      {showSummary ? (
        <p className={summaryClassName} aria-label={`Rated ${summary.average} out of 5 from ${summary.count} reviews`}>
          <span aria-hidden="true">
            {summary.average.toFixed(1)} ★ · {summary.count} review{summary.count === 1 ? "" : "s"}
          </span>
        </p>
      ) : null}

      <ul className={gridClassName} style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {shown.map((review, i) => {
          const source = formatSource(review.source);
          const when = formatReviewDate(review.date);
          return (
            <li key={i} className={cardClassName}>
              <div className={starsClassName}>
                <Stars rating={review.rating} />
              </div>
              {review.text ? <p className={textClassName}>{review.text}</p> : null}
              <p className={authorClassName}>
                {review.author}
                {when ? <span> · {when}</span> : null}
              </p>
              {source ? <span className={sourceClassName}>{source}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
