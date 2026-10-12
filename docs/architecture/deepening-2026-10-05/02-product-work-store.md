# Workspace records

Status: proposed · 2026-10-05 · candidate 2 of 9 · source: architecture review

## What it is

One module that every product goes through to read, create and change the
things it keeps for a workspace: website drafts, schedules, documents,
trackers, onboarding cases, applications. Today that is one table
(`saved_product_work`) reached three ways. Five products use the
`BoundedStore` port (`src/platform/bounded-work/repository.ts:7-30`). Four
products call `getWork`/`saveWork` plus their own revision-checked RPC and
translate its errors by hand. Two products detect the production adapter by
identity (`store === boundedStore`) and run a different code path for their
own tables. The module puts one interface over all of it, with a Postgres
adapter and an in-memory adapter that pass the same contract.

**Renamed from "product work store".** "Work" is taken: CONTEXT.md defines Work
as a finite request, action or result, and a website draft is not finite.
ADR 0011 already says records stay underneath Systems, which is exactly this
layer. A System (attymooney.com) is shown through one or more workspace records.

## Language

**Workspace record**:
One thing a product keeps on behalf of a workspace, such as a website draft, a schedule, a document or an onboarding case. It belongs to exactly one workspace and one record kind, and changes one revision at a time.
_Avoid_: saved work, product work, bounded work, saved product work, resource, item

**Record kind**:
What a workspace record is: the product that owns it plus the kind of thing within that product, such as "tracker / tracker" or "onboarding / case".
_Avoid_: resource kind, product id (alone), type

**Owning product**:
The one product allowed to create and change records of a given kind. Other products may read those records but never change them.
_Avoid_: writer, source product

**Revision**:
The count of accepted changes to a workspace record. A change names the revision it started from.
_Avoid_: version (ADR 0011 uses Version for context, not time), CAS, sequence

**Revision conflict**:
The refusal of a change because another change was accepted after the one it started from. The person reloads and tries again; nothing is merged.
_Avoid_: stale write, race, concurrent edit error

**Revision entry**:
The append-only note of who made a revision, what kind of change it was, and when.
_Avoid_: history row, audit entry, change log

**Companion state**:
State a product keeps beside its workspace records under its own rules, such as application releases, custom-application grants and budgets.
_Avoid_: side table, durable state, sidecar, canonical storage

**Stopped workspace**:
A workspace whose exit is complete. Its records stay readable and nothing new starts in it.
_Avoid_: exited workspace, frozen, closed, archived

## Scenarios

