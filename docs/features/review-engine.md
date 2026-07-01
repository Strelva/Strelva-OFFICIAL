# Review Engine (filter-safe, verified live)

Picked 2026-06-10 (features round). Founder reason: retention-spine sweep; ICP = Angi-refugee plumbing/HVAC.

**Type:** harness + proof. **Shape:** delegate-and-review (drafts → owner/Jacob approval → publish → verify).
**Asset:** existing Google/Yelp review polling crons + per-tenant review history; GBP OAuth already in place (read-side).

## What it is
1. **Reply drafting** tuned to dodge Google's rejection filter: no boilerplate ("thrilled to hear", "kind words", "welcome you back"), no hashtags, no contact details, no duplicates — each reply references the specific job/review content.
2. **Publication via GBP API with verification**: confirm the reply is actually live (re-read via API), because rejections are silent. Verified state feeds the verified-live receipt.
3. **Recency cadence**: review-request nudges (link sent post-job, later wired to the photo pipeline) to keep review velocity up — review recency is the fastest-rising local ranking factor (rank #93 → #11, Whitespark 2026).

## Why the user's own AI can't
Drafting is commoditized; *landing* is not. Without API access an owner cannot even see that Google rejected their reply. 67% of rejections trace to AI boilerplate (12,752-reply dataset, Apr–May 2026). Also: Apr 2026 Gemini-powered GBP enforcement wave — naive automation risks suspension; governance + human sign-off is the safety layer.

## Frame / quotable
"Google silently throws away AI review replies — twelve thousand last spring. Ours are written to pass, and we check that every one is live."

## Build notes
- Extend `poll-google-reviews` cron: new review → draft event in review queue (governance: replies are customer-facing copy → always owner/Jacob approval, never auto).
- GBP reply publish needs Business Profile API write scope — new OAuth scope + token storage in `connections.ts`.
- Anti-boilerplate: maintain a banned-phrase list from the rejection dataset; vary structure per reply; lint drafts before queueing.
- Done = proven: a real review on GLDF gets a drafted, approved, published, re-read-verified reply; show the API read-back. Rejection path tested with a deliberately boilerplate reply on a test profile if feasible — otherwise mark unproven.

## Research basis (dated)
2026-06-10 scouts: localsearchforum rejection dataset; Whitespark 2026 ranking factors (recency #11); GBP suspension wave Apr 2026; SEL on Google's own draft-grade AI replies (Mar 2026).

---

## Review intelligence (shipped 2026-06-30)

A dependency-free analysis layer over each tenant's reviews, ported and typed
from the archived OWSH Systems `sentiment-analyzer` + review-intelligence
services. Runs synchronously with **no model call**, so it is cheap enough to
compute inside the weekly report, the Reviews dashboard, and the admin tenant
page on every render.

### The product rule (admin vs client)
Audit-style *issues are admin-side only*; the client sees good numbers as good
numbers. The split is enforced in code by two separate return shapes, so a
client surface cannot accidentally import the concerns/queue:

- **`getClientReviewSummary(reviews)`** → positive, owner-facing only: average
  rating, five-star count, new-this-period, rating trend, reply coverage, and
  the praise themes ("customers love your service"). No concerns, no queue.
- **`getAdminReviewIntelligence(reviews)`** → the full operator picture:
  sentiment breakdown, mean sentiment, the urgent-first **needs-a-reply queue**,
  unanswered-negative count, emerging concerns, and an at-risk flag.

### Files
- `src/lib/reviews/sentiment.ts` — lexicon sentiment engine: negation- and
  intensifier-aware scoring (resets scope at sentence boundaries), plus
  topic / keyword / urgency / emotion extraction. `analyzeReview(text, rating)`
  is the per-review entry point; `TOPIC_LABELS` maps topics to owner-facing copy.
- `src/lib/reviews/intelligence.ts` — the two split views above, built on the
  sentiment engine. Windowed (default 30 days; the weekly report uses 7).

### Where it surfaces
- **Client — weekly report** (`src/lib/weekly-brief.ts`): the win column now
  leads with real review wins ("3 new 5-star reviews this week", "Customers love
  your service and cleanliness") from the client summary, falling back to the
  raw event count when there is nothing to analyze.
- **Client — Reviews dashboard** (`ReviewsPanel.tsx`): the header leads with the
  positive summary — rating, a "N new this month" chip, and the praise line.
- **Admin — tenant page** (`src/app/admin/tenants/[id]/ReviewIntelPanel.tsx`):
  the operator view — sentiment split, needs-a-reply queue, unanswered
  negatives, emerging concerns, at-risk badge.
- **Admin — API** (`GET /api/admin/tenants/[id]/reviews-intel`): the admin
  intelligence as JSON, super-admin gated.

### Reply drafting boost
`draftReviewReply` (`src/lib/review-replies.ts`) now feeds a one-line
sentiment/topic hint into the Gemini prompt so a reply acknowledges the reviewer's
*actual* concern or praise ("the reviewer's main concern is wait times —
acknowledge it directly"). This is a filter-safe way to be specific; the
anti-boilerplate lint, near-duplicate check, deterministic fallback, and the
**always-queue-for-approval** governance are unchanged.

## Issue prioritization (shipped 2026-06-30)

`src/lib/audit/prioritize.ts` (`prioritizeIssues(AuditResult)`) ranks the
failing/warning checks the audit engine already produced into one ordered
"fix first" action list — a pure transform, **no new store or cron** (audit
history stays owned by `scan.ts` / `scan-store`). Ported and de-scoped from the
OWSH issue-prioritization engine; revenue-impact modeling was intentionally left
out. Admin-only:
- `POST /api/admin/scan` now returns `prioritizedIssues` alongside the category
  detail.
- The admin `SiteScan` view renders it as a priority-badged "Fix first" list.
The client dashboard still shows only the grade/score — never the raw issues.

### Tests
`src/__tests__/review-intelligence.test.ts` (sentiment + both intelligence
views, incl. the client-safe-shape assertion) and
`src/__tests__/audit-prioritize.test.ts` (ranking, priority derivation, band
counts). The existing `review-replies.test.ts` still passes with the sentiment
hint in place.
