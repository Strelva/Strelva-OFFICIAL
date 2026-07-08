# GBP Write-Side — the Google listing as half the product

Picked 2026-06-10 (features round). Founder reason: retention-spine sweep; biggest build accepted knowingly. ICP = Angi-refugee plumbing/HVAC.

**Type:** asset + harness (credentialed territory the owner's agent can't reach). **Shape:** chat as entry ramp into the existing dashboard + governance queue.
**Asset:** existing Google OAuth + connections plumbing (read-side today), tenant config, governance layer.

## What it is
Manage the client's Google Business Profile from the same chat + approval loop that manages the site: hours, services, photos, Google Posts, attributes, holiday hours. "Update my hours" changes the site AND the listing in one request. GBP changes flow through governance (facts auto-approve, copy queues) and feed the verified-live receipt.

## Why this moves the product to the leverage
Measured (Whitespark May 2025): emergency/near-me queries show the local pack ~93% vs AI Overviews ~15% — the map pack wins the 7am moment. Since Jul/Oct 2025, GBP feeds local pack + LSA rank/reviews + AI citations: one artifact, three surfaces. Consumer agents are blocked at the login/2FA wall (Atlas can't touch credentials; sensitive-site pauses) — credentialed write access with an accountable human is structurally defensible.

## Frame / quotable
Reframes the offer from "website care" to "the whole way you're found." Quotable: "The 7am emergency search is won on your Google listing. We run it like we run your site — nothing changes without your OK, everything verified live."

## Build notes
- Business Profile APIs (locations, posts, media) — new scopes on the existing Google OAuth; quota/eligibility check early (API access approval can gate this — verify before promising dates).
- Agent tools: `update_business_hours`, `create_gbp_post`, `upload_gbp_photo` etc., governed like `update_section`. (Built — see "Shared tool factory" below.)
- Surface GBP state in dashboard Content map ("what Google says about you") — read-back, not cached claims.
- Sequencing: after verified-live receipt (its verification rail) and review engine (shares scopes). 
- Done = proven: real hours change on a client GBP from chat, approval, API read-back verify, receipt line. Screenshot the listing.

## Shared tool factory (B6, 2026-07-08)
The three GBP write tools (`create_gbp_post`, `update_business_hours`, `upload_gbp_photo`) are now defined ONCE in a shared factory `buildGbpTools` in `src/lib/agent-shared.ts`. Both AI agent paths call it — the streaming chat route (`src/app/api/agent/route.ts`) and the background executor (`src/lib/agent-executor.ts`) — so their schema, metadata, and return shape can't drift. Each path injects its own post-queue side effect via hooks: the route records a streamed result card (`recordActionResult`), the executor sends a Slack ping. Previously each path hand-rolled its own copies which HAD drifted (the executor was missing `upload_gbp_photo` entirely and its `create_gbp_post` schema/metadata differed); the factory closed that gap. Do NOT hand-roll a second copy — extend the factory.

**Safety invariant (unchanged):** the tools NEVER write to Google directly. They queue a `status:"pending"` event (`metadata.kind` = `gbp_post_draft` / `gbp_hours_draft` / `gbp_photo_draft`); the real write happens on owner approval in `src/lib/event-actions.ts`.

**New — activity feed:** on a SUCCESSFUL approval-write, `event-actions.ts` logs a `gbp-post` / `gbp-hours` / `gbp-photo` activity entry (actor `admin`) so published GBP actions appear in the owner's "What Strelva did for you" feed (`src/lib/activity-feed.ts`). Previously GBP posts never reached that feed — a known gap, now closed.

## Research basis (dated)
2026-06-10 scouts: Whitespark intent split + ranking factors; LSA "Google Verified" consolidation Oct 2025 + reviews-via-GBP Jul 2025; agent login-wall findings (Atlas help docs).
