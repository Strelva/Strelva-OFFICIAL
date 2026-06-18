/**
 * Review reply drafting and anti-rejection linting.
 *
 * Based on the 12,752-reply rejection dataset (Apr–May 2026):
 * 67% of rejections trace to AI boilerplate, hashtags, or contact info.
 * This module produces filter-safe drafts by: generating with explicit
 * anti-boilerplate instructions, linting the output, regenerating once with
 * violations fed back, then falling to a deterministic template if both
 * AI paths fail or the lint still fires.
 *
 * Governance: review replies are customer-facing copy. They are ALWAYS
 * queued for human approval — never auto-published. The cron caller and
 * publishReviewReply both enforce this.
 */

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getRedis } from "./redis";
import type { TenantConfig } from "./types";

// ─── Banned phrases & patterns ────────────────────────────────────────────────
// Exported as data so tests can assert exhaustive coverage.

export const BANNED_PHRASES: readonly string[] = [
  "thrilled to hear",
  "kind words",
  "look forward to welcoming you back",
  "we're so glad",
  "we are so glad",
  "so glad to hear",
  "so pleased",
  "means the world",
  "means so much",
  "thank you for taking the time",
  "thank you for sharing your experience",
  "thank you for your feedback",
  "we appreciate your feedback",
  "we value your feedback",
  "your satisfaction is",
  "we strive to",
  "we pride ourselves",
  "we look forward to serving you",
  "hope to see you again soon",
  "hope to see you soon",
  "see you next time",
  "we will pass your comments along",
  "we have noted your feedback",
];

/** Regex for hashtag detection (matches #word patterns). */
const HASHTAG_RE = /#+\w+/;

/** Regex for embedded URLs (http/https/www). */
const URL_RE = /https?:\/\/|www\./i;

/** Regex for phone numbers (loose: 7+ digit clusters with optional separators). */
const PHONE_RE = /(\+?\d[\d\s.\-()]{6,}\d)/;

/** Regex for email addresses. */
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export interface LintResult {
  ok: boolean;
  violations: string[];
}

/**
 * Lint a candidate reply draft against Google's rejection criteria.
 *
 * Returns { ok: true } when the draft is clean, otherwise returns the
 * list of violation descriptions so they can be fed back to the model
 * for a second-pass regeneration.
 */
export function lintReplyDraft(text: string): LintResult {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      violations.push(`banned phrase: "${phrase}"`);
    }
  }

  if (HASHTAG_RE.test(text)) {
    violations.push("contains hashtag(s)");
  }
  if (URL_RE.test(text)) {
    violations.push("contains URL");
  }
  if (PHONE_RE.test(text)) {
    violations.push("contains phone number");
  }
  if (EMAIL_RE.test(text)) {
    violations.push("contains email address");
  }

  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations };
}

// ─── Near-duplicate detection ─────────────────────────────────────────────────

const RECENT_REPLIES_KEY_PREFIX = "review-replies:recent:";
const RECENT_REPLIES_MAX = 10;
const NEAR_DUPLICATE_RATIO_THRESHOLD = 0.85;

function recentRepliesKey(tenantId: string): string {
  return `${RECENT_REPLIES_KEY_PREFIX}${tenantId}`;
}

/**
 * Store a newly drafted reply in the per-tenant recent-replies list.
 * Capped at RECENT_REPLIES_MAX; oldest entries fall off.
 * TTL 90 days (matches event retention).
 */
export async function storeRecentReply(
  tenantId: string,
  replyText: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = recentRepliesKey(tenantId);
  const pipeline = redis.pipeline();
  pipeline.lpush(key, replyText);
  pipeline.ltrim(key, 0, RECENT_REPLIES_MAX - 1);
  pipeline.expire(key, 90 * 24 * 60 * 60);
  await pipeline.exec();
}

/**
 * Fetch up to RECENT_REPLIES_MAX recent drafted replies for a tenant.
 */
export async function getRecentReplies(tenantId: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  const items = await redis.lrange(recentRepliesKey(tenantId), 0, RECENT_REPLIES_MAX - 1);
  return items.filter((i): i is string => typeof i === "string");
}

/**
 * Naive word-overlap similarity ratio (Jaccard on word sets).
 * Scores 0–1; 1 = identical word sets.
 */
