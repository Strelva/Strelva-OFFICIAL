# Feature Management — Build Plan

> **STATUS: SHIPPED (Jul 8 2026) → PR [#141](https://github.com/Strelva/REB/pull/141), branch `feat/feature-management`.** All 5 steps built. Green: typecheck + 1573 tests + lint + prod build, plus a live DB test on the `summit` demo tenant (toggle Wellness → persisted → 4 tabs appeared additively → core-lock guard fired → restored). Adversarial review found + fixed one real bug (TenantFeature now derived from a single array, so the validation list can't drift). Awaiting Jacob's review; not merged. **Next: the studio module** (the actual class/member/pack content behind the tabs) is the separate, validation-gated build.

**Date:** Jul 8 2026 · **Scope:** turn the demo's model (core-locked / conditional / vertical-set features + an operator toggle) into working code. Grounded in the real files. Demo: `strelva-feature-toggle` artifact.

> **What this build IS:** the plumbing to turn a client's dashboard features on/off cleanly, with core locked. **What it is NOT:** the wellness *content* (Schedule/Members/Packages pages = the `studio/` module, a separate build gated on validation). This build makes the tabs toggleable and appear; the studio module fills them in. So this is decoupled infra, useful for every vertical, and safe to build independently.

---

## Where the code is today (verified)

- `src/lib/dashboard-surfaces.ts` — `getDashboardSurfaces()` returns a **hardcoded list of 6 surfaces**. `SurfaceId` is a fixed 6-value union. Core 4 (today, ask-ai, website, analytics) are always `state:"shown"`; conditional 2 (google-business, reviews) derive state from presence-profile + connections. **`features[]` currently only affects one thing** — `tenantHasStore` (the Store sub-tab). There is no vertical-set concept and no core/locked concept.
- `src/app/api/admin/tenants/route.ts` — POST accepts `features` but `cleanFeatures` whitelists only 3 (`TENANT_FEATURES = {commerce, booking, newsletter}`); PATCH's Zod schema omits `features` entirely (can't edit after create).
- `TenantEditor.tsx` (cockpit) — the panel to extend; posts to `PATCH /api/admin/tenants`.
- `tenants.features text[]` column already persists via the `tenantToRow`/`rowToTenant` mapper.

---

## The plan (5 phases, ~3.5–4 focused days)

### Phase 1 — The feature registry (the missing source of truth) · ~0.5d
New file `src/lib/features/registry.ts`:
```ts
export type FeatureTier = "core" | "conditional" | "set";
export interface FeatureDef {
  id: string;                 // "website","analytics","google-business","schedule",...
  label: string;
  tier: FeatureTier;
  locked?: boolean;           // core → true
  set?: string;               // "wellness" | "ecommerce" | ...
  requires?: { presence?: "local"; connection?: "google" | "stripe-connect" };
  surface?: { href: string; group: "manage" | "presence" | "set" };
}
export const CORE_FEATURES = ["today","ask-ai","website","analytics"] as const;
export const FEATURE_REGISTRY: FeatureDef[] = [ /* all features, one place */ ];
export const SETS = { wellness: ["schedule","members","packages","roster"], ecommerce: ["products","orders","storefront"] };
// helpers: isCore(id), expandSets(features[]), featuresToSurfaces(...)
```
This replaces the three scattered vocabularies (`features[]`, `LOCAL/ONLINE_TEMPLATES` presence, `COMMERCE_FEATURES`) with one registry the resolver + write path + UI all read. Unit tests for the helpers.

### Phase 2 — Write path + core-lock guard · ~0.5d
In `src/app/api/admin/tenants/route.ts`:
- Replace `cleanFeatures`' 3-value `TENANT_FEATURES` set with **registry validation** (accept any registered feature id).
- **Add `features` to the PATCH schema**, routed through a guard:
```ts
function applyFeatureChange(current: string[], next: string[]) {
  for (const c of CORE_FEATURES)                       // 1. core can never be removed
    if (current.includes(c) && !next.includes(c)) throw new Error(`"${c}" is core`);
  return dedupe(expandSets(next));                     // 2. enabling a set expands its members
}
```
Server-side enforcement (the UI disabling core is not the real guard). Audit-log via the existing pattern. Tests: reject core removal, set expansion, unknown-id rejection.

### Phase 3 — Resolver refactor (registry-driven, behavior-preserving) · ~1d · the careful one
Refactor `getDashboardSurfaces()` to build the list from the registry + `features[]` + presence + connections instead of the hardcoded array:
- Core surfaces from `CORE_FEATURES` (always shown).
- Conditional from the registry's `requires` (presence/connection) — reproduces today's google-business/reviews logic exactly.
- **Set-member surfaces (new):** extend `SurfaceId` with the set members (schedule/members/…); render a surface for each enabled set-member feature, in a new `"set"` group.
- **Behavior-preserving:** the 6 existing surfaces must resolve identically for existing tenants. **Golden test** — snapshot current output for gldf/rohlax/a wellness tenant, assert unchanged after refactor.

