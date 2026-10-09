# F02 / F08: qualification and supply-chain lane

Implementation base: `reborn-1.0` at `6ddc03f4d0f854997ff3f54481d5066625bf62fe`.
The program's earlier `a1306213f` snapshot is source history only. This lane
does not copy or edit the coordinator's README, plan JSON, research or model.

## Existing behavior and gap

Actions intend Node 22 and pnpm 10.34.5; package.json pins only pnpm. Supabase
configures PostgreSQL 17, while local CI silently prefers Homebrew PG18 and
hosted CI accepts any server major. Playwright is pinned to 1.59.1, but a
locally selected Chrome channel can change what a browser receipt means.
Security uses mutable Action tags and a `latest` scanner. Its custom config
does not explicitly extend default rules and broadly allows secret variable
assignments. One development advisory is ignored without an enforced expiry.
Next 16.3.8 and sharp 0.35.5 are already fixed and will not be upgraded here.

## Owned files and behavior

- `scripts/qualification-profile.json`, `scripts/check-qualification.mjs`,
  focused Node tests, package scripts/engine declaration and `.node-version`:
  enforce Node 22, pnpm 10.34.5, installed runtime/browser versions, same-major
  server tools and explicit configured-PG17 versus historical-PG18 profiles.
- `.github/workflows/*.yml` and `scripts/check-ci.sh`: narrow preflight wiring
  and immutable existing Action pins, without changing workflow triggers,
  deployment/tag authority, shared SQL runners or fixtures.
- Supply-chain policy/check scripts and focused tests: validate bounded
  advisory exceptions, current high-risk audit, installed license inventory,
  frozen-install intent, official scanner provenance and redacted seeded scan.
- `.gitleaks.toml`: enable upstream rules and remove broad assignment bypasses.
- `.githooks/pre-commit`: reuse the same redacted scanner wrapper for staged
  changes; retire the second mutable Docker scanner invocation.
- `docs/operations/testing-and-ci.md`: only qualification/supply-chain sections.

## Acceptance and failure tests

Wrong Node/pnpm/runtime/browser version, missing/mixed/wrong-major server tools,
unknown profile and browser channel override fail before heavy checks. Profile
output names local shim limitations; configured PG17 never means managed/Auth
qualification. PG17 absent locally is retained as a blocker, not rescued with 18.

Mutable/unapproved Action/scanner revisions, mismatched exception/ignore lists,
expired/malformed exceptions, unavailable audit data, unexcepted high findings
and unknown/restricted licenses fail clearly. A generated fictional credential
must be detected without printing its value. Frozen installation must leave
package/lock dependency versions unchanged; Next/sharp pins are verified.

## Deletion targets and exact checks

Delete duplicated Postgres discovery from CI/check-ci in favor of one preflight;
delete mutable Action/scanner references and the secret-assignment allowlist.
Do not delete shared caches, prior failures or another owner's output.

Run `node --test scripts/tests/qualification.node-test.mjs` and supply-chain
Node tests; `pnpm install --frozen-lockfile`; `pnpm check:qualification` (retain
missing PG17/wrong Node failure); explicit `--profile historical-pg18`; current
audit/license inventory; scanner self-test and exact-source redacted scan;
`pnpm typecheck`; `git diff --check` and scoped lint. No full units, Next build,
Docker/Auth or native SQL run without the parent's resource grant.

## F03 ownership and source disposition

SQL harness owns local admission/helpers and shared SQL repairs. This lane
inspects prepared proof-runner source and returns adoption deltas only. No
private #611 migration graft, alternate SQL runner or duplicate admission
module is authorized. Three combined rehearsals, hosted CI, managed PG17/Auth
and provider execution remain acceptance outside these local checks.

### Prepared F03 source inspected (no adoption)

The read-only source packet is
`/Users/jacobrhinehart/Desktop/strelva/.scratch/full-model-completion-2026-10-09/reusable-local-verification-runner-unit-worker-successor/`.
Its `local_proof_runner.py` SHA256 is
`f93e1e0e866c6b0a9e0c93565363aad027536d2e3ceb686dc2722e424c61035b`;
`READY.md` SHA256 is
`fff62e0d0802478f708d5c7dd1221e571dfc0d5065ffc25dfc8289061e0bf533`.
The original implementation packet records `98cb70...` with 15 controls; the
worker successor records five additional worker controls and retained earlier
review controls. These are prior packet claims, not new executions in this lane.

