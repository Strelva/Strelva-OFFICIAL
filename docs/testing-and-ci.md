# Testing & CI

Two test layers, and two Playwright "smoke" modes that differ by the dev-access bypass.

## Vitest (unit + integration)

`pnpm test` (`vitest run`) — the bulk of coverage (~1700 tests in `src/__tests__/`).
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

## Actions-minutes budget (2,000/mo, resets the 1st)

The org's free tier is 2,000 GitHub Actions minutes/month with a $0 overage budget
(so it HARD-BLOCKS when exhausted — every workflow then fails in ~2s with no runner).
Guardrails in the workflows keep usage well under that:

- **`concurrency: cancel-in-progress`** on all three workflows — a new push cancels
  the superseded run instead of letting both finish. Biggest saver during active dev.
- **CodeQL runs weekly only** (was every push+PR) — it analyzes with `upload: never`
  until code scanning is enabled in repo settings, so per-event runs produced nothing.
  Re-add `push`/`pull_request` + flip `upload` when scanning is turned on.
- **`paths-ignore`** on CI for `**.md` / `docs/**` — docs-only changes skip the build.
- **Playwright browsers cached** across runs.

**Before you push (avoid burning a run to find a failure):** run the CI-faithful check
locally. `pnpm check:ci` runs lint + typecheck + vitest + the no-Redis surface smoke —
the same gates the runner enforces. If it's green, CI will be too.

If minutes are exhausted mid-cycle and a PR must land: either merge on a local
`pnpm check:ci` green-light, or raise the Actions spending cap a few dollars for a
couple of validating runs. Usage resets on the 1st.

## Do NOT

- Publish to a real client tenant (gldf/rohlax) from a test — editor smokes stay on the
  draft layer and discard; a publish fires a live revalidation.
- Re-introduce the `font-[family-name:var(--font-display)]` arbitrary class — use the
  `font-display` `@utility` (see AGENTS.md § Conventions). Turbopack dev mis-serializes the
  arbitrary value on cold compile and crashes the dev server.
