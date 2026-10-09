# Lifetime System kind — scoped PRD and plan

## Person and job

A consultant grows a proposal into package selection and onboarding. It keeps
its System identity and proposal kind; content, purpose and behavior can evolve.
An already accepted proposal keeps the revision and terms that produced it.
Jacob selected one kind for life on October 9. This prepares that contract for
reviewed Reborn convergence, not a production migration or rollout.

## Before and after

At `a1306213f42b211d0560af54124770bd49a76545`, application updates, memory
updates and `update_business_system` allow proposal → portal. After this work,
the typed application update only accepts name and purpose. Unknown/malformed
patches fail rather than silently succeeding. SQL accepts an unchanged legacy
kind, rejects changed kind, and protects direct and native persisted updates.
Kind-only legacy SQL is a true no-op after current authority and change-number
checks; a same-kind payload with name/purpose retains ordinary update behavior.

## Existing rules and inventory

The [glossary](../../../GLOSSARY.md#businesses-and-what-they-run) already says
one kind for life. ADR 0011 lets a proposal grow behavior without changing
identity; ADRs 0012/0013 preserve agency standing and glossary authority. Company
ADRs were read at `/Users/jacobrhinehart/Desktop/strelva/docs/adr/` because
worktree-relative `../docs/adr` is absent. The exact prior investigation is
`4543251842d0546258e392fdf368635b1deaf6c3:docs/architecture/deepening-2026-10-09/01-domain-version.md`.

TypeScript kind writers are System creation, `applySystemUpdate` and projection
from existing native work. No application `updateSystem` caller beyond adapters
and tests was found. SQL writes to `public.systems` live in migrations 04120000
(create/update/revision/lifecycle), 07150000 (Version creation), 08130000
(adoption/activation/pause), 10113000 (website release/adoption/lifecycle), and
20090023 (offering source Version creation/revision/lifecycle). Only the original
update command assigns kind on an existing row. Later commands reach these
writers through helpers/triggers; final ordered schema proof must cover them.

Health treats proposal/document/report as static by default; surfaces and native
website/inquiry candidates select by kind. Inquiry agent pause checks kind plus
native work. `from-existing.ts` maps application and tracker to `internal_app`;
kind is not a one-to-one resource writer registry. Native origin/record checks
still govern writes. No second classification or central registry is added.

The current update command has no renamed command wrapper. Its authority helper
does: package/private-source successors wrap `system_actor_scope`. Preserve
those definitions, grants, row locks, actor verification, membership, exit and
change-number checks. Identity/origin, revisions and issued output snapshots
remain immutable. Do not infer or rewrite historical kinds.

## Scope and deletion targets

Remove kind from `contracts.ts` update input and `invariants.ts` update behavior;
correct their comments. Add one rule code/error mapping in those files and
`supabase-store.ts` only if needed. Memory uses the existing strict schema.
Own relevant `systems-invariants`, `systems-store-contract`, and
`systems-supabase-store` tests; `tests/systems-schema.sql`; new lifetime SQL
contract/preflight fixtures; one new forward migration and guarded inverse;
necessary registration in both workspace SQL runners; ontology and this record.
No `types.ts` exists in this module. No neighboring runtime/UI/Version files,
existing migration bytes, glossary, canonical model or shared strategic state
are edited. SQL runner overlap is integration work to reconcile, not authority
to edit another worktree.

## Acceptance and failure cases

- Changed kind is refused with unchanged System row, revision/history/output,
  no successful receipt, and an actionable refusal code.
- Application patches cannot include kind, even unchanged kind; strict runtime
  validation rejects malformed/unknown fields before RPC dispatch.
- Legacy SQL unchanged-kind patches work; kind-only is a no-op. Name/purpose,
  null purpose, revisions, lifecycle and native writes keep working.
- Member, stale/unverified actor, lost membership, foreign System, stopped
  business, stale change number and malformed payload retain truthful denials.
- A table trigger refuses every changed persisted kind without replacing the
  current identity/lifecycle guard or authority helper chain.
- Empty-schema inverse restores the previous command/grants; populated inverse
  refuses rather than reopening mutable kind underneath retained Systems.

## Implementation and exact proof plan

1. Retain baseline acceptance and failing refusal evidence in
   `.scratch/lifetime-system-kind/` before runtime edits: focused Vitest and
   actual fully ordered disposable PostgreSQL.
2. Narrow application update, add SQL row invariant and bounded legacy handling;
   preserve historical bytes and current command authority. Update scoped tests
   and ontology; prepare a read-only preflight with data uncertainty disclosure.
3. Run `pnpm exec vitest run src/__tests__/systems-invariants.test.ts
   src/__tests__/systems-store-contract.test.ts
   src/__tests__/systems-supabase-store.test.ts`, `pnpm typecheck`, focused
   `pnpm exec eslint` on changed TS, `pnpm check:boundaries`,
   `pnpm check:ontology`, and `git diff --check`.
4. Run `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`
   and `pnpm check:workspace-upgrade` with the same command-local PATH, plus the
   focused all-migrations SQL contract. Use only allocated local clusters and
   fictional rows, no repository real env or shared/hosted stores. Retain native,
   current identity, READ ONLY and security checks. Agency/browser and custom
   client checks apply only if those contracts/permission paths change; explain
   any skips, never call them passed.
5. Review identity, authority, acceptance versus verification, stale response,
   scope reset and compatibility. Commit owned work, push only this branch,
   draft PR to `reborn-1.0`, link it and send the coordinator completion packet.

## Production qualification still required

Existing persisted kinds are unqualified. The guard freezes the kind at the
time it is applied; sparse revisions cannot prove a System's original kind.
Prepare read-only counts/native-origin mismatches and catalog checks for an
authorized release operator. Any discrepancy needs explicit adjudication,
never an automatic historical rewrite. Live preflight/migration, combined
convergence, native/Auth/provider delivery and rollout remain separate gates.

## Handoff

**Implemented, prepared only.** Application updates accept name/purpose only;
kind assignment is removed from the pure update implementation. Strict validation
already used by both adapters refuses any kind field before mutation/RPC. SQL
adds an independent before-update row invariant and narrows the current bounded
command without replacing its authority helper chain. A new refusal code maps
to “A System keeps its kind for life.” No new dependency, registry, classification,
UI, native resource authority, provider path or historical rewrite is introduced.

**Source size and overlap.** Runtime TypeScript: **7 added / 7 deleted, net 0**
(including comments); executable changes remove two kind-update lines and add two
refusal-vocabulary lines. Keeping an actionable refusal accounts for the net
balance. Enforcement SQL, tests, runner setup and docs are separate additions,
not a runtime reduction claim. Shared overlap for convergence is the two workspace
SQL runners and ontology; this stream edits only its tail registration/section.
No Version runtime, website attempt, location helper, neighboring PRD, coordinator
README, glossary, canonical model or strategic state changed.

**Initial regression evidence, retained.** The old acceptance tests passed.
Adding the two refusal tests before runtime edits produced **2 failures / 32
passes** in the focused run: memory kind mutation and Supabase dispatch succeeded
instead of rejecting. `.scratch/lifetime-system-kind/initial-target-regression.log`
retains both failures. The earlier `pnpm test --` invocation expanded to the full
suite; its two new failures are not claimed as a final full-suite qualification.
The isolated SQL baseline applied the actual ordered predecessors through
`20261022175000`, stopping ahead of the unrelated 1751 ACL blocker. It failed
`expected system_kind_immutable, but statement succeeded` at the new kind
regression. `.scratch/lifetime-system-kind/baseline-kind-sql.log` retains this.
This was not a green full ordered-schema baseline. Installation used the existing
lockfile (`pnpm install --frozen-lockfile`), with no dependency change.

**Final local proof.**

- Six focused suites: **102 passed / 0 skipped**: System invariants, store
  contract, Supabase adapter, existing native projection, health, and Systems
  projection. Changed-kind rejection preserves the row/revisions/accepted terms;
  permitted edits, null purpose, unknown/malformed patches, lost access, member,
  stop and stale-change cases are exercised. Compile-time keys are exactly
  `name | purpose`; fake RPC tests prove validation/dispatch/error mapping only.
- `pnpm typecheck`, focused ESLint, `pnpm check:boundaries`,
  `pnpm check:ontology`, shell syntax and `git diff --check` pass. Logs are in
  `.scratch/lifetime-system-kind/`; all **601 existing migration/helper files**
  remain byte-identical to the initial SHA-256 inventory.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash
  scripts/check-lifetime-system-kind.sh` passes on actual PostgreSQL 18 in an
  owned disposable socket cluster. It applies every forward migration, preserving
  the established early-lead ordering, and qualifies only the explicit local
  setup below. Core contract distinguishes same-kind no-op (after current actor,
  membership, exit and change checks), atomic changed-kind refusal, direct row
  trigger refusal, unchanged full row/history/output, allowed edits, revision
  changes, pause/resume and restore. No-op does not bump change number/time.
- The actual empty-schema inverse/reapply restores exact predecessor command
  definition/ACL and preserves identity, locked load and current scope helper
  fingerprints. The actual populated inverse refuses with
  `system_kind_rollback_requires_data_preservation`; the fictional row and forward
  definitions/ACL remain unchanged. The inverse holds an exclusive System-table
  lock before checking population. No data is removed to qualify rollback.
- Current native proof executes source creation, schedule adoption/observation,
  schedule-side pause and System-side resume, tenant adoption, persisted content
  observation/reconciliation, repeat no-op, and tenant pause through their
  actual writers. The existing `offering-source-versions-schema.sql` passes on
  this final schema: qualified staff/inquiry/website source registration,
  historical adoption, configuration, activation, qualification revocation and
  retirement all retain System lineage and native resources. Its Version writers
  cover the offering successor; no copied data/grants are fabricated. The private
  definition catalog contract and `function-exposure-schema.sql` also pass.
  Existing authority/identity/load definitions and grants remain exact.

**Exact conditioned setup and preserved failures.** The local Supabase shim
supplies inherited anon/authenticated table grants and named-role function
EXECUTE. Existing migration 1751 explicitly refuses those inherited defaults
before its own revocations. The focused runner temporarily revokes only the
shim's anon/authenticated table defaults and anon/authenticated/service-role
function defaults immediately before **1751**, applies its unchanged full SQL,
then restores the shim defaults immediately afterward. No guard is skipped, no
migration byte is changed, and the new lifetime migration is exercised with the
restored hostile defaults. This is proof of that explicitly conditioned ordered
disposable schema, never hosted ACL or required-runner qualification.

`pnpm check:workspace-sql` **fails**, both before and after the change, at
`20261022175100_legacy_google_operation_authority.sql:24` with
`legacy_google_creation_authority_invalid`. `pnpm check:workspace-upgrade`
**fails**, before and after, at `tests/money-effect-admission-schema.sql:78` with
`null value in column "created_at" of relation "business_bookings" violates
not-null constraint`. Neither reaches the new lifetime tail; neither is green.
Their initial/final logs are retained as `baseline-workspace-*` and
`final-workspace-*`. Required registration remains in both runners for the
integration owner once their separate blockers are resolved.

Historical native fixtures were also attempted against the current schema and
retained as failures: `system-versions-schema.sql` used an unqualified source
revision; `w6-version-native-applications.sql` lacked the latest package/private
source grant; `system-possibilities-schema.sql` expected an observation from an
unpersisted content pointer; `website-system-releases-schema.sql` omitted the
historical required content author. They are not weakened or marked passed.
The new focused native fixture uses actual persisted content with explicit
`author=user`, `status=live`, timestamps and current native commands. Its initial
missing status fixture error was corrected; the final fixture was rerun. These
adjustments qualify the bounded writers above, not those entire historical suites.

**Other skips and limits.** No UI changed. No rendered browser/desktop/mobile,
Auth, provider or hosted proof is claimed. No provider/owner permission helper or
policy changed; agency-workflow/Auth browser is not rerun. Established native
permission tests remain intact, and this stream adds direct current actor/member,
revoked membership, verification, stale-change and exit denials plus exact helper
fingerprints. No `/api/v1` or client-site contract changed; custom-client checks
are not triggered. Full build/full lint/final full unit suite are not claimed.
Production/customer data and providers were never contacted.

**Migration SHA-256, frozen source contract.**

- `20261022183000_lifetime_system_kind.sql`:
  `cb4634ccfa6dc84e701cc08b707e631ffa2cf813d88899e14dc6294e76aca417`
- `rollback-20261022183000_lifetime_system_kind.sql`:
  `95978ca755b1d88c702c30410d438f6a33fad7c6b7f2900c9aa38c9fa3c6634d`

**Read-only release preflight, prepared and locally exercised only.**
[`scripts/sql/lifetime-system-kind-preflight.sql`](../../../scripts/sql/lifetime-system-kind-preflight.sql)
uses a READ ONLY transaction and prints current-kind population, absent native
origin/history, current native-origin mapping mismatches, current row-writer and
trigger inventory, and command/helper hashes and ACLs. An authorized release
operator can run `psql --no-psqlrc --set=ON_ERROR_STOP=1 --file
scripts/sql/lifetime-system-kind-preflight.sql` on a separately approved target.
Review any native mismatch/missing mapping or grant/trigger drift before applying
anything. Existing population is unqualified. Revisions record implementation,
not birth kind; absence of mismatch/history is not proof of original kind. The
migration freezes current persisted kind at application and does not choose a
historical correction. Populated rollback is deliberately refused.

**Review and remaining semantic question.** Final diff was checked for identity,
authority, successful acceptance versus refusal, stale change token, scope reset
and compatibility. The preliminary independent source review found no runtime
blocker; exact-head review remains with root. Health's existing static default
for proposal/document/report stays unchanged. Fixed kind does not by itself prove
health classification for a proposal gaining recurring behavior; any such
consumer expansion still needs its own evidence and scoped review. Native origin
and resource authority remain separate; no universal writer registry is claimed.

**Proposed canonical evidence deltas (unapplied).** Mark the lifetime-kind
mismatch locally resolved in the prepared source contract, supported by typed,
memory, conditioned ordered Postgres and inverse evidence above. Keep population,
required native/upgrade runners, hosted ACL/Auth/provider delivery and release
qualification open. Update dependent native/health eligibility claims only to
“kind cannot change after the guard is installed,” not “all existing kinds are
historically correct.” Canonical model/strategic state and both vault reviews stay
with the integration owner; no offer or production bet is promoted.

**Exact integration action.** Root reviews the pushed frozen draft head against
`reborn-1.0`, reconciles the two runner tail registrations/ontology with neighboring
streams, and retains this prepared stream separately during the isolated union
preflight until root release. Resolve the two required-runner blockers under their
owners and rerun combined checks. Source integration and live preflight/migration
remain separate; shared/production SQL still needs Jacob's separate yes. Branch,
commit and draft PR identity are sent in the coordinator callback after ordinary
push. No main merge or migration application follows from this work.