| Scenario | Today (verified) | With the module |
| --- | --- | --- |
| Two people edit the same document from revision 4 | Each product maps its own conflict code: `documents/server.ts:47`, `tracker/server.ts:101`, `onboarding/server.ts:86`, `bounded-work/repository.ts:24`, `product-learning/server.ts:37`. Messages differ: tracker and documents throw the default "The workspace operation conflicts…", bounded says "This work changed. Reload…" | One `RevisionConflictError` with one message. The contract proves exactly one of two writes from revision 4 lands, in both adapters |
| Exit completes while someone edits a document | Exit is enforced by the `saved_product_work` trigger (`20260920100000_workspace_exit.sql:62-117`, redefined `…export_boundaries.sql:172`). It blocks inserts and a few status moves for investigations, operations and scheduling. Websites also check inside their RPC (`20260920120000_websites.sql`). Document, tracker and onboarding updates pass after exit, so the exit mapping at `documents/server.ts:46`, `tracker/server.ts:100`, `onboarding/server.ts:85` never fires on update | Each record kind declares what a stopped workspace still allows. One contract case per kind shows it. Whether edits continue is a question for Jacob |
| Product-learning creates a record after exit | `create_product_learning_work` inserts and the trigger raises `workspace_exit_future_work_blocked`. `product-learning/server.ts:24-26` does not map it, so the person sees "could not be saved" (store failure) | The single translation maps it to `WorkspaceStoppedError` for every kind |
| Agency's read delegation is revoked between read and write | `getWork` admits direct members, delegated readers and assigned agencies (`workspaces/repository.ts:304-314`). Every write RPC rechecks direct membership inside its transaction, so the write is refused. The read result does not say whether the actor may edit (`SavedWork` has no access field), so callers guess | `read` returns `access: "edit" \| "read"` as of that read. Writes still recheck in the transaction. Who counts as a member stays with candidate #9 |
| Tracker records an experiment under another product | `tracker/server.ts:121,140` creates `research / experiment` through `saveWork`, which accepts any product id from any member (`workspaces/repository.ts:331-352`). Product-learning reads documents, trackers and experiments (`product-learning/service.ts:8`) | Tracker is declared the owning product of `research / experiment`. Product-learning gets a read-only view of those kinds. No other product can create them |
| A test passes in memory and fails in Postgres | `fixtures/bounded-store.ts` allows one hard-coded owner, skips the product allow-list (`websites.sql`: applications, scheduling, investigations, websites), skips revision+1 and append-only checks, ignores exit, never updates the title from the payload | One contract suite runs against both adapters. The memory adapter takes a membership and exit table instead of a hard-coded owner |
| A custom-application test exercises releases and grants | `custom-applications/lifecycle.ts:128-129` returns no database unless `store === boundedStore`; 26 `durableDb` uses switch paths. In memory, design authority is `createdBy === actor` (`lifecycle.ts:309-316`) and state lives in module maps; in Postgres the RPCs decide. Same pattern at `applications/repository.ts:80-87` and `websites/server.ts:292` | The composition root picks matching adapters once (Postgres records + Postgres companion, or memory + memory). Products never inspect which adapter they got |
| A visitor books on a public website | `scheduling/public-booking-server.ts:73-89` reads `saved_product_work` and `users` directly and acts as the schedule's creator. If the creator leaves the workspace, a valid public grant stops working | Out of scope for the first steps. Once candidate #9 defines a grant principal, the module's `read` accepts it, and this direct read goes away |

## Contradictions in the code

1. Exit handling: TypeScript treats "workspace stopped" as possible on document,
   tracker and onboarding edits. The database never raises it there. The
   message says "New work is stopped"; edits to existing records keep working.
2. `create_product_learning_work` reports the 500-record limit as
   `learning_revision_conflict` (`20260912143000_product_learning_work.sql:14`)
   while every other path uses `saved_work_limit_reached`
   (`20260905190000_release_one_workspaces.sql:102-111`).
3. `*_payload_invalid` (a caller bug) is reported as "could not be confirmed",
   the same as a store outage, in all five writers.
4. `readBounded` checks product but not kind (`bounded-work/repository.ts:36-38`).
   The other 22 call sites check both. Work plans report a wrong kind as
   not-found (`work-plans/repository.ts:12`); everyone else reports access
   denied.
5. The five update RPCs are not copies. Each also holds product rules: tracker
   cross-record links (`20260912190000_tracker_record_coordination.sql:39-67`),
   document receipts, onboarding revisions starting at 1, learning revisions
   capped below 1000, and revision kept at `payload.tracker.revision` for
   trackers but `payload.revision` elsewhere.

## Interface

Recommended: a records module with a kind-scoped handle. Products describe
their kind once and get back four operations.

