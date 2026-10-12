# Private source lock-order successor — prepared, native HOLD

## Source contract

Additive `20261022174500_private_source_exit_lock_order.sql` follows frozen1740
and1730; those migrations and their prior evidence are unchanged. It replaces
exactly two existing functions through CREATE OR REPLACE, preserving their OIDs,
owner and ACLs. The inverse checks both exact successor catalogs before restoring
both exact1740/1730 definitions. No new table, helper, public port, grant, retained
predecessor journal, provider access or data mutation is introduced.

Effective `complete_workspace_exit` in migration37 takes7415 before verified user
SHARE, workspace UPDATE and owner membership SHARE. Frozen1740 instead takes user,
workspace and membership SHARE before7415. The customer branch's effective
`business_record_assert_actor` from provider_seats also takes7415 after those
manager locks. Both source kinds therefore inherited the inversion. This is a
source finding, not a measured native deadlock; preserve all prior failures.

The new manager first reads workspace kind without a row lock solely to choose a
supported customer/agency7415 route. After advisory acquisition it locks and
checks the current verified user, locks the actual workspace, rejects any kind
change, and locks current direct owner/admin membership. The customer authority
branch remains exactly `business_record_assert_actor(...,true)`, including its
verified actor, provider policy, current exit check and workspace UPDATE. Agency
admission retains1740's explicit unsupported-isolation refusal and fresh direct
completed-exit query after every preceding wait. Preliminary kind grants nothing;
missing, personal or changed kind cannot admit work.

The ninth caller,1730 `register_neutral_creator_listing`, previously acquired user
and workspace SHARE before manager. It now takes7415 first for both supported
preliminary kinds, then retains its verified-user checks and locks workspace with
an exact-kind predicate. All later Connect manager, source manager, exact creator
revision, internal_app/bundle, qualification, recorded agreement, completed-exit
and canonical listing calls remain byte-identical. The other eight effective
direct callers have no workspace row lock before their manager call in the
inspected canonical99c source. That inspection does not prove their complete
outer call graphs or cross-domain lock order.

The [source contract JSON](private-source-lock-order-contract-2026-10-09.json)
pins both forward/inverse bytes and bodies. Historical348 reconciliation remains
[immutable evidence](private-source-348-reconciliation-2026-10-09.json), not a
canonical inventory update. If1745 is selected, its append produces349 forwards
before independently owned1750 rewards/1800 operator groups/1810 inquiry/1820
booking selections. Root owners must reconcile current inventory, batch pins,
SQL/upgrade tails, proof counts, final exposure and READ ONLY checks against the
actual selected freeze. Do not import this older checkout's canonical owners.

## Prepared actual-native harness

`scripts/check-private-source-exit-lock-order.py` requires an explicitly owned
loopback window with `STRELVA_LOCAL_AUTH_PROOF=1`,
`STRELVA_PRIVATE_SOURCE_EXIT_WINDOW=1`, and `STRELVA_LOCAL_DB_URL`. It accepts typed
actual native argument receipts and writes a new evidence path; it refuses to
overwrite prior evidence. No Auth, role, reviewer policy, agreement, qualification,
source or arbitrary SQL fixture is fabricated by the harness. Every irreversible
exit gets an independent active workspace fixture. The root runtime owner creates
and qualifies these through actual commands, with providers held.

Invocation, only after coordinator authorization:

```bash
python3 scripts/check-private-source-exit-lock-order.py actual-native-fixtures.json retained-evidence.json
```

The JSON `cases` array must contain exactly32 unique kind/port/order cases:

- Original12: customer/agency × create/publish/share × source-first/exit-first.
- Supplemental16: customer/agency × create/publish/share/listing ×
  partial-source-first/partial-exit-first.
- Supplemental4: customer/agency listing × source-first/exit-first.

This keeps the original twelve separate. These supplemental requirements do not
change native34, other existing proof budgets, or release qualification criteria.
A case contains `kind`, `port`, `order`, `workspaceId`, `sourceArguments`,
`freshSourceArguments` and `exitArguments`. Argument arrays are in the actual SQL
function declaration order. Supported source ports are
`create_system_version_source`, `publish_private_application_source`,
`set_private_application_source_share`, and `register_neutral_creator_listing`.
Exit uses all nine arguments of the actual migration37 function. Fresh arguments
must differ and retain exact workspace identity; they must pass their own actual
rollback-only positive control before the race. Use real qualified revisions and
recorded fictional agreements for both listing controls. No placeholder expected
receipt can stand in for actual success. Receipt validation binds actual workspace,
System, revision, publication actor, share target/state, or listing agreement.

