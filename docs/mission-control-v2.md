# Mission Control v2 — "from read to act, and make it feel alive"

Scoped 2026-06-16 from a deep-dive audit of the admin/operator surface. Built on
`feat/platform-solidify`. Every change gated by `pnpm typecheck` + `pnpm test`
before commit. No Co-Authored-By trailer rules here — standard repo conventions.

## Why

Audit found: visual debt is narrow (two components built on raw `zinc-*` never
migrated to tokens) but the bigger gap is functional — the operator **reads far
more than it can act on**. Four admin API routes are built but curl-only
(`domains`, `component-registry`, `revalidation-status`, `portfolio`), and the
agent is missing obvious action-tools (run scan, revoke pay link, send invite).

## Phase 1 — Visual system pass

- Shared `status-colors` + `Field` primitives (kill 5 duplicated maps + 3 local Field reimpls).
- Migrate `CreateTenantForm` + `InviteButton` modal off raw zinc to tokens; fix `DraftActions` reject button.
- Replace native `alert()`/`window.confirm` with inline UI.
- Overview tenant-table empty state.
- Tenant SEO card resting state (last stored grade + mini bars + scanned timestamp).

## Phase 2 — Make the operator act

- Domain-management panel on tenant detail (consumes `/api/admin/domains` CRUD).
- Revalidation-status panel on Ops (`/api/admin/revalidation-status`).
- Agent action-tools: `propose_run_scan`, `propose_revoke_pay_link`, `propose_send_invite`.
- Audit filters (tenant / actor / action).

## Phase 3 — Fun / alive

- Scan history (ring buffer) → grade trend (↑/↓ since last scan) on overview + tenant page.
- One-click "Scan all clients" with freshness indicators.
- Sparklines on portfolio stats.
- ⌘K command palette (quick nav + jump-to-tenant + operator console).

## Notes

- Dev server pinned to **localhost:3100** (`pnpm exec next dev -p 3100`) to avoid the
  PuckCast/other-project port-3000 collisions. Prod env pulled to `.env.local` +
  `REB_DEV_UNGATED_ACCESS=1` for local super-admin.
