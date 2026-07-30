# Feature Management — Build Plan

> **STATUS: MERGED + LIVE (Jul 8 2026) → commit `f144c4c` on main.** All 5 steps built and merged. Green: typecheck + 1573 tests + lint + prod build, plus a live DB test on the `summit` demo tenant (toggle Wellness → persisted → 4 tabs appeared additively → core-lock guard fired → restored). Adversarial review found + fixed one real bug (TenantFeature now derived from a single array, so the validation list can't drift). **Next: the studio module** (the actual class/member/pack content behind the tabs) is the separate, validation-gated build.

**Date:** Jul 8 2026 · **Scope:** turn the demo's model (core-locked / conditional / vertical-set features + an operator toggle) into working code. Grounded in the real files. Demo: `strelva-feature-toggle` artifact.

> **What this build IS:** the plumbing to turn a client's dashboard features on/off cleanly, with core locked. **What it is NOT:** the wellness *content* (Schedule/Members/Packages pages = the `studio/` module, a separate build gated on validation). This build makes the tabs toggleable and appear; the studio module fills them in. So this is decoupled infra, useful for every vertical, and safe to build independently.

---

## Where the code is today (verified)

*(Pre-ship state recorded here for reference. All items below are now resolved.)*

- `src/lib/dashboard-surfaces.ts` — now registry-driven. `SurfaceId` is extended with set-member ids (`schedule`, `members`, `roster`). Core surfaces come from `CORE_FEATURES`; set surfaces appended by `getSetSurfaces(tenant.features)` from the registry. The old hardcoded 6-surface list is replaced.
- `src/app/api/admin/tenants/route.ts` — POST validates against the full registry; PATCH accepts `features` with the `applyFeatureChange` core-lock guard (previously dropped silently).
- `TenantEditor.tsx` is now at `src/app/admin/clients/[id]/TenantEditor.tsx` and has a live `FeaturesPanel`.
- `tenants.features text[]` column persists via `tenantToRow`/`rowToTenant` — unchanged.

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
// Shipped — CORE_FEATURES has 5 entries (reports added):
export const CORE_FEATURES = ["today","ask-ai","website","analytics","reports"] as const;
export const FEATURE_REGISTRY: FeatureDef[] = [ /* all features, one place */ ];
// Shipped as FEATURE_SETS (exported also as SETS for backward compat):
export const FEATURE_SETS = { wellness: { label: "Wellness", members: ["schedule","members","packages","roster"] }, /* … */ };
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

## Execution checklist (completed — commit f144c4c)

**Setup**
- [x] Branched `feat/feature-management` off `main`. No Co-Authored-By trailer (repo rule).
- [x] Loop: `pnpm test` · `pnpm typecheck` · `pnpm lint` green.

**Step 1 — Registry (Phase 1)**
- [x] `src/lib/features/registry.ts` written (`FeatureDef`, `CORE_FEATURES`, `FEATURE_REGISTRY`, `FEATURE_SETS`/`SETS`, helpers `isCore`/`expandSets`/`getSetSurfaces`/`applyFeatureChange`/`getToggleableRegistry`).
- [x] Unit tests for the helpers.

**Step 2 — Write path + core-lock guard (Phase 2)**
- [x] POST create validates against full registry (replacing 3-value `TENANT_FEATURES` whitelist).
- [x] PATCH accepts `features` + `applyFeatureChange` guard (core removal rejected, sets expanded, audit-logged).
- [x] Tests: core-removal rejected, set expansion, unknown-id rejected.

**Step 3 — Resolver refactor (Phase 3)**
- [x] `SurfaceId` extended with `schedule`/`members`/`roster`.
- [x] `getSetSurfaces()` appends set-member surfaces; core surfaces stay hardcoded-from-registry.
- [x] Golden test: existing tenants (gldf/rohlax) resolve identically.

**Step 4 — Toggle UI (Phase 4)**
- [x] `FeaturesPanel` in `TenantEditor.tsx` (core locked / conditional toggles / vertical-set toggles with member expansion), dark-dashboard styling, wired to PATCH write path.

**Step 5 — Placeholder pages + guardrails (Phase 5)**
- [x] Placeholder routes for `schedule`/`members`/`packages`/`roster`.
- [ ] "Needs setup" state when a set requires an unmet connection — deferred.
- [ ] Soft-disable data warning (warn if data exists when toggling off) — deferred.

**Merged**
- [x] Full `pnpm test`/`typecheck`/`lint` green.
- [x] Merged to main as commit `f144c4c`.

### Known issues / TODO

- **Deferred: "needs setup" state** — toggling on a feature that requires an unmet connection
  (e.g. google-business without a Google connection) shows the tab immediately rather than a
  "needs setup" indicator. The registry's `requires` field is defined but not yet consumed by
  a UI state.
- **Deferred: soft-disable data warning** — toggling a feature off hides the surface but does
  not warn if data exists under it (e.g. a members list). The data is preserved (not deleted)
  but no confirmation prompt fires.
- **Audit finding [MEDIUM][security]**: `businessRules` injected unsanitized into the agent
  system prompt (`src/lib/agent-prompt-shared.ts:342`). Fix: `sanitizePromptValue(businessRules)`
  + max-length cap in the TenantEditor PATCH validator.

## Related
- `admin-feature-management-architecture.md` — the architecture this implements
- `platform-layout.md` — where features sit (owner layer)
- `studio-vertical-architecture.md` — the wellness set that plugs into this
- `repo-audit-2026-07-08.md` (vault) — the light-up priorities