Full source-first holds a successful actual producer. Full exit-first holds a
completed actual exit. Partial source-first holds only7415, observes the actual
exit waiting, then dispatches the actual producer. Partial exit-first holds only
7415, observes the actual source/listing waiting, verifies that waiter holds no
workspace RowShare-or-stronger relation lock, then dispatches the actual exit.
Every wait must name the exact holder PID and advisory event before release.
Retained pg_stat_activity/pg_locks graphs include relation, advisory and transaction
locks. Native producers and exits run as service_role; only fixture observation
and controlled holder/observer barriers use migrator authority. There is no new
service-role permission on the internal manager.

The harness records actual native receipts and complete retained source, revision,
share, qualification, private-marker, System/Version/binding, native records/state,
creator listing, agreement, paid period and money history snapshots. Source-first
snapshots read the holder's own uncommitted native changes, then compare after exit.
Exit-first checks unchanged source history. Both fresh and replayed commands must
refuse after exit without changing retained history. Deadlock40P01, cancellation,
timeout, missing barrier, wrong refusal or mismatched receipt is HOLD; failure
records survive. No retry converts a failure to PASS. The harness is prepared code:
its PostgreSQL compatibility and complete runtime behavior remain UNRUN.

## Required proof beyond this harness — all UNRUN

- Run the32 controlled cases against the actual current selected ledger, preserve
  graphs and failures, and validate legitimate exit audit/stop projections separately.
- Exercise remaining effective callers: put_system_version_source,
  publish_system_version_source_revision, record_system_revision_qualification,
  set_system_package_listing and register_offering_package_source. Require actual
  synchronous positive controls, both partial/full orders wherever their supported
  creator kinds permit them, exact exit/refusal and retained-history checks.
  Offering registration's actual platform agency/operator provenance is mandatory.
- Check nested effective business_record_assert_actor, Connect manager, reviewer,
  listing, qualification and offering/operator paths against current row/advisory
  order. These source inspections and32 cases do not prove global liveness.
- Verify actual owner/admin success and member, foreign, provider-seat and personal
  refusals. Withdraw verification or direct membership while the actual source
  waits on7415; retain specific refusal and no mutation. Test preliminary kind
  changes during the wait: locked kind mismatch must refuse, never switch routes.
- Agency repeatable-read and serializable must specifically refuse unsupported
  snapshot admission with no effects. Preserve and inspect customer higher-isolation
  behavior, including serialization failures; do not relabel failure as success.
- Apply exact1740→1745 on current qualified schema, verify complete pg_proc/ACL/OID
  and source hashes, seeded catalog drift refusal, exact inverse with populated
  source/creator/money history, reapply, final function exposure and READ ONLY.
  Inverse intentionally restores frozen1740 timing; it is recovery evidence, not
  permission to treat that predecessor as globally live-safe.
- Ordinary source and creator maintenance actual Auth remain separate fresh
  current-qualified stack jobs. Retain provider and production holds, historical
  failures and all unproven deployment/adoption/economics claims.

## Local source evidence and continuation

Twelve Vitest source checks (1740 and1745) and five pure Python harness input/receipt
checks passed; scoped lint, Python syntax parsing and diff check passed. These tests
prove source assertions and input/receipt guards, not SQL apply, controlled races,
Auth or liveness. No PostgreSQL, server, browser, provider or root write ran.

Next action: independent review of the exact two-function1745 source and harness,
then root-owned canonical reconciliation and a scheduled native window. Until the
required actual evidence exists, this successor and full release remain HOLD.

## Harness review successor — native execution still UNRUN

The frozen2eeda SQL files remain unchanged. Its harness was held by review for
URI/libpq routing, literal quoting, cleanup and mutable projection defects. This
separate successor changes only harness/tests and this continuation; it cannot
inherit native qualification from source-only SQL acceptance.

