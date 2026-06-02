# unlocks.md — Strelva (`/Users/laneyfraass/REB`)

Latent-possibility recon. Five unlocks, each from a **different spot** in the codebase, ranked by novelty × leverage × feasibility. Every one cites a re-derivable artifact element + a named primitive/graft.

**SUBSTRATE:**
- `package.json` — PRESENT (dep versions)
- `src/lib/events.ts` — PRESENT (per-tenant event store + key shape)
- `src/lib/agent-executor.ts` — PRESENT (agent tool defs)
- `src/lib/audit/checks.ts` + `audit/scoring.ts` — PRESENT (any-URL audit engine)
- `src/lib/connections.ts` — PRESENT (integration storage)
- `src/app/api/cron/*` — PRESENT (poll-google-reviews / poll-yelp / poll-instagram)
- `src/lib/revalidate-client.ts` — PRESENT (signed per-change revalidation)
- `.env.example` — PRESENT (integration keys, names only)
- `CLAUDE.md` — PRESENT (radar gate: names custom-repo model, AI agent, integrations registry, "Do NOT build" list)
- `.movement/` — MISSING (no prior radar memory → novelty gated against CLAUDE.md + expert-founder baseline)

**Router-note:** `continue` — input is the codebase, not a held idea list. Output can feed `/pick`.

---

## 1. Cross-tenant vertical benchmark from the event stream  *(spot: data/event layer)*

1. **The move:** Add a cross-tenant aggregation consumer over the `events:${tenantId}` sorted sets that rolls up by template/vertical, producing a proprietary "businesses like yours" baseline (a wellness studio's normal booking-click rate, a restaurant's normal review velocity).
2. **Opens:** a **data-asset moat that compounds with every tenant** — each new client sharpens the benchmark, and no competitor can reproduce it without the same install base. New dashboard surface ("top 20% in your vertical") that is structurally un-copyable.
3. **Why it may not be on your radar:** the event store is keyed *per tenant* (`events.ts:29`, `events:${tenantId}`) and every reader filters to one tenant (`getEvents(tenantId, …)`) — the schema was built for isolation, so the cross-tenant tap that creates the data-network-effect is one aggregation away and nothing consumes it yet.
4. **First step:** new `src/lib/benchmarks/` reader that scans event keys grouped by the existing template verticals (wellness/food-brand/restaurant/trades/professional) and computes percentile baselines; render one stat in the dashboard overview.
5. **Grounding cite:** `events.ts:29` `events:${tenantId}` + event types `"review"`/`"analytics"`/`"content_update"` (re-derived) × **data-network-effect graft**. *This is the only compounding-moat unlock here — lead with it.*

## 2. Audit engine as a before/after proof generator  *(spot: audit lib)*

1. **The move:** Run `src/lib/audit/checks.ts` against the client's **old** site at intake and against the **new** Strelva site on the weekly cron, then diff `computeOverallScore`/`scoreToGrade` into a "D → A" proof artifact in the weekly report and on the sales page.
2. **Opens:** the **proof mechanic the dashboard's willingness-to-pay rests on** — manufactures the "receipts" gravity (`/product` named proof as the missing gravity), plus a reusable per-client sales asset.
3. **Why it may not be on your radar:** the audit engine ships today as a one-shot marketing lead-gen scan; the same `CheckResult[]` + scoring functions run just as well as a *longitudinal* before/after diff — a different capability surface (proof over time) than the scanner it was built as.
4. **First step:** persist the intake-time audit score for the old domain; re-score the live Strelva domain inside the `weekly-report` cron; render the delta.
5. **Grounding cite:** `audit/scoring.ts:3` `computeOverallScore`, `scoring.ts:16` `scoreToGrade`, `audit/checks.ts:22` `validateUrlSafety` (any-URL scan, re-derived) × **before/after proof graft**.

## 3. MCP server over the agent tools — operator multiplexer + owner-side channel  *(spot: agent layer)*