```ts
// src/platform/workspace-records/index.ts
export interface RecordKindSpec<P> {
  product: string;                       // owning product
  kind: string;
  schema: z.ZodType<P>;                  // payload is parsed on every read
  revisionOf(payload: P): number;        // where this kind keeps its revision
}

export interface WorkspaceRecord<P> {
  id: string; workspaceId: string; product: string; kind: string;
  title?: string; payload: P; revision: number;
  input?: unknown; sourceId?: string;
  createdBy: string; createdAt: string; updatedAt: string;
  access: "edit" | "read";               // for this actor, as of this read
}

export interface NewRecord<P> { title?: string; payload: P; input?: unknown; sourceId?: string }

export interface RecordsOfKind<P> {
  /** Throws RecordNotFoundError when missing, another kind, or not visible. */
  read(actor: WorkspaceActor, id: string): Promise<WorkspaceRecord<P>>;
  list(actor: WorkspaceActor, workspaceId: string): Promise<WorkspaceRecord<P>[]>;
  /** Direct member only. Throws WorkspaceStoppedError, or the saved-record limit. */
  create(actor: WorkspaceActor, workspaceId: string, record: NewRecord<P>): Promise<WorkspaceRecord<P>>;
  /** next must be revisionOf(current)+1. Membership is rechecked in the write. */
  change(actor: WorkspaceActor, current: WorkspaceRecord<P>, next: P): Promise<WorkspaceRecord<P>>;
}

export interface WorkspaceRecords {
  own<P>(spec: RecordKindSpec<P>): RecordsOfKind<P>;
  view<P>(spec: RecordKindSpec<P>): Pick<RecordsOfKind<P>, "read" | "list">;
}

// Errors extend today's classes so routes keep their status codes.
export class RecordNotFoundError extends WorkspaceAccessError {}
export class RevisionConflictError extends WorkspaceConflictError {}
export class WorkspaceStoppedError extends WorkspaceConflictError {}  // WORKSPACE_EXIT_STOPPED_MESSAGE
export class RecordRejectedError extends WorkspaceStoreError {}       // *_payload_invalid

export function postgresWorkspaceRecords(): WorkspaceRecords;
export function memoryWorkspaceRecords(seed: MemorySeed): MemoryWorkspaceRecords;
```

`own` is how a product gets write access, so a product can only change kinds it
names. Candidate #8's capability descriptor can carry the `RecordKindSpec`;
its recheck and perform steps call `own(spec)`. Candidate #7 maps these error
classes to HTTP. Candidate #9 owns who is a member and what a delegation
allows; this module only asks.

Alternatives considered:

- **Command store.** `records.apply(actor, ref, command)`, with each kind
  registering a reducer, and the store doing read, compute and write. Deepest
  interface, but it pulls the document, tracker and onboarding engines into
  the store. Tracker authorizes coordination between compute and write
  (`tracker/server.ts:94`). Rejected: it overlaps #8 and becomes a runtime.
- **Keep `BoundedStore`, add a shared error translator.** Four methods, plus
  `translateWriteError(error, conflictCode)`. Cheap and safe, but shallow.
  Callers still pass raw payloads, check kinds by hand, and sniff adapters.
  Kept as step 1 of the migration, not as the end state.
- **One generic SQL function first.** Collapse the five RPCs, then build the
  TypeScript seam on top. Rejected as the first move: it needs a migration and
  Jacob's yes, and contradiction 5 means each kind still needs its own
  validation in SQL.

## Behind the seam

- **Postgres adapter.** Reads use today's `getWork`/`listWork` and work out
  `access`. Creates use `saveWork` or the kind's create RPC. `change` looks up
  the kind's writer: `update_document_work`, `update_tracker_work`,
  `update_onboarding_work` and `update_product_learning_work` by kind;
  `update_bounded_product_work` for applications, scheduling, investigations
  and websites. One function translates `workspace_access_denied`,
  `workspace_exit_future_work_blocked`, `*_revision_conflict`,
  `*_payload_invalid`, `saved_work_limit_reached` and an empty result. It
  takes an `RpcClient` port (`rpc(name, args)`), so a test can point it at the
  throwaway Postgres.
- **Memory adapter.** Seeded with memberships, delegated reads and stopped
  workspaces. Enforces revision+1, append-only revision entries for kinds that
  use them, the 500-record limit, and a per-kind stop policy that mirrors the
  trigger. Exposes an internal `project(id, payload)` that only memory
  companion adapters use.
- **Companion state** stays product-owned. Applications and custom
  applications each define a companion port (custom applications: the 13
  `custom_application_*` RPCs) with a Postgres and a memory adapter. Those
  Postgres functions already rewrite the record's payload in the same
  transaction (`custom_application_touch_work`,
  `application_touch_compatibility`). The memory companion does the same
  through `project`. The composition root builds records and companions from
  the same backend, so `durableDb(store)` and `managerForMemory` disappear.