The runtime owner must provide `STRELVA_PRIVATE_SOURCE_CLUSTER_RECEIPT`, pointing
to the exact pre-existing receipt also stored as
`<dataDirectory>/strelva-private-source-exit-owned.json`. No receipt or cluster is
created by the harness. The finite JSON keys are `purpose` (exactly
`private-source-exit-disposable`), `host` (exactly127.0.0.1), explicit `port`,
`database`, `user`, UUID `windowId`, actual `dataDirectory`, local `postmasterPid`,
existing absolute `psqlPath`, native `databaseOid`, native `systemIdentifier` and
actual `startedAt` (`pg_postmaster_start_time()::text`). The directory must resolve
beneath the current user's temporary tree and belong to that user. Its marker and
postmaster.pid must match. The selected connection must independently match actual
cluster control identity, catalog OID, start time, data directory, numeric endpoint
and migrator user before any source effects. Every new connection repeats this
identity guard; observer connections are included.

The database URI must use numeric127.0.0.1, an explicit nonprivileged port and plain
database/user names. Query parameters, fragments, hostname routing and extra
receipt keys refuse. The URI is parsed once and never forwarded to libpq. Every
psql child receives reconstructed --host/--port/--username/--dbname arguments and a
finite environment, with no inherited PGHOSTADDR, PGSERVICE, PGOPTIONS or HOME.
Only the parsed password reaches PGPASSWORD; it is never placed in argv or evidence.
Startup PGOPTIONS fixes standard_conforming_strings=on and an observer statement
bound; the identity guard verifies the setting. Literal generation additionally
uses explicit E-string quoting with doubled backslashes and apostrophes, independent
of that setting. Owned guard dollar tags are generated until absent from their body.

All one-off clients now receive their own application/client/backend identity
receipts, bounded communicate and independent closure. SIGINT/SIGTERM produce
HOLD; a second signal cannot interrupt child cleanup. Every holder/waiter/one-off
gets independent TERM, bounded wait, KILL and reap attempts. Every case checks exact
owned application/backend disappearance with a bounded observer loop, excluding
the observer itself. Forced, failed, unreaped or unknown closure blocks PASS.
Timeout retention/rethrow uses a credential-safe summary rather than raw argv.
These behaviors remain prepared source, not observed process cleanup evidence.

Full native application-state snapshots are retained. Comparisons separately
permit and require the actual exit's narrowly authorized draft/installed→retired
projection for the exact exiting workspace under maintainedResources.stop, including
its updated_at change. Other workspace rows, specification fields, history, records
and source/creator/money rows must stay exact; deletion/insertion or changed specs
refuse. Both full before/after snapshots and allowed mutable differences are saved.
Fresh/replay refusals compare against the actual post-exit snapshot without another
projection allowance. Separate populated stop proof remains required.

Fifteen pure harness checks pass, covering prior typed-input/receipt guards plus
routing reconstruction, hostile libpq exclusion, backslash/apostrophe quoting,
cluster guards, TERM timeout/KILL/reap sibling closure, timeout redaction and narrow
retirement comparison. Python syntax and diff checks pass. One-off clients additionally check bounded local disappearance of their actual
backend PID, including the final observer; unknown PID/permission or a surviving
backend remains HOLD. This uses the already required same-host disposable cluster
identity and never sends a termination signal to a database backend.

No native subprocess,
PostgreSQL, signal-interruption integration or Auth run occurred. Next: independent
review of this exact successor, then a separately scheduled owned native window.

## Atomic signal ownership and actual harmless-child fault successor

Frozen18c5 remains the reviewed held checkpoint. Its SQL hashes remain unchanged.
This successor replaces raising signal handlers across child creation with a
SignalGate and shared ChildRegistry. Signals are queued while OS creation,
metadata assignment and registry registration complete; pending interruption is
delivered only after the process has registry ownership. Caller-local assignment
is no longer the cleanup owner. Holder, waiter and one-off creation all use this
path. Global terminal cleanup can close a registered child even when interruption
prevented its caller receiving the process return value.