1. **The move:** Wrap the existing `tool({…})` set in `agent-executor.ts` (`read_section`, `update_section`, `create_suggestion`, `create_blog_post`, `list_blog_posts`) as an MCP server so Jacob manages **all** tenants from one Claude Code session, and an owner can manage their site from their own AI assistant.
2. **Opens:** a **distribution + operator-leverage channel** — site management moves out of Strelva's dashboard into the AI surfaces operators/owners already use (the operator-OS body from `/product`); one operator drives N tenants from one terminal.
3. **Why it may not be on your radar:** the agent is wired only to the in-app `/api/agent` route, but the tools are already individuated `tool()` definitions (`agent-executor.ts:238–495`) — MCP-wrapping is a transport change, not new capability, and CLAUDE.md names no MCP surface.
4. **First step:** a thin MCP server exposing the 6 existing tools with a tenant-scope argument; point Jacob's Claude Code at it and manage GLDF + Rohlax from the terminal.
5. **Grounding cite:** `agent-executor.ts` tools at lines `238/246/411/419/444/495` (re-derived) × **MCP primitive (2026)**.

## 4. Polled reviews/IG auto-injected as always-fresh social proof on the client sites  *(spot: integrations/cron layer)*

1. **The move:** Pipe data already collected by `poll-google-reviews` / `poll-yelp` / `poll-instagram` (persisted per-tenant via `connections.ts`) into a managed social-proof section on the `(public)` client sites and the marketing site, kept current automatically.
2. **Opens:** a **conversion surface that embodies the "managed, always-current" promise** — proof the site is alive — using data that today dead-ends in the dashboard. Directly fills the "zero social proof" gap the mobbin pass flagged as P0.
3. **Why it may not be on your radar:** three polling crons collect reviews/social and `connections.ts:49` `updateLastSynced` persists them, but the only consumer is the dashboard — the public sites never read it. Classic data-collected-vs-used: the consumer is one section component away, no new instrumentation needed.
4. **First step:** a `ReviewsContent` section type fed from the connected Google/Yelp data, rendered in the public template; default-on for any tenant with a live review connection.
5. **Grounding cite:** crons `poll-google-reviews` / `poll-yelp` / `poll-instagram` + `connections.ts:49` `updateLastSynced` (re-derived) × **data-collected-vs-used pattern**.

## 5. Signed revalidation history → a public "managed since / last updated" trust feed  *(spot: revalidation/contract layer)*  — lower novelty, ranked last

1. **The move:** Surface the per-site change history that already flows through `revalidateClientSite` (and the `reb:revalidation:last-success:` timestamps) as a public, lightweight "actively managed · updated N days ago" feed on each client site footer.
2. **Opens:** a **proof-of-active-management trust signal** to the SMB's *own* customers + a distribution flywheel (every client site becomes a proof-carrying Strelva surface).
3. **Why it may not be on your radar:** the "powered-by" backlink half is a known growth tactic (gate-1 honest caveat) — but the *public proof-of-active-management feed* built from the signed-revalidation log is not; the data (`content_update` events + `revalidate-client.ts:28` last-success timestamps) is captured and only used internally for failure alerting.
4. **First step:** read the last-success timestamp + recent `content_update` events for a tenant; render a minimal public "last updated" line; gate behind a tenant flag.
5. **Grounding cite:** `revalidate-client.ts:28` `LAST_REVALIDATION_PREFIX` (`reb:revalidation:last-success:`) + `content_update` events (re-derived) × proof-feed graft. *Honest caveat: the backlink mechanic is on-radar; the trust-feed surface is the latent part.*

---

### Notes
- **#1 and #2 are the highest-leverage pair** — #1 is the only compounding data moat; #2 manufactures the proof gravity `/product` flagged as missing. #3 is the operator-OS channel. #4 is the cheapest real win (data already collected). #5 ranked last on novelty.
- None is a whole-product bet, so none hands off to `/pick`. If the cross-tenant benchmark (#1) grows into a standalone "local-business performance index" product, *that* would be a `/pick` candidate.
