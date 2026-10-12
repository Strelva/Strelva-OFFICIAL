# Google location lineage

Implementation on `a1/google-lineage`, 2026-10-07, for #467. Local proof only;
no deployment, production migration, Google traffic or owner email was sent.

Each Google location keeps its existing System identity
(`google_location:<binding ID>:<location ID>`). An operator explicitly attaches
that System as a `location` Version of a shared Google source. Names, payer,
Google account and tenant count never imply that two locations are one business.
This supports either answer to Twin Trees #242: two Versions in one business,
or Versions in separate businesses with an explicitly shared source.

The source holds shareable hours and post copy. The existing Versions engine
owns immutable source revisions, local overrides, three-way compare, conflict
choices and adoption. Account bindings, location IDs, records, secrets and
approval policy never enter the shareable definition. A single OAuth binding
may legitimately contain several locations; each Version still resolves its
own binding/location pair from its own business's publishing snapshot.

## API

`/api/workspace/publishing/google-versions` is additive. All calls require a
confirmed workspace actor and the existing Workspace, Systems and Publishing
release gates. Writes also require the same-origin JSON guard and rate limit.
Source authorship and target administration use the existing Versions rules;
source authorship does not grant access to another business.

`GET ?workspaceId=<UUID>&versionId=<UUID>` returns the Version, its row revision
and available improvements. It requires access to the listing's own business
and target, beyond a lineage-only grant.

`POST` supports these commands (the exact strict input schemas live in
`src/products/google-listing/versions.ts`):

- `publish`: `workspaceId`, `name`, `definition`, `summary`, `commandId`,
  optional `sourceSystemId`, `hidden`, `expectedSourceRevision` (initially 0).
  Definition: `{kind:"google_listing", hours?: <business-hours-shape>|null,
  post?: <Google-post-shape>|null}`. Set `hidden:true` for a same-business
  shared setup; `hidden:false` for an agency Library source. Updating requires
  the current source revision. Replaying the same definition/summary against
  the immediately preceding revision returns the existing revision.
- `share`: `workspaceId`, `sourceSystemId`, `businessId`. Explicitly shares the
  source with a second business through Versions. Copies no accounts or data.
- `attach`: `workspaceId`, `sourceWorkspaceId`, `sourceSystemId`, `revision`,
  `bindingId`, `locationId`, `label`, `commandId`. Adopts the existing projected
  listing into the System spine if needed, then creates its Version. A retry
  returns existing lineage only for the same source and location context.
  The adopted spine revision references the connected location; it does not
  claim that source defaults have been sent to Google.
- `override`: `workspaceId`, `versionId`, `expectedRowRevision`, `path`
  (`hours` or `post`), optional `value`. Omitting value clears the override;
  null explicitly clears hours or removes the shared post.
- `prepare`: source `workspaceId`, `sourceSystemId`, `revision`, `kind`
  (`hours` or `post`), `commandId`, and selected `versions`, each with
  `workspaceId`, `versionId`, `expectedRowRevision` and optional conflict
  `resolutions` (`keep_local` / `take_upstream`). Offers the shared revision
  once, with a separate approval draft and outcome for each selected location.

Preparation adopts the working definition only, then calls the existing Google
draft path. It never approves or sends a Google write. Each frozen event pins
its Version row revision, definition digest, System and binding/location pair.
Before approved dispatch, the executor rechecks those pins and the Systems
release gate, alongside the existing owner authority check. This also works
through the existing sessionless owner-link executor. A changed Version or
replaced binding blocks dispatch and requires a fresh draft.

One conflict, stale Version, disconnected target or failed preparation is
reported for that location; other selected locations continue. If adoption
succeeded but draft persistence failed, reload that Version's current row
revision before retrying. Its working copy remains adopted; Google is unchanged.
Retrying with the same command and unchanged Version reuses the existing event.
An approved or declined event is reported as such, rather than offered again.

Approval, accepted-write recovery, receipts, read-back and undo remain in the
existing per-location publishing path. Google acceptance finishes that approval,
even if read-back fails. The receipt records provider reality; a Versions
baseline or working definition does not prove an external write. Generic Version
release history is unchanged by publishing an output.

Stored listing Systems keep their publishing health, controls and receipt
projection. Their lineage appears through the existing `read_business_versions`
read and Versions panel; no parallel lineage table or component was introduced.

## Proof and limits

- Unit and route tests cover one/two-business layouts, local-hour conflicts,
  explicit choices, target isolation, flags, stale drafts, scoped management,
  shared-definition validation, source replay and HTTP guards.
- Google doubles cover frozen location hours, sessionless approval dispatch,
  accepted receipt/read-back and failed read-back without a repeated write.
- The Postgres test (`google-location-versions-postgres.test.ts`) persists real
  source and listing System/Version rows, reads scoped lineage, prepares with a
  fake port and checks the frozen pins. Run with `STRELVA_VERSIONS_PSQL` pointed
  at an isolated workspace SQL cluster **after account-binding migrations**.
- No new schema or dependency. Existing SQL checks still run unchanged.

The source/attach/prepare workflow is an API implementation, with existing
lineage display and approval surfaces. It adds no bulk authoring UI. Reply voice
still uses the existing tenant-level store; this endpoint does not copy voice,
change reply mode or grant unattended posting authority. Google accounts without
a linked tenant still need the workspace-owned publishing target described in
the Wave 6 handoff. Live Google/OAuth, owner-link delivery and adoption/economics
remain unproven. Twin Trees' business boundary remains the owner's decision.
