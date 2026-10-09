# Enterprise/IDX bounded tenant-cleanup handoff

Objective: correct the additional teardown reporting gap in the composed runtime
review. Source inspection: integration `10d43c70d21d3b8cb6d5a20bcf34ab88717de94b`.
Baseline alignment commit `4d880915` copies the coordinator's existing guarded
teardown runtime into this lane; do not cherry-pick that baseline commit.

Prepared change: database removal commits with an outstanding native cleanup
receipt; Redis/provider failures and explicit provider retention remain incomplete.
Retained cleanup receipts fence new tenant insertion/id changes under the original
advisory lock, including after cleanup completes. Completion alone cannot fence
another in-flight cleanup worker or old slug-scoped writer. Automatic identity
reallocation therefore remains closed until a generation-safe protocol is qualified;
no production policy or existing live slug is changed here. Exact receipt
recovery/retry remains available after the tenant disappears.
The API exposes pending cleanup as 202 with a false completion flag; the admin
editor retains that result and can retry. CLI preserves the receipt and exits 3.
Shared account grouping retains its canonical account lock and mirror hooks;
its identity is checkpointed before index removal and survives later unavailable
Redis retries. Domain claims and email-keyed invitations recheck ownership atomically.
No subscription/provider billing mutation. The dry-run preview now includes exact
native booking-grant/booking holds through a stable, lock-free reader, matching
the atomic guard's existing protected-record predicates without narrowing them.

Additive migration `20261022090100` follows the coordinator's guarded `22090000`.
No applied migration bytes changed. The guarded predecessor is kept, with direct
service execution revoked; the new wrapper retains its billing/export/workspace
guards. The inverse refuses whenever historical cleanup receipts exist.

Evidence: seven targeted files, 53 passing mock-based unit/route/source checks,
three actual-Lua qualification cases deliberately skipped without the explicit
resource flag. Scoped ESLint and diff whitespace checks pass. The mocks verify
application decisions and failure reporting; they do not prove SQL or Lua behavior.
Native SQL/fixture-persisted literal READ ONLY and explicitly gated isolated-Redis
tests are prepared. A temporary ENOSPC source-write failure was retained in the
coordinator handoff; no file was truncated, and writes resumed only after the
coordinator reclaimed its own ignored idle compiler output.
No native DB, Redis server, browser, build, typecheck, provider/external write,
production access or dependency install was performed in this bounded fix.

Exact next action: coordinator cherry-picks the standalone fix, composes its
preceding guarded migration, runs typecheck and `tests/tenant-cleanup-receipts-schema.sql`,
its persisted-fixture `tests/tenant-cleanup-blockers-readonly.sql`, then the
explicitly gated isolated Redis tests and pending/retry UI. Preserve failed
receipts. Existing provider/public/full-model gates remain unchanged. Canonical model,
state and goal remain coordinator-owned; this source is preparation, not deployed
or commercially qualified teardown. Receipt progress and slug reuse are the only
proposed capability delta; no broader lifecycle/policy choice is promoted.


Concurrency correction, October 8: the initial 8cb19b6a fix alone is not qualified.
The coordinator identified a stale concurrent worker that could overwrite the
account checkpoint and falsely close Redis cleanup. A separate correction adds
mandatory revision CAS to every receipt update, preserves account target identities
monotonically and refuses Redis completion without explicit confirmation of every
retained account. The application advances its expected revision only from the
acknowledged native checkpoint. The inverse signature and native fixture follow
that six-argument writer; no preceding migration bytes changed.

A focused two-worker test suspends canonical unlink after reverse-index removal,
lets a stale worker attempt completion, verifies its revision rejection and pending
account identity, then verifies the failed first worker and a current-receipt retry
that preserves the other tenant. This is application behavior against a mocked
SQL CAS contract. Native SQL assertions separately prepare stale revision rejection,
fresh-but-omitted account confirmation rejection and identity retention across an
empty summary. Native execution remains coordinator-owned and unperformed here.

