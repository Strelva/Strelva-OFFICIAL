# System Versions and lineage

A Version is a System adapted to a different business reality: another
location, customer segment, agency client or franchise. It keeps lineage to its
source and owns everything local: overrides, accounts, data, people, grants and
its own release history. A Version is not a point in time.

## The model

- **Source revision.** The source business publishes an immutable shareable
  definition (shape and rules). Records, bindings, grants and secrets are
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
   (`overlapping_edit`, `incompatible_override`) or `missingBindings`.
4. The descendant decides: `adoptImprovement` (with `keep_local` or
   `take_upstream` for every conflict) or `declineImprovement`. Missing accounts
   must be bound locally first. Adoption changes the working definition only;
   it does not release.

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
| Offering definition `id@version` | Strelva-authored source System, revision from semver |
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

## Not built yet

- Postgres storage. `store.ts` is the port plus the in-memory reference. The
  migration waits on lane B's systems tables (slot `20261004122000`).
- Real membership, connection ownership and `SystemRef` come from
  `src/platform/workspaces`, the connections owner and `src/platform/systems`.
- Collection/franchise Versions across several Systems.