function similarityRatio(a: string, b: string): number {
  const wordsOf = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
    );
  const setA = wordsOf(a);
  const setB = wordsOf(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * True if `candidate` is too similar to any recent reply for this tenant.
 */
export async function isNearDuplicate(
  tenantId: string,
  candidate: string
): Promise<boolean> {
  const recent = await getRecentReplies(tenantId);
  return recent.some(
    (r) => similarityRatio(candidate, r) >= NEAR_DUPLICATE_RATIO_THRESHOLD
  );
}

// ─── Deterministic fallback template ─────────────────────────────────────────

/**
 * Claims-safe deterministic fallback. Uses only the reviewer name + star
 * rating — never invents job details or quotes. Short and specific enough
 * to pass the filter.
 */
export function buildDeterministicReply(
  reviewerName: string,
  rating: number
): string {
  const name = reviewerName.trim() || "there";
  if (rating >= 4) {
    return `${name}, appreciate you leaving this review. Glad your experience was good — it means a lot to us.`;
  }
  if (rating === 3) {
    return `${name}, appreciate the feedback. We'd like to understand what we can do better — please reach out directly.`;
  }
  // 1–2 stars
  return `${name}, thank you for the honest feedback. We'd like to make this right — please contact us directly so we can address it.`;
}

// ─── Google Review interface (mirrored from cron for portability) ─────────────

export interface GoogleReviewForReply {
  reviewId: string;
  reviewerName: string;
  rating: number; // 1–5
  comment?: string;
}

// ─── Draft generation ─────────────────────────────────────────────────────────

const DRAFT_PROMPT = (
  reviewerName: string,
  rating: number,
  comment: string,
  businessName: string
) => `You are writing a Google Business Profile review reply for ${businessName}.

Review details:
- Reviewer: ${reviewerName}
- Rating: ${rating}/5 stars
- Comment: "${comment}"

Write a reply that will NOT be rejected by Google's filter. Rules you MUST follow:
1. DO NOT use any of these phrases: "thrilled to hear", "kind words", "look forward to welcoming you back", "we're so glad", "thank you for taking the time", "thank you for sharing your experience", "we appreciate your feedback", "we value your feedback", "we strive to", "we pride ourselves", "hope to see you again soon".
2. DO NOT include hashtags, URLs, phone numbers, or email addresses.
3. Reference something specific from the review content.
4. Keep it to 2–3 sentences maximum.
5. Use a natural, conversational tone — not corporate.
6. Address the reviewer by first name only.
7. No greeting opener like "Dear" or "Hello". Start directly.`;

/**
 * Draft a review reply using Gemini, lint it, and optionally regenerate.
 * Falls back to a deterministic template if:
 * - Gemini is unavailable
 * - Both passes fail lint
 * - The draft is a near-duplicate of a recent reply
 *
 * Does NOT store the reply in recent-replies — the caller does that after
 * queueing (so aborted drafts don't pollute the near-duplicate list).
 */
export async function draftReviewReply(
  review: GoogleReviewForReply,
  tenantConfig: Pick<TenantConfig, "id" | "siteName">
): Promise<string> {
  const businessName = tenantConfig.siteName || tenantConfig.id;
  const comment = review.comment?.trim() || "(no comment left)";

  // ── First AI pass ──────────────────────────────────────────────────────────
  let firstDraft: string | null = null;
  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: DRAFT_PROMPT(review.reviewerName, review.rating, comment, businessName),
      maxOutputTokens: 200,
    });
    firstDraft = text.trim();
  } catch {
    // Gemini unavailable; fall through to deterministic template below.
  }

  if (firstDraft) {
    const firstLint = lintReplyDraft(firstDraft);
    if (firstLint.ok) {
      // Near-duplicate check
      const dup = await isNearDuplicate(tenantConfig.id, firstDraft);
      if (!dup) return firstDraft;
      // If near-duplicate, attempt a second Gemini pass with an explicit
      // "write something structurally different" prompt.
    }

    // ── Second AI pass (violations fed back) ──────────────────────────────
    const violationFeedback = firstLint.ok
      ? "The previous draft was too similar to a recent reply — write something structurally different."
      : `The previous draft contained these issues: ${firstLint.violations.join("; ")}. Fix them.`;

    try {
      const { text: secondText } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt:
          DRAFT_PROMPT(review.reviewerName, review.rating, comment, businessName) +
          `\n\nIMPORTANT FEEDBACK ON YOUR PREVIOUS ATTEMPT: ${violationFeedback}`,
        maxOutputTokens: 200,
      });
      const secondDraft = secondText.trim();
      const secondLint = lintReplyDraft(secondDraft);
      if (secondLint.ok) {
        const dup2 = await isNearDuplicate(tenantConfig.id, secondDraft);
        if (!dup2) return secondDraft;
      }
    } catch {
      // Second pass also failed; fall through to deterministic.
    }
  }

  // ── Deterministic fallback ─────────────────────────────────────────────────
  return buildDeterministicReply(review.reviewerName, review.rating);
}