Correction verification: the intended seven-file suite passed 54 cases, with three
explicitly gated native-Lua cases skipped. Scoped ESLint and diff checks passed.
An accidental selection of existing `deprovision-redis-client-data.test.ts` started
its isolated Redis without the coordinator window; its afterAll stopped it. That
older file produced two passes and one failure (`tenant_teardown_blockers_unavailable`
with its null DB mock). It was not changed or rerun, and does not qualify teardown.
No database, browser, build, typecheck, dependency, provider or production operation
was run in this correction. The next integration must cherry-pick 8cb19b6a followed
by this separate correction; 8cb19b6a alone has the reported concurrency gap.


Native concurrency/Auth fixture preparation: added an explicitly gated two-worker
fixture that invokes actual cleanup/account/domain/mirror source with real SQL RPCs
against the coordinator's already fully migrated disposable cluster and its own
isolated Redis only in the authorized future window. The transport delays B's
actual native receipt read; one actual account SET is refused after index deletion.
Native checkpoint/final CAS and current-receipt retry are never mocked. Other
resources/subscription and durable account targets are asserted. Provider remains
disabled and overall pending. The real mirror removal can report unknown deleted
tenant; the queue index is retained/checked, not claimed as successful PG removal
or qualified payload repair. The narrow adapter has no table fallback or schema
fabrication. See `docs/operations/tenant-cleanup-concurrency-proof.md` for exact env,
resource ownership, limits and execution.

A separate gated actual Auth fixture uses current real super-admin authority and
the loaded editor, desktop/mobile confirmation/pending202/exact-id retry/native
revision progress/GET recovery/ordinary403/retired reuse refusal. The deleted-tenant
editor requires a row on page load; a fresh recovery UI remains unproven. No route
fulfillment or fabricated provider result. Current profile must keep Vercel disabled
on both runner and server. Preparation evidence: scoped lint and diff checks pass,
16 existing mocked cases pass and new native case gated skip; Playwright collects
two UI cases. No native DB/Redis/Auth/browser/build/provider/production commands in
this fixture-preparation turn. Root owns composed typecheck and execution; retain
all failures, native receipts and existing provider/full-model gates.


Recovery/adapter successor: independent coordinator review found that 9e2d02f8's
initial local-host adapter guard accepted a duplicate later host or --host switch.
That source is not safe alone. The successor parses only singular -h/-U/-d and
optional valid -p pairs, rejects all other flags and unsafe values, reconstructs
argv, removes libpq/psql environment overrides and checks actual socket directory
canonical /tmp ownership before execution. Focused regressions preserve duplicate,
long host, URI/service, command/file flag and PGHOSTADDR/PGSERVICE rejection.

Standalone `/admin/tenant-cleanup/<slug>` is now implemented with current
super-admin auth, actual existing receipt GET and exact-id retry, shared native
receipt parsing, explicit loading/unknown/absence/pending/complete states and
owned Button/TextInput primitives. Missing tenant at original editor URL routes
there; pending editor links there. Typed confirmation remains required; denied,
stale/inconsistent or unavailable responses cannot authorize another retry before
reload. Client async responses are tied to current page generation. Updated
actual Auth desktop/mobile journey reloads the deleted editor URL, observes the
standalone page/native GET, re-confirms and retries the same receipt, reads native
revision progress and verifies ordinary UI/API denial and slug retirement.

The earlier fresh recovery UI gap is now implemented locally; actual browser
proof remains pending. 21st CLI was unavailable (command not found), so no install
or generated design; inspected owned components were reused. React checklist
applied to direct imports, effect cancellation/current-response ownership,
accessible states/labels/focus and no added provider/dependency. Exact source and
focused proof are supplied in the coordinator handoff; no native/Redis/Auth/browser,
Docker/build/typecheck/provider/production operations ran in this successor.

Successor verification: eleven focused files, 82 passed and four explicitly gated
native cases skipped; scoped lint and diff checks pass. Updated Playwright lists
the two desktop/mobile reload/recovery cases without browser/server startup.
Native full-schema two-worker execution and actual Auth reload UI remain pending
in coordinator resource windows. The next integration must include 9e2d02f8 and
this successor before any native adapter execution. Retain all existing unknown
provider/mirror repair evidence and the prior accidental native failure record.
