# Strelva Wellness Vertical — Status & Plan (START HERE)

**Updated:** Jul 30 2026 · **Status board:** https://claude.ai/code/artifact/29bf13e1-81f4-413d-827f-bde965d94910
**This is the top-level page. Read it first, then follow the links.**

---

## Status: PLAN COMPLETE. Next = VALIDATION, not building.

The thinking, research, and architecture are done. Nothing gets built until studios confirm they'd pay.

**Path:** Research ✓ → Decision ✓ → Scoping ✓ → **Validation ◉ (now)** → Build (gated)

---

## What's decided
- **First vertical:** Wellness / Pilates studios, before trades (Noah's call).
- **Positioning:** "Acuity but modern, plus our online-presence layer."
- **The model:** the dashboard = **Features**. Wellness is a vertical **feature-set** on the shared platform (maps to `tenants.features[]` + `dashboard-surfaces`, already live in `src/lib/features/registry.ts`).
- **The wedges:** real reformer bay-selection · design · trustworthy migration. (App = cheap PWA bonus; native = V3 maybe.)
- **Pricing shape:** low subscription + payments spread (Stripe Connect).
- **First user:** Cove Wellness (Jazz's studio) — design partner + canary.

## What's live on the platform today (as of Jul 30 2026)
- **`wellness` feature set registered** (`src/lib/features/registry.ts`): toggling the wellness set on a tenant enables Schedule / Members / Roster dashboard surfaces. Backed by the existing `bookings` table + KV rewards store. No new migrations.
- **`packages` NOT in the live set** — intentionally omitted because no dashboard surface exists yet. V1 build scope item.
- **`src/lib/studio/` does not exist.** No `studio_*` tables in the DB. The pre-build spec lives in `docs/studio-vertical-architecture.md`.
- **Booking engine (`src/lib/booking.ts`):** 1:1 appointment slots only — no recurring classes, no capacity/waitlist, no class-payment path.
- **No Vagaro webhook.** Vagaro is an embed-only integration (`src/components/public/VagaroEmbed.tsx`). Calendly has a real webhook handler (`src/app/api/webhooks/calendly/route.ts`).

## What's done this round
Market validation (5-agent, verdict build-but-narrow) · competitive/feature teardown · the Features product model · architecture + build scope (accounts, tabs, tables) · V1/V2/V3 roadmap · Jacob brief + interview script.

## What's next (the plan)
1. **Send Jacob the brief** — Noah — *ready* (copy in ~/Downloads).
2. **Jacob reads it, gives his call** — Jacob — *pending* (positioning, GTM, wellness-vs-trades).
3. **Run 5-8 studio-owner validation calls** — Noah + Jacob — *pending* (mix Acuity-light + Mindbody-paying; script below; Jazz intros some).
4. **Decision gate** — *gated on the calls*. Green flags (paid to fix, tried to switch, named a price) → build. Polite "sounds nice" → services play, not SaaS.
5. **Build V1 — the wellness feature-set** — *only if validation passes*. The bounded `studio/` module: member accounts, class engine, packs, Stripe Connect, new tabs. Cove as canary.

## The one thing that decides everything
**Will small studios pay a premium for design + safe migration?** Every other claim is sourced; this one is still a guess. Answer it with the calls *before* a line of code. That's why step 3 comes before step 5.

---

## The documents

| Type | Doc |
|------|-----|
| **Plan (canonical)** | vault `brain/1-projects/scaffold-web/wellness-vertical-2026-07-07.md` — has ▶ RESUME HERE |
| **Product model** | vault `brain/1-projects/scaffold-web/dashboard-feature-model.md` — the Features frame |
| **Jacob handoff** | `docs/wellness-vertical-brief.md` (also in ~/Downloads) |
| **Interview script** | `docs/wellness-validation-interview-script.md` |
| **Engineering design** | `docs/studio-vertical-architecture.md` — module boundary, tables, pivot-all-in path |

**Artifacts (visual):** status board · [validation memo](https://claude.ai/code/artifact/fd07afa3-e177-41e8-bc9b-c4e7e20f924d) · [topology](https://claude.ai/code/artifact/b629e6cf-662d-4e87-8b5b-33bb1fb86671) · [product model](https://claude.ai/code/artifact/fb4968af-7a33-484f-b4fa-4942036f8c99) · [landing](https://claude.ai/code/artifact/a00c6b6a-6848-4f2e-bb16-c196ad6c8710) · [roadmap](https://claude.ai/code/artifact/7e3abd73-56bc-4adf-9758-78c8c1832f85) · [build scope](https://claude.ai/code/artifact/5c9fa5ef-12c6-4e9a-9407-9ff37130edec) · [feature model](https://claude.ai/code/artifact/d0ffc231-f01f-4f36-84bd-4b5a2df31a34)

---

## Known issues / TODO (pre-build blockers)

Before any wellness V1 code lands, these open platform issues need to be addressed or tracked:

- **[CRITICAL]** Next.js on 16.2.6 has unpatched CVEs. Bump to 16.2.12 before Cove goes live.
- **[HIGH]** `maxAdvanceBooking` config field is declared (`src/lib/booking.ts:17`) but never enforced in slot generation. Any date is accepted regardless of the limit. Must fix before Cove production use.
- **[HIGH]** `upload_image` agent tool uses a shared flat Blob namespace (no tenant prefix). Fix: use `uploadTenantMedia()` in `src/app/api/agent/route.ts:568`.
- **[MEDIUM]** `businessRules` injected unsanitized into the agent system prompt (`src/lib/agent-prompt-shared.ts:343`). Wrap with `sanitizePromptValue`.
- **[MEDIUM]** Fractional star delta causes uncaught Redis error in `adjustStars` (`src/app/api/rewards/members/[email]/adjust/route.ts:35`). Add `Number.isInteger(delta)` guard.

Full audit findings with remediation detail are in `docs/wellness-vertical-brief.md` under "Known issues / TODO."

*Do not build before step 4 (validation) clears.*
