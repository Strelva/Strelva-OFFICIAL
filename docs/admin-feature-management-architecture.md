# Admin Feature Management — Architecture

**Date:** Jul 8 2026 · **Goal:** let an operator add/remove a client's features from the admin cockpit, with core features locked (never removable). Grounded in the current code.

---

## Current state (what the audit found)

- **Features already exist as data:** `tenants.features[]` (`TenantFeature` = `commerce | booking | newsletter | blog | video | events | shop | products | rewards | providers | instagram | reviews`).
- **The dashboard nav already gates on them:** `src/lib/dashboard-surfaces.ts` → `getDashboardSurfaces()` decides tabs from **presence-profile** (derived from `template`/`businessModel`) + live **connections** + the `features[]` array (e.g. `tenantHasStore` reads `features` OR `hasCommerce`).
- **The feature write path is barely wired (verified in code):** the **create** path (`POST /api/admin/tenants`) accepts `features`, but `cleanFeatures` only whitelists **3** of the 12 type values — `TENANT_FEATURES = {commerce, booking, newsletter}` (line 12). The **edit** path (`PATCH`) does **not** include `features` in its Zod whitelist at all. Net: 3 features can be set at creation, **zero can be toggled after.** The panel to extend is `TenantEditor.tsx` in the cockpit (strongest admin surface, 85/100).
- **`features[]` is NOT the billing/tier system.** Per AGENTS.md, tiers ($99/$199/$499) are *packaging + build-scope*, not code-enforced flags — "the platform serves whatever's built into the client's repo; the Stripe price just sets the charge." So feature-management governs **which dashboard tools/surfaces a client sees**, not what they're billed for. Keep those two concerns separate.
- **There is NO formal "core / locked" concept.** Core tabs (Today, Ask Strelva, Website, Analytics) are always-on because that's **hardcoded** in `getDashboardSurfaces()`, not because they're marked locked. Nothing stops a future write from trying to remove them.
- **Three overlapping "feature" vocabularies** exist and must be reconciled: `features[]` (the array), presence-profile (`template`/`businessModel`), and `site_capabilities` (site-editing only, NOT feature gating). Plus `integrations[]` for connections.

---

## The design

### 1. One feature registry (single source of truth)
Create `src/lib/features/registry.ts` — the canonical list, replacing the scattered vocabularies. Each feature declares:

```ts
type FeatureTier = "core" | "conditional" | "set";
interface FeatureDef {
  id: TenantFeature | string;   // "website", "analytics", "booking", "classes", ...
  label: string;
  tier: FeatureTier;
  locked?: boolean;             // true for core → never removable
  set?: string;                 // vertical set this belongs to, e.g. "wellness", "ecommerce"
  requires?: {                  // prerequisites for enabling
    connection?: "google" | "stripe-connect";
    property?: "physical_location";
  };
  surfaces: SurfaceId[];        // which dashboard tabs it lights up
  onEnable?: string;            // setup hook (seed config / prompt connect)
}

export const CORE_FEATURES = ["website", "analytics", "today", "ask-ai"] as const; // locked
```

- **Core** (`locked: true`): website, analytics, today, ask-ai. Always on, cannot be removed.
- **Conditional**: google-business (`requires.property: physical_location` / `requires.connection: google`), reviews.
- **Set**: a vertical bundle, e.g. `wellness` = {schedule, members, packages, roster}; `ecommerce` = {products, orders, storefront}. Toggling a set flips its member flags together.

### 2. Data — reuse `tenants.features[]`
Keep the existing array as the enabled-feature store (no new table needed for the flags). The registry maps `feature → surfaces`; the resolver reads both. Per-feature *config* (e.g. booking hours) lives where it already does / in the studio module.

### 3. Write path — add a guarded feature toggle
Add `features` to the tenant write, **with a server-side guard** (this is the "never the locked ones" enforcement, and it must be server-side, not just UI):

```ts
// in the PATCH schema / a dedicated POST /api/admin/tenants/[id]/features
function applyFeatureChange(current: string[], next: string[]) {
  // 1. core features can never be removed
  for (const core of CORE_FEATURES)
    if (current.includes(core) && !next.includes(core))
      throw new Error(`"${core}" is a core feature and cannot be removed`);
  // 2. enabling a set expands to its member features
  // 3. enabling a feature with an unmet `requires` → allowed but flagged "needs setup"
  return dedupe(next);
}
```
Super-admin gated + audit-logged (both patterns already standard in the admin routes).

### 4. Resolver — unify on the registry
Refactor `getDashboardSurfaces()` to be **registry-driven** instead of part-hardcoded-part-flag: core surfaces come from the `locked` set, conditional/set surfaces from `features[]` + their `requires` checks + connections. This collapses the three vocabularies into one and removes the hardcoded always-on branch. (Behaviour-preserving refactor — same tabs render, cleaner source.)

### 5. Admin UI — a feature checklist in `TenantEditor`
Grouped by tier:
- **Core** — listed, shown with a 🔒 lock icon, checkbox disabled. Visible so the operator sees them, un-removable.
- **Conditional** — toggles, with a prerequisite hint ("needs a physical location" / "connect Google first"). Enabling without the prerequisite shows a "needs setup" state, not a broken tab.
- **Vertical sets** — one toggle per set ("Wellness ▸") that flips the whole bundle; expandable to see members.

### 6. Guardrails (the rules)
1. **Core locked server-side** — the UI disables them, but the API guard is the real enforcement (§3).
2. **Enable ≠ ready** — turning a feature on that needs a connection/config surfaces "needs setup," never a dead tab.
3. **Disable = soft-hide, don't destroy** — removing a feature hides its surface but must NOT delete its data (a wellness studio's members/classes survive a toggle-off). Warn if data exists.
4. **Sets are atomic** — toggling a set on/off flips all member flags together, but individual members can still be toggled after.

### 7. Reuse what's there
- `integrations[]` is the existing connection-toggle pattern → reuse for `requires.connection`.
- The audit-log + super-admin recheck pattern from every admin route → reuse verbatim.
- `TenantEditor` (85/100) is a mature panel → extend, don't rebuild.

---

## Net-new vs reuse

| Piece | Status |
|-------|--------|
| `tenants.features[]` store | **Reuse** |
| `dashboard-surfaces` resolver | **Extend** (make registry-driven) |
| `TenantEditor` panel | **Extend** (add the checklist) |
| `TENANT_FEATURES` whitelist (create path) | **Extend** (currently only 3 of 12 features) |
| PATCH schema / feature endpoint | **Extend** (add `features` — today PATCH accepts none — + the core guard) |
| Feature registry + CORE_FEATURES | **Net-new** (the missing single source of truth) |
| Core-lock guard | **Net-new** (no locked concept exists today) |
| Set-expand + soft-disable logic | **Net-new** |

## Sequencing
1. Registry + `CORE_FEATURES` (net-new, small).
2. Server-side guard + `features` in the write path.
3. Resolver refactor to registry-driven (behaviour-preserving).
4. `TenantEditor` checklist UI.
5. Set-toggle + soft-disable + "needs setup" states.

This is a small, contained build on already-strong surfaces — the only genuinely new concepts are the registry and the locked-core guard, which don't exist today.
