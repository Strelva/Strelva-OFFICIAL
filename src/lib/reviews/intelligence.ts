/**
 * Review intelligence — aggregates a tenant's reviews into two deliberately
 * separated views:
 *
 *  • getClientReviewSummary  → the positive, owner-facing numbers ("customers
 *    love your service", "4.8★, 3 new this week"). NEVER exposes concerns,
 *    negative themes, or the response queue. Safe to render on the client
 *    dashboard and drop into the weekly report.
 *
 *  • getAdminReviewIntelligence → the full operational picture for Jacob /
 *    super-admins: sentiment breakdown, unanswered negatives, the ordered
 *    "needs a reply" queue, and emerging concerns. Admin surfaces only.
 *
 * This split is the product rule: issues are admin-side; the client sees good
 * numbers as good numbers. Built on the dependency-free `sentiment` engine, so
 * it runs synchronously with no model call.
 */

import type { ReviewItem } from "../types";
import {
  analyzeReview,
  TOPIC_LABELS,
  type ReviewAnalysis,
  type ReviewTopic,
  type SentimentLabel,
  type Urgency,
} from "./sentiment";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ThemeCount {
  topic: ReviewTopic;
  label: string;
  count: number;
}

export interface ClientReviewSummary {
  totalReviews: number;
  /** Average star rating, one decimal. 0 when there are no reviews. */
  averageRating: number;
  fiveStarCount: number;
  /** Reviews received within the trailing window (default 30 days). */
  newThisPeriod: number;
  newFiveStarThisPeriod: number;
  /** Direction of the average rating vs the prior window. */
  ratingTrend: "up" | "down" | "flat";
  /** Share of reviews the owner has replied to, 0–100. */
  replyCoverage: number;
  /** What customers praise most — positive themes only. */
  lovedFor: ThemeCount[];
  /** One-line owner-facing headline, e.g. "27 reviews · 4.8★ · 3 new this week". */
  headline: string;
}

export interface AdminReviewFlag {
  reviewId: string;
  author: string;
  rating: number;
  date: string;
  sentiment: SentimentLabel;
  urgency: Urgency;
  topics: ReviewTopic[];
  replied: boolean;
  /** Why this review is in the queue. */
  reason: string;
}

export interface AdminReviewIntelligence {
  totalReviews: number;
  sentimentBreakdown: Record<SentimentLabel, number>;
  /** Mean sentiment score across all reviews, -1…1. */
  averageSentiment: number;
  /** Reviews that warrant an owner reply, urgent-first then most-recent. */
  needsResponse: AdminReviewFlag[];
  /** Negative/critical reviews with no reply yet. */
  unansweredNegative: number;
  /** Emerging negative themes. */
  concerns: ThemeCount[];
  /** True when recent signal suggests reputation is slipping. */
  atRisk: boolean;
  atRiskReason?: string;
}

interface Analyzed {
  review: ReviewItem;
  analysis: ReviewAnalysis;
  time: number;
}

function analyzeAll(reviews: ReviewItem[]): Analyzed[] {
  return reviews.map((review) => ({
    review,
    analysis: analyzeReview(review.text || "", review.rating || 0),
    time: new Date(review.date).getTime() || 0,
  }));
}

function isPraise(a: Analyzed): boolean {
  return a.review.rating >= 4 || a.analysis.sentiment.label === "positive";
}

function isCritical(a: Analyzed): boolean {
  return a.review.rating > 0 && a.review.rating <= 2
    ? true
    : a.analysis.sentiment.label === "negative";
}

