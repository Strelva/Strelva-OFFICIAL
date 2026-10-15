# Release gate source preparation · October 14, 2026

This candidate repairs the release checks without changing production gates,
provider configuration or client state. Local checks qualify only their stated
scope. The merge coordinator owns the composed source and remaining execution.

## Dependency and secret gates

CI and nightly use `pnpm check:supply-chain`, which checks the complete audit,
production audit, licenses and immutable workflow pins. The existing
`scripts/supply-chain-policy.json` exception for GHSA-vfj7-8cjw-p6xm is limited
to development dependencies, reviewed October 9, rechecked October 14 and expires
October 23. It never exempts a production dependency or another advisory. The
[upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still records
no patched version at this check. Recheck before expiry; use a compatible patched
version when available. This is an exception, not a vulnerability repair.

Gitleaks uses the existing policy's immutable 8.30.1 image. `.gitleaksignore`
contains 47 exact line fingerprints covering the 263 findings triaged in the
October 14 audit gap-4:
220 source hashes, 24 disposable tokens/hashes and 19 fictional test values.
It deliberately excludes both `dev-tenants.json` historical findings. The
security workflow should continue to fail on those two until Jacob authorizes
rotation of both client revalidation secrets and the signed readback is retained.
History is public; deleting the old file did not revoke its credentials.

October 15 update. A local `node scripts/check-supply-chain.mjs` on the base
returned `blocked` with `license_review_required` for `@sentry/cli`,
`@sentry/cli-darwin` (`-linux-x64` on the CI runner) and `gsap`. The braces
advisory sat under `audit.all.excepted` (valid until October 23) and the production
audit had 0 findings, so braces was not the cause of the red "Audit dependencies"
step. `scripts/supply-chain-policy.json` now has a `reviewedPackages` list: each
entry names one package, its exact license string and exact versions, a use
(`build-tool` or `distributed`), an owner, a review date and a license source.
The list is empty. `@sentry/cli` 2.58.5 (FSL-1.1-MIT, build-time only, nine
platform packages) and `gsap` 3.14.2 (GSAP Standard License, ships in client
website components) need Jacob's approval before any entry is added. The
registry audit did run locally on October 15 (`pnpm check:supply-chain`,
read-only registry traffic): status `blocked`, issues exactly
`license_review_required:@sentry/cli`, `license_review_required:@sentry/cli-darwin`
and `license_review_required:gsap`. `audit.all` has 1 finding, braces, excepted;
`audit.production` has 0. The block is the unreviewed licenses above, not an advisory.

October 15, secret scan. Locally, Gitleaks reports exactly two findings:
`eb67cd15b278cf5e4da33d358f1e68919c047ad1:dev-tenants.json:generic-api-key:23`
and `...:47`, both dated 2026-04-30. The Security job stays red by design on these
two, and `.gitleaksignore` is unchanged. Closing it needs Jacob's approval plus
proof that the app database's stored copy of both revalidation secrets was
re-encrypted and read back. The live sites' secrets already differ from the leaked
values and signed probes with the leaked values return 401.

## Replay and migration order

Push and nightly select the same PostgreSQL 18 server/client tools through
`scripts/check-postgres-tools.sh`; wrong-major or incomplete toolchains fail
before replay. Push now runs both workspace SQL and the full ordered upgrade.
No migration body or existing version was changed. A PostgreSQL source-definition
hash can depend on server major version, so tool selection is part of this proof.
Actual clean replay remains required after merge; this lane cannot execute SQL.

`pnpm check:migration-order` preserves the exact forward-filename baseline from
`be68287b5` (392 forwards after excluding named verify/rollback helpers). Historical
future dates and invalid hours are retained as ordered identifiers. New forward
versions must be valid UTC timestamps strictly above `20261024800001`; new
backdated files, duplicate versions, deleted or renamed retained files fail.
The baseline is a source inventory, never an applied-production catalog. No
migration was needed for this lane.

## Browser and monitoring proof

`pnpm smoke` includes a `recorded` context with the six observed-on release gates
from REPORT section 2 of the October 14 audit, and Needs you off. Unknown Systems,
Ask, AI-cap, email and model-call settings are not inferred. Provider credentials,
Auth bypass and UI previews stay off in that context. Its sign-up and signed-out
routing tests do not establish a completed authenticated customer journey.

The existing fixture review context exercises review decisions; the native,
dark and private Auth contexts remain mandatory. Original fixture identity and
manifest checks prevent a renamed test from silently disappearing. Main pushes
must execute the browser gates as well as ready PRs. Coordinator execution:

```bash
pnpm typecheck
pnpm check:migration-order
pnpm check:supply-chain
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
pnpm smoke
```

The SQL commands start only throwaway local clusters. Browser checks own their
local app/Auth harnesses; hosted providers stay unqualified. The completion brief
prohibits this lane from running SQL, dev servers, builds, Playwright or Docker.

Private workspace/business/inquiry errors are scrubbed before reporting, with
arbitrary content and identity removed. Source frames and normalized route
identity retain diagnostic value. Browser initialization uses only
`NEXT_PUBLIC_SENTRY_DSN` and stays off when unset. No server secret environment
module is imported into the browser. A configured server DSN/public DSN and a new
deployment followed by a controlled error receipt are still required for hosted
monitoring proof.

## Version and next action

The candidate package is 1.0.0. Health already reads the package fallback;
`APP_VERSION` remains an explicit deployment override and must be reconciled at
release. The 1.0.0 changelog entry remains Unreleased. The public lane must align
its package/lockfile version before `pnpm version:check`; no tag or deployment is
created by this preparation.

The next agent should integrate the lane, run the composed checks above and all
changed browser specs on desktop and phone, retain exact receipts, then prepare
Jacob's production decisions listed in [launch blockers](launch-blockers.md#current-blockers).
Canonical model updates belong to the integration writer: release machinery is
prepared, hosted operation and ordinary-account acceptance remain unproven.
