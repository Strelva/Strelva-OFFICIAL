# W6 stream: journeys

October 8 follow-up on `e9ac136f`: issue #501's anonymous booking and released
inquiry checks pass locally; the qualified stable-baseline profile passes all
12 flags-on journeys and native Version owner releases. All eight flags-off
journeys passed after current agency-maker fixture qualification. The original
account-free acceptance and generic Versions proof remain unqualified; the
website reconciliation/refresh discrepancy is a separate unresolved follow-up. See the [dated repair and proof
matrix](evidence/journey-501-2026-10-08.md) for current contracts, failures and
safe reproduction. The October 7 baseline below is historical.

Status: baselines recorded locally (Oct 7 2026); journeys remain red. Branch
`w6/journeys`, based on `integrate/reborn-1.0` @ 0479cdab (the Oct 6 workspace
redesign is in it). Runtime and migrations match that base; the branch changes
only the journey harness, tests and handoff. This is local browser/database
evidence, not a production or release-readiness claim. Refs #336; reader fix
is owned separately by #252 (`a1/readers-fix`).

## Goal
The 1.0 signed-in journeys run and pass locally, end to end, against a
disposable local Supabase, with flags on and with flags off. One command:
`pnpm check:journeys`.

## The command
`pnpm check:journeys` (`scripts/check-journeys.sh`):
- Starts a loopback Supabase (CLI 2.117.0 via npx, unique project id, free
  ports) and applies every migration (`scripts/prepare-launch-auth-stack.sh`).
- Runs `scripts/check-readonly-rpcs.mjs` against it (see findings).
- **Flags on**, the way production runs: `CONTENT_SOURCE`, `TENANTS_SOURCE`,
  `DATA_SOURCE=postgres`, the bookings and leads read/authority switches, seven
  seeded parity days, and a loopback Redis (`scripts/journeys-redis.ts`: a
  disposable `redis-server` behind the scrubbed copy's Upstash REST bridge, no
  new dependency). Flags: `STRELVA_SYSTEMS_RELEASE`, `STRELVA_NEEDS_YOU_RELEASE`,
  `STRELVA_OWNER_ENTRY`, `STRELVA_BOOKING_STORE_WRITE`,
  `STRELVA_MAKE_REAL_OWNER_LINK_RELEASE`, `STRELVA_INQUIRY_RECORDS`.
- **Flags off**, the way CI's launch verification runs: no Redis, default
  sources, every 1.0 flag unset.
- Each phase runs on its own `next dev` and is checked against required spec
  counts (`scripts/check-launch-browser-results.mjs`, `journeys-on` / `journeys-off`).
- Sends stay local: `EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED`,
  `OPERATOR_EMAILS_ENABLED`, `PROSPECT_EMAILS_ENABLED` are false; deliveries are
  recorded as suppressed; specs rebuild one-tap links with the same signer.
  `.env.local` / `.env` must be absent (the script refuses otherwise).
- Options: `--keep-stack`, `--reuse <dir>`, `--only on|off`,
  `--with-proposed-fixes`, `-- <playwright args>` (e.g. `-- -g "Versions"`).

| Journey | Spec | Phase |
| --- | --- | --- |
| Test-tenant conversion, agency designation, owner invite and accept, owner entry on the admin host, Needs you, one-tap approve, Strelva handled + undo | `owner-journey-1-0-authenticated-local.spec.ts` (2) | on |
| Operator queue: take, close with minutes | `operator-queue-authenticated-local.spec.ts` (2) | on |
| Make real through Needs you, partial result | `make-real-authenticated-local.spec.ts` (1) | on |
| Bookings: request → Needs you → Confirm / Not yet; visitor request on the tenant site | `booking-approval-authenticated-local.spec.ts` (3) | on |
| Email-link approval for an owner with no account (booking, Make real) | `email-only-owner-authenticated-local.spec.ts` (2) | on |
| Versions: source shared, owner approves release 1; agency improvement, Review all, owner approves release 2 | `versions-authenticated-local.spec.ts` (1, new) | on |
| Inquiries: Postgres-first capture, held spam released by the owner | `inquiries-1-0-authenticated-local.spec.ts` (1, new) | on |
| Every 1.0 surface dark with flags off | `release-1-0-flags-off-authenticated-local.spec.ts` (1) | off |
| Today's launch journeys (CI set) | launch-business, application-use, onboarding, service-request | off |

