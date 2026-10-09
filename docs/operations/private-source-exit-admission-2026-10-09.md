# Private source exit admission: reserved successor 1740

Status: separately prepared source correction to review HOLD6cc. Native execution
and controlled-wait evidence remain UNRUN. The coordinator reserved
`20261022174000_private_source_exit_admission.sql` after money1730; accepting both
would make the prospective inventory 348. No root, migration ledger, runtime or
provider was modified. Do not infer qualification from this checkout's older
migration inventory or any prior stack receipt.

## Observed boundary and correction

The historical package-management manager verifies/locks the user, locks the
workspace FOR SHARE, locks direct owner/admin membership, then invokes customer
business-record authority or takes the agency 7415 advisory lock. The current
customer path already checks completed exit in business_record_assert_actor
(provider-seats migration284). The agency path lacks that check.

The effective `complete_workspace_exit` wrapper in
20261020090037_provider_completion_cleanup.sql takes the 7415 advisory lock
FIRST, then verified user FOR SHARE, workspace FOR UPDATE and owner membership
FOR SHARE, before invoking its retained inner exit body and provider cleanup.
The earlier inner body used different locking; it is not the current entry
point. An agency source call can pass its separate service preflight and wait
behind a completed exit transaction before continuing. The preflight in6cc
cannot settle that race. It remains a useful UI/current-role check only.

1740 preserves the existing source-manager lock order and the customer branch
byte-for-byte. The agency branch retains its advisory lock, then performs a new
statement against completed exit rows inside an explicitly VOLATILE function.
Its existing workspace FOR SHARE lock is held through the enclosing native
producer transaction. Exit-first means the source waits, sees the committed exit
at the final check, and refuses. Source-first means exit waits for the admitted source transaction’s 7415
lock until that transaction finishes; existing history is retained. These two
fully admitted orderings do not rule out the inherited partial-lock inversion
described below.

