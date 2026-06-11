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
