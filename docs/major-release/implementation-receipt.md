# IMP-01 implementation receipt

Prepared 2026-09-08. This is a local toolchain and verification receipt for
`IMP-01` / `AC-13`; it is not a release authorization, deployment record or
production result. The product release version remains unselected.

## Scope and requirement mapping

This change covers:

- `OPS-08`: exact pnpm/package/lock compatibility, current Next.js advisory
  review, patched locked dependencies, and configuration-level generated-output
  lint ignores.
- `OPS-09`: hosted/local gate inventory, restore-safe `dev-tenants.json`
  handling, and explicit `ready_for_review` browser workflow activity.
- `OPS-13` / `AC-13`: exact commands, synthetic data boundaries and limitations
  for local evidence. The release-one script includes the current
  account/recovery/Website Audit/shared-frame paths and picks up future
  Enterprise/Home Finder/IDX-focused Vitest files by name.

No production environment, database, provider, tenant, client site, marketing
repository or live IDX installation was changed.

## Dependency and security evidence

| Command or inspection | Result | Scope and limitation |
| --- | --- | --- |
| `npx --yes pnpm@10.34.5 install --lockfile-only --ignore-scripts --reporter=append-only` | Pass | Regenerated the root lockfile without touching `node_modules`. |
| `pnpm --version` | `10.34.5` | The repository `packageManager` field resolves the local Corepack shim to the selected exact toolchain. |
| `pnpm install --frozen-lockfile --lockfile-only --ignore-scripts --reporter=append-only` | Pass | Frozen lock/config validation in the shared checkout; lock-only by design while other workers use shared `node_modules`. |
| `pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only` | Pass in isolated checkout `/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/strelva-frozen-install.SpiCYj` | `Lockfile is up to date`; 737 packages installed; `Done in 12.3s using pnpm v10.34.5`. The shared checkout's `node_modules` was not touched. |
| Isolated current-tree `npx --yes pnpm@9.15.9 install --frozen-lockfile --lockfile-only --ignore-scripts --reporter=append-only` | Pass: `Done in 229ms using pnpm v9.15.9` | The pre-change archive failed with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`; this compatibility check did not install dependencies into the shared checkout. |
| `pnpm audit --audit-level high` | Pass: `No known vulnerabilities found` | Uses the regenerated lockfile and does not weaken audit severity or add ignored GHSA IDs. |
| Official Next.js advisory review | Patched line selected: `next` / `eslint-config-next` `16.3.4` | [GHSA-2xp9-vwfh-vxw4](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and [GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) list `16.3.3` as patched; the official [Next.js August 2026 security release](https://nextjs.org/blog/august-2026-security-release) confirms the patched 16.3.3 Active LTS line. `16.3.4` is a later compatible patch release. IDX's separate `16.2.6` package remains outside this receipt and needs its owner's coordinated decision. |

The audit was checked before changing the dependency graph: it reported two
critical Next.js advisories plus other high/moderate/low transitive findings.
After updating the direct patched line and locking the affected transitive
versions, the same high-severity command reports no known vulnerabilities.

## Verification-script and workflow evidence

`pnpm exec eslint eslint.config.mjs`, an ESLint probe over one file in each
generated directory (`.next-self-service`, `.next-self-service-build`,
`.validation-artifacts`, `.next-playwright`), `bash -n scripts/check-ci.sh
scripts/check-release-one.sh`, and `git diff --check` all passed for the owned
implementation files. The CI workflow
now uses `pnpm/action-setup@v4` with `10.34.5`, includes ontology and isolated
workspace SQL gates, and declares:

```yaml
pull_request:
  types: [opened, synchronize, reopened, ready_for_review]
```

Every browser step also requires `github.event_name == 'pull_request'` and
`github.event.pull_request.draft == false`, so a draft-to-review transition
cannot silently omit the browser gate and a main push cannot accidentally run
it.

`scripts/check-ci.sh` exports empty provider/data values in its child process so
Next.js cannot repopulate them from `.env.local`, runs lint, typecheck, product
boundaries, ontology, isolated SQL, coverage, high-severity audit, build, public
smoke, workspace browser acceptance and no-Redis surface smoke, then reports
hosted evidence as a separate requirement. `scripts/check-release-one.sh` adds
explicit Vitest coverage for account/recovery, workspace context, Website Audit
and the shared frame, discovers future Enterprise/Home Finder/IDX/installation/
Assessment/Access test files, and runs focused public, workspace and isolated
preview shared-frame browser specs.

The stubbed release-one command-runner test completed every declared command and
printed this current inventory: customer readers/repository/routes, Home Finder
preview/server adapter, assessment contracts and access-request tests; it explicitly
reported `Enterprise-specific Vitest inventory: none present` and
`IDX/installation-specific Vitest inventory: none present`. Those messages are
an honest pending-evidence signal, not a passing Enterprise/IDX claim.

## Fixture-preservation tests

These checks used stubbed commands and did not install, build or contact a
provider:

1. In the shared checkout with no initial `dev-tenants.json`, a stubbed
   `pnpm smoke:surfaces` returned exit 17. The harness reported
   `absent fixture restored; status=17`, and the fixture was absent afterward.
2. In an isolated temporary checkout with a pre-existing fixture, a stubbed
   `pnpm smoke:surfaces` returned exit 23. A SHA-256 comparison reported
   `pre-existing fixture restored; status=23`; the original fixture content was
   restored after the failed command.
3. In an isolated temporary checkout with a pre-existing symlink, a stubbed
   `pnpm smoke:surfaces` returned exit 29. The symlink and target hash were both
   unchanged after cleanup (`pre-existing symlink and target restored; status=29`).

The GitHub Actions surface step uses the same backup/restore semantics inline.
It restores on normal failure and on HUP/INT/TERM through an EXIT trap. The
local harness does not delete a developer's pre-existing fixture.

## AC-13 evidence status

| Evidence class | Local result in this receipt | Remaining proof |
| --- | --- | --- |
| Frozen install/config | Full isolated frozen install passes under pnpm 10.34.5; lock-only checks and pnpm 9 compatibility also pass without shared install | Hosted install step on the selected commit. |
| Dependency security | High-severity audit pass after advisory remediation | Hosted audit step on the selected commit. |
| Fixture safety | Absent, pre-existing regular-file and pre-existing symlink failure paths all restore correctly | Hosted surface step on the selected commit. |
| Script syntax/inventory | Shell syntax/workflow conditions pass; stubbed release-one run prints the present and absent future-suite inventory | Hosted non-draft run must show browser jobs actually executed; Enterprise/IDX suites must be added before their AC rows can pass. |
| Changed-boundary tests | Current 24-file focused Vitest run: 168 passed, 1 skipped, exit 0; `pnpm typecheck` exit 0. Shared run used existing Vitest 4.1.5; locked install contains 4.1.11. | Broadened local/hosted gates coordinated with the release owner. |
| SQL/build/browser/production | Not claimed here | Isolated SQL, clean build, browser run, confirmed sessions and production evidence remain separate gates. |

No hosted Actions URL or production timestamp is asserted by this local
receipt. The coordinator must add the selected version, exact commit
identities, migration/configuration hashes, changed sibling receipts and
authorized production evidence before calling `AC-13` complete.