### Phase 4 — Operator toggle UI in `TenantEditor` · ~1–1.5d
Add a "Features" section (the demo, productionized):
- **Core** — listed with 🔒, disabled.
- **Conditional** — toggles + prerequisite hints ("needs a physical location" / "connect Google").
- **Vertical sets** — a master toggle per set that expands to member sub-toggles.
- Posts the new `features[]` to the write path; optimistic update; audit feedback.
- Match the dark dashboard styling (the demo is light; the cockpit is dark).

### Phase 5 — Set surfaces get placeholder pages + guardrail polish · ~0.5d
- Each new set-member `SurfaceId` needs a route so an enabled tab isn't a 404. Ship **placeholder pages** ("Schedule — coming soon") so feature-management is fully usable before the `studio/` module lands.
- **Guardrails:** "needs setup" state when a feature requires an unmet connection (e.g. wellness set + Stripe Connect); **soft-disable** (toggling a set off hides tabs but does NOT delete data) + a warn-if-data-exists confirm.

---

## Sequencing & dependencies
- **1 → 2 → 3** are backend, invisible, safe to ship dark (feature-flagged; no existing tenant changes because their `features[]` and the golden test guarantee identical output).
- **4** depends on 1+2+3. **5** is polish, last.
- Everything is additive; no migration (the `features` column already exists).

## Risks / decisions
1. **Resolver regression** — the one real risk. Golden tests on existing tenants are non-negotiable before merge.
2. **Store how a "set" persists** — recommend storing the **expanded member ids** in `features[]` (uniform resolver, registry knows the grouping) rather than a `set:wellness` marker. Simpler reads; the guard's `expandSets` does the work on write.
3. **Keep features ≠ billing** — do not wire the Stripe tier to `features[]`. Two separate concerns (AGENTS.md).
4. **The `two-repo` promotion rule** (AGENTS.md) doesn't block this — it governs promoting a *client-repo* feature to the platform; feature-management is control-plane infra.

## Honest sequencing note (where this slots)
This is clean, satisfying, foundational infra and it's the backbone of the vertical strategy — but per the repo audit, it is **not the highest-ROI work on the board.** The Tier-1 "light-up" items (flip client email so weekly reports send, land the GBP approval, roll out tracking) make the *existing* product demonstrably work and are days of ops, not code. If forced to order: light-up first, then this. That said, feature-management is a reasonable thing to build in parallel as the foundation the wellness set will plug into — and it's not gated on the wellness validation the way the studio module is.

## Execution checklist (the steps, in order)

**Setup (before any code)**
- [ ] Branch `feat/feature-management` off `main`. It's Jacob's repo — work on a branch, ship via PR for his review, **no Co-Authored-By trailer** (repo rule).
- [ ] Confirm the loop: `pnpm test` · `pnpm typecheck` · `pnpm lint` green before each commit. Everything ships dark/additive (no tenant changes until a toggle is flipped).

**Step 1 — Registry (Phase 1)**
- [ ] Write `src/lib/features/registry.ts` (`FeatureDef`, `CORE_FEATURES`, `FEATURE_REGISTRY`, `SETS`, helpers `isCore`/`expandSets`/`featuresToSurfaces`).
- [ ] Unit tests for the helpers.
- [ ] ⏸ **Checkpoint:** you eyeball the registry shape — it's the source of truth.

**Step 2 — Write path + core-lock guard (Phase 2)**
- [ ] Swap the 3-value `cleanFeatures` whitelist for registry validation (POST).
- [ ] Add `features` to the PATCH schema + `applyFeatureChange` guard (reject core removal, expand sets, dedupe). Audit-log.
- [ ] Tests: core-removal rejected, set expansion, unknown-id rejected.

**Step 3 — Resolver refactor (Phase 3, the careful one)**
- [ ] Snapshot current `getDashboardSurfaces` output for gldf / rohlax / a wellness tenant = golden baseline.
- [ ] Refactor resolver to registry-driven; extend `SurfaceId` with set members (`schedule`/`members`/…).
- [ ] Golden test asserts existing tenants resolve **identically**; new tests for set surfaces.
- [ ] ⏸ **Checkpoint:** confirm zero regression before moving on.

**Step 4 — Toggle UI (Phase 4)**
- [ ] Add the Features section to `TenantEditor.tsx` (core 🔒 / conditional / sets), dark-dashboard styling, wired to the write path.
- [ ] ⏸ **Checkpoint:** you toggle it on Cove's tenant and eyeball it.

**Step 5 — Placeholder pages + guardrails (Phase 5)**
- [ ] Placeholder routes for the set-member surfaces (no 404s).
- [ ] "Needs setup" + soft-disable (hide, don't destroy) states.

**Ship**
- [ ] Full `pnpm test`/`typecheck`/`lint`; verify by toggling the wellness set on a test tenant end-to-end.
- [ ] Open PR for Jacob. Don't merge/deploy without his review (his repo/product).

## Related
- `admin-feature-management-architecture.md` — the architecture this implements
- `platform-layout.md` — where features sit (owner layer)
- `studio-vertical-architecture.md` — the wellness set that plugs into this
- `repo-audit-2026-07-08.md` (vault) — the light-up priorities
