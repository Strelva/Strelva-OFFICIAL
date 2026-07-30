# Admin Feature Management — Architecture

**Date:** Jul 8 2026 · **Built:** Jul 8 2026 (PR #141, commit f144c4c, merged to main).
**Goal:** let an operator add/remove a client's features from the admin cockpit, with core features locked (never removable). Grounded in the current code.

---

## Current state (as shipped — verified Jul 2026)

**This feature is LIVE.** The architecture below was designed and then built in the same increment (PR #141). The "what the audit found" items below describe the pre-ship state that motivated the design; see the design sections for what shipped.

- **Features as data:** `tenants.features[]` (`TenantFeature` = `commerce | booking | newsletter | blog | video | events | shop | products | rewards | providers | instagram | reviews`, plus set-member ids `schedule | members | roster | packages` added by #141).
- **The dashboard nav gates on them:** `src/lib/dashboard-surfaces.ts` → `getDashboardSurfaces()` decides tabs from presence-profile + connections + `features[]`. Set-member surfaces (`schedule`/`members`/`roster`) are appended by `getSetSurfaces(tenant.features)` from `src/lib/features/registry.ts`.
- **Feature write path is fully wired (verified in code):** the **create** path (`POST /api/admin/tenants`) validates features against the full registry. The **edit** path (`PATCH`) accepts `features`, runs `applyFeatureChange(current, next)` (rejects core removal, expands sets, dedupes), and audit-logs the change. ~~Zero can be toggled after create~~ is gone.
- **`features[]` is NOT the billing/tier system.** Per AGENTS.md, tiers ($99/$199/$499) are *packaging + build-scope*, not code-enforced flags. Feature-management governs which dashboard surfaces a client sees, not what they're billed for.
- **`CORE_FEATURES` is the locked set:** `["today", "ask-ai", "website", "analytics", "reports"]` (5 items, not 4 — "reports" was added). Enforced server-side in `applyFeatureChange`; the UI also disables these toggles.
- **Single source of truth:** `src/lib/features/registry.ts` — `FEATURE_REGISTRY`, `CORE_FEATURES`, `FEATURE_SETS` (wellness = schedule/members/packages/roster), and helpers `expandSets`/`applyFeatureChange`/`getSetSurfaces`/`getToggleableRegistry`. The resolver, write path, and operator UI all read this registry.
- **`TenantEditor`** (`src/app/admin/clients/[id]/TenantEditor.tsx`) has a live `FeaturesPanel` component — core features listed with a lock, conditional toggles, and vertical-set toggles that expand to member features.

---

## The design

### 1. One feature registry (single source of truth)
`src/lib/features/registry.ts` — the canonical list, replacing the scattered vocabularies. Each feature declares:

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

export const CORE_FEATURES = ["today", "ask-ai", "website", "analytics", "reports"] as const; // locked — 5 items
```

- **Core** (`locked: true`): today, ask-ai, website, analytics, reports. Always on, cannot be removed.
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

## What shipped (PR #141)

| Piece | Status |
|-------|--------|
| `tenants.features[]` store | Reused |
| `src/lib/features/registry.ts` | Net-new — `FEATURE_REGISTRY`, `CORE_FEATURES`, `FEATURE_SETS`, helpers |
| Core-lock guard (`applyFeatureChange`) | Net-new — enforced server-side in the PATCH handler |
| `dashboard-surfaces` resolver | Extended — `getSetSurfaces()` appends set-member surfaces |
| `TENANT_FEATURES` whitelist (create path) | Replaced with registry validation (full feature set) |
| PATCH schema / feature endpoint | Extended — `features` accepted + core-guard applied |
| `TenantEditor` `FeaturesPanel` | Net-new — live in `src/app/admin/clients/[id]/TenantEditor.tsx` |
| Set-expand + member toggles | Net-new — `expandSets` on write; per-member sub-toggles in UI |
| Placeholder pages for wellness set | Net-new — `schedule`/`members`/`packages`/`roster` surfaces |

### Known issues / TODO

- **Audit finding [MEDIUM][security]**: `businessRules` field in the agent system prompt
  (`src/lib/agent-prompt-shared.ts:342`) is interpolated without being wrapped in
  `sanitizePromptValue`, unlike every other tenant-supplied field in the same prompt. This
  opens a prompt-injection vector. Fix: wrap in `sanitizePromptValue(tenantConfig.businessRules)`
  and add a max-length cap at write time (e.g. 1000 chars in the TenantEditor PATCH validator).
  `personality` is already sanitized; `businessRules` is not.
- **Audit finding [MEDIUM][bug]**: `upload_image` tool in `src/app/api/agent/route.ts:568`
  calls unscoped `uploadFile()` instead of `uploadTenantMedia()` — uploaded images land in a
  shared flat Blob namespace rather than under the tenant's prefix. Fix: replace with
  `uploadTenantMedia(tenant, buffer, finalFilename, mimeType)`.
- Soft-disable data warning (warn when toggling off a feature with existing data) was deferred —
  currently toggling off a feature hides its surface but no warning fires if data exists.
