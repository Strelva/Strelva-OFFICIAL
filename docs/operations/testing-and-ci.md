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
`require` calls, and type imports across current source and scripts, including
untracked files. Product and platform direction rules remain in force.

The domain check follows the complete local import graph from each product's
`contracts.ts`, `domain.ts`, `engine.ts`, and `inquiry-engine.ts`, plus the named
execution, budget, delivery-commitment, governance and risk cores in
`scripts/domain-boundaries.ts`. A dependency hidden behind an intermediate helper
or type re-export is still checked. Unresolved local modules and nonliteral module
loads fail rather than disappearing from the graph. Domain roots allow Zod and
the existing Node identity primitive, not provider SDKs, storage or presentation.
Native application rules retain their narrower explicit dependency allowlist.
This is import-boundary enforcement, not a proof that arbitrary code is pure.

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

## Inquiry delivery Lua check

`pnpm check:inquiry-lua` runs the inquiry delivery store contract
(`src/__tests__/inquiry-delivery-store-contract.test.ts`) against the real Lua
scripts in `src/products/inquiries/delivery-store.ts`. It starts a throwaway
`redis-server` on a private unix socket with no TCP port and no persistence,
and removes it on exit. It never connects to a shared or production Redis.
`pnpm test` runs the same contract against the memory store only, because CI has
no Redis. It needs `redis-server` on `PATH` (`brew install redis`). Run it when
a delivery-store script or the stored checkpoint shape changes. A green run is
local proof only.

## Scrubbed production copy check

`pnpm check:scrubbed-copy` proves the scrubbed-copy tooling
([runbook](scrubbed-production-copy.md)) end to end against a fake source. It
builds a throwaway PostgreSQL cluster at production's recorded migration level,
seeded with fixture tenants, and a throwaway redis-server behind the Upstash
REST protocol. It then copies, scrubs, loads and dry-runs every active
tenant's conversion. It never contacts a hosted service. It needs PostgreSQL 18
binaries, `redis-server` and `LC_ALL` set (see below). `pnpm test` runs only the
unit tests (`src/__tests__/scrubbed-copy.test.ts`); the end-to-end file skips
unless `SCRUBBED_COPY_E2E=1`. A green run is local proof only.

## Workspace schema checks

`pnpm check:workspace-sql` builds the current workspace and recovery schema in
isolated PostgreSQL and exercises its permissions, concurrency and failure paths.
It is the regular CI gate.

The October 1 website document fixture also checks immutable revisions, approval
failure paths, tenant ownership, atomic agency copies, workspace portability and
service-only RPC access. Two simultaneous service-role transactions claim the
same fictional source domain; exactly one may commit a rebuild. The prepared
migration remains a local test artifact until separately authorized.

The inquiry portion of `pnpm check:workspace-sql` also runs
`scripts/check-inquiry-rollbacks.sh` on its local socket. It retains fictional
contract rows in an isolated clone, checks all 19 wave-6 rollback files separately
and in reverse order, and compares exact rows for leads, events, send purposes,
provider receipts, facts/proposals and booking offers. Clones are removed after
each case, including failures; the outer cluster and logs remain local evidence.
The receipt-preserving rollback files disable RPC access instead of deleting
accepted or ambiguous send state. Callers must be switched off first. This is
rollback execution and retention proof, not authorization to apply production
migrations or to replay non-idempotent forward files on retained tables.

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

Both commands require PostgreSQL server binaries. The SQL check scripts and
release-safety rehearsal set `LC_ALL=C` internally, including for `initdb` and
`pg_ctl`; callers do not need to export a locale on macOS/PostgreSQL 18.
The workspace, upgrade, inquiry and customer-mapping checks remove only the
cluster/socket directories they create on success, failure, SIGINT or SIGTERM.
They record the postmaster PID and stop that cluster before deleting its files,
including when startup fails after launching Postgres. If both shutdown attempts
fail and the recorded PID is still alive, the check fails and prints the retained
path rather than deleting a running server's data. SIGKILL cannot run cleanup.

