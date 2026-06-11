# Emergency Visibility Tracker

Picked 2026-06-10 (features round). Founder reason: retention-spine sweep; chosen over the public Buffalo Visibility Index (killed, see judgments ledger). ICP = Angi-refugee plumbing/HVAC.

**Type:** asset (accumulating position history nobody else has) + proof. **Shape:** proactive feed (report section) + discovery artifact section.
**Asset:** ai-visibility scorecard script (`scripts/ai-visibility.ts`) as the seed; weekly report as the delivery rail; tenant config for trade + service towns.

## What it is
Weekly, per client: where do you appear for the queries that win jobs — "emergency plumber {town}", "{trade} near me", "water heater repair {town}" — across (a) Google local pack, (b) AI answers (AI Overview / ChatGPT / Perplexity), versus **three named local competitors**. Tracked over time: "You moved #7 → #3 in Cheektowaga this month." Same instrument runs inside the gated discovery report as the sting section for prospects.

## Why the user's own AI can't
A one-off "where do I rank" prompt is trivial; the value is the **longitudinal series** (position history = non-derivable data after week 2), the competitor set, and honesty about intent split. Research flagged this instrument as nonexistent for trades emergency queries (only vendor opinion fills the space).

## Frame / quotable
Report's primary line when it moves: position change vs named competitor. Quotable: "Someone searched 'emergency plumber' in your town this week. Here's who they saw — and where you were."

## Honesty rails (from research)
- Local pack owns emergency intent (~93%) vs AI (~15%) — never sell this as "ChatGPT replaced Google"; report both surfaces, weighted honestly.
- Rank checks are location-sensitive; declare methodology (queried from fixed proxy/locale) and keep it consistent — trend integrity beats absolute precision.

## Build notes
- Extend ai-visibility script into a per-tenant cron writing `visibility_snapshot` events; queries derived from tenant trade + towns; competitor set in tenant config.
- Costs: SERP checks need a SERP API or careful scraping — keep per-tenant cost inside the <20%-of-price rule.
- Report: one section, plain English, only when there's signal (a move, a gap, a win); discovery report reuses the same renderer.
- Done = proven: 2+ weekly snapshots for a real tenant rendering a trend line in a real report; discovery version rendering for a prospect domain.

## Research basis (dated)
2026-06-10 scouts: Whitespark AI-Overview intent study (May 2025); BrightLocal LCRS 2026 (45% AI usage, self-reported); "no trades-specific instrument exists" gap flag.
