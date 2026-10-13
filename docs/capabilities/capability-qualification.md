# Capability inventory and availability contract

Prepared against `reborn-1.0` at
`6ddc03f4d0f854997ff3f54481d5066625bf62fe`. These server projections establish no
production activation or authority. Consumer adoption is held by the architecture
union; this contract has no UI change.

## Ownership and evidence

`src/capability-registry.ts` still adapts the same six declaration owners. Entries
retain their original key/name/description/declaration fields and add:

- `owner`: owning declaration reference and workspace/tenant model;
- `contract`: declaration reference and executable/descriptive/installable/
  tenant-tools/dashboard role;
- `qualification`: owner receipt reference, exact-key evidence references and
  explicit proven modes;
- `availability`: workspace gate, existing scoped flag keys and required owner
  prerequisite IDs.

`capabilityStatusView()` generates a JSON-compatible view of every declaration.
`validateCapabilityStatusView(value)` rejects an artifact that differs from the
current owner-derived view, including changed evidence modes, foreign version
keys, invented readiness fields, missing entries and extra fields. File-reference
conformance tests check every declaration and evidence file exists.

The existing operation witnesses remain in `src/server/capabilities.ts`. Their
`focused_test` / `local` records support `local_test` only. References and dates
are historical owner witnesses; they are not newly run, exact-source native/Auth
receipts. Other catalogs currently have source references only. No mode is an
ordinal readiness level: source/test/fixture evidence does not imply local native,
local Auth, provider or production qualification. Existing owner records lack
stronger scoped receipts; those modes remain unknown. Adding stronger modes needs
an owner adapter with exact source/environment/subject receipt validation, not a
renamed label or environment string.

Commercial products are descriptive. Offering `installability` describes the
owner's installation contract. Neither becomes an executable operation by being
listed. Qualification leaves native grants, command admission, current authority,
installation, provider approvals and all production stop points with their owners.

## Server availability

`src/capability-availability.ts` exports `capabilityAvailability(keys, scope,
readers)` and `capabilityAvailabilityView(scope, readers)`. Both return only
`key`, `state`, `reason`, `message`, `evidenceMode` and `grantsAuthority: false`.
Clients may import types from `src/platform/capabilities/inventory-contracts.ts`;
`server-only` protects the compositions.

Scope names one business workspace and viewer. The default evidence mode is
`production`. `local_test` may be available for an operation with its existing
local witness when the release and owning prerequisites are confirmed. This says
nothing about native execution or production readiness. Source-only existence is
never available execution, even if requested as the evidence mode.

Resolution order is deterministic: owner declaration/role, platform kill switch,
valid workspace, scoped release rows, owner prerequisites, exact proof mode.
Known release refusals and missing prerequisites are `unavailable`; missing or
failed scoped reads and qualification are `unknown`. All consumers use these same
values rather than choose their own wording for a reason.

The existing `resolveReleaseFlag` supplies off/workspace/on and operator/tester
layering. One read is shared across a projection. A foreign or failed scoped read
returns unknown even when env is on. This stricter discovery behavior does not
change the older boolean gate's env fallback or native command admission. No flag
value, store row, production config or secret is written.

A `readPrerequisites` owner adapter reports checks bound to the exact capability
key and workspace. Missing, failed, foreign, duplicate or incomplete observations
cannot qualify availability. IDs identify native adapters, owning runtimes,
required offering resources or tenant availability. They do not replace grants;
for example, a calendar connection does not authorize a calendar write. This lane
provides the contract, not a made-up provider/resource reader.

## Remaining acceptance

Workspace, Ask, MCP and operator adoption and their rendered/journey agreement
are pending the architecture union freeze and reviewed owner prerequisite readers.
The common serializable contract is unit-tested; four fictional wrappers do not
qualify four real surfaces. The new module rejects inline env flag logic in its
conformance test. A repository-wide inline-flag ratchet and all real consumer
adapters remain integration work. No browser/Auth/provider/production claim is
made by local contract tests.