- Not yet behind the seam: `update_work_responsibility` and
  `checkpoint_operational_assignment` also write this table.

## Tests

- **Survive:** the product behaviour suites (`bounded-applications`,
  `bounded-scheduling`, `bounded-investigations`, `websites-server`,
  `custom-application-lifecycle`, `workspace-document`, `onboarding-lifecycle`)
  keep their assertions and switch from `fixtures/bounded-store.ts` to the
  memory adapter. All `tests/*-schema.sql` files survive; they guard each
  kind's own rules.
- **Replaced:** tests that mock `@/platform/workspaces/repository` and
  `@/lib/db/client` and assert RPC names. That means `tracker-server`,
  `tracker-change-server`, `tracker-coordination`, `work-plan-application`
  and `horizontal-work-routes`, plus `application-repository`, which spies on
  `boundedStore` and calls `durableDb`. These cases move to the contract
  suite or to the product suites on the memory adapter.
- **New:** `describeWorkspaceRecordsContract(makeAdapter)`. Cases:
  create/read round trip; read of another kind is not-found; a stale revision
  is refused and leaves the record unchanged; two writes from one revision,
  exactly one wins; a non-member is refused; a delegated reader sees
  `access: "read"` and cannot change; a stopped workspace refuses create, with
  one case per kind for change; the next revision must be +1; `view` has no
  write; the title follows the payload. Companion contracts get the same
  treatment.
- **On Postgres:** `pnpm check:workspace-sql` is psql-only, the repo has no
  Postgres client, and reads use the query builder. So step 2 mirrors the
  write cases in `tests/workspace-records-contract.sql`. One TypeScript suite
  on both adapters needs `pg` (Jacob's yes) and read RPCs (step 6).

## Migration steps

1. **Translation only, no migration.** Add `src/platform/workspace-records/`
   with the error classes and one translator. Point `boundedStore.update` and
   the four hand-rolled writers at it. Fix the product-learning exit mapping.
   Proof: existing tests plus `pnpm typecheck`.
2. **Memory adapter and contract, no migration.** Replace
   `fixtures/bounded-store.ts`. Add the SQL mirror of the write cases to
   `check:workspace-sql`.
3. **Move products one at a time:** documents, tracker, onboarding,
   product-learning, investigations, scheduling, websites (deleting the list
   sniff at `websites/server.ts:292`). Each product deletes its kind checks
   and its RPC call.
4. **Companions:** applications, then custom applications. Delete `durableDb`
   and `managerForMemory`; tests use the memory companion.
5. **Ownership:** declare tracker as the owner of `research / experiment` and
   give product-learning a `view`. Stop exporting `saveWork` and `getWork`
   outside the module. Steps 1-5 deliver most of the value with no database
   change.
6. **Needs Jacob's yes (DB migration).** Add `change_workspace_record` (same
   lock order, membership, kind match, revision compare and stop policy for
   every kind) that calls a per-kind `validate_<kind>_change` function. Add
   `read_workspace_record` so read and access are one round trip. Keep the old
   RPC names as wrappers for one release, then drop them. Optionally move
   revision into a column.

## Decisions worth an ADR

**Each record kind has exactly one owning product; other products only read
it.** Hard to reverse once data is written under owners; surprising because
the table accepts any product id from any member; a real trade-off against
today's open writes (tracker writes `research / experiment`). "Product rules
stay in per-kind SQL" is not ADR-worthy until step 6.

## Open questions for Jacob

1. After a workspace exits, may people still edit existing documents,
   trackers and onboarding cases? The database says yes; the code and copy
   assume no.
2. Is a `pg` dev dependency OK, so one contract suite can run against both
   the memory adapter and a throwaway Postgres?
3. Should the public booking page act as the schedule's creator (today), or as
   the published grant? This changes what happens when the creator leaves.
   Shared with candidate #9.
4. Should `research / experiment` stay owned by tracker, or become its own
   product kind?
