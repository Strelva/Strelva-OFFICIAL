# Neutral journey parity fixture scope — October 8, 2026

The first aggregate baseline at frozen issue317 source75581583 failed. Its
flags-on helper admitted only `journeys-parity` and `j10-<8hex>` fixtures, while
the actual new neutral agency journey published native `elmwood-bakery-<12hex>`
tenants. Earlier neutral runs also left those actual tenants in the same owned
stack. The first full baseline remains failed evidence, not a passing result.

This private successor changes only the proof helper. Before reading fixture
scope it requires the explicit local Auth proof marker, actual owned stack
configuration with `strelva-proof-<16hex>` project ID and `strelva-auth.*` directory,
loopback API/app/database endpoints, matching configured API/database ports, and
no alternate libpq query routing. The existing `j10` and parity fixture identities
remain accepted.

A native neutral tenant additionally requires the exact tenant ID/stable ID in
its real hosted reservation; linked website work in the same business; durable
agency client addition; same verified actor as addition, reservation and agency
creator; actual current agency-owner membership; and the authored fixture's
agency/business/source URL/actor-email/product/resource identities. A matching
business name or tenant prefix alone is refused. Unrelated tenants remain a hard
failure. Coverage is inserted only for the exact stable IDs that passed; a
concurrent new unknown tenant gets no synthetic coverage and the cutover fails
closed. These backdated fixture rows are not observed seven-day parity.

Pure assertions cover mismatched/unowned stack routing, every native-provenance
boundary, unrelated tenants and name-only forgery. A read-only probe reuses the
same actual catalog projection and scope guard:

```bash
STRELVA_LOCAL_AUTH_PROOF=1 PLAYWRIGHT_BASE_URL=http://localhost:<owned-app-port> \
  pnpm exec tsx scripts/check-journey-parity-scope.ts
```

Its local keys and stack path must already come from the owned private runner
env. It writes no parity rows. The full journey runner performs the subsequent
synthetic fixture insertion only inside that bounded rehearsal.

Five initial flags-off failures independently expected owners to create internal
apps with HTTP201. Current source returned403 `make_systems_required`.
`workspace_require_make_systems` (20261014112000, lines308–320) permits provider
or agency; repository `assertCanMakeSystems` has the same rule; application
creation SQL rechecks independently of the Systems feature flag. Product1.0's
internal-tool contract names Agency/Strelva creators. These older self-service
fixtures remain stale evidence/acceptance to reconcile. This successor does not
weaken creator policy, rewrite those tests or claim the aggregate suite passes.

No production runtime, migration, provider authority or production parity was
changed. Parent owns the next full flags-on/off baseline and its qualification.

## Initial seed and flags-off fixture correction

Frozen9c44ee41 scoped the test helper, but the runner's earlier initial seed still
covered every tenant. The follow-up replaces that SQL with `seed-journey-parity.ts`,
which invokes the same ownership/provenance guard before adding the parity marker
or any synthetic coverage. Actual negative proof inserts only an explicitly named
unrelated local fixture, calls the initial seed, observes refusal and zero coverage
with unchanged total parity count, then removes that exact fixture.

The five stale creator fixtures are mapped to their complete jobs:

| Original case | Current authority proof |
| --- | --- |
| Staff uses released app while candidate changes, rollback and revocation | Ordinary customer creates the business; customer creation returns403; separate actual agency creator builds and changes the tool; owner issues/revokes staff access; staff operates the released version |
| Staff corrects date records through conflict and recovery | Separate agency creator builds/releases; owner grants bounded record access; recipients keep their own edit/conflict/replay checks |
| Template produces private app without copying preview records | Ordinary customer creation denied403; separate agency actor previews and creates through the real UI; preview records stay private; owner retains sharing authority |
| Fresh business and delivery, desktop/mobile | Customer creates its business through UI and is denied self-build; separate agency actor builds/publishes through UI; original owner operates the result and agrees/accepts delivery |

`ordinary-agency-maker.ts` uses actual anonymous Auth signup, ordinary agency
HTTP creation, the business owner's current `choose_business_provider` command,
and the separate agency owner's real native staff command. It creates no SQL
seats, privilege overlay or super-admin maker. Customer authority remains member;
maker authority becomes provider. Flags-off Team HTTP is explicitly asserted503;
the native staff command prepares the fixture through its actual actor checks.
This establishes native authority/legacy work behavior, not flags-off Team
onboarding UI. Existing synthetic operator delivery authority is unchanged.

Selector-only current dialog/Needs-you fixes were inspected in known later
journey source `d8f3a4c9e621f3321a0223e6c8ebb8fa34f5a42d` (#501 lineage). Its raw SQL
`seedLocalNativeMaker` dual-role fixture and runtime fixes were not imported.
No later release branch or production migration was merged/cherry-picked.

## Explicit alternate bundler proof

The next full default-Turbopack run began at79aeabe3. A documentation-only
chronology commit7fa3ba18 occurred after handoff; runtime, runner and test bytes
were identical, but literal clean79ae throughout is not claimed. That run
encountered Next16.3.8's internal DM Sans font-query compilation500. Both Next
and the loaded Darwin ARM SWC resolved16.3.8. The failure remains evidence and
does not establish a cache cause.

An isolated runner successor adds `--bundler webpack`. Installed Next16.3.8
`next dev --help` explicitly supports `--webpack`. The default remains the same
Turbopack command. Missing or unknown bundler values fail before stack setup.
Both choices retain the same owned loopback stack, fixture scope, feature flags,
test inventory, retries0 and strict result gate. Each phase logs its bundler.

```bash
SUPABASE_CLI=supabase bash scripts/check-journeys.sh --bundler webpack --reuse <owned-runner-dir>
```

Parent owns the serialized full on/off execution after the preceding run is
archived. Preparing this option starts no server. A Webpack pass qualifies only
that explicit local development-bundler proof; it does not erase default
Turbopack failure, waive a production build, or prove hosted/production operation.
No dependency, application font or UI runtime changes accompany this option.