PostgreSQL documents fresh per-query snapshots for volatile functions and fresh
command snapshots at Read Committed. Higher isolation can retain an earlier
transaction snapshot, so agency writes explicitly refuse repeatable-read and
serializable transactions with private_source_snapshot_unsupported. Read
Uncommitted has PostgreSQL's Read Committed behavior. This does not rewrite or
claim stronger higher-isolation behavior for the existing customer path.
References: [function volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html)
and [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

## Caller and lock-order audit

Direct manager callers in the effective migration chain:

| Caller | Existing later work | Effect of1740 |
| --- | --- | --- |
| create_system_version_source | source/System insertion or exact replay | Agency new source/replay stops after completed exit |
| put_system_version_source | source row FOR UPDATE and share replacement | Agency source metadata/share changes stop |
| publish_system_version_source_revision | source row FOR UPDATE, immutable revision insertion | Agency publication stops |
| publish_private_application_source | private marker and existing publisher | Stops before marker/revision mutation, including replay |
| set_private_application_source_share | source row FOR UPDATE and exact share/revoke | Stops before share mutation |
| record_system_revision_qualification | native checks and qualification rows | Agency new checks stop; human reviewer policy is unchanged |
| set_system_package_listing | source row FOR UPDATE and listing metadata | Agency future visibility changes stop |
| register_offering_package_source | its existing package-key advisory, native source/revision/checks | Existing native registration stops for an exited creator |
| register_neutral_creator_listing (1730:108) | prior verified user/workspace SHARE and connect manager; then source manager, exact qualified revision and recorded agreement | Stops agency new/replayed listing admission after exit; existing term/qualification predicates and histories remain |

The enterprise-standards migration replaces the publisher with the same manager
call, not an extra independent caller. Other source-money producers calling these
routines inherit this boundary; no paid term, qualification approval, grant,
Version installation, accepted release or provider writer is edited. Nested
manager invocations retain the same transaction locks. No new lock class, row
upgrade, dependency, helper RPC or public grant is introduced. This is a source
inspection, not evidence that every lock interaction has executed successfully.

The source manager acquires workspace SHARE before its 7415 lock. Effective
exit37 takes 7415 before workspace UPDATE. This is an inherited potential
inversion, not a new ordering introduced by1740 and not an observed deadlock
result in this lane. Other outer callers, including neutral listing1730, may
already hold user/workspace SHARE before entering the manager. Merely reordering
the manager would not establish a consistent order for all those outer callers.
Preserve actual blocked-lock/deadlock evidence and leave native HOLD open for any
such failure; do not count a deadlock abort as a successful canonical exit
refusal or hide it with retries.

## Exact inverse/reapply and catalog admission

Both directions require one exact public manager signature owned by the
migrator, canonical language/void/security-definer/volatility/parallel/config/
argument/default/cost properties, and exactly the owner EXECUTE ACL without
other grantees or grant options. Forward pins canonical predecessor prosrc MD5
c38d391dfc5030244639e5a60d3aeafa. Inverse pins successor prosrc MD5
b1899c36f203a3d07230a31a6d5a299f, then restores the exact historical manager DDL.
CREATE OR REPLACE retains identity and ACL; no data is erased. No journal table
or additional callable helper is needed because both bodies/properties are
fixed, and inverse refuses drift rather than trusting a rewritten baseline.

Mandatory actual catalog rehearsal on a separately owned fresh current schema:

1. Capture complete function definition/property/owner/ACL/default-privilege,
   dependency and exposure catalogs before 1740. Apply1740 and capture successor.
2. Probe body, overload, owner, custom execute role, grant-option, missing owner
   ACL, volatility, parallel, cost, argument/config and security-definer drift
   in separate transactions for forward and inverse. Each must refuse before
   replacement; compare entire catalogs before/after each refusal. Restore probe
   transactions without altering retained fixture history.
3. Run inverse and compare the complete predecessor catalog byte-for-byte; run
   forward again and compare the complete successor catalog byte-for-byte. Run
   native function exposure and read-only RPC checks. Historical migration file
   hashes and accepted money/private grant/qualification/Version functions must
   be identical through this sequence.
4. Actual inverse/reapply results and catalogs are required. Five passing source
   contract tests only check prepared text and cannot qualify a native migration.

## Controlled native wait proof plan

Use a fresh current qualified owned disposable PostgreSQL stack and three
independent psql sessions: source S, exit E, observer O. No root stack reuse,
Auth/native process launch in this lane, arbitrary sleeps as success, fabricated
exit rows, production credentials or provider calls. Bind the database identity,
connection hash, exact forward inventory+hashes and applied ledger to the new
qualification receipt before dispatch. Preserve all output privately.

Create distinct fictional agency/customer owner workspaces for every scenario.
Seed only verified identities/memberships/workspaces. Create actual private
sources and immutable revision1 through native producer RPCs before exit; never
insert source or revision table rows. For publish scenarios use a valid exact
revision2 with a new command UUID, existing source identity, approved data-only
form shape and native system_package_behavior declaration. Share targets are
fresh customer workspaces. Give each process a unique PGAPPNAME and capture its
pg_backend_pid. Explicitly set READ COMMITTED and bounded lock/statement timeouts.

Exercise each real producer, under SET LOCAL ROLE service_role, separately:

- create_system_version_source with a fresh command and valid digest;
- publish_private_application_source with expectedRevision1 and exact revision2;
- set_private_application_source_share for one exact customer target.

For **exit-first**, record the actual preflight exit read as false before E
starts. E begins, calls the real complete_workspace_exit with cancel/revoke/stop
and a unique digest, verifies its actual returned state is completed, and holds
its transaction open. S begins and dispatches one of the actual producers. O
must observe S still active with wait_event_type Lock and E's exact PID in
pg_blocking_pids(S). Also retain pg_locks entries demonstrating E's7415/workspace
row/transaction locks and the actual wait encountered by S. Fail if S returns, times out, hits a different
blocker, or no wait is observed. Only after this observed barrier, commit E.
S must fail specifically workspace_exit_future_work_blocked, roll back, and
leave no new source/System, revision2, private marker, share or check row.
Compare the complete source/revision/share/qualification/private-marker and
Version/native record/binding histories before and after the failed S command.
Exit's own legitimate audit/stop rows are compared separately and retained.

For **source-first**, S begins, executes the actual producer successfully,
checks its exact native receipt, and stays idle in that transaction. E calls the
actual exit routine. O must see E blocked by S's exact PID on the7415 advisory lock before
E obtains its workspace UPDATE lock. Commit S only after
that observed barrier. E must then complete normally. The admitted source effect
exists exactly once before exit, its history remains intact after exit, and the
next fresh source command must refuse. No duplicate effect or historical rollback
is an acceptable substitute for this ordering.

Run both directions for create/publish/share for agency workspaces (six controlled
races). Run the same six customer cases as regressions of its unchanged native
authority. Before every share/publish race confirm a synchronous positive control
on a distinct active fixture, so malformed payload or unavailable native adapter
cannot masquerade as exit refusal. Also verify actual ordinary owner/admin,
member/foreign/provider-seat/personal refusal, and agency repeatable-read and
serializable refusal without mutations. Do not call the internal manager through
a new service-role grant to make the test pass.

Additional required native probes, separate from the twelve full-order races:

- **Inherited partial-lock inversion:** E holds7415 in an open transaction before
  dispatching its actual exit call. Dispatch S's actual producer, observe S hold
  workspace SHARE while waiting on E's7415, then dispatch the real exit in E.
  Preserve the complete blocking graph and any40P01/deadlock/timeout outcome.
  This phase is a liveness probe, not a fabricated exit or an acceptable green
  refusal. No successful result is assumed. Repeat on relevant outer callers
  that already acquire workspace SHARE, especially1730 listing. Stop promotion
  on failure; any order correction requires its own reviewed successor.
- **Ninth caller admission:** create a distinct active agency source through
  actual source RPCs, qualify it through actual checks and designated human
  policy, and record explicit fictional creator agreement through
  record_neutral_creator_money (1730). Confirm a positive actual register_neutral_creator_listing command
  before exit. Exercise exit-first and caller-first controlled waits for the
  exact1730 RPC under service-role authority. After committed exit, fresh and
  replayed listing requests must refuse with protected qualification/terms,
  immutable listing, accepted paid-period and ledger histories unchanged. Also
  retain current owner/admin withdrawal and wrong source/agreement refusal.
  These extra cases do not replace any of the twelve source races.
- **Remaining callers:** actual qualification, listing visibility, generic
  publisher/share metadata, and offering registration need their own active
  positive controls and exit/current-authority refusals. Keep designated human
  review, selected private grants and recipient owner release tests separate.

Retain session PIDs, blocking samples, transaction settings, exact command IDs,
exit receipts, source receipts/refusals, immutable native before/after snapshots,
whole catalog snapshots, raw exit statuses and schema binding/hash inventory.
Any missing wait observation, unexpected success, timeout/deadlock, noncanonical
error, duplicate effect or changed protected history leaves the HOLD open.

## Current evidence and next action

Source contract checks cover branch/order retention, volatile final check,
unsupported agency snapshot isolation, exact inverse body/hash and atomic catalog/
owner-only ACL admission. The first text check used unqualified id instead of
historical w.id in its expected substring; correcting that assertion did not
change the SQL. Actual SQL application, inverse/reapply, exposure, catalog-drift
probes and all twelve controlled native races remain UNRUN.

Independent review accepted1740 source correction; native HOLD remains. This
documentation successor corrects the obsolete exit-body description and ninth
caller omission without changing accepted ae3 or6cc commit objects. Next:
coordinator reconciliation of the exact 348 companion against root `99c4f858e` with 347 migrations and all
actual current manager callers, then coordinator-owned fresh schema rehearsal
and controlled waits. Keep6cc on HOLD until those required native results pass.
The ordinary source Auth case must then run on a separate current qualified
stack. Neither packet establishes deployment or full release qualification.

## Exact 348 source reconciliation companion

[Prepared reconciliation JSON](private-source-348-reconciliation-2026-10-09.json)
reads the immutable root99c4f858edadfe28591d2da71eececd89ef7d3d3 tree:
347 exact sorted unique forward filenames and SHA256 hashes, plus only the
accepted1740 forward, give348. Every historical347 byte hash is retained; the
inverse is pinned separately and never counted as a forward migration. This is
an expected source inventory, not an observed applied ledger or qualification.

The JSON identifies fifteen canonical owner files with their 99c baseline hashes
and exact required reconciliation: historical-forward inventory, release-safety
batches manifest, both final SQL tails and combined predecessor coverage,
private-authority and checkout-window exact counts, creator exit admission
library/fixtures/source capture and original1700 proof, neutral composition tests,
and function exposure. Original native34 cases and separate supplemental case
counts remain unchanged. The original1700 checker dynamically processes347
other forwards before applying1700, producing348; that order is a source
projection and still requires native execution. No canonical owner file was
edited in this lane. Root coordinator/rootMoney owner must apply the coherent
companion to the then-current root and retain all declared unrun proof.

Before importing, check the actual current root against those immutable baseline
hashes. Read-only inspection saw root advance from99c to a98ee4043 in unrelated
source, so never treat the old HEAD as the current frozen root or force-replace
changed owners. Reconcile differences against actual source, then run exact
physical inventory, manifest hash, exposure/tail and count admission checks.
A same-count substituted/missing ledger or old347 qualification must refuse.