## Findings

1. **Ten 1.0 readers fail through supabase-js (product bug, migrations unapplied).**
   PostgREST runs STABLE functions in a read-only transaction. Each of these is
   STABLE and reaches a row lock through its actor check, so every app call
   fails with `25006 cannot execute SELECT FOR KEY SHARE / FOR SHARE in a
   read-only transaction`. Confirmed one by one over PostgREST on the local
   stack with a legitimate caller. Unit and SQL checks miss it because psql
   transactions are read-write.
   - Operator queue (`20261007160000`): `read_operator_queue_context`,
     `read_outside_write_receipts` — the queue never shows marks: Take says
     "Taken." and the row never says "Taken by you"; notes and closes don't show.
   - `20261008123000`: `read_google_listing_readback_failures`.
   - Business effort (`20260928130000`, `20261007160100`): `read_business_effort`, `read_effort_businesses`.
   - `20261007155000`: `read_make_real_activation`.
   - `20261007182000`: `export_workspace_v3_category`.
   - Websites (`20261008150000`, `20261008150100`): `read_website_current_tenant`,
     `read_website_linked_publications`, `read_website_domain_approvals`.
   **Fix (separate #252 stream):** declare each reader VOLATILE in an
   additive migration; checksum-pinned release migrations must remain unchanged.
   `scripts/journeys-proposed-fixes.sql` has the exact
   statements; `pnpm check:journeys --with-proposed-fixes` applies them to the
   disposable database only. `pnpm check:readonly-rpcs <db-url>` guards the class.
2. **The redesign renamed Needs you verbs** (`needs-you-presentation.ts`):
   booking asks say "Confirm", go-live asks "Make it live". Specs updated.
3. **Fixture tenants and the tenant cache.** With `TENANTS_SOURCE=postgres`,
   a tenant written straight to Postgres is invisible until `reb:tenants:all`
   expires; without Redis, the per-process copy holds it for 60s. The fixture
   helper drops the key, as the app's own tenant writes do.
4. **`next dev` and client admin hosts.** Next builds `request.url` from its
   bound host, so admin-host same-origin guards and redirects differ from
   Vercel. The specs route admin hosts through a shim (`serveAdminHostsAsOnVercel`);
   product code is unchanged.

## Baseline on integrate/reborn-1.0

Measured October 7, 2026, using runtime/migrations at `0479cdab`, journey
branch input `bf5d8fd3`, and the harness corrections below. Docker 29.6.2,
local Supabase CLI **2.117.0 via npx** (Homebrew has 2.120.0), real Supabase
Auth/Postgres, Chromium desktop project, one worker, zero retries. Flags-on
specs also check 1440px and 390px layouts; email-only owners have no account.
No real email, hosted database, provider write or deployment was used.

Both retained disposable stacks were stopped after the runs.

The fresh initial compound run hit `ENOSPC` while Turbopack compiled invitation
acceptance. Its flags-on phase was interrupted (12 skipped), so it is **not** a
product baseline. Once disk space recovered, all 12 flags-on tests executed.
Plain on and on+fixes reused the same isolated database; flags off was run
against a separate fresh, unmodified database. Raw local logs and traces stay
in `test-results/journeys-baselines/` and `test-results/journeys-{on,off}/`;
[retained summaries](./w6-journeys-baselines-2026-10-07.json) contain the final
per-test status and failure assertions without local credentials.

- **Flags on, plain:** `pnpm check:journeys --reuse <local-stack> --only on`.
  **8 passed, 4 failed**, no skipped/flaky tests; exit 1. The RPC guard reports
  the ten known STABLE readers. Browser failures: visitor booking, inquiry
  release marker, and operator queue at both widths.
- **Flags on, proposed local SQL:** `pnpm check:journeys --reuse <local-stack>
  --only on --with-proposed-fixes`. **10 passed, 2 failed**, no skipped/flaky
  tests; exit 1. RPC guard: **786 public functions checked; none reach a row
  lock**. Both operator queue journeys now pass. Only the visitor booking and
  inquiry release-marker failures remain. No migration or reader implementation
  was edited in this branch.
- **Flags off, unmodified schema:** `pnpm check:journeys --only off
  --keep-stack`, then `pnpm check:journeys --reuse <fresh-unmodified-local-stack>
  --only off` after harness corrections. **3 passed, 5 failed**, no skipped/flaky
  tests; exit 1. The dark-surface regression, onboarding and service requests
  pass. All five failures are the existing application/launch maker guard
  described below. The RPC guard independently reports the original ten
  readers; flags-off testing does not certify those readers.

### Failures beyond #252

1. **Anonymous visitor booking is sent to sign-in.** The tenant-host
   `/api/booking/availability` navigation follows a sign-in redirect and returns
   HTML (200), so the JSON assertion fails. `src/proxy.ts` does not exempt
   `/api/booking` from public-host auth gating. The full visitor capture,
   duplicate-slot refusal and owner confirmation sequence remains unproven.
2. **Released inquiry loses its visible receipt and hold control.** Release
   succeeds, the database is updated, and the message appears among normal
   inquiries, but the card lacks “Released from held messages.” and its
   return-to-held control. `WorkspaceInquiries.tsx` renders both only when
   `releasedRowId` exists. Both plain and proposed-fixes runs reproduce it;
   the marker/read path needs investigation by the inquiries owner.
3. **Five existing flags-off native-tool journeys fail the maker guard.**
   Three application-use tests and both launch-business widths receive
   `403 {code: "make_systems_required", error: "Ask Strelva to build this."}`
   where the old fixtures expect 201. Reconcile those fixtures with the
   current `make_systems` authority contract; do not weaken the product guard
   to make these tests green.

### Harness corrections and verification

- The result gate now requires all **12 on / 8 off** tests, including both
  operator widths, all three booking cases, and all three application-use
  cases. Added positive profile checks and a missing-test rejection for every
  required spec, even when summary counts claim success.
- The admin-host shim uses the generic local environment, allowing flags-off
  routing without requiring flags on. The flags-off UI assertion targets the
  visible Current workspace selector, its business ID and selected label,
  instead of a hidden option. The Oct 6 frame intentionally keeps “Needs you”
  and “Strelva handled” headings with flags off; the test checks their legacy
  fallback content, no 1.0 action buttons, and no decision-feed reads instead
  of incorrectly requiring those headings to disappear. APIRequestContext
  connects to loopback with the admin Host header because its DNS does not resolve `*.localhost`. The
  no-decisions assertion uses the authorized RPC: `owner_decisions` denies
  direct service-role table reads by design.
- `pnpm typecheck`: **passed (exit 0)**.
- `pnpm lint`: **passed (exit 0)**.
- `pnpm exec vitest run src/__tests__/launch-browser-results.test.ts
  src/__tests__/owner-journey-copy.test.ts
  src/__tests__/inquiry-preview-journey.test.ts --maxWorkers=2`:
  **3 files / 42 tests passed**. The brief's `pnpm test -- <paths>` forwards
  the delimiter to Vitest and starts the whole suite with this pnpm version;
  that accidental invocation was stopped, and the explicit filtered command
  above completed. No whole-suite pass is claimed.
- `pnpm check:boundaries`: **failed (exit 1)** on eight existing imports in
  `src/experience/workspace/outcomes/`: `AiMirror`, `LocationHeatmap`,
  `LoopRibbon`, `PriceSheet`, `RatingTrend`, `ReplyPattern`,
  `SundayPictureText` → `@/lib/motion`; `ai-mirror` →
  `@/lib/ai-visibility-scorecard`. These files match the tested base `0479cdab`.
- Shell syntax and Node syntax checks for the journey runner, stack preparation,
  result gate and RPC guard: **passed**. `git diff --check`: **passed**.
- SQL suite was not rerun: this branch changes no schema; all migrations were
  applied successfully to the disposable databases.

## Next action

During these runs, the integration branch advanced to `115448a9`: #487
(reader fix) and #491 (boundary fix) were merged there. This worktree was kept
on the requested baseline; its recorded failures do not describe that newer
tip.

Orchestrator: integrate this test/evidence PR after review, then reconcile the
three remaining failure groups with their owning streams and release-readiness
record. #252's additive reader migration landed through #487; rerun plain
`pnpm check:journeys` on the updated integration branch. A green run still needs
all 12 on and 8 off tests without skips or retries, plus the boundary
check rerun after #491. Local proof does not authorize deployment.
Strategic/release state reconciliation is deferred to the orchestrator because
this sub-agent is confined to the supplied worktree. No release, commercial,
or production state was changed.
