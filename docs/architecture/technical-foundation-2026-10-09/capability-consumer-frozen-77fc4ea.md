# E03 consumer delta against frozen union

Source preparation only. The [unapplied patch](./capability-consumer-frozen-77fc4ea.patch)
and [source/hash manifest](./capability-consumer-frozen-77fc4ea.json) bind six
existing-file hunks and one proposed new helper. Consumer source comes from frozen
union `77fc4ea49f61aecc901f92062d8646bd125f21ee`; the new inventory contract comes
from repaired PR625 `080ab594a18bb18ec0f7db6fc85f73b8eda39189`.
Root was notified of the proposed optional workspace field and MCP callback.
Neither interface is changed in the checkout. No union merge or canonical
promotion occurred.

## Proposed delta and ownership

- One server-only app-edge helper selects workspace product, executable, offering
  and non-internal operation keys from their existing owners. It invokes the
  existing availability projection in production evidence mode. Tenant tools and
  dashboard catalogs are not newly exposed; no tool aliases are inferred.
- A browser-safe `CapabilityAvailabilitySnapshot` binds proof entries to a
  workspace ID. `WorkspaceSnapshot.capabilityAvailability` is optional and uses a
  type-only import. Workspace GET adds it after existing required authority reads.
- Ask app-edge composition adds the same projection as supplemental model context
  after current membership, target and release admission. Existing dependency
  contracts, tool authorizers, native tools and force-review behavior remain.
- Protected MCP business-context reads receive an optional app-edge callback
  after native OAuth/SQL context validation. The selected workspace/user is
  captured for this optional read, and foreign-workspace results are discarded.
  Public discovery, input schemas, quote approvals and website writes remain.

The helper and optional Ask/MCP reads catch supplemental failures and omit the
field. Missing owner prerequisite readers stay unknown. The patch adds no owner
reader, receipt, installation permission, authorization or release value. OAuth
uses the connected user with operator/tester false; cross-viewer equality is not
assumed. Projection equality is required for identical keys, workspace, viewer,
evidence mode and owner observations.

## Fences preserved for application

No hunk targets WorkspaceApp, Layout, OpenedWork, SystemPage, needs-you reads,
Systems or Version seams, inquiry definitions/emission, or component inventory.
Saved work keys, workspace selection, navigation location/dispatch, optional
History and domain reads remain untouched. Optional proof metadata cannot replace
the current successful GET or permission epochs. A failed refresh may retain work
for display while active callback authority remains invalid; metadata must never
restore it. Current actor, domain, membership, target and per-call admission
checks remain the owners of permission.

Known unavailable evidence and unknown evidence describe the qualification read.
Neither describes a failed, accepted or retryable write. Ask explicitly preserves
that distinction; no command outcome is rewritten. The supplemental GET read
follows the required aggregate and cannot make a failed aggregate succeed.

Retain the union's read-sync caveat: `readWorkspaceSystems` synchronizes stored
Possibilities for writable viewers. An already-started synchronization can finish
even when another required aggregate read fails. This patch neither changes that
behavior nor proves that a failed GET performed no write. Existing current-actor
SQL checks remain required; mocked reader tests do not prove those checks.

## Evidence and remaining acceptance

All existing source blobs match the manifest's frozen references in this checkout.
`git apply --check` accepts the unapplied patch; its SHA-256 matches the manifest.
`git diff --check` and local documentation links pass. These are source preparation
checks, not typecheck, route conformance, browser or runtime proof of the patch.
The actual PR625 repair separately passed 74 focused tests, scoped ESLint and
typecheck. No broad/native/Auth/build/browser/provider run was authorized.

Next: root coordinates an own-branch union base and overlap before applying this
patch. Reconfirm all before-blobs at that base. Then run focused real
Workspace/Ask/MCP tests for equal projections, absent/rejected supplemental reads,
foreign workspace/user, revoked authority, current-GET callback fences and unchanged
public discovery/native admission. Retain optional History/domain failures and
accepted-write outcomes. Typecheck/lint the applied delta and inspect any eventual
rendered proof UI through Croki desktop/mobile/focus/states before claiming UI
agreement. No UI presentation is prepared here. Repository-wide inline-flag
ratchet and owner prerequisite qualification remain separate acceptance gaps.

Inquiry `href:null` cleanup stays reserved pending its separate freeze. E04
descriptor/schema conformance remains prepared and awaits A07 current owning-writer
authority before outside-write wiring changes. Canonical evidence delta proposed:
record the sparse-validator repair as local proof and this consumer patch as
unapplied source preparation; do not promote consumer/Auth/provider/production claims.
