# Native website facts, October 8, 2026 (#457)

Prepared on `a1/457-native-fact-mappings-20261008` from
`release/security-runtime-20261007` at `e9ac136f`. This is local implementation
and proof. It does not enable a flag, publish a website, call Google, deploy,
apply a hosted migration or change a client repository.

## What an owner can do

Business details edits a formatted address and existing services, using the
same shared hours editor for weekly hours, timezone and dated exceptions.
Hours/services remain editable when Google publishing is off. A save updates
the business record first, then reports Google and native website preparation
separately. Saving a record never certifies a website or Google update.

With the existing native-facts and Systems gates on, the owner can choose
which facts each eligible linked native website uses. Name maps to
`settings.siteName`; contact facts map to the existing contact fields. Each
service pair names its business-service UUID, native-service ID and selected
name/description/price/duration fields. An owner must make those choices;
there is no name matching or array-position matching. Previously shipped
contact mappings remain the default; name and service mappings are opt-in.
Configuration affects future changed facts and does not publish anything.

The service's legacy `externalRef` is retained for compatibility. It is an
unscoped import hint, never native mapping authority. Durable mappings use
workspace + stable tenant identity + explicit service IDs, so identical hints
on another site cannot select or update its services. Service IDs, order,
booking links, images, marketing fields and unmapped content are preserved.

## Authority and dispatch

- New mapping read/save/claim RPCs are service-only. Reads and preparation
  claims retain the current acting-provider check; a global operator admin
  alone cannot replace the business’s provider. Direct mapping table access
  is revoked from public, anon, authenticated and service_role, with RLS enabled.
- The mapping mutator checks the current verified owner, workspace, linked
  active stable tenant, source-service membership and expected mapping revision.
  The route also checks native editing, current tenant content permission,
  subscription, Systems release and supported sections/native-service IDs.
- The native projection reads only confirmed owner facts. Its private service
  projection carries stable IDs; the public business-facts API is unchanged.
  Pending operator/agency edits, missing facts and removals never become a
  guessed replacement or silent deletion.
- Existing contact claims survive the additive migration. Every section has
  one dispatch claim per exact record revision. An uncertain claim blocks later
  dispatch of that section. A retry cannot create another review.
- At dispatch, current membership, subscription, flags, site linkage, mapping
  revision, record revision, content, manifest and existing draft are rechecked.
  Existing drafts are held. `applySectionUpdate(forceReview: true)` retains the
  shared validation and governance path; this feature never auto-publishes.
- A record save remains accepted when preparation fails. Google receipts and
  native preparation results remain independent. Service-only owner decisions
  gain additive `servicesChanged` and `serviceIds` receipt fields so confirmation
  prepares only the changed mapped service UUIDs. Missing service scope is held
  for operator review, never expanded to unrelated services. Owner email links
  without a member identity retain the existing operator-review fallback.

## Migration and recovery

`20261019113000_native_website_fact_mappings.sql` is proposed release batch 15,
not a production step. The rollback restores the exact captured predecessor
confirmation function and unique constraint while the expansion is unused.
It refuses after mapping decisions or explicit-mapping/non-contact review
claims exist, and refuses function drift rather than overwriting a successor.
No hosted target, environment setting or production migration is authorized.

## Local proof

- Final repository-wide ESLint and `pnpm typecheck`: passed.
- Final focused regression: 231 tests in 18 files passed (177 + 54). This includes
  the owner controls, routing, record/projection contracts, independent
  multi-site isolation cases and owner-confirmation integration. The full
  repository unit suite and production build were not run for this slice.
- Final `pnpm check:workspace-sql`: passed against throwaway PostgreSQL 17.11,
  including the entire existing ordered job plus native mapping authority and
  isolation, confirmed versus pending services, stale revision/configuration,
  legacy claim identity, uncertain no-replay, flags-off/inactive-site refusal,
  slug rename, neutral provider read/claim, staff/seat revocation, and global
  operator refusal. Exact unused rollback/reapply and retained-data refusal
  passed. Only local transport adapters were used. An earlier fixture tried to
  delete an immutable link; the corrected fixture uses inactive-site refusal.
- Product boundaries passed with unchanged baseline: 202 imports in 92 files,
  43 older boundary imports; no new exception. Release inventory, hosted-domain
  configuration and `git diff --check` passed.
- Rendered browser proof remains unavailable. Both the normal fixture run and
  the same scoped escalation retry stopped before a page opened because Chromium
  could not create its Unix process-singleton socket (`Operation not permitted`).
  No screenshot, desktop/mobile visual pass or authenticated browser proof is
  claimed. Preview fixtures and Playwright cases are retained for a capable
  environment; incidental generated files and tsconfig changes were cleaned.

The dispatch boundary remains check/recheck before the existing content writer;
this slice does not introduce a cross-store atomic compare-and-swap for every
concurrent mapping or draft edit. Force-review still prevents live publication.
These proofs do not establish hosted delivery, public read-back, adoption or
production acceptance. #458 standing publication grants and #468 combined
Google consent remain separate work. Automatic PR CI is configured for `main`,
so a draft targeting the release branch does not establish a GitHub CI pass.
