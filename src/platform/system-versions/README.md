# System Versions and lineage

A Version is a System adapted to a different business reality: another
location, customer segment, agency client or franchise. It keeps lineage to its
source and owns everything local: overrides, accounts, data, people, grants and
its own release history. A Version is not a point in time.

## The model

- **Source revision.** The source business publishes an immutable shareable
  definition (shape and rules), identified by the spine's `SystemRevisionRef`
  (`revisionId` plus an ordering `number`). Records, bindings, grants and secrets are
  rejected at publish (`assertShareableDefinition`).
- **Version.** `createVersion` gives the descendant its own `SystemRef`, owned
  by the descendant business. Only the definition is copied. Bindings, data and
  grants start empty.
- **Overrides.** Business-owned paths over the baseline. Working definition =
  baseline + overrides.
- **Bindings.** `bindAccount` accepts only a connection the Version's own
  business owns (`ConnectionOwnership` port), and only if no other Version
  already binds it. A source's or sibling's account is refused, even inside
  one business.
- **Releases.** `release` snapshots the working definition as release N of this
  Version. Release numbers never follow source revision numbers.

## Upstream improvements

1. The author publishes revision N+1. Nothing local changes.
2. `listAvailableImprovements` shows it to each descendant with a three-way
   compare (base = baseline, upstream = N+1, local = working).
3. Status is `auto_applicable`, or `blocked` with explicit `conflicts`
   (`overlapping_edit`, `incompatible_override`) or `missingBindings`. Each
   override is one unit of local change: an override at `form` conflicts with
   an upstream change at `form.title`, and the reverse. Lists are one value.
4. The descendant decides: `adoptImprovement` (with `keep_local` or
   `take_upstream` for every conflict) or `declineImprovement`. Missing accounts
   must be bound locally first. Adoption changes the working definition only;
   it does not release. The adopted result must equal the preview plus the
   chosen `take_upstream` values, or adoption fails and nothing changes.

The compare rule is the inquiry pattern update rule, lifted out.
`src/products/inquiries/inquiry-pattern-updates.ts` now calls
`collectChangedPaths` from `compare.ts`.

## Access

Members of the owning business read everything. Any other business, including
the source author, gets `VersionAccessError` unless the owner grants
`lineage` (overrides, releases, decisions) or `lineage_and_data` (adds local
data). Bindings are never shown outside the owning business.

## Two real cases

- **Same business: Twin Trees.** One account, two location sites
  (`twintrees-camillus`, `twintrees-fayetteville`). `multiSiteAccountAsVersions`
  plans one website System with a Camillus Version and a Fayetteville Version,
  each with its own hours, domain and booking calendar. The plan sets
  `requiresOwnerConfirmation`: if the locations are separate legal businesses
  they become two workspaces sharing a source instead. Proven in
  `src/__tests__/system-versions-twin-trees.test.ts` with placeholder data.
- **Cross business: agency source, two clients.** Proven in
  `src/__tests__/system-versions-lineage.test.ts`.

## Existing objects (`mapping.ts`)

| Today | Reads as |
| --- | --- |
| Inquiry `PatternInstallation` (`installed` / `update_available` / `conflicted`) | The closest existing lineage. `sourceVersion` = baseline, `targetVersion` = Version release. This module builds on its compare rule |
| Offering definition `id@version` | Strelva-authored source System, revision number from semver. Projections with no stored revision get the deterministic `revisionId` `<systemId>@<number>` (`projectedRevisionRef`) |
| Offering installation | Version owned by `businessId`; `configuration` = overrides, `nativeResources` = bindings, `active` = release 1 |
| Multi-site account (Twin Trees) | One website System, one location Version per tenant |
| Agency website draft grant | A **Possibility** on the client's own System, prepared by the agency. Not a Version. An upstream improvement offered to a client also arrives as a Possibility there |

## Q_CONTEXT_RELEASE_AXIS

No existing `version` column means a contextual Version. They are all temporal
history, concurrency, platform or contract. Contextual identity is new and is
added beside them; nothing is renamed:

- **Lineage baseline**: `OfferingInstallationRecord.definitionVersion`,
  `PatternInstallation.sourceVersion`.
- **Version release**: custom app `currentReleaseVersion`/`releases[]`,
  `PatternInstallation.targetVersion`, client repo `compatibleTag`/`compatibleCommit`.
- **Neither**: `release-manifest.json` `version` (platform build),
  `contractVersion` and `SCAFFOLD_CONTRACT_VERSION` (`/api/v1` family), and
  every `revision` / `expectedRevision` token (concurrency).

