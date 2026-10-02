# Job-Photo Pipeline

Picked 2026-06-10 (features round, growth side). ICP = Angi-refugee plumbing/HVAC.

**Type:** travel + asset (every job becomes content + a review; site visibly grows). **Shape:** delegate-and-review from the owner's phone.
**Asset:** Vercel Blob uploads, agent + governance, custom-repo gallery sections, review-request rail (pairs with review engine).

## What it is
Tech or owner texts/emails before-after photos from the truck (MMS or simple upload link). Strelva drafts: a gallery addition on the site, a Google Post, and a review request to that customer. Owner gets one approval tap. The site gains fresh, real work weekly — and each job feeds review velocity.

## Why the user's own AI can't / why it retains
It's not the drafting — it's the **pipeline ownership**: photos land somewhere durable, publish to two surfaces, verification confirms they're live, and the receipt shows it ("3 jobs added this week, 1 new review came from Tuesday's water heater"). New work the owner never did before — not automated cost-cutting (Duolingo rule). This is the feature a client shows another contractor — distribution baked in.

## Frame / quotable
"Text us the job photos from the truck. By Friday they're on your site, on your Google listing, and the customer got a review ask — you just tapped approve."

## Build notes
- Intake: start with email-to-tenant-address or a magic-link upload page (MMS via Twilio later — cost + A2P registration friction; don't block on it).
- Permission line: photos of customer property — approval gate must include "OK to publish?" copy; never auto-publish.
- Sequencing: after review engine (shares the review-ask rail) — but a minimal version (photos → gallery draft → approve) can ship earlier.
- Done = proven: real photo through the pipeline to a live gallery + GBP post + review request sent; receipt line rendered.

## Research basis (dated)
2026-06-10 scouts: review recency #11 ranking factor; trades content gap; trust-headwind finding (owner approves everything from phone).
