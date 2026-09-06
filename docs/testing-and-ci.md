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

`noUncheckedIndexedAccess` is ON in `tsconfig.json` (enabled 2026-07-30). Every array index and record key access is typed `T | undefined` — guard or provide a default. All 637 existing sites were fixed when the flag landed; keep it green. A new `arr[i]` or `record[key]` without a guard will fail typecheck.

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

## CI (`.github/workflows/ci.yml`)

`build` job: install → lint → typecheck → vitest+coverage → `pnpm audit --audit-level high`
→ build → Playwright browsers → **Smoke tests** (bypass OFF) → **Surface smoke** (bypass ON,
seeds `tests/fixtures/tenants.fixture.json` → `./dev-tenants.json`). CI has **no DB and no
Redis** and never touches prod.

### The CI-faithful local sim (use this before trusting a green local run)

Local `.env` provides Postgres **and** Upstash, which silently masks CI-only failures
(a tenant that only resolves via the fixture; a page that only renders with Redis). To
reproduce CI locally, blank BOTH the data sources and Redis:

```bash
cp tests/fixtures/tenants.fixture.json dev-tenants.json
DATA_SOURCE=file CONTENT_SOURCE=file TENANTS_SOURCE=file CI=true \
  UPSTASH_REDIS_REST_URL="" UPSTASH_REDIS_REST_TOKEN="" KV_REST_API_URL="" KV_REST_API_TOKEN="" \
  pnpm smoke:surfaces
rm -f dev-tenants.json
```

Do NOT set `CONTENT_SOURCE=file` while asserting tenant **content** rendering — the prod
source-flags guard refuses dev-file content in a prod-like context (`CI=true`) and 500s.
The Surface smoke only asserts chrome, so it's unaffected.

## GitHub Actions account gate

The org's free tier has a finite Actions budget and a zero-dollar overage limit.
When the account cannot fund a run, every workflow stops before receiving a
runner and therefore supplies no code evidence.

As of 2026-08-01, the latest `main` Security and CI runs are blocked with GitHub's
“recent account payments have failed or your spending limit needs to be increased”
annotation. Their jobs have zero steps. This is an external account block, not a
test failure, but `main` does not have fresh CI evidence until the account state is
fixed and a new run passes.

There are only two workflows now (CI + Security). Guardrails keep usage well under 2,000:

- **`concurrency: cancel-in-progress`** on both workflows — a new push cancels the
  superseded run instead of letting both finish. Biggest saver during active dev.
- **CodeQL was deleted.** It analyzed with `upload: never` (code scanning isn't enabled),
  so it burned ~3 min/event producing nothing usable. Re-add it (`git show` the old
  `codeql.yml` from history) only after enabling code scanning in repo settings.
- **The Playwright e2e smoke (public + surface, ~2.5 min) runs only on NON-DRAFT PRs.**
  Draft-PR pushes and main pushes run the fast checks (lint/typecheck/vitest/build) only —
  iterate in a draft PR, mark it "ready for review" to run the e2e gate before merge.
- **`paths-ignore`** on CI for `**.md` / `docs/**`; **Playwright browsers cached**.
- **Local git hooks** (`.githooks/`, wired via the `prepare` script's `core.hooksPath`):
  pre-commit runs gitleaks on staged changes (never commit a secret); pre-push runs
  typecheck (catch type errors before they reach a runner). Both skippable with
  `--no-verify`; gitleaks degrades to a warning if the binary/docker isn't present.

**Before you push (avoid burning a run to find a failure):** run the CI-faithful check
locally. `pnpm check:ci` runs lint + typecheck + vitest + the no-Redis surface smoke —
the same gates the runner enforces. If it's green, CI will be too.

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

On 2026-08-01, `pnpm typecheck` and `pnpm test` passed locally. The encryption,
subscription-deletion, Stripe idempotency, and zero-dollar trial invoice branches
called out by the July audit all have current test coverage. No confirmed failing
Vitest test remains.

`pnpm lint` is currently red with 10 `no-explicit-any` errors in
`scripts/inspect-tenant.ts` and seven warnings. In this combined local checkout,
`eslint .` also traverses generated output under the ignored
`strelva-marketing/` and `client-prototypes/` workspaces, making the failure slow
to reach. `pnpm check:ci` stops at lint and has no current surface-smoke result.