Repeated signals remain queued throughout failure-graph handling, every independent
TERM/KILL/reap attempt, backend disappearance checks and terminal evidence writing.
Unexpected closure failure for one child retains HOLD and still attempts siblings.
Terminal evidence uses an atomic primary write and a distinct emergency fallback.
A failed primary or fallback never qualifies a run. Updating a fallback is allowed
only when the same run just created that exact fallback; prior-run files remain
protected. Signals arriving during the write trigger a retained HOLD rewrite before
signal handlers are restored. If both paths fail, a credential-safe terminal HOLD
receipt reaches stderr. Actual database cleanup/interrupt behavior remains UNRUN.

Actual harmless-child fault runner:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/check-private-source-child-faults.py new-retained-child-fault-evidence.json
```

It invokes only isolated local Python children, never psql, a database URL, a
server, Auth or provider. The injected fault sends SIGINT and SIGTERM after a real
OS child exists but before the Popen wrapper returns to registration. A shared
registry retains both that TERM-resistant child and its sibling. Repeated signals
continue during closure; actual bounded TERM timeout is followed by KILL/reap.
Additional actual controls inject signals inside backend-disappearance/terminal
retention protection and make the primary evidence path unwritable while a signal
arrives during the write. All actual children must disappear and be reaped; the
faulted run's terminal receipt must remain HOLD. “Backend” PIDs in these helper
receipts are explicitly aliases for harmless local child PIDs, not SQL backends.

Retained observations:

- [First actual attempt](private-source-child-fault-evidence-2026-10-09.json) is HOLD:
  spawn interruption/repeated signals/KILL/reap/sibling closure worked, but a
  second signal rewrite incorrectly refused the fallback created by that same
  run. The children were reaped; the retention-control assertion failed.
- [Two-control correction](private-source-child-fault-evidence-successor-2026-10-09.json)
  records both fault controls passing after that fallback ownership correction.
- [Final three-control evidence](private-source-child-fault-evidence-terminal-successor-2026-10-09.json)
  additionally observes repeated signals inside the protected backend closure.
  Its recorded SHA256 matches this successor's exact harness source. All three
  controls pass; all faulted terminal runs stay HOLD. No database/native SQL ran.

Fifteen pure harness checks, Python parsing and diff check also pass. Native32
races, owned-cluster compatibility, actual SQL backend interruption/cleanup,
remaining callers, inverse/reapply/exposure/READ ONLY and fresh Auth remain UNRUN.
Next: independent exact-source review of this successor, followed only by the
coordinator's separately admitted native runtime window.

## Final handoff signal successor

Independent actual harmless-child review confirmed the three earlier controls,
but found a clean natural-exit counterexample in frozen76aa: SIGTERM at the final
helper return was queued at depth1 after its last count check. Memory and primary
evidence still said PASS, and the main acceptance expression accepted it.
The [counterexample](private-source-independent-late-signal-counterexample-2026-10-09.json),
[incorrect primary receipt](private-source-independent-late-signal-primary-2026-10-09.json)
and [independent earlier controls](private-source-independent-child-faults-76aa-2026-10-09.json)
are preserved unchanged. This is a real observed harness failure, not SQL evidence.

The successor arms a terminal invalidation callback after owned child/backend
closure and keeps it armed through helper return and caller acceptance. Any later
signal changes memory to HOLD and atomically retains HOLD, including signals still
queued inside protected code. A writing flag prevents reentrant writes: a signal
during initial serialization marks it dirty, followed by a HOLD rewrite. Further
signals during that rewrite cannot turn its already-HOLD serialization into PASS.
The actual main acceptance additionally rejects the live pending-signal list.
Signals outside deferral retain HOLD before raising interruption.

[Four-control actual evidence](private-source-child-fault-evidence-handoff-successor-2026-10-09.json)
is pinned to the exact successor harness SHA256. Its fourth control runs a real
harmless child to normal exit and reaps it without TERM/KILL. It injects actual
SIGTERM on the final return line at depth1, after prior retention checks. Observed
memory and retained status are HOLD, pending is[15], and acceptance is false.
The earlier spawn-gap, repeated signal, TERM-resistant/sibling, backend-closure
and retention-failure controls also pass. All faulted terminal receipts remain
HOLD. Fifteen pure checks and diff/source-hash checks pass; historical SQL bytes
remain unchanged. No PostgreSQL, psql, SQL backend, Auth or provider ran.

Next: independent exact-successor review. Actual native32 races and the other
unchanged current-qualified native/Auth requirements remain UNRUN/HOLD.

## Writer release ownership successor

Independent review found a further actual harmless-child failure in frozenedef:
SIGTERM immediately before `writing=False`, after the last dirty check, left
memory HOLD but primary evidence PASS with no signal. Main acceptance correctly
refused, but durable evidence was wrong. Preserve the exact
[counterexample](private-source-independent-writer-release-counterexample-2026-10-09.json),
[incorrect primary](private-source-independent-writer-release-primary-2026-10-09.json)
and [independent reproduction](private-source-independent-writer-release-repro-2026-10-09.py).

The writer now releases its guard and then drains any queued dirty invalidation.
That is an ownership handoff: signals before release queue work for the drain;
signals after release invoke the still-armed callback and write directly. No final
snapshot of pending length owns correctness. The callback remains armed through
helper return and acceptance, and memory/retained HOLD remain separate requirements.

[Five actual harmless controls](private-source-child-fault-evidence-writer-successor-2026-10-09.json)
are pinned to this exact harness SHA256. The new natural-exit control injects actual
SIGTERM on the release line with writing still true, after the prior dirty check.
It observes memory HOLD, retained HOLD with signal15, rejected acceptance and clean
unforced child reap/disappearance. The earlier four controls also pass. Fifteen
pure controls, parsing, diff and frozen SQL hash checks pass. These remain local
child/retention observations; no database/native SQL/Auth/provider ran.

Next: independent exact-successor review. Actual native qualification remains
UNRUN/HOLD under the existing controlled-runtime boundary.

## Verified interpreter successor — existing CPython3.14.6 only

Independent composition review found interpreter-dependent behavior in frozen8dc.
The actual fifth writer-release control under `/usr/bin/python3`3.9.6 left memory
HOLD but primary PASS, while `/opt/homebrew/bin/python3`3.14.6 passed the same five
controls. Preserve [3.9 failed controls](private-source-independent-python39-faults-2026-10-09.json),
[3.9 debug log](private-source-independent-python39-debug-2026-10-09.log) and
[3.14 debug log](private-source-independent-python314-debug-2026-10-09.log).
The prior acceptance and47-file packet remain dated evidence; neither establishes
portable interpreter support or native qualification.

The conservative successor requires the already-installed CPython3.14.6 and the
resolved `/opt/homebrew/bin/python3` executable. It adds no dependency and installs
nothing. Main admission, SignalGate installation, ChildRegistry construction and
terminal completion all enforce that requirement before their effects. Other
implementations, versions or executable identities refuse. A future Python update
requires a new actual fault review and an explicit guard update; support is not
inferred from a newer version number.

Explicit commands, still subject to the coordinator's separate native window:

```bash
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3 scripts/check-private-source-exit-lock-order.py actual-native-fixtures.json retained-evidence.json
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3 scripts/check-private-source-child-faults.py new-retained-child-fault-evidence.json
```

The harness and fault evidence record implementation/version/resolved executable.
[New3.14 actual evidence](private-source-child-fault-evidence-python314-successor-2026-10-09.json)
passes all five actual harmless controls and pins the exact successor harness SHA.
[Actual3.9 refusal controls](private-source-python39-refusal-successor-2026-10-09.json)
exercise all four entry points in the real3.9.6 interpreter with child creation
and signal mutation trapped: every entry refuses, spawn count0, signal mutation
count0. No database URL, psql, native SQL, server, Auth or provider ran.

The original15 pure checks plus three supplemental runtime checks pass on the
verified3.14 runtime. These counts do not change native32 or other original proof
budgets. The frozen1740/1745 SQL/source contract bytes remain unchanged.

This source successor must be independently reviewed before replacing the harness
portion of the prior47 composition packet. Do not import that old patch alone and
assume its runtime is safe. Recompose against the coordinator's exact selected
current root, preserve its newer unit/browser/native records and failures, and
reconcile canonical owners without auto-qualifying a count. The current standalone
SQL window remains coordinator-owned; this work grants no competing execution.
Actual native32, SQL backend interruption/cleanup, remaining callers/catalog/
inverse/exposure/READ ONLY and separate current-qualified Auth remain UNRUN/HOLD.
