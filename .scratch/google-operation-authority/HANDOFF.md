> Historical 8cca source handoff, superseded by the complete corrected successor.
> Current prepared behavior is recorded in [the successor operation record](../../docs/operations/legacy-google-operation-authority-successor-2026-10-09.md): qualified trusted reconnect writes credentials, metadata, canonical binding/location and watermark in one guarded SQL transaction; it performs no independent legacy or cache write. Final author checks were 126 mocked tests plus full TypeScript and scoped lint, retained in tool history only. Actual SQL, concurrency, delete/unlink, provider and Auth qualification remain unrun. The notes below preserve the prior 8cca state and its 111-test result; they do not describe the corrected current source.

# Legacy Google operation authority closure — prepared source

## Objective, base and scope

Requested by full-model coordinator: close canonical binding stale-operation/cache-await race and actual current locked legacy OAuth settings:write recheck, without provider/DB/Auth/Redis/browser calls. Isolated branch codex/google-binding-operation-authority-20261009 begins at844fb5f59a7296274ead84082fc05e0e3628a637; metadata98939 prerequisite is cherry-picked as5602cba28. Closure incremental patch must exclude that prerequisite; apply accepted98939 before closure. Native hash/boundary6d packet remains separate and every historical migration, including143, is unchanged.

## Observed defects

Generic reconnect/selection writes canonical binding/location after optional cache awaits using unversioned upsert. An older operation can overwrite a later completed canonical selection. Legacy OAuth callback admits viewer through requireTenantAccess while claiming settings:write; it writes connection and metadata before binding, so a guarded binding-only recheck leaves unauthorized state. A provider-discovery refresh can change the grant while selection waits; accepting a recaptured generation would defeat the initial pin.

## Implemented source

Interactive callback requires settings:write early, captures real actor and operation before provider reads, then commits through one durable RPC. GBP selection has the same captured actor/pin, while GA4/GSC preserve existing flow. Neither path recaptures a changed grant or falls back after refusal. Both qualified provider stores and the existing bindings flag must remain enabled; pre-cutover Redis authority cannot be held under a DB permission lock, so these interactive writes fail closed rather than silently enabling flags or authorizing cache writes.

Additive751 owns a real tenant operation watermark, complete binding id/updated_at + monotonic selection-generation digest + exact tenant/link pin. Current verified user, matching email, active settings:write memberships(editor/admin/owner) or unrevoked matching super-admin lock through transaction. Interactive connection, optional location metadata and canonical grant/location commit together. Ciphertext uses the existing secrets path; SQL canonical record hashes match fixed JS vectors. Cache writes only follow accepted durable transaction; cache outage does not erase durable acceptance. Grant refresh omitted by Google preserves durable refresh ciphertext.

Generic governed publishing reconnect keeps its existing authority port and gets pure canonical CAS instead of unversioned binding/location upsert. Its start is captured before token exchange and passed through the existing port. Canonical pins are captured before optional cache awaits. Generic legacy connection/metadata persistence remains its pre-existing authority flow; this pure service path's new proof is canonical CAS, not a newly actor-bound all-record transaction. The existing native no-tenant reconnect branch is untouched and retains its separate native/provider qualification hold.

## Lock review and reversal

Independent review found global-admission→tenant/link/workspace wait cycles against historical unlink/teardown row→global paths. New post-admission row locks use NOWAIT and return a safe superseded refusal on contention; valid current role/identity locks still last through commit. Historical writers and migration bytes are preserved. Actual concurrent lock/role/teardown execution remains pending; a source fix is not concurrency qualification.

## Validation and limitations

App unit/RPC seams pass111 focused tests across10files (103 original targeted run plus7 RPC-edge tests plus one delayed-provider-start case). Scope includes stale canonical operations paused at optional cache, no-write/current-role refusal, cutover/flag loss, exact unchanged pin, encrypted RPC tokens and sanitized responses. Scoped TypeScript, changed TypeScript lint, race-helper shell syntax and whitespace checks pass. Boundary evaluation has no new diagnostics; twelve inherited diagnostics remain on this base, including four covered by separate6d packet. Independent HTTP review reviewed locked authority and null CAS and identified the lock-cycle fix. Actual SQL fixture is prepared, not executed: absent-binding stale operation; location change-back generation; role/email/verified loss; super-admin revocation; old/equal start; actual service/Auth roles; injected post-record binding failure atomicity; legacy tombstone; unlinked durable records; fixed JS hash vectors.

Prepared race helper requires explicit owned-disposable-fresh authority, exact owned paths/connection argument allowlist, read-only server identity validation, empty Google/native/watermark state and a separate fresh runner with immediate teardown. It schedules ten role/email/tenant/workspace/link ordering cases and snapshot contention checks; no schedule was executed. It retains fictional rows for teardown and must not precede native-isolation proof in a reused database.

751 inverse is explicitly forward-only and refuses before mutation. Removing watermark history could admit delayed work; no empty inverse/source-drift qualification is claimed. No dependency, deployment, provider call, production data access, external messages or flag changes. No strategic state promoted; coordinator owns canonical-model reconciliation.

## Coordinator next action

Root owns final prospective catalog/registry/qualifier tail. Current root catalog355 includes211401; new reservation221751 adds one only if accepted. Do not inherit348/347 labels or overwrite root inventory from this lane. Register forward/inverse exact hashes and append new SQL fixture after all actual forwards, reconcile desired final total, freeze actual resulting commit and run focused/full-schema SQL, real post-admission contention, role/revocation and stale-generation cases. Native lifecycle/hash fixture and all provider/Auth operation proof remain independent pending gates. Preserve each actual failure as evidence.
