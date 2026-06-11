# Offer ↔ Codebase Gap Analysis — Build Plan

Date: 2026-06-09. Source: 26-agent workflow (7 subsystem analyses + adversarial verification of all 19 claimed sale-blockers). Full structured output: workflow run `wf_1fa9ab17-973`.

**Headline: zero hard blockers.** All 19 claimed blockers verified as "real-but-workaround" — first sales close with manual mechanics (hand-made Stripe links, signed PDF terms, manual qualification). Code work is about removing founder labor and honoring promises at scale, not unblocking revenue.

**The one dangerous finding:** the weekly receipt — the load-bearing sales artifact — has **no data pipe for the actual delivery model**. Page views/booking clicks populate only via the control plane's `/api/track` (legacy platform-template path); the live custom repos (GLDF, Rohlax) are not connected, so a real receipt today shows ~zero visits. Compounding: Resend v6 send failures are silently swallowed (`route.ts:75-82` never checks `.error`), and one Gemini failure kills the whole run for all tenants. **We may believe receipts have been landing when none have.** Selling "weekly proof" before fixing this produces a weekly email that disproves us.

## Track A — before the first Door 1 sale (this week; zero/low code)

1. **Sell off-site now.** Pitch by call/email; hand-made Stripe Payment Link ($1,500–2,500, tenantId metadata) or invoice; build starts after payment. No deploy needed.
2. **Receipt truth check (zero code):** confirm in Sanity that gldf/rohlax have `ownerEmail`; confirm `updates.strelva.com` (and any tenant `resendDomain`) verified in Resend; manually trigger `/api/cron/weekly-report` with CRON_SECRET and read `{sent, errors, skipped}`.
3. **Claims discipline sweep:**
   - Trim "AI-visibility monitoring" from Care scope in `website-offer-two-door.md` (until the cron exists).
   - Fix `/terms`: $149/mo (`src/lib/pricing.ts`) and "export within 30 days of cancellation" both contradict the offer — change to export-anytime + new pricing, or unpublish pricing from terms until lawyer pass.
   - Delete/redirect `/onboard` (dead $149 self-serve; API already 503s).
   - Sweep ~17 "free site" strings (home hero, nav, audit CTA, account, delivery tracker, Slack intake).
   - `AuditPage.tsx:391` "Get a free site" CTA → two-door language.
4. **Webhook guard (S, real bug):** `checkout.session.completed` sets `subscriptionStatus: "active"` for ANY checkout with tenantId metadata — including one-time payments. Add `session.mode === "subscription"` check; route `mode: "payment"` to a build-payment record.
5. **Scorecard artifacts:** CLI runnable today (`npx tsx scripts/ai-visibility.ts` with GOOGLE_GENERATIVE_AI_API_KEY). Add `--html` one-pager flag (hours) for sendable artifacts. Claims note: citation probe is Gemini-only and 50% of grade with run-to-run variance — artifact must say "Gemini," not "AI tools," and is a conversation-starter, not a metric.

## Track B — the receipt becomes true (the strategic fix; M)

1. Connect tracking from custom repos → control plane (the data pipe for views/clicks). Without this the core artifact is empty for every real client.
2. Resend `.error` check + failures into `errors[]` + Slack alert (~30 min).
3. Per-tenant try/catch in `generateAllReports` + deterministic fallback summary (mirror `buildFallbackSummary`) — one Gemini hiccup stops killing all receipts.
4. Count missing-`ownerEmail` tenants in `skipped` + notify.
5. Unify the two divergent Gemini summaries (email vs dashboard brief) so the owner reads one story.
6. Then: publish one anonymized receipt as the proof asset (blocked until data is real — no invented numbers).

## Track C — before the first Door 2 signature (S–M)

1. Signed one-page agreement (Google Doc/PDF, e-sign): 12-mo minimum, own-after-12, buyout = $1,995 − paid, export-anytime. Lawyer pass before first signature.
2. Hand-create Stripe prices: $199/mo (+$499 start) and $99/mo care. Keep `STRIPE_SCAFFOLD_PRICE_ID` unset for now (billing-on is a cliff: tenants without status get 402'd — needs migration before flipping).
3. Restrict self-serve cancellation in Stripe portal config (or accept paper-only minimum knowingly).
4. Add `stripeSubscriptionId`, `subscriptionStartedAt`, `commitmentEndsAt` to TenantConfig + persist in webhook (prerequisite for month-12 mechanics).
5. Domain procedure in `docs/domain-setup.md`: registered in CLIENT's registrar/Cloudflare account day one; Strelva gets DNS-edit member access only.
6. Repo-transfer runbook (doc): repo transfer + bake final content into `content-defaults.ts` for frozen-handoff viability; flag third-party deps (GLDF's paused Supabase) as transfer risks.
7. Un-suppress offboarding requests (`/api/offboarding/request` currently a dead letter — no event, no Slack).
8. OwnershipSection copy update after terms settle (own-after-12, keep-everything).

## Track D — scale + positioning polish (after first sales; M–L)

- `/pay/[client]` generalization (per-client pay config; supports pre-tenant leads). Rohlax page stays grandfathered as-is ("no monthly fees, ever" is her deal — never the template).
- Two-price billing in code: `priceId` param on `createTenantSubscriptionCheckout`; `trial_period_days≈90` for Door 1's 3-months-included; consolidate the duplicate create-subscription route (it omits tenantId metadata — webhook misses its invoices).
- One-active-request: 409 on open `change_request` + scope paragraph in system prompt (also: paste scope into tenant `businessRules` today — zero code, injected verbatim).
- Close the abdication loop: "your update is live" email on draft approval (drafts currently publish silently — undercuts the whole pitch).
- Dashboard IA: "Ask AI" becomes primary CTA over "Edit site"; Reports added to desktop sidebar (currently absent!); pin latest brief on Today; remove owner-facing churn telemetry ("Quiet 14+ days" badges); resurrect dead "since launch" totals for the day-90 renewal moment.
- Chat model fallback in `api/agent/route.ts` (hardcoded gemini-2.5-flash; executor already has the pattern).
- Later (L): consolidate the two divergent agent implementations; approved suggestions currently run with weaker scope walls than chat.

## Cross-repo + language flags

- **strelva-marketing repo** (serves production strelva.com): pricing page says "We build it free… $99/mo" — directly contradicts both doors. Two-door pricing page + ownership-promise page belong THERE; this repo's marketing pages may also serve depending on env `MARKETING_DOMAINS` (verify which hosts hit which repo in prod).
- **"Text it like a person"** is dashboard chat, not SMS. Sales language: "chat — like texting" or commit to a messaging channel later. Don't let the pitch promise a channel that doesn't exist.