The release-safety rehearsal uses the same ownership rules, removes its database
and dump files, and saves its private receipt under `output/release-safety/`.
Private PostgreSQL error diagnostics remain separate from disposable clusters.
Run `node --test scripts/tests/temp-postgres.node-test.mjs` with PostgreSQL 18
installed (or `POSTGRES_BIN` pointing to its binaries) to exercise initialization,
partial-startup and SQL failures plus signal cleanup. These tests skip when the
server binaries are unavailable.

On this workstation:

```bash
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm test:migration-helpers
```

The Launch verification `persisted-delivery` job runs the ordered upgrade and
helper filename proof on pull requests. Run them locally when the migration tail
or its baseline changes and before authorizing a real migration.

Forward filenames must match `<14-digit version>_<name>.sql`. The metadata
inventory explicitly excludes `rollback-<14-digit version>_<name>.sql` and the
retained manual helper names in `scripts/check-workspace-target.mjs`; other
non-versioned SQL files fail closed. New rollback helpers use the timestamped
convention. Keep existing helper paths: release manifests, rollback rehearsals
and operational instructions reference them.

Supabase CLI 2.117.0, pinned in both Launch verification jobs, skips helpers with
a filename notice ([filename rule](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/pkg/migration/file.go),
[skip behavior](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/pkg/migration/list.go)).
`pnpm test:migration-helpers` starts a disposable loopback PostgreSQL cluster,
replaces every repository helper's SQL with an exception, runs the installed
CLI's `migration up`, and verifies only the forward appears in migration history.
It also checks the ordered-upgrade file selection and the Auth stack's shared
staging function. `prepare-launch-auth-stack.sh` stages only validated forward
files, so Auth startup has no helper skip notices. The ontology check likewise
reads only forward SQL. These checks require the Supabase CLI and PostgreSQL
server binaries; they use no Docker, hosted configuration or real migrations.

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

`pnpm smoke:workspace` enables only the workspace shell release and explicitly
runs both `workspace-release.spec.ts` and `provider-seat-workspace.spec.ts`.
The provider fixture keeps its assertions for assigned client work, disabled
general Ask and an enabled saved rebuild retry. Every API response is fictional;
this proves rendered controls, not authenticated provider authority. Public smoke
keeps the workspace gate closed and skips that release-dependent fixture. The
October 8 CI failure rendered the intended closed workspace page in the first
two attempts; the later ENOSPC retry was separate. The fixture existed unchanged
at `e9ac136f`. The guard fixes profile routing, and the explicit enabled command
retains its coverage. Actual enabled-profile and full-CI reruns belong to root
integration; no production gate is changed here.

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

The current IMP-01 receipt is [docs/archive/major-release-2026-09-08/implementation-receipt.md](../archive/major-release-2026-09-08/implementation-receipt.md).
It records the exact toolchain and local evidence without turning local results into a
hosted or production claim. The repository pins `pnpm@10.34.5`, the lockfile was regenerated
with that toolchain, and generated output is ignored narrowly at the ESLint boundary
(`.next-self-service*`, `.validation-artifacts`, and sibling `.next*` output only).

The receipt also records the official Next.js advisory review and the patched `next` and
`eslint-config-next` line. A clean install in an isolated temporary checkout, the focused
release tests and `pnpm typecheck` must be recorded separately from any run that reuses the
developer checkout. No local check authorizes deployment, migration, provider writes or a
production release.

## October 1 website rebuild implementation receipt

The [website rebuild spec](../capabilities/website/website-rebuild-spec-2026-10-01.md) now has a local
v2 implementation: bounded public-site crawling, quoted facts, source-backed
copy, typed catalog composition, review, hosted publication preparation,
governed edits, undo, export, domain checks and operating receipts. The existing
v1 website path remains separate. This receipt records local implementation and
measured artifacts; production acceptance remains pending.

