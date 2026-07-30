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

- Domain-management panel on tenant detail (new super-admin `/api/admin/tenants/[id]/domains`).
- Review operator view on tenant detail (`ReviewIntelPanel` + `GET /api/admin/tenants/[id]/reviews-intel`) — sentiment split, urgent-first needs-a-reply queue, unanswered-negative count, emerging concerns, at-risk flag. Admin-only; the client dashboard shows only the positive review summary. See `docs/features/review-engine.md`.
- "Fix first" ranked issue list on the tenant `SiteScan` (a fresh scan returns `prioritizedIssues` via `src/lib/audit/prioritize.ts`) — the raw failing/warning checks, priority-badged, that the client health card no longer shows.
- ~~Revalidation-status panel on Ops~~ — SKIPPED: the Ops page already surfaces the same `getRecentFailures()` data; a separate panel would be redundant UI.
- Agent action-tools: `propose_run_scan`, `propose_revoke_pay_link`, `propose_send_invite`.
- Audit filters (tenant / actor / action) — client-side over the fetched events.

## Phase 3 — Fun / alive

- Scan history (ring buffer) → grade trend (↑/↓ since last scan) on overview + tenant page.
- One-click "Scan all clients" with freshness indicators.
- Sparklines on portfolio stats.
- ⌘K command palette (quick nav + jump-to-tenant + operator console).

## Notes

- Dev server runs on **localhost:3000** (`pnpm dev`). The port-3100 pin mentioned in
  earlier drafts of this doc was a temporary workaround and is no longer used. Prod env
  pulled to `.env.local` + `REB_DEV_UNGATED_ACCESS=1` for local super-admin.
- Auth is now Supabase-only (Clerk fully removed 2026-07-11, #146). `src/proxy.ts`
  (the renamed `middleware.ts` in Next.js 16) owns the request-level auth gate
  (`gateRequest`, fail-closed) and route matcher (`isPublicRoute`/`isCronRoute`). No
  `@clerk` imports remain anywhere in the repo.
- Sanity is fully torn down as a data source (2026-07-10). The only residual is
  `sanityImageUrl` for legacy content-image asset refs stored in Postgres rows, kept
  until the content-URL rewrite ops step.

## Status (as of 2026-07-30)

Phase 1 and Phase 2 items from this plan are shipped and live. Phase 3 sparklines
and the command palette are the remaining items. This doc is a historical design record
for the `feat/platform-solidify` sprint. For the current operator surface map, see
`docs/operator-command-center.md`.

## Known issues / TODO

**[MEDIUM] `OperatorConsole` proposals accumulate across turns** (`src/app/admin/OperatorConsole.tsx:423`): `setProposals(result.proposals)` replaces the proposals array on each response, but stale confirmed or in-flight proposals from previous turns can remain visible and clickable if the new response returns a different set. A user approving a stale card from a prior turn may trigger an unintended action.

**[HIGH] `buildOpsReport` is a fully serial N+1 loop** (`src/lib/ops.ts:113-157`): three `for...of` loops over all active tenants with sequential `await` calls per tenant. At portfolio scale this blocks the ops-digest cron handler for O(n*3) sequential round-trips. Fix: collapse into a single `mapPool(active, 8, ...)` that fetches SMS state, queue count, and auto-approved events per tenant in parallel.