`RELEASE_AXIS_FIELDS` is the full list and is tested. `/api/v1` and
`release-manifest.json` are untouched.

## Storage

- `store.ts` is the port (async; every call names the actor) and the
  in-memory reference. `supabase-store.ts` is the Postgres adapter over
  `supabase/migrations/20261007150000_system_versions.sql`. One contract suite
  (`src/__tests__/system-versions-store-contract.test.ts`) runs on both; the
  Postgres run happens inside `pnpm check:workspace-sql` on a throwaway
  cluster. SQL rules are proven in `tests/system-versions-schema.sql`.
- A Version release also records a `system_revisions` row on the Version's
  System and moves its current pointer, so History and the spine agree.
- `improvement.ts`: Library states, the improvement Possibility, and the
  release gate (`createVersionReleaseGate`), which releases only with an
  approval from its `VersionReleaseApprovals` port.
- Strelva-authored sources live in Strelva's agency workspace, read from
  `platform_workspaces` (`resolveStrelvaAgencyWorkspaceId`).

## Native Live authority (prepared October 8)

Native application Versions prepare one exact `system.change_live` owner
item through `src/platform/needs-you/sources/version-release.ts`. Agencies can
prepare client drafts through their staffed provider seat. Native app effect
mandates are not qualified yet, so the signed-in business owner approves and
executes Live; a provider/operator review or owner-link session cannot publish
one. `save_system_version` binds the same Version, System, row revision,
baseline and approved candidate, and rechecks the approver's current verified
owner membership. Issued decisions and release history remain unchanged.

The additive `20261020112000_version_live_owner_authority` successor is prepared
and pinned in proposed batch 12. Local unit and ordered SQL proof establish this
boundary, not deployment. See
[the authority qualification](../../../docs/operations/content-version-authority-2026-10-08.md)
for checks, failure evidence and remaining work.

## Not built yet

- Offering installations and inquiry pattern installations are still read
  through `mapping.ts`, not stored as Version rows.
- Collection/franchise Versions across several Systems.

## Revision-bound package declarations (#326)

New executable source revisions carry `definition.declaration` (schema version
1). The current interpreter supports only the closed native `internal_app`
shape: title, fields and components. It inspects that shape independently of
caller-supplied claims. Unknown kinds, fields, components and extra behavior
keys fail closed. Declaration metadata is stripped at every native-spec boundary.

The declaration states records read and written, directional business-record
fields, outside effects, required binding kinds, and outbound fields grouped by
destination. It describes possible behavior, including behavior behind release
flags. An ordinary application can email the business owner on submission even
without an assigned-person field; contact resolution can write the business
record. Shared-view exposure includes visible labels and select options even
when a recipient cannot read records, plus the release/record revision metadata
the view emits. It describes what an explicitly granted viewer could receive.
These declarations never create a grant, connect an account, approve a
message or authorize an outside write.

A release re-reads the immutable source pin through the owning Version's scope,
then inspects the effective definition after every override. It validates each
permission dimension separately, checks required bindings are still locally
owned, and refuses locally replaced declaration metadata. Publishing a broader
upstream revision changes nothing until it is adopted. Keeping local behavior
through adoption, or restoring a prior release, must fit the currently adopted
ceiling. Restore and whole-definition adoption carry the current declaration,
not a historical permission ceiling. Unsharing a source prevents new upstream
access without taking away an existing descendant's immutable pin.

The additive migration repeats these checks for source publication and direct
SQL release calls. Native application publication and pointer changes cannot
bypass their mapped Version's accepted release. Rejection is transactional and
uses `system_version_declaration_invalid` / `VersionDeclarationError`; Needs you
records this as a failed release rather than a successful no-op.

Compatibility is intentionally fail-closed. Historical revisions, draft edits
and issued releases stay readable. An undeclared historical definition cannot
produce a new release: publish a supported declared revision and explicitly
adopt it first. No existing revision or historical output is rewritten.

Non-native sources also supply product-specific draft planners. Existing Google
listing copy can still be stored and offered through its separate per-location
approval flow, but cannot use native Version release. Supplying a declaration
does not bypass the supported-kind check. Google dispatch is unchanged and is
not certified by this interpreter; no general Google or payment runtime is added.

Focused proof lives in `system-version-declarations.test.ts`, the owner-decision
integration tests, and `tests/system-version-declarations.sql`. This is a local
implementation contract; production migration, feature activation and customer
adoption remain separate decisions.