The renderer uses the existing React stack and a catalog of 22 validated node
types. `@json-render/core`, `@json-render/react` and `@json-render/next` have not
been installed. Jev and model providers have injectable, admitted adapters, but
the measurement below used deterministic composition and source copy: zero
paid provider calls and $0 measured model cost. Provider accuracy, model cost,
Jev-versus-model quality and human blind judgment remain unmeasured. The
[provider comparison runner](../capabilities/website/website-rebuild-benchmark.md) has a zero-call dry
run and a bounded, explicit opt-in command prepared for paid measurement. A
JavaScript-only site falls back to the business-description path; Vercel Sandbox
browser rendering has not been implemented.

Reproduce the read-only public-source spike with:

```bash
pnpm exec tsx scripts/website-rebuild-spike.ts
```

The October 1 run read 10 pages from `https://www.attymooney.com/`, composed 10
pages in 1,215 ms, and retained 239 facts with source support. Forty claims
require owner review under the conservative years, money, credentials and
outcomes policy. The resulting 199 of 239 facts supported without owner action
is **83.3%, below the spec's 85% target**. Source support means matching the
published text or structured source fields; it does not independently establish
that the business's claims are true. This is one run, not a latency percentile
or a provider accuracy benchmark.

The generated local artifacts are:

- [Measurement and unresolved claims](../../output/website-rebuild-spike-2026-10-01/evidence.json).
- [Source, template and catalog comparison](../../output/website-rebuild-spike-2026-10-01/index.html).
- [Strict runtime HTML audit](../../output/website-rebuild-spike-2026-10-01/runtime-audit.json).
- [Audit input URLs, byte counts and SHA-256 hashes](../../output/website-rebuild-spike-2026-10-01/runtime-audit-inputs.json).
- [Raw source HTML](../../output/website-rebuild-spike-2026-10-01/raw-source.html) and
  [planned non-preview HTML](../../output/website-rebuild-spike-2026-10-01/planned.html).
- [Canonical audit module comparison with well-known files](../../output/website-rebuild-spike-2026-10-01/audit.json).

Use the raw source and planned non-preview artifacts for the runtime audit.
`original.html` is a sanitized display snapshot and `catalog.html` is a private
preview; both intentionally omit behavior or metadata needed for a fair
intended-site comparison. The input receipt ties the runtime measurement to
document hash
`c0ca900d53c72bb8817b027bf78fd7bf1666494ced1b0ea1ae3e508a43d8be19`.

The strict runtime HTML audit measured AI readability 39→58 and content quality
61→63; SEO stayed 100, accessibility stayed 100 and trust stayed 44. The
separate canonical comparison includes fetched source robots/sitemap files and
locally generated destination equivalents, so its category scores differ. No
Lighthouse result, assistant mention, real inquiry, calendar write, live hosted
response or verified custom domain is implied by either artifact. The planned
`https://mooney.strelva.com` URL is not published.

The pinned Next.js 16.3.6 local validation is recorded in the
[check receipt](../../output/website-rebuild-spike-2026-10-01/checks/receipt.json)
and its logs. The installed dependencies were restored with
`pnpm install --frozen-lockfile`; no package or lockfile changes were made.
The final [full check log](../../output/website-rebuild-spike-2026-10-01/checks/check.log)
records passing lint, typecheck, 516 test suites, 3,927 tests with one skipped,
and a successful build. Product boundaries, ontology and version synchronization
also passed. The receipt records source, migration, artifact and log hashes.

- [Manifest-pinned client compatibility log](../../output/website-rebuild-spike-2026-10-01/checks/custom-repos-pinned.log):
  58/58 checks passed in isolated clean GLDF and Rohlax worktrees at the exact
  release-manifest revisions. This does not execute live client journeys.
