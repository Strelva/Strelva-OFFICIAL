# Website admission and settlement

Stream: `website`. Base: `reborn-1.0` at `e9511b044b217fc233bde6b174c12988eaa2e950`.

## Person and job

An owner or authorized agency prepares a private website, corrects its facts,
and reviews the exact saved preview. A lost response must not make them lose
their inputs, accidentally create another website, or reuse a command ID for
different work. A missing History read must not hide a successfully saved change.

## Before and after

Native creation retains only a request ID. After a committed response is lost,
intake stays editable and can submit different fields under that ID; the owning
service rejects it. Legacy creation already retains its submitted brief. Both
will retain the admitted command, freeze inputs through uncertainty, and check
the same request with current access. Only a settled result or demonstrated
initial refusal allows a fresh command.

Mutation settlement currently awaits domain/History enrichment. Malformed
History turns an accepted correction into an unknown write. Settlement will
adopt the owning acknowledgement and cleared approval first. Independent reads
will preserve scope/shape checks and show unavailable status with an explicit
reload, without replaying accepted work.

## Existing rules

- Workspace/work identity, monotonic current records and candidate identity
  remain separate. Delayed work from another scope is never adopted.
- Admission is synchronous before React commits; permission loss/regain
  invalidates pending responses. Visibility does not grant authority.
- Unknown writes preserve input, lock new writes and recover keyboard focus
  without stealing an outside focus choice.
- Domain recovery is an exact GET. Cutover recovery explicitly replays its
  captured idempotent POST with current authority and both attestations.
- Same-work role changes retain attempts. Workspace/work changes reset sessions.
- No production effects, migrations, API changes, dependencies or provider calls.

## Implementation plan and ownership

1. Record failing service-backed lost-ack and accepted-correction regressions.
2. Introduce a website-attempt owner for admission, retained commands,
   permission epochs, unknown/refused/accepted settlement and mounted cleanup.
   Replace duplicated lifecycle guards in the owned experiences/recovery controls;
   keep transport-specific receipt validation and GET/POST semantics with callers.
3. Add native exact-request recovery; preserve public props and keyed sessions.
4. Remove supplemental reads from mutation settlement; independently validate
   supplemental reads and expose unavailable/reload states.
5. Run focused failure/identity/focus proofs, type/boundary/ontology checks,
   inspect fictional rendered desktop/mobile states, review diff and commit.

Owned runtime: `src/experience/websites/{RebuildExperience,WebsiteExperience,
WebsiteRecoveryControls}.tsx`, `rebuild-transport.ts`, `website-attempt.ts`.
Directly affected tests, this stream document, and only the relevant component
inventory entries are in scope. Opened-work composition overlaps consumers:
public props remain stable; no role-variant remount is introduced.

Deletion targets: repeated in-flight/unknown/retained-command/permission lifecycle
code and post-mutation enrichment. Focus projections and meaningful guards stay.

## Failure cases and acceptance

Commit then lost acknowledgement checks the original body/ID and creates exactly
one record. Changed/foreign/malformed acknowledgements stay unknown. Immediate
double clicks, stale work/workspace, permission loss/regain, missing/denied reads
and unmount cannot reopen admission. Initial proven refusal releases intake;
later refusal does not settle uncertainty. Accepted corrections remain visible,
editable and unapproved when History is malformed or unavailable. Supplemental
reads never adopt foreign scope; failed reads never imply empty History.

## Exact checks

`pnpm test --` with the affected rebuild/website recovery, transport,
entry, domain, cutover, permission and independent-peer tests; `pnpm typecheck`;
`pnpm check:boundaries`; `pnpm check:ontology`; `git diff --check`.
No SQL/custom-client contract changes are planned; add those checks if scope
changes. Browser: Croki preview over disposable fictional local fixtures,
desktop/mobile, intake/loading/empty/error/read-only, keyboard and focus recovery.
Local evidence proves neither Auth/provider operation nor production delivery.

Canonical model/state remain with the integration owner. Final handoff here will
include proposed evidence deltas, proof failures/skips, runtime additions/deletions,
remaining questions and the exact integration action.

## Completion handoff

Implemented on `arch/website-settlement-depth-20261009`. Public props and
workspace/work session keys are unchanged. `website-attempt.ts` owns synchronous
admission, captured command copies, mounted lifetime, permission epochs and
accepted/refused/unknown settlement for all four local flows. Transport and
receipt semantics stay with their owning flow: domain reconciliation remains
GET; creation/cutover checks replay only their captured idempotent POST.

