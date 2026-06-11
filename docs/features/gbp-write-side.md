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
- Agent tools: `update_business_hours`, `create_gbp_post`, `upload_gbp_photo` etc., governed like `update_section`.
- Surface GBP state in dashboard Content map ("what Google says about you") — read-back, not cached claims.
- Sequencing: after verified-live receipt (its verification rail) and review engine (shares scopes). 
- Done = proven: real hours change on a client GBP from chat, approval, API read-back verify, receipt line. Screenshot the listing.

## Research basis (dated)
2026-06-10 scouts: Whitespark intent split + ranking factors; LSA "Google Verified" consolidation Oct 2025 + reviews-via-GBP Jul 2025; agent login-wall findings (Atlas help docs).