- [Workspace SQL log](../../output/website-rebuild-spike-2026-10-01/checks/workspace-sql.log)
  and [full-schema upgrade rehearsal](../../output/website-rebuild-spike-2026-10-01/checks/workspace-upgrade.log):
  both passed on isolated PostgreSQL 18 clusters. The fixtures cover immutable
  documents and receipt history, native ownership, agency publication denial,
  revoked access, atomic candidate updates, crawl retention and competing intake.
  The nullable domain registration-attempt migration preserves legacy claims and
  rejects invalid states without widening public permissions. The agency bridge
  reuses accepted delivery scope and existing expiring draft grants. SQL proves
  atomic edits, source-fact preservation, descendant scope checks, stale
  selectors, revoked/expired authority and denial of owner commands.
- [Desktop/mobile interaction evidence](../../output/website-rebuild-spike-2026-10-01/ui-proof/evidence.json),
  [locked-version reflow and hash checks](../../output/website-rebuild-spike-2026-10-01/ui-proof/locked-evidence.json),
  [publication/domain evidence](../../output/website-rebuild-spike-2026-10-01/ui-proof/domain-evidence.json),
  and [agency editing evidence](../../output/website-rebuild-spike-2026-10-01/ui-proof/agency-evidence.json):
  browser-rendered synthetic fixtures at 1280, 390 and 320 pixels, plus keyboard
  review. Exact long TXT values remain intact; page widths fit their viewports.
  Empty, loading, failure, read-only, managed, factual review, publication
  read-back failure, pending/verified/error domain and unavailable report states
  were inspected. Agency fixtures cover section edits, saved multipage previews,
  ordering, stale revisions and revoked/expired permission. The actual
  unauthenticated preview request redirects to sign-in with private-preview
  headers; authenticated editing authority is proven by local service/SQL tests.
  The Mooney iframe hash matches the measured document above.
- Legacy renderer, metadata, robots, sitemap and redirect fixtures compare against
  their pre-change outputs. That is local compatibility evidence, not a
  byte-for-byte comparison of all nine clients' deployed responses.

Owner agent edits can add a validated catalog page and append its navigation
link. New copy and page metadata become explicit review claims; immutable
source facts cannot be rewritten through the patch interface. Regression tests
exercise review, approval, rendering, export and undo. Removing one disputed
claim preserves unrelated page copy, children and evidence.

The monthly report checks current native owner authority before private inquiry
or booking reads, and again before sending. It reads the actual published
revision and immutable receipt history. Assistant citation results require a
completed saved probe; website readiness checks are shown separately. Missing inquiry, calendar or visibility
measurements remain unavailable. No real inquiry, calendar write or client email
was performed by this work.

Domain recovery records intent before submission and distinguishes never
submitted, unknown, rejected and confirmed outcomes. Known rejection can be
retried after a fresh provider lookup; accepted or ambiguous requests are only
reconciled. Concurrent authorized attaches still rely on the provider's unique
domain/project resource; strict one-request admission is not implemented.

