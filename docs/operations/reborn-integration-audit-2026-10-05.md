# Reborn integration and branch audit

Observed October 5, 2026 EDT. This record separates local source and test evidence
from production operation. Production was neither changed nor freshly audited.

## Objective and integrated scope

Jacob asked for the overall branch state and full audits, then authorized bringing
the newer branches into `reborn`. Original `reborn`, remote `reborn`, and remote
`main` all pointed to `ff817d86`. The working tree was clean. The comparison with
the September 30 release commit `ab4f8a20` included 385 files, largely documentation
moves plus the website rebuild and workspace navigation.

Prepared integration `d1010f5e` combines:

- `fix/deepening-2026-10-05`: workspace authority, inquiry delivery, navigation,
  failure handling and product entry-point fixes ([PR 211](https://github.com/Strelva/Strelva-OFFICIAL/pull/211)).
- `reborn-business-record`: the business record and local tenant conversion
  ([PR 210](https://github.com/Strelva/Strelva-OFFICIAL/pull/210)).
- `reborn-stop-losing-data`: durable lead mirroring, repair, operator visibility
  and compatibility coverage for all nine client repositories.
- `transition/systems`: the System spine, Connections, health, contextual Versions,
  Possibilities, isolated Make real runner, customer experience and direction docs.
- `product-model` and `versioning/zero-ladder`: canonical memory, derived views,
  staged 0.x delivery and the feature inventory.

Source branches are preserved. Combining them grants no authority to apply SQL,
convert production clients, change flags, send email, deploy, or publish a website.
Vercel Git deployment is disabled in `vercel.json`.

## What is now present

The business record, tenant conversion, durable lead copy and Systems implementation
are available together locally. Redis remains the operational lead read path;
the Postgres mirror requires configured Supabase, its prepared migration and an
enabled mirror. Make real's HTTP path runs on an isolated copy and stops before
live pointer switches or provider effects. Versions and Make real still require
durable operating proof. No real client conversion or customer adoption is implied.

## Verification

Evidence logs are retained locally under `/tmp/strelva-branch-audit-20261005/`.
The installed toolchain is pnpm 10.34.5, Node 26.8.2, PostgreSQL 18 and Next 16.3.6.
Hosted CI uses Node 22. The isolated integration checkout used a frozen-lockfile
install; no dependency was added.

- Original branch: lint, typecheck, boundaries, ontology, isolated SQL, 518 suites
  and 3,958 tests passed; one test skipped. The CI harness stopped at dependency
  audit: two high and six moderate advisories. Build/browser phases did not run.
- Prepared combined source `d1010f5e`: lint, typecheck, boundaries, ontology,
  isolated SQL and 561 suites passed; 4,399 tests passed and 14 skipped.
- Full ordered migration upgrade passed on a throwaway PostgreSQL cluster.
- Client compatibility passed 196/196 checks across all nine local repositories.
  This is structural and fixture evidence, not nine live customer journeys.
- App/marketing version parity passed at 0.2.0.
- The first combined build failed while an audit dev server concurrently generated
  route types in `.next-audit`. The audit-created include was removed and the
  server stopped before retry. This failure is retained in `integration-check-ci.log`.

Final correction and browser/build receipts are recorded below.
The first final check caught incorrect TypeScript types in the new System runtime
test fixtures; that failed check is retained in `final-check-ci.log`.

## Dependency evidence

The latest nightly Preview run on `ff817d86` failed at dependency audit; later
build/browser steps were skipped ([run](https://github.com/Strelva/Strelva-OFFICIAL/actions/runs/37393778073)).
The older ordinary CI run on that SHA was green; it does not override newer
advisories or the nightly failure.

The integration patches `source-map-js` to 1.2.2. It also carries an explicit
`ignoreGhsas` entry for development-only
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
through ESLint's `fast-glob → micromatch → braces`. The advisory lists no patched
version. Passing the configured high-severity gate is therefore not a zero-advisory
claim or a production waiver. Six moderate OpenTelemetry instrumentation findings
remain in the production dependency audit. No new production risk acceptance is
recorded here.

## Open release findings

These findings were independently reviewed against actual source. Severity ranks
the consequence if the affected path is activated; it does not assert a production
incident. The website rebuild remains release-gated.

1. **P1: Hosted tenant deprovision can partially erase data before failing.**
   New reservation/publication tables restrict tenant deletion
   (`supabase/migrations/20261001120000_website_documents.sql`, tenant foreign keys),
   while `src/lib/deprovision.ts` deletes older child tables sequentially before
   deleting the tenant. The new tables are absent from its sweep and revoke direct
   service-role DML. Add an atomic supported teardown or reject these tenants
   before the first deletion; merely extending the table list is insufficient.
2. **P1: A small valid website document can expand exponentially when rendered.**
   `site-document-schema.ts` permits shared/repeated child references;
   `site-render-tree.ts` recursively expands each occurrence. An offline actual-module
   fixture validated 14 nodes / 1,699 bytes and rendered 20,480 elements. Bound
   expanded output or enforce unique tree ownership, including patch validation.
3. **P1: Anonymous audits can follow an external redirect into an internal address.**
   `src/lib/audit/checks.ts` uses automatic redirects. Homepage validation happens
   after the response is read; well-known-file fetches lack redirect validation.
   The public audit route reaches this reader. Reuse pinned DNS and validated
   redirects; the newer rebuild crawler already implements that boundary.
4. **P1: Website image rehosting fails under modern Node lookup defaults.**
   `src/products/websites/site-media.ts` returns one DNS address without handling
   `all:true` or forcing IPv4. Calling the actual function with only DNS mocked
   reproduced `ERR_INVALID_IP_ADDRESS` before connection. Transport-mocked tests
   hide the failure. Use the established pinned-request lookup contract.
5. **P1: Legacy lead POST can claim success without confirmed storage.**
   `/api/v1/leads/[tenant]` ignores `recordLead`'s nullable outcome and returns 200.
   The mirror reduces retention exposure, but when Redis is unavailable and the
   mirror is disabled, unavailable or fails, the response still claims receipt.
   Preserve the additive v1 contract while distinguishing durable acceptance
   from unavailable storage.
6. **P1: Managed website approval cannot be completed by an ordinary provider admin.**
   The managed customer UI hides Publish, while SQL launch helpers require an
   owner. The operator surface permits owner/admin discovery but admin launch is
   denied. The launch service also re-approves as the launcher. Prepare scoped
   provider launch authority that preserves the customer's approval.
7. **P1: Managed website requests still require special wording.**
   `src/experience/workspace/workspace-start.ts` selects managed service through
   phrases such as “hire Strelva”; generic “Build a new website” selects creation.
   The October 1 brief requires the existing managed relationship to choose the
   default without special phrasing.
8. **P2: Hosted tenant rename leaves current website identity stale.**
   SQL publication/reservation slugs cascade, but work payloads, document capability
   bindings and current URLs retain the old slug. Domain operations, reports and
   health probes can fail. Resolve current routing from stable identity while
   preserving immutable historical receipts.
9. **P2: Website report email points at an absent route.**
   `src/products/websites/site-report.ts` generates
   `/workspace/{workspaceId}/websites/{workId}`. The implemented workspace opens
   work through query parameters; there is no corresponding path route or rewrite.

10. **Release boundary: Systems and isolated Make real inherit the workspace gate.**
    That gate was enabled in the September 30 production release. Merging source
    does not activate it, but a future deployment needs an explicit feature
    boundary and acceptance decision before exposing the prepared experience.
    The newer October 5 release re-audit also leaves business-record product
    adoption partial: the conversion script calls the record, while capability
    routes and owner notices do not yet consistently read it. Lead copies cascade
    with tenant deletion; retention beyond deprovision remains an owner decision.

The integration fixes tenant-specific lead email gating. The new System summary
also improves name, domain, live link, health and change access; a health signal
does not prove live verification or complete customer acceptance.

## Continuation and change review

Current commitment: integrate these branches and prove the combined local result.
The managed website remains the live customer obligation. Local integration is
not the Reborn production release. The September 30 production record remains
the last cited production scope, with authenticated customer operation unproven.

Capability-overhang review: the combined source removes branch separation as a
constraint on rehearsing conversion and the business/System journey. The decisive
next operating test is a scrubbed, isolated representative-client conversion,
with unchanged storefront responses and member/owner acceptance. No new offer,
price or outside integration is required to perform that local test.

Vault review: both feature and product futures were checked through the existing
canonical model's proposed compositions. No separate vault files exist in this
checkout or the configured strategic store. No future was activated by this merge;
live Make real, broad capability consolidation and new commercial promises remain
prepared/proposed. Production-only prerequisites remain blocked. Revisit those
records after the representative-client rehearsal; do not infer promotion from
merged source.

Exact next release action: resolve the open safety and managed-delivery findings,
rehearse a representative conversion and complete the existing production checklist
before requesting any production action. Keep paid model benchmarking, real email,
provider writes, migrations, billing and deployments behind their existing authority.

## Integration corrections and final receipt

The audited integration includes the later `51571c15` release re-audit and these
corrections, with no database migration or provider write:

- `e862140c`: tenant rename moves queued lead-mirror repairs and their payloads
  atomically, retaining TTL, retry order and failure diagnostics. Mirror failure
  reporting and alert deduplication have bounded waits. Failure tests include a
  real throwaway Redis Lua execution, acknowledgement loss and stalled reporting.
- `7024d5e7`: System website work uses the existing v2 document renderer. App and
  booking use is separated from management authority: a member can submit and
  reserve while revise, pause and management tabs remain denied. Native commands
  still enforce their own authority.
- `22358721`: the new runtime fixtures use their real workspace payload types;
  production contracts were not widened to make tests compile.

The final checked source is `2235872102e425a9d2390de1b678fdeecf50ec71`.
`pnpm check:ci` passed lint, typecheck, boundaries, ontology, isolated SQL, the
coverage gate and production build on that source: 563 suites, 4,409 tests passed,
14 skipped, 68.97% line coverage and 54.51% branch coverage. Dependency audit passed
its configured high gate with the explicit exception described above.

The browser phase then stopped because another local task occupied port 3100.
That failure remains in `final-check-ci-corrected.log`; the unchanged remaining
browser commands were resumed with empty providers on port 3312. Public smoke
passed 94 tests and skipped 240 opt-in fixture/authenticated tests. Its 62 UX
capture cases only take screenshots and do not assert visual correctness; their
inclusion does not make this a complete visual audit.

Remaining hosted-equivalent browser phases passed: workspace acceptance 38/38
(`final-workspace-browser.log`) and synthetic owner/operator surfaces 20/20
(`final-surface-browser.log`). The extra opt-in runtime run passed 38 of 39 tests
before catching a test interaction error: an existing-record app keeps its add
form collapsed. The test now opens “Add another record” before checking the field.
The corrected Systems suite passed 10/10 with zero retries, including member use,
management denial, empty/loading/error states and desktop-to-390-to-320px reflow
(`final-system-browser-corrected.log`). The other 29 opt-in application/custom-app/
workspace cases already passed unchanged in `final-system-runtime-browser.log`.
The original failure and traces are retained in `failed-system-browser-artifacts/`.

A T3 browser inspection also observed the final member Home at 390px using local
fixtures. Successful checks do not erase warnings: the workspace browser log
contains a duplicate synthetic React key, and the preview run reports a missing
fixture product image. Neither is evidence of complete production UI acceptance.

The ordered migration upgrade, all-nine-repository compatibility and version
parity receipts remain applicable: these corrections changed no SQL migration,
client contract or version. The canonical ledger validates at revision 6 (93 nodes,
133 edges), and the integration diff passes `git diff --check`.

Overall state: the branches can be developed and tested together. Reborn's dated
line audit remains 8/48 done locally, 13 partial and 27 not started; passing checks
does not close the release findings above. The next move is the safety and managed
website correction batch, followed by a scrubbed representative-client conversion.