Source owns clean-HEAD admission, before/end source/dependency/tool hashes,
finite environment, exclusive private evidence, raw-versus-aggregate exit,
bounded helper receipts, sampled owned-process closure and cache exclusions.
Its optional worker count is an explicit request, not measured concurrency.
Reuse this machinery through its owner; a second runner would recreate it.

Exact adoption deltas/blockers:

1. The successor still requires independent narrow review of its external
   runner pin. An older reviewed runner hash cannot qualify its newer bytes.
2. It supports only build/unit/lint. F03 still needs explicit mandatory suite
   status, SQL/Auth health, disk admission/serialization through the harness
   owner (this inspected runner samples disk before/end without a threshold), and three exact-current-candidate rehearsals with elapsed time and
   measured human interventions. None ran here.
3. Tool probes pin Node bytes/version but do not enforce F02's Node22 profile;
   its source-contract pins omit `.node-version` and the qualification JSON.
   Adopt the F02 preflight result/hash and stage name before launch, without
   calling PG18 managed/configured-PG17. Browser/Auth remain separate scopes.
4. Cached pnpm is tied to `~/.cache/node/corepack/v1/pnpm`, and build admission
   requires source/dependencies under `/private/tmp` for a private tracing hook.
   This Croki checkout is outside that location. Source/dependency isolation and
   an authorized compatible build path must be selected, not bypassed.
5. No private #611 migration or unrelated prepared source was imported. The SQL
   harness remains the exclusive owner of runner/shim/admission repairs.

## Local implementation evidence (October 9)

- Frozen installation passed with pnpm10.34.5; lockfile SHA256 remains
  `0569cd8a155c1a02ef8873a2274a48f5c932e8aa2a404d51edf1235de86ada15`.
  Dependency/devDependency/override/build-allowance fields match the exact base.
- Thirteen Node controls pass: profile mismatches, missing/mixed server tools,
  browser override/revision/download refusal, immutable pins, exception expiry,
  prod/critical refusal, unavailable/muted audit, licenses and secret redaction.
- Installed Next/eslint-config-next16.3.8, sharp0.35.5 and Playwright1.59.1
  observed. Chromium manifest is147.0.7727.15/revision1217; files absent.
- Real default preflight and `check:ci` refuse Node26/PG18/browser absence
  **before lint or fixture mutation**. Historical-PG18 sees18.6, with Node22
  and browser qualification still blocked. No server/database was started.
- `pnpm typecheck` and scoped ESLint pass on the available Node26 shell.
  These are diagnostics outside the declared Node22 profile, not its proof.
- Current raw audits: production has zero findings; all dependencies has one
  high braces advisory under the retained expiring development exception.
  Licenses:689 permissive,1 notice-required,4 source-obligation and3 review-required
  package entries on this Darwin install. SentryCLI/platformCLI and GSAP block
  full supply-chain qualification. Platform package names vary by runner.
- Existing native Gitleaks8.30.1 detects all three generated fictional secret
  assignments without values; executable SHA256
  `f414bc2fb952be6c9072b75cb411e3368614ef4b16d48dbd9ad238034afd2302`.
  This is local installed-scanner evidence. The pinned upstream image was not
  executed, and full-history scanning failed twice at the 120-second process guard. The
  diagnostic rerun retained `ETIMEDOUT`, `SIGTERM`, no exit status; it is an
  unavailable result, not zero findings.
  No historical-clean or hosted scanner pass is claimed.
- The complete lane's staged diff passes the same native redacted scanner with
  zero findings. This qualifies the staged additions, not the full history.

No full units, Next build, native SQL, Docker/Auth, UI, managed target, hosted
Actions or provider checks ran in this lane. No product UI changed. Pending:
Node22/PG17/browser provisioning decision, exact restricted-license review,
retained full-history scan diagnosis and pinned-image execution, then reviewed
combined rehearsals under the coordinator's resource grant. Strategic/model
evidence changes are proposed to the coordinator only; no shared state changed.