function topThemes(items: Analyzed[], limit: number): ThemeCount[] {
  const counts = new Map<ReviewTopic, number>();
  for (const item of items) {
    for (const topic of item.analysis.topics) {
      counts.set(topic, (counts.get(topic) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic, count]) => ({ topic, label: TOPIC_LABELS[topic], count }));
}

function averageRating(items: Analyzed[]): number {
  const rated = items.filter((i) => i.review.rating > 0);
  if (rated.length === 0) return 0;
  const sum = rated.reduce((acc, i) => acc + i.review.rating, 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

/**
 * The positive, client-facing summary. Contains no concerns or negative
 * signal by design — the client sees good numbers as good numbers.
 */
export function getClientReviewSummary(
  reviews: ReviewItem[],
  windowDays = 30,
  now: number = Date.now(),
): ClientReviewSummary {
  const analyzed = analyzeAll(reviews);
  const windowStart = now - windowDays * DAY_MS;
  const priorStart = now - 2 * windowDays * DAY_MS;

  const current = analyzed.filter((a) => a.time >= windowStart);
  const prior = analyzed.filter((a) => a.time >= priorStart && a.time < windowStart);

  const total = reviews.length;
  const avg = averageRating(analyzed);
  const fiveStar = analyzed.filter((a) => a.review.rating === 5).length;
  const repliedCount = reviews.filter((r) => Boolean(r.reply)).length;
  const replyCoverage = total > 0 ? Math.round((repliedCount / total) * 100) : 0;

  const currentAvg = averageRating(current);
  const priorAvg = averageRating(prior);
  let ratingTrend: ClientReviewSummary["ratingTrend"] = "flat";
  if (current.length > 0 && prior.length > 0) {
    if (currentAvg - priorAvg >= 0.2) ratingTrend = "up";
    else if (priorAvg - currentAvg >= 0.2) ratingTrend = "down";
  } else if (current.length > 0 && prior.length === 0 && currentAvg >= 4) {
    ratingTrend = "up";
  }

  const lovedFor = topThemes(analyzed.filter(isPraise), 3);

  const newThisPeriod = current.length;
  const windowLabel = windowDays <= 7 ? "week" : windowDays <= 31 ? "month" : `${windowDays} days`;
  const headlineParts = [`${total} review${total === 1 ? "" : "s"}`];
  if (avg > 0) headlineParts.push(`${avg.toFixed(1)}★`);
  if (newThisPeriod > 0) headlineParts.push(`${newThisPeriod} new this ${windowLabel}`);

  return {
    totalReviews: total,
    averageRating: avg,
    fiveStarCount: fiveStar,
    newThisPeriod,
    newFiveStarThisPeriod: current.filter((a) => a.review.rating === 5).length,
    ratingTrend,
    replyCoverage,
    lovedFor,
    headline: headlineParts.join(" · "),
  };
}

/**
 * The full operational picture for admin surfaces. Includes the concerns and
 * the response queue the client never sees.
 */
export function getAdminReviewIntelligence(
  reviews: ReviewItem[],
  windowDays = 30,
  now: number = Date.now(),
): AdminReviewIntelligence {
  const analyzed = analyzeAll(reviews);

  const sentimentBreakdown: Record<SentimentLabel, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
    mixed: 0,
  };
  let sentimentSum = 0;
  for (const a of analyzed) {
    sentimentBreakdown[a.analysis.sentiment.label]++;
    sentimentSum += a.analysis.sentiment.score;
  }
  const averageSentiment =
    analyzed.length > 0 ? Math.round((sentimentSum / analyzed.length) * 1000) / 1000 : 0;

  const urgencyRank: Record<Urgency, number> = { high: 0, medium: 1, low: 2 };
  const needsResponse: AdminReviewFlag[] = analyzed
    .filter((a) => a.analysis.needsResponse && !a.review.reply)
    .sort((x, y) => {
      const u = urgencyRank[x.analysis.urgency] - urgencyRank[y.analysis.urgency];
      return u !== 0 ? u : y.time - x.time;
    })
    .map((a) => ({
      reviewId: a.review.id,
      author: a.review.author,
      rating: a.review.rating,
      date: a.review.date,
      sentiment: a.analysis.sentiment.label,
      urgency: a.analysis.urgency,
      topics: a.analysis.topics,
      replied: Boolean(a.review.reply),
      reason:
        a.analysis.urgency === "high"
          ? "Urgent: needs a reply today"
          : a.review.rating > 0 && a.review.rating <= 2
            ? "Low rating, no reply yet"
            : a.analysis.sentiment.label === "negative"
              ? "Negative sentiment, no reply yet"
              : "Worth a reply",
    }));

  const unansweredNegative = analyzed.filter((a) => isCritical(a) && !a.review.reply).length;
  const concerns = topThemes(analyzed.filter(isCritical), 3);

  const windowStart = now - windowDays * DAY_MS;
  const recentCritical = analyzed.filter((a) => a.time >= windowStart && isCritical(a)).length;
  const hasHighUrgency = analyzed.some((a) => a.analysis.urgency === "high" && !a.review.reply);

  let atRisk = false;
  let atRiskReason: string | undefined;
  if (hasHighUrgency) {
    atRisk = true;
    atRiskReason = "An urgent review is unanswered";
  } else if (recentCritical >= 2) {
    atRisk = true;
    atRiskReason = `${recentCritical} critical reviews in the last ${windowDays} days`;
  }

  return {
    totalReviews: reviews.length,
    sentimentBreakdown,
    averageSentiment,
    needsResponse,
    unansweredNegative,
    concerns,
    atRisk,
    atRiskReason,
  };
}