Production acceptance remains pending. Jacob selected `scaffoldweb.com` as the
tenant-zero custom domain; Strelva is the business label for this internal proof.
Owner/workspace and source content remain to be verified. This selection does
not authorize production changes. The prepared migrations are
[website documents](../../supabase/migrations/20261001120000_website_documents.sql),
[domain registration attempt](../../supabase/migrations/20261001130000_domain_registration_attempt.sql),
and [agency catalog drafts](../../supabase/migrations/20261001140000_agency_website_document_drafts.sql).
The existing workspace prerequisite migrations and live schema must be reconciled
through the [production release checklist](horizontal-release-checklist-2026-09-11.md#september-21-production-preparation)
before choosing an exact execution sequence. `STRELVA_WEBSITE_REBUILD_RELEASE`
and the workspace release gate keep the new path disabled by default. Applying
migrations, changing production environment, deploying, creating tenant zero and
attaching its domain require Jacob's explicit approval under AGENTS.md. Paid
provider measurement, human blind judgment, a real calendar/inquiry journey,
Lighthouse and a verified production domain remain unproven.

## October 6 browser receipt: merged wave 1–2 surfaces (local preview)

Branch `w3/journeys` off `integrate/reborn-1.0` at `40ba7a72`. This is local
proof only. It used one `next dev` (Turbopack) on port 3200 with
`STRELVA_UI_PREVIEW=1 REB_DEV_UNGATED_ACCESS=1 REB_DEV_TENANT=gldf`. The CI
tenant fixture was copied to `dev-tenants.json` for the admin client page.
`.next`, `dev-tenants.json` and all screenshots were deleted afterwards.

**Sweep.** A headless Playwright script loaded each URL at 1440×900 and
390×844. On each load it recorded page errors, console errors and 5xx
responses, and checked for horizontal overflow (naming the elements that
overflowed). It also tabbed through the first 14 stops and flagged any focused
element whose computed outline, shadow, border, background or color did not
change. Three passes ran 326, 360 and 140 page loads, and each fix was rechecked on its own page.

- **Home:** `scenario=mooney|mooney-empty|mooney-loading|mooney-shared|mooney-member|mooney-error|agency-systems|twin-trees`,
  with `systems=on`. Mooney was also loaded with `needsYou=on`,
  `makeReal=partly|live`, `publishing=on|pending|disconnected|none` and
  `ask=on|off|error|forbidden|unsaved`. That covers Needs you, Systems,
  Strelva handled, In progress, From your site and Ask Strelva.
- **Flags off:** `systems=off` for mooney, agency-systems and twin-trees. The
  legacy scenarios free, paid, managed, business, agency, enterprise, empty,
  read-only, unavailable, signed-out, website-audit and recovery.
- **System pages,** opened directly by URL: Mediation intake, Mediation
  sessions, attymooney.com, The Mooney Firm inquiries, and the Google listing
  and newsletter (`publishing=on`). Both Twin Trees locations. The website
  System with `websiteDetail=empty|partial|connected|error|loading|permission`,
  as a member, shared, with `makeReal=partly`, and an unknown System id.
- **Agency home:** `agency=full|many|loading|empty|error|delegated|library-empty|library-error`.
- **Owner places:** Try it (`ready|changed|expired`). `/preview/strelva/workspace-site`
  for native and request kinds, every tab, roles member, admin and operator,
  and states empty, error, permission and not_found. `places` for inquiries,
  reviews, results and business-details in every state, plus each save result.
  `bookings` in every state and the day view. `recaps` in every state and the
  month view. Also the account, customers, inquiries views and rebuild
  scenarios, plus `website`, `components` and `colors`.
- **Operator:** `operator-queue` (full, incomplete, empty) and `who-decides`
  (ready, empty, denied, error, off). The real `/admin/queue` and
  `/admin/needs-you` show "Operators only" and "Needs you is off" without an
  operator session or the release. `/admin/clients/gldf` with its Domains
  view, which is empty: no monitor scan on record.

**Existing preview specs.** These ran against the same server and all 102
tests pass: `systems-experience-ui`, `workspace-ui-preview`, the three
`inquiry-*` UI specs, `illustrated-home`, `shared-frame`,
`self-service-library`, `tracker-local-preview`, `public-continuation-ui`,
`application-use-ui`, `custom-application-use-ui`, `atmospheric-components`,
`color-system`, `operator-surfaces` and `owner-surfaces`.

**Defects found and fixed**

| Defect | Fix |
|---|---|
| The `/preview/strelva/workspace` alias dropped `system`, so every System page opened by URL or reload said "This system isn't available here." It also dropped the `needsYou`, `publishing`, `ask`, `makeReal`, `agency` and `websiteDetail` switches. | The alias forwards them. Covered in `workspace-preview-alias.test.ts`. |
| Home's "From your site" and recaps links point to `${appBase}/workspace/<place>`, which returned 404 in the preview. | Added the `preview/strelva/workspace/[place]` alias to the fixture pages. Covered in `workspace-place-preview-alias.test.ts`. |
| Version lineage is now read only from `system_versions`, but the preview had no Version rows. Mediation intake showed no lineage, and the specs still expected the retired "Adapted from a source system" copy. | Added fixture Version rows (`previewStoredVersions`), covered in `preview-stored-versions.test.ts`. Updated the systems spec, and the agency spec now checks the Library tab. |
| On the website System page, Tab walked every link of the embedded live site, with no visible focus, before reaching Compare and Make real. | The preview iframes are `tabIndex={-1}`; Visit site is the keyboard route into the site. |
| In the standalone inquiry experience, the logo ("Strelva inquiries home") did nothing once you had left home, and there was no other way back. | The link returns to the home view when it points at the open page. The inquiry specs now use Recent work and the logo instead of the retired Work and Home links. |
| Ongoing work said "No ongoing work has been created." under a load error. | The empty line is hidden when there is an error. |
| On `/admin/clients/<id>` at 390px, the activity row overflowed by 8px. Its input also had no label. | The input gets `min-w-0` and `aria-label="Touchpoint"`. |
| The agency home spec expected the old per-client load banner. | It now checks the named Retry for the failed client and that the client loads on retry. |

**Not proven here**

- Live data on the admin queue, Who decides and the domain view. Those need an
  operator session and Postgres.
- The work and settings views call real APIs (`/api/operations`,
  `/api/work-economics/payer-transition` and `/api/websites/<id>`). In the
  preview those answer 503, and the screens show their error state.
- Release flags on `/admin/clients/<id>` return 403 under the dev bypass.
- No authenticated, hosted or production run.

## 1.0 signed-in journeys (authenticated local)

Five specs exercise the 1.0 owner and operator journeys against real local
Supabase Auth and Postgres. Without `STRELVA_LOCAL_AUTH_PROOF=1` they skip
everywhere, including `pnpm smoke`; the October 6 check showed all 10 tests
skipped. They have not yet run against a stack, because no Docker or Supabase
CLI was available on October 6. They are also not in the `authenticated-journeys` CI job yet.

| Spec | Journey |
|---|---|
| `tests/owner-journey-1-0-authenticated-local.spec.ts` | The operator converts a fixture tenant, designates Strelva's agency workspace and invites the owner. The owner accepts the signed link, lands in the workspace on `admin.<tenant>.localhost` and sees Systems and Needs you. The owner approves a booking by one-tap link with no session; a link for another recipient is refused. Then the owner undoes a Strelva-handled change. |
| `tests/operator-queue-authenticated-local.spec.ts` | The operator takes an owner's request in `/admin/queue` and closes it with 12 minutes, at 1440 and 390. A non-operator is refused. |
| `tests/make-real-authenticated-local.spec.ts` | Make real on a website Possibility through Needs you. The result is partial and isolated, and the live site is unchanged. A member is refused. |
| `tests/booking-approval-authenticated-local.spec.ts` | Booking requests become Needs you decisions. Approve, pressed from the keyboard, confirms one; Not yet declines the other. Runs at 1440 and 390. A visitor's request on the tenant host, with no Redis, reaches Needs you and is confirmed. |
| `tests/email-only-owner-authenticated-local.spec.ts` | An owner with no account decides by email link only, after the hourly chase opens the ask. GET changes nothing, and a tampered recipient is refused. The same owner approves Make real by email link. |

Shared steps live in `tests/support/journeys.ts`. Operator steps run the real
operator scripts (`convert-tenant-to-workspace`, `business-ownership`) with
`--apply`; those scripts refuse a database that isn't on loopback. Client email
stays off, so the chase records deliveries as suppressed. The specs rebuild the
email's one-tap link with the same signer (`buildWorkspaceApproveUrl`).

The three steps that were `test.fixme` are real tests since `w4/journey-gaps`
(October 6). Like the rest, they have not yet run against a stack:

- Strelva handled lists the approved booking decision, says Strelva confirmed
  it, and says why it isn't a one-tap undo
  (`20261009130000_strelva_handled_decisions.sql`).
- A visitor's request-mode booking goes through `/api/booking` on
  `<tenant>.localhost` with the one store serving and no Redis. The step
  seeds seven days of booking parity with `psql` on the disposable database
  (`STRELVA_LOCAL_DB_URL`, exported by `prepare-launch-auth-stack.sh`), so it
  needs `psql` on the runner and `STRELVA_BOOKING_STORE_READ=postgres` and
  `CONTENT_SOURCE=postgres` on the app server. The server caches the parity
  streak for five minutes, so run it on a fresh server.
- An owner with no account approves Make real by email link
  (`20261009131000_make_real_owner_link.sql`). The chase opens the ask as
  Strelva (system), and the result says it ran on an isolated copy.

Strelva's agency designation is permanent: the table refuses update and
delete. Run these specs only on a disposable stack. A rerun replays the
existing designation.

### How to run (needs Docker and the Supabase CLI 2.117.0)

Run from a checkout with **no `.env.local`**. `next dev` loads it, so any Redis
or Resend keys in it would reach real services.

```bash
test ! -e .env.local || { echo "Move .env.local aside first."; exit 1; }
export STRELVA_PROOF_TMP="$(mktemp -d)"

# 1. Disposable Auth + Postgres on loopback, all migrations applied.
env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL \
  CI=true STRELVA_LOCAL_AUTH_PROOF=1 RUNNER_TEMP="$STRELVA_PROOF_TMP" GITHUB_ENV="$STRELVA_PROOF_TMP/env" \
  bash scripts/prepare-launch-auth-stack.sh
set -a; source "$STRELVA_PROOF_TMP/env"; set +a

# 2. Flags and local-only secrets, shared by the app and the runner.
export STRELVA_LOCAL_AUTH_PROOF=1 STRELVA_WORKSPACE_RELEASE=1 STRELVA_SYSTEMS_RELEASE=1 \
  STRELVA_NEEDS_YOU_RELEASE=1 STRELVA_OWNER_ENTRY=1 STRELVA_BOOKING_STORE_WRITE=1 \
  STRELVA_BOOKING_STORE_READ=postgres CONTENT_SOURCE=postgres
export APPROVE_LINK_SECRET="$(openssl rand -hex 32)" CRON_SECRET="$(openssl rand -hex 32)"
export REB_DEV_UNGATED_ACCESS=0 SCAFFOLD_DEV_UNGATED_ACCESS=0 EMAIL_SENDING_ENABLED=false \
  CUSTOMER_EMAIL_ENABLED=false OPERATOR_EMAILS_ENABLED=false PROSPECT_EMAILS_ENABLED=false
export PLAYWRIGHT_BASE_URL=http://localhost:3100 NEXT_PUBLIC_APP_URL=http://localhost:3100

# 3. One app server (the specs also open admin.<tenant>.localhost:3100).
pnpm exec next dev --hostname localhost --port 3100 > "$STRELVA_PROOF_TMP/app.log" 2>&1 &
app_pid=$!
until curl --fail --silent http://localhost:3100/sign-in > /dev/null; do sleep 2; done

# 4. The journeys.
pnpm exec playwright test \
  tests/owner-journey-1-0-authenticated-local.spec.ts \
  tests/operator-queue-authenticated-local.spec.ts \
  tests/make-real-authenticated-local.spec.ts \
  tests/booking-approval-authenticated-local.spec.ts \
  tests/email-only-owner-authenticated-local.spec.ts \
  --workers=1 --retries=0 --reporter=line

# 5. Stop and clean up.
kill "$app_pid"
supabase stop --workdir "$STRELVA_AUTH_STACK_DIR" --no-backup
rm -rf "$STRELVA_PROOF_TMP" .next
```

Screenshots land in `test-results/` at 1440 and 390. They cover the accepted
invitation, admin-host Home, the one-tap pages, the queue, Make real and
bookings. If the admin host does not connect, restart step 3 with
`--hostname 0.0.0.0`. The first real run may expose a few things:

- The conversion script reads legacy stores and may misbehave without Redis.
- The exact Undo label.
- Whether the isolated Make real reports a status other than `made_real`.

A green run here is local proof only, never a production claim.