Native creation now retains the whole submitted request and validates the real
HTTP acknowledgement against its workspace, request ID and submitted fields
(including the owning service's URL canonicalization). Immediate/deferred
service-backed commit-then-lost-ack tests retain one work row and the same body.
Initial route401 permits a fresh ID; later refusal and permission loss/regain do
not. Scope reset, double-click and focus/outside-focus tests remain intact.
Standalone current records now use the same monotonic identity guard even when
no minimum revision was supplied; pending/unknown writes cannot adopt poll reads.

Accepted mutations return their owning acknowledgement without supplemental
requests. The correction and invalidated approval stay usable while History or
domain status is unavailable. Explicit saved-state GET reads validate History's
workspace/work envelope and both supplemental shapes; their failure cannot replay
or relock an accepted mutation. Missing/foreign/stale owning acknowledgements
remain unknown. A domain mutation also requires an actual domain field before
settlement, and clears only its domain-unavailable projection when accepted.

### Evidence

- Initial regression: [five failures, one pass](02-website-initial-regression.txt),
  on base runtime before source edits. The committed lost-ack test observed one
  saved row with editable intake; accepted correction was hidden by History failure.
- Final targeted run: [319 tests, 27 files, no skips](02-website-final-tests.txt).
  Exact command: `pnpm exec vitest run $(cat docs/architecture/deepening-2026-10-09/02-website-test-files.txt)`;
  the [file list](02-website-test-files.txt) retains all27 affected suites.
- `pnpm typecheck`, `pnpm check:boundaries`, `pnpm check:ontology`, targeted ESLint
  across all changed runtime/tests, and `git diff --check` passed locally.
- Croki preview: desktop1280/1600, tablet768, mobile360 and reflow320. Empty,
  loading, read-only, native intake uncertainty and accepted correction with
  malformed History were inspected. At360/320, document width equalled viewport;
  mobile intake/check controls measured44px minimum. Keyboard Tab/Shift+Tab
  returned to the exact request check with a2px focus outline. Correction recovery
  returned to Edit fact; explicit History reload kept one mutation, two saved-state
  reads, corrected text and enabled editing, with no unknown-write lock.
- Browser transport used fictional records and a page-local fetch replacement
  on the existing routing fixture. No repository env files were present; the dev
  server used an empty inherited environment with only local preview settings.
  The preview iframe's unqualified endpoint remained unavailable: its error was
  visible and was not counted as successful preview/Auth/provider delivery.
- Retained screenshots are in Croki browser artifacts:
  `browser-screenshot-localhost-mv1fjr2l-d594df08.png` (desktop uncertainty),
  `browser-screenshot-localhost-mv1fkmah-dccfa0fb.png` (mobile uncertainty),
  `browser-screenshot-localhost-mv1fl8d8-28d9fd7b.png` (corrected mobile fact),
  `browser-screenshot-localhost-mv1fljtm-acc2f051.png` (desktop unavailable History),
  `browser-screenshot-localhost-mv1fnts7-7b88af5f.png` (mobile read-only),
  `browser-screenshot-localhost-mv1fntzi-2f1449e3.png` (mobile loading), and
  `browser-screenshot-localhost-mv1foqqi-17fd8cf2.png` (mobile empty).

Runtime source: **+179 / -142, net +37 lines**, separately from tests/docs.
Distributed lifecycle code shrank; the retained-command owner, creation recovery
and supplemental validation add the remaining source. No guard was deleted for
line count. The relevant inventory entry is the only shared documentation overlap.
Next's temporary local distDir additions to `tsconfig.json` were removed, and
only this stream's local server was stopped.

### Limits and integration

SQL, full suite/build, custom-client compatibility and authenticated/provider
browser proof were not run: this patch changes no API, database, migration,
server permission or storefront contract. Existing required SQL/security proofs
remain untouched. These319 tests and fictional rendering are local behavior
proof, never production, hosted delivery or commercial acceptance.

No new business noun, authority grant, price or selected product bet changes.
Proposed canonical evidence delta: website request recovery now retains exact
native submitted bodies, and accepted mutation visibility is independent of
History/domain availability. Keep it prepared until combined release review;
canonical model and both vaults remain for the integration owner to reconcile.

Combined review must verify opened-work composition retains the same
workspace/work-keyed owner through role changes, preserves optional unavailable
fields when adopting records, and does not interpret them as an unknown write.
History fixtures must carry their existing workspace/work envelope; missing
identity is unavailable rather than confirmed empty. Domain responses currently
have no identity envelope: their scoped route is the existing authority contract.
The local attempt survives same-mounted-scope changes, not a browser reload or
closing the page; a durable cross-browser attempt journal is outside this stream.

Exact next action: review the draft PR against `reborn-1.0`, integrate this branch
with opened-work composition in the coordinator's isolated union, rerun the
same319-test group plus combined type/boundary/ontology and relevant release
proofs, and reconcile the proposed evidence delta. No main merge or rollout is
part of this handoff. Branch, final commit and draft URL are supplied in the
queued coordinator completion message and PR metadata.
