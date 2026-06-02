# GATE-A-TEST — does a stranger reproduce the wow?

> The 14-day launch plan stays **LOCKED** until this passes. A confusing or "so what" artifact wastes the one cold-start. This gate is binary and hand-to-a-stranger.

## Reproduction steps (give these to a non-friend)
A second person — ideally a real SMB owner or a marketer/consultant who serves SMBs, OR a fresh zero-context Claude session — runs, with **their own / a client's** business:

```bash
# in the REB repo, deps installed (pnpm install)
npx tsx scripts/ai-visibility.ts "Their Business" --site=theirsite.com --category="<what they do>" --city="<their city>"
```

(Optional, for the full wow: `export GOOGLE_GENERATIVE_AI_API_KEY=…` first to run the live "does AI name you?" probe.)

## Expected wow
An A–F **AI Visibility Score** + a one-line verdict + the top fix, in under 30 seconds, that makes them react with *"oh — AI can't see me"* and ask *"how do I fix it?"* or want to send it to someone.

## Pass / Fail (binary)
- **PASS** if a non-friend, scanning a business they care about, has a visible "oh no / I need this" reaction AND either asks for the fix or says they'd share it. That reaction is the share trigger the whole loop depends on.
- **FAIL** if the reaction is "so what," the grade feels arbitrary/unfair, or they don't understand what it means. → Do **not** launch. Fix the artifact (sharpen the verdict, make the score feel fair and the fix obvious), re-test. Never paper over a weak magnet with more channels.

## The "would you forward this?" test (must also pass)
A stranger forwards this because: *"it shows my client/business is invisible to AI search with a specific, fixable reason — sending it makes me look on-top-of-2026 and makes them worried enough to act."* If you can't complete that sentence honestly after watching a real reaction, the magnet isn't ready.

## Status
- [x] Author can run it and it produces an honest, specific A–F scorecard on real sites.
- [ ] **A non-friend reproduced the wow on a business they care about and reacted.** ← the gate. Not yet done.

## On pass → unlock
When the box above is checked, return to `/ignite` to emit the Phase A→B→C 14-day PULL plan (primitive-first: free MCP server / Claude skill + the shareable scorecard; Reddit/marketing-community value-first drops; registry submission only after install velocity). Until then, B/C are intentionally withheld.
