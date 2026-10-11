# Ordinary private sources: isolated source and Auth packet

Status: implementation and focused source checks prepared in the existing
creator-maintenance proof checkout. Genuine Auth/native/UI execution is UNRUN.
The coordinator owns integration, full type/build checks and serialized local
stacks. This packet neither qualifies the full model nor changes ADR 0012.

Review follow-up:6cc remains on HOLD for the agency native exit race. Its separate
service preflight cannot close a wait for an exit commit. The reserved successor
and required controlled native proof are documented in
[private source exit admission](private-source-exit-admission-2026-10-09.md).
The customer branch already has its native post-lock exit check. Passing focused
source checks or collecting the Auth case does not resolve this native HOLD.

## What changes

An ordinary customer or agency owner/admin can create, publish and share a
reusable native form definition through the existing version-sources POST wire.
The extra agency-only gate becomes current direct owner/admin authority plus
verified native actor lookup and the same completed-exit stop. The latter is
intentional: deleting the old agency gate outright would also lose its exit
check. Native write RPCs still lock and recheck current source-manager authority.

A new private no-store GET and server-rendered source page admit only current
customer/agency members. The read DTO includes source summaries and exact
revision identities, not installed work, records, grants or accounts. A selected
incoming revision must belong to the exact source and be shared with the selected
recipient business. Qualification uses the complete existing qualification
contract. Personal and provider-seat projected authority do not enter this page.

Customer catalog and agency-home entry links reuse owned controls. The small form
publishes an actual data-only internal_app revision. Share targets are known
customer workspaces returned by the current actor workspace list; a share carries only a definition. Recipient owners/admins
can install a qualified exact revision as a separate native draft. The install
wire retains historical agency_client context and the existing private atomic
command. No new party privilege, client relationship or live approval is implied.

Lost responses freeze editable values and retain both create and publish command
IDs. Explicit retry sends the original commands. Source/package controls are
held while that attempt is unresolved. Unmount aborts observation and prevents
an old response publishing the next step or refreshing a different workspace.

Private grant issuance, exact revision/command/expiry/provider-seat checks,
current source sharing, native empty records/account bindings, source lineage,
owner acceptance, provider holds and immutable histories retain their existing
implementation. No SQL migration, dependency, price, agreement, provider action,
external message or root runtime change is included.

## Prepared genuine proof

One additive case in `tests/ordinary-source-authenticated-local.spec.ts` uses
confirmed actual local Auth identities for a customer owner, independent agency
owner, recipient owner, reviewer and stranger. Actual business bootstrap and
agency creation go through app HTTP. SQL creates only explicit fictional current
memberships and a designated local review-policy prerequisite; it never seeds
source revisions, qualification approvals, installations or synthetic lineage.

Both owners use the source UI at 1440px and a keyboard save. The customer case
forwards the original publish once to the actual route, requires its exact 201
native receipt, then aborts the browser response. Frozen fields and explicit retry
must recover the same immutable revision and commands. Every route handler is
registered for cleanup before the click and the rejecting commit promise is
observed immediately while remaining awaited by the case.

The recipient sees an unqualified incoming revision at 390px and cannot install;
the actual POST must refuse without Version rows. Actual package checks and a
distinct designated reviewer approve that exact revision. A real private grant
request without a selected/staffed provider seat must refuse. The recipient then
installs through the UI. SQL reads the actual System Version, native application
state, records and bindings. Draft installation and replay must leave the source
and immutable revision unchanged and create only one Version. Preparation cannot
make it live; the owner approves the real Needs-you item before native release 1.

Anonymous/foreign access, forged revision identity, foreign create, revoked share,
completed workspace exit, and current membership withdrawal must refuse. Exit
retains readable source summaries with no future controls. The disposable stack
retains native immutable fixture history for inspection; do not reuse the root
native stack or delete these histories as cleanup.

## Evidence and limitations

Observed local checks: 45 focused source/regression tests, four profile tests,
scoped ESLint, diff/secret checks and Playwright collection of the one exact
case. The full native/Auth case and its screenshots remain UNRUN.

Focused source checks are dependency-injected adapter/UI/route tests; they are
not actual Auth or Postgres proof. The existing private-definition privacy tests
remain part of the check. The new profile has the unchanged full-native release
environment and exactly one required named case. Its preflight rejects hosted
services, missing source/Auth gates, enabled external mail and provider credentials.
Profile tests refuse skipped, wrong-case and unit-only reports as qualification.

The first service-fixture run failed two cases because its mock qualification
omitted the existing four required evidence checks. The fixture was corrected to
match that contract; no application relaxation was made. Review also corrected
the prepared SQL snapshot to use baseline_revision_id/current_release and the
native application_states/application_records tables, and the UI to accept the
native System UUID rather than incorrectly assuming it equals commandId.

No complete typecheck, build, real browser, native fixture or provider execution
was performed in this lane. The checkout still has an older schema inventory
than the coordinator's current frozen integration. No old qualification receipt
can authorize a new supplemental run. Preserve accepted creator packets through
133cca69 and provider-held packet 9ca9498a independently; this source packet is
additive and does not replace either.

## Exact next action

1. Independently review the named source/UI/proof patch, then integrate it after
   the coordinator's frozen native window. Resolve any source-money ownership
   overlap against the actual parent diff; this lane changes no money ports.
2. Run parent full type/build checks and qualify a separate fresh owned schema
   stack against the then-current migration hash inventory and ledger. The last
   coordinator-reported inventory was 346, not this checkout's older inventory.
3. Apply `ordinarySourceProfile().env` to a clean full-native server/runner, add
   owned loopback bindings and local keys, and run `ordinarySourcePreflight`.
   Keep every provider/mail hold. Never inherit provider credentials.
4. Execute only `tests/ordinary-source-authenticated-local.spec.ts` with
   `playwright.config.ts`, workers 1/retries 0 and a JSON report. The runner must
   supply the exact already-qualified owned app URL; otherwise Playwright would
   start a server itself. Validate the complete unmodified report with
   `validateReport(report, ordinarySourceProfile())`. Its claim remains
   local-ordinary-source-only and fullReleaseQualified false.
5. Preserve actual failures/screenshots/native receipts and inspect the source
   and recipient graph. Passing this one case still leaves full release,
   commercial policy, provider evidence and distribution unproven.
