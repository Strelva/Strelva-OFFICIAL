# Testing & CI

Two test layers, and two Playwright "smoke" modes that differ by the dev-access bypass.

## Vitest (unit + integration)

`pnpm test` (`vitest run`) is the bulk of coverage. The 2026-08-01 local run
passed 2,013 tests across 246 files with one intentional skip.
Runs in CI as the "Test (with coverage gate)" step. Mock at module boundaries
(`vi.mock`), not the function under test — e.g. `tenant-access-enforcement.test.ts`
exercises the REAL `hasTenantAccess` with the auth primitives (`getSessionUser`,
`getMembershipRole`, `isSuperAdminUser`, `isDevAccessBypassEnabled`) mocked.

### Tenant-isolation coverage is three complementary files — keep all three:
- `tenant-isolation.test.ts` — content **storage** is scoped per tenant (data layer).
- `tenant-isolation-guard.test.ts` — **structural**: every route that derives a tenant
  from the request calls `requireTenantAccess`/`requireTenantPermission` (catches a
  route that forgets the guard — the #1 leak risk).
- `tenant-access-enforcement.test.ts` — the guard **logic** returns the right allow/deny
  (member of A can't reach B, verified-email gate). An inverted membership check would
  pass the other two while silently opening cross-tenant access; this catches it.

### TypeScript strictness

`pnpm typecheck` runs `next typegen` before `tsc --noEmit`. CI uses the same
command so an untouched checkout gets Next's route and static-image declarations
without relying on an earlier development server or build. Vitest discovers
both `.test.ts` and `.test.tsx` files under `src/__tests__`.

`noUncheckedIndexedAccess` is ON in `tsconfig.json` (enabled 2026-07-30). Every array index and record key access is typed `T | undefined` — guard or provide a default. All 637 existing sites were fixed when the flag landed; keep it green. A new `arr[i]` or `record[key]` without a guard will fail typecheck.

### Source ownership

`pnpm check:boundaries` checks static imports, re-exports, literal dynamic imports,
`require` calls, and type imports across current source and scripts. Native
application rules and their shared contract dependencies may import only the
explicit domain modules and Zod. The check rejects a database or service import
hidden behind a contract re-export. Other product and platform boundaries remain
in force; this is an incremental migration, not a claim that every product has a
pure domain layer.

ESLint treats unused variables and imports as errors. Explicit underscore-prefixed
parameters remain allowed for interface implementations. Unreferenced routes,
public product entry points, fixtures, migration history, and deployed client
contracts are not disposable just because an import search finds no callers.

## Playwright (`tests/*.spec.ts`) — two modes

`pnpm smoke` runs `playwright test`. The webServer is `next dev` (see
`playwright.config.ts`); against an external server set `PLAYWRIGHT_BASE_URL`.
`retries: 2` in CI absorbs cold-compile hiccups.

The **dev-access bypass** (`REB_DEV_UNGATED_ACCESS=1` / `SCAFFOLD_DEV_UNGATED_ACCESS=1`,
`src/lib/dev-access.ts`) grants super-admin and is what splits the two modes:

| Mode | Bypass | Runs | Skips |
|---|---|---|---|
| **Public smoke** (CI "Smoke tests") | OFF | marketing/tenant pages, public `/api/v1`, cron auth, signed-out auth-gate redirects, API contract | the ungated console specs |
| **Surface smoke** (CI "Surface smoke") | ON + `REB_DEV_TENANT=gldf` | `operator-surfaces` + `owner-surfaces` (admin console + owner dashboard) | signed-out redirect tests |

- Specs that need the console gate on `test.skip(process.env.REB_DEV_UNGATED_ACCESS !== "1", …)`;
  the signed-out auth-gate tests gate on the **inverse** (`=== "1"`), so each set runs in
  exactly one mode. `pnpm smoke:admin` / `smoke:dashboard` / `smoke:surfaces` are the ungated scripts.
- The **Surface smoke** asserts only **data-independent** chrome (headers, static section
  titles) — content comes from `gldf-content-defaults`, the operational stores stay empty —
  so it needs no DB/Redis/prod. The owner **Today** page is the exception (its verdict + activity
  feed are backend-driven), so its smoke is a render-check only.

## Pinned client release checks

`pnpm check:custom-repos` retains its development behavior: executable platform
contract checks plus structural checks for available sibling repositories.
For a release checkout, run `CUSTOM_REPO_VERIFY_PINS=1 pnpm check:custom-repos`.
This additionally requires every declared client repository to exist, have its
exact `compatibleCommit` checked out, and have no tracked or untracked changes.
Use isolated worktrees in the manifest's sibling layout; do not reset a working
client checkout to obtain this proof. Ignored dependencies and build output do
not count as source changes.

To keep the isolated client checkouts together, set `CUSTOM_REPO_CHECKOUTS_ROOT`
to their parent directory. Each checkout must be named for its manifest tenant,
for example `/tmp/strelva-clients/gldf` and `/tmp/strelva-clients/rohlax`:

```bash
CUSTOM_REPO_CHECKOUTS_ROOT=/tmp/strelva-clients CUSTOM_REPO_VERIFY_PINS=1 pnpm check:custom-repos
```

An explicitly selected checkout directory does not fall back to the ordinary
client working folder. `CUSTOM_REPO_WORKSPACE_ROOT` alone does not relocate
manifest paths; they remain relative to the control-plane checkout.

Pin verification does not execute each client's own check suite or contact its
deployment. Run those local checks separately with isolated configuration, then
record the client revision and result. A production checklist may make external
writes even when its name says “check”; inspect it before running it against a
live environment.

## Workspace schema checks

`pnpm check:workspace-sql` builds the current workspace and recovery schema in
isolated PostgreSQL and exercises its permissions, concurrency and failure paths.
It is the regular CI gate.

`pnpm check:workspace-upgrade` is the ordered-history rehearsal. It applies every
repository migration through the documented pre-workspace baseline
`20260802120000_report_snapshots.sql`, seeds representative tenant,
membership, content and report rows, then applies every later workspace/recovery
migration. It checks identity preservation, service-role-only creation, browser
denial, RLS, verified and unverified owners, and atomic rejection of a duplicate
migration. It also checks that the content-version column change fails immediately
under conflicting locks, concurrent index creation does not queue out client
writes, a valid index can be retried, and an incompatible index is rejected.
It never connects to a hosted or production database.

Both commands require PostgreSQL server binaries. On this workstation:

```bash
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
```

The upgrade rehearsal is a deliberate release check rather than a per-push CI
step because it replays the full retained history. Run it when the workspace
migration tail or its baseline changes and before authorizing a real migration.

The content-version index migration uses `-- pg-delta: transaction=false` and
`CREATE INDEX CONCURRENTLY`. Use Supabase CLI 2.117.0 (which supports this directive) or `psql` without a
wrapping transaction. The local rehearsal uses `psql`. Supabase's GitHub integration
does not honor this directive. A failed concurrent build can leave an invalid
index; inspect and explicitly repair it before retrying. The migration rejects
an incompatible or invalid existing index instead of silently accepting it.
See [Supabase migration execution](https://supabase.com/docs/guides/local-development/cli-workflows).

## Internal product-learning acceptance

`tests/product-learning-authenticated-local.spec.ts` uses isolated local Supabase
Auth/Postgres and synthetic users, sources and evidence. It checks the full saved
learning lifecycle, independent review, stale revisions, source change/outage,
pause and revoked access. Its direct due-time setup exercises collection admission;
it does not prove background dispatch or observed customer value.

Production access is disabled unless `STRELVA_PRODUCT_LEARNING_RELEASE=1` and the
workspace release gate are both enabled. Active verified internal access and native
workspace membership remain required. This flag does not schedule collection.
Changing a production environment remains a separate authorized release action.

## CI (`.github/workflows/ci.yml`)

`build` job: install with the repository's exact `pnpm@10.34.5` → lint → typecheck → product
boundaries → ontology invariants → isolated workspace SQL → vitest+coverage →
`pnpm audit --audit-level high` → build → Playwright browsers → **Smoke tests** (bypass OFF)
→ **Workspace browser acceptance** → **Surface smoke** (bypass ON, seeds
`tests/fixtures/tenants.fixture.json` → `./dev-tenants.json`). CI has **no DB and no Redis**
and never touches prod. Browser steps are conditional on a non-draft pull request; the
workflow explicitly includes `ready_for_review` so a draft becoming reviewable runs them.

### The CI-faithful local sim (use this before trusting a green local run)

Local exports or `.env` may provide Postgres **and** Upstash, which silently masks CI-only
failures (a tenant that only resolves via the fixture; a page that only renders with Redis).
Run the restore-safe CI harness instead of copying/removing the fixture by hand:

```bash
pnpm check:ci
```

`scripts/check-ci.sh` runs the hosted-equivalent checks, exports empty provider/data and
release-bypass values so `.env.local` cannot repopulate them in its subprocess, and seeds the
synthetic tenant only for Surface smoke. For that step it backs up an existing
`dev-tenants.json` with metadata, restores it on success, test failure or signal, and removes
the synthetic file when none existed. The Surface smoke asserts only chrome; do not set
`CONTENT_SOURCE=file` while asserting tenant **content** rendering — the production
source-flags guard refuses dev-file content when `VERCEL_ENV=production` and 500s.

## GitHub Actions account gate

The org's free tier has a finite Actions budget and a zero-dollar overage limit.
When the account cannot fund a run, every workflow stops before receiving a
runner and therefore supplies no code evidence.

### Historical account observation (2026-08-01)

As of that dated observation, the latest `main` Security and CI runs were blocked with
GitHub's “recent account payments have failed or your spending limit needs to be increased”
annotation, and their jobs had zero steps. This was an external account block, not a test
failure. It is historical evidence only; inspect the latest hosted run before describing
the branch or release as CI-green.

There are only two workflows now (CI + Security). Guardrails keep usage well under 2,000:

- **`concurrency: cancel-in-progress`** on both workflows — a new push cancels the
  superseded run instead of letting both finish. Biggest saver during active dev.
- **CodeQL was deleted.** It analyzed with `upload: never` (code scanning isn't enabled),
  so it burned ~3 min/event producing nothing usable. Re-add it (`git show` the old
  `codeql.yml` from history) only after enabling code scanning in repo settings.
- **The Playwright e2e smoke (public + workspace + surface, ~2.5 min) runs only on NON-DRAFT
  PRs.** Draft-PR pushes and main pushes run the fast checks (lint/typecheck/vitest/build)
  only. The workflow subscribes to `ready_for_review`, so marking a draft ready runs the
  browser gate before merge.
- **`paths-ignore`** on CI for `**.md` / `docs/**`; **Playwright browsers cached**.
- **Local git hooks** (`.githooks/`, wired via the `prepare` script's `core.hooksPath`):
  pre-commit runs gitleaks on staged changes (never commit a secret); pre-push runs
  typecheck (catch type errors before they reach a runner). Both skippable with
  `--no-verify`; gitleaks degrades to a warning if the binary/docker isn't present.

**Before you push:** run `pnpm check:ci` locally. It runs lint, typecheck, product-boundary
and ontology checks, isolated SQL, coverage, high-severity audit, build, public smoke,
workspace browser acceptance and no-Redis surface smoke. A local green result is local
evidence only; it cannot replace the hosted run or production evidence.

If Actions is blocked, treat `pnpm check:ci` as local evidence only. Clear the
billing/spending block and obtain a fresh hosted run before describing a PR or
release as CI-green.

## Do NOT

- Publish to a real client tenant (gldf/rohlax) from a test — editor smokes stay on the
  draft layer and discard; a publish fires a live revalidation.
- Re-introduce the `font-[family-name:var(--font-display)]` arbitrary class — use the
  `font-display` `@utility` (see AGENTS.md § Conventions). Turbopack dev mis-serializes the
  arbitrary value on cold compile and crashes the dev server.

## Current verification record

The current IMP-01 receipt is [docs/major-release/implementation-receipt.md](major-release/implementation-receipt.md).
It records the exact toolchain and local evidence without turning local results into a
hosted or production claim. The repository pins `pnpm@10.34.5`, the lockfile was regenerated
with that toolchain, and generated output is ignored narrowly at the ESLint boundary
(`.next-self-service*`, `.validation-artifacts`, and sibling `.next*` output only).

The receipt also records the official Next.js advisory review and the patched `next` and
`eslint-config-next` line. A clean install in an isolated temporary checkout, the focused
release tests and `pnpm typecheck` must be recorded separately from any run that reuses the
developer checkout. No local check authorizes deployment, migration, provider writes or a
production release.
