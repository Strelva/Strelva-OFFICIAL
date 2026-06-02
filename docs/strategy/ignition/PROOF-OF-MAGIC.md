# Proof-of-Magic — AnswerRank "AI Visibility Score"

**The one-input → one-wow:** type a business → get an A–F grade for how visible it is to AI search, with a blunt verdict and the top fix. < 30 seconds, no signup.

> example.com → **F (28/100)** · "at high risk of being invisible to AI search"
> Anchor Bar → **D (68/100)** · found schema.org Restaurant, flagged missing address + no FAQ

## Why this is the wow (not a feature list)
Every SMB owner *feels* the anxiety that "AI is taking over search" but has no way to see where they stand. The grade makes an invisible threat suddenly concrete and personal — and the fix is obvious and ownable. That's the share trigger: an owner or the marketer/consultant who serves them forwards "you're invisible to AI — here's why," because it makes the sender look smart and the receiver alarmed.

## What's built (runnable today)
- `src/lib/ai-visibility/score.ts` — scoring module.
- `scripts/ai-visibility.ts` — CLI: `npx tsx scripts/ai-visibility.ts "<Business>" --site=… --category="…" --city="…"`
- **Readiness signals (deterministic, no key):** AI-crawler access (GPTBot/PerplexityBot/Google-Extended/ClaudeBot in robots.txt), schema.org structured data, name/address/phone, answer-format/FAQ content, title/description clarity.

## What's stubbed (the genuinely-new capability)
- **Live citation probe** (`GOOGLE_GENERATIVE_AI_API_KEY`): asks an LLM "best {category} in {city}?" and checks whether the business is actually named/recommended. This is the *visceral* half of the wow ("a competitor got the recommendation, not you"). Degrades gracefully to readiness-only without a key.
- Correction to the strategy synthesis: the audit engine's four Phase-2 stubs are **local-SEO** stubs (GBP/NAP/reviews/grid), *not* AEO — so AI-visibility scoring is net-new, not just "wiring." (It's still small — this file proves it.)

## Honest-surface rule (enforced in code)
The verdict only says "AI won't recommend you" when the live probe actually ran. Without a key it says "at high risk of being invisible" (readiness-framed). Never claim a citation result we didn't measure.

## Day-0 surface (from cold-start.md)
A grader *web page* is a content-cold-start disguised as a product (visited once). The re-firing primitive is the CLI today and a **free MCP server / Claude skill** next — a re-shareable win agencies/marketers invoke repeatedly. The web tool at `strelva.com/ai` is the secondary, conditional surface. Build the primitive + the magnet first; submit to directories only after install velocity.
