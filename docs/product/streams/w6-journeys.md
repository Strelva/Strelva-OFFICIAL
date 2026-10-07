# W6 stream: journeys

Status: in progress (round 5, Oct 7 2026). Branch `w6/journeys`, rebased onto
`integrate/reborn-1.0` @ 0479cdab (the Oct 6 workspace redesign is in it).
This branch changes no product code: `git diff integrate/reborn-1.0 -- src supabase`
is empty, so a run on this branch is the run on `integrate/reborn-1.0`.

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
   **Fix (owning streams, before the batches are applied):** declare each
   reader VOLATILE. `scripts/journeys-proposed-fixes.sql` has the exact
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
Pending the full run (flags on, then flags off).

## Next action
Finish the flags-on run (plain, then `--with-proposed-fixes`), run flags off,
record both baselines here, then the brief's verification commands.
