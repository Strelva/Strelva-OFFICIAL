# Business policy facts

Issue #305, local implementation for Agency 1.0. No deployment, owner adoption,
booking enforcement, or provider effects are established by this implementation.

Policies are business-record facts: `cancellation`, `deposit`, `service_area`,
`payment_methods`, `age_waiver`, `booking_rules`, and `response_time`.
`service_area` keeps its existing key and values. Missing terms mean unknown;
`required: false` or `waiverRequired: false` are explicit facts, never defaults.
The schemas live in `src/platform/business-record/contracts.ts`.

## Writes and confirmation

`patchBusinessPolicies(actor, workspaceId, expectedRevision, policies, options)`
validates policy keys and calls the existing `patchBusinessRecord` machinery.
`policies` maps each key to `{ value, verified? }`; `null` removes a fact.
Use source `owner` or `operator` for confirmation, subject to the existing actor
checks. An agent or agency proposal stays unconfirmed. An edit without
`verified: true` clears prior confirmation. Provenance includes source, actor,
and timestamp. Existing revision history, idempotent commands, stale-write
protection and `undoBusinessRecordRevision` apply unchanged.

`business_record_facts` remains authoritative. New `business_policies` is a
transactional projection maintained by a fact trigger and cascading foreign key.
It backfills existing service areas without changing their provenance. Neither
clients nor service role have direct table privileges. It has no separate write
RPC or authority rules. `business_record_assert_actor` is unchanged.

## Reader contract for the agent and public-page streams

Exports from `@/platform/business-record`:

- `readBusinessPolicies(actor, workspaceId)` reuses the actor-checked record read.
- `selectBusinessPolicies(record)` returns `{ workspaceId, revision, confirmed,
  unconfirmed }`, with each key's typed value and existing provenance.
- `selectPublishedBusinessPolicies(record)` returns only confirmed terms with
  `{ value, source, updatedAt }`. It excludes private actor and workspace IDs.

The public selector accepts an already-authorized record. `/biz/{handle}`,
`get_policies`, JSON-LD and llms.txt must first enforce their own publication and
release gates; a selector does not establish consent. Those streams own their
routes and serializers. Do not publish `unconfirmed` as settled business terms.
The SQL `read_business_policies(workspace, user, verified_email)` uses the same
actor-checked read and confirmed/unconfirmed split; only service role may call it.

Cancellation and booking terms describe business policy. They do not configure
slot eligibility, cancellation cutoff, intake validation, or charging. Consumers
must preserve that distinction until the booking machinery explicitly enforces
those terms.

## Migration and proof

`20261011120000_business_policies.sql` is additive. Its rollback restores the
original fact validator and key constraint before any new policy is accepted.
After use, it refuses if new policy facts or policy history exist, including
undone/deleted facts. Preserve adopted data before preparing a later reversal;
never discard it through this rollback. Legacy service areas survive reversal.

`tests/business-policies-schema.sql` proves all policy kinds, malformed values,
confirmation refusal, provenance, replay, history, read/write denials, stale
updates, undo conflicts, and projection removal/restoration. The SQL gate runs
it before and after rollback/reapply, then proves the real rollback refuses
current terms and history-only adoption without changing data or schema. Unit tests cover typed readers and writes,
public filtering, unknown terms, and validation.

Issue #335 was already implemented on integrate: document payloads retain 20
recent receipts while `document_revisions` keeps the full history. Existing
unit and SQL tests perform 1,000 edits and undo; the added regression continues
250 edits from a legacy 200-receipt payload and undoes the latest edit. This is
local proof, not a production row-count check or release authorization.
