# Inquiries wave 6 — local verification, October 7

Branch `w6/inquiries`, recovered after the unverified round 5 checkpoint `8a31dd88`. This is the current evidence map for the
[September acceptance](./inquiry-first-acceptance-2026-09-11.md), as amended by
[the October delta](./inquiry-1.0-delta-2026-10-06.md). Historical partial/pending
rows remain historical; the tables here identify the implemented contract and
its executable proof. Rollout switches, migrations and exact next actions are in
[the stream handoff](../../product/streams/w6-inquiries.md).

Every proof below is local. The user supplied the production fact that 0.2.1
is live, dual-writes all leads to `tenant_leads`, and 43 leads were backfilled.
This stream did not read production or use a real provider.

## Final aggregate verification

Recovery on October 7 ran the accumulated source from all 23 stream commits,
including every WIP checkpoint. These are fresh results, not the previous
thread's claims. Raw logs remain local under `.scratch/w6-inquiries/recovery-*`.

- `pnpm typecheck`: passed after supplying `secondary: null` in the Running test fixture.
- `pnpm lint`, `pnpm check:boundaries`, `pnpm check:ontology`: passed.
- Initial `pnpm test -- inquiry`: actually ran the full suite: **710 files / 6,423 tests passed; 1 file / 37 tests skipped**. Vitest ignored selection after `--`; the focused commands below use `pnpm exec vitest run`.
- `STRELVA_LOCAL_TEST_WORKERS=2 STRELVA_LOCAL_TEST_TIMEOUT_MS=30000 pnpm exec vitest run inquiry`: **67 files / 491 tests passed; 13 skipped**.
- `pnpm exec vitest run` with the changed agency-home, connect-js, deprovision-atomic, event-actions, lead-read-source, needs-you-evaluator, needs-you-service, production-readiness-snapshot and workspace-ports suites: **9 files / 255 tests passed**.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade`: passed, applying all **19** stream migrations in historical order and preserving the historical fixture.
- `STRELVA_LOCAL_TEST_WORKERS=2 STRELVA_LOCAL_TEST_TIMEOUT_MS=30000 PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`: **passed (exit 0)**, including all 19 forward contracts, engine/owner and workspace authority races, real Make real/booking-store tests, and all 19 independent/reverse-order rollback cases with exact retained rows.
- `bash scripts/check-inquiry-rollbacks.sh` against the isolated upgrade and aggregate clusters: all **19** rollback files passed independently and as a reverse-order batch. Exact before/after rows match for inquiry records, events, claims, notice receipts, business facts/proposals and signed booking offers. The workspace SQL command now includes this rehearsal.
- `STRELVA_UI_PREVIEW=1 EMAIL_SENDING_ENABLED=0 CUSTOMER_EMAIL_ENABLED=0 PLAYWRIGHT_PORT=3216 pnpm exec playwright test` with the six inquiry system/inbox/library/member/running/delivery-surface fixture specs: **30 passed**, desktop/mobile and failure/permission states. Screenshots remain in ignored `output/`. Browser fixture proof is separate from authenticated live journeys.
- `pnpm check:custom-repos`: **196/196 passed** in development mode; this does not prove pinned release checkouts.
- `NODE_ENV=production EMAIL_SENDING_ENABLED=0 CUSTOMER_EMAIL_ENABLED=0 pnpm build`: passed.
- `git diff --check`: passed.

Recovery preserved these failures: typecheck found the missing fixture field;
the first workspace SQL run timed out after 5 seconds in the booking one-store
suite (28 other tests passed); another full test run and dev-cache persistence
hit `ENOSPC`. The interrupted duplicate full run is not proof. Ignored caches
left by the stopped stream were cleared; affected runs use the already-supported
30-second local test timeout. The 30 browser tests passed even though dev-cache
persistence logged `ENOSPC`; no live provider was used. The rollback rehearsal
first detected deletion of `inquiry_engine_reply_claims`; fixture retention also
exposed reused fictional keys/emails/lead IDs, now isolated per retained fixture. Five
rollback files now revoke entry points while retaining claims, provider receipts,
proposals and offers. The decision-notice claim rollback no longer drops the
parent of the retained provider-event foreign key.

## Operator gates awaiting #251 — reported, unchanged

The audit's **five SQL `super_admins` checks** are all present:

1. `20261010123000_inquiry_context_notices.sql:43`, `authorize_inquiry_owner_notice_repair`: verified, unrevoked super-admin authorizes bounded managed-site owner-notice repair; no tenant membership check at this seam.
2. `20261010124000_connected_inquiry_records.sql:207`, `decide_held_workspace_lead`: current workspace owner or an unrevoked super-admin may decide held spam after verified-email identity and exact record/workspace binding. The operator branch does not require workspace membership.
3. `20261010125930_inquiry_business_facts.sql:103`, `correct_inquiry_business_fact`: after canonical business-record actor validation, an unrevoked super-admin is labelled operator and may correct facts; otherwise owner authority is required.
4. `20261010125935_inquiry_operator_authority.sql:8`, `authorize_inquiry_operator_actor`: verified user, matching super-admin email and **any tenant membership**. **It omits `revoked_at IS NULL`.** A local transactional probe set `revoked_at` on the fictional operator and the RPC still returned `true` (log: `recovery-operator-gate-audit.log`). Existing SQL tests delete the row rather than mark it revoked. This is a concrete unresolved authority finding for #251; it was not fixed under this task's report-only instruction.
5. `20261010125950_inquiry_operator_review.sql:8`, `inquiry_assert_operator`: verified email and unrevoked super-admin, with no business membership; protects global held/notice lists, spam decisions and corrected-recipient repair claims. Workers reverify that operator for repair.

New application gates using `isSuperAdmin()` also protect:
`src/app/admin/client-leads/inquiries/page.tsx:11`,
`src/app/api/admin/client-leads/held/route.ts:14`,
`src/app/api/admin/client-leads/owner-notice/route.ts:16`, and
`src/app/api/admin/client-leads/connected-owner-notice/route.ts:13`.
The held route and its permission view explicitly say “Strelva operators.”
Ordinary-message review calls the SQL operator actor seam through
`src/products/inquiries/message-review-authority.ts` and requires supervised,
noncommitment, sponsor-bound review. These capabilities currently privilege
Strelva operators; no provider-agency replacement was made. Existing queue
operator-only action and workspace viewer gates were inspected and unchanged.

**Merge condition:** #251 must classify each as a provider-agency check or an
explicit platform-operator power, and address the revocation finding. Local green
checks do not settle that authority review or authorize production.

## September acceptance, amended by October delta

| ID | Current requirement / disposition | Code and executable evidence |
| --- | --- | --- |
| IF-01 | Old sidebar superseded by C2. Business changes still clear draft/selection/approval. | `experience/app-frame/{AppFrame,StrelvaSidebar}.tsx`, `experience/ask/AskStrelva.tsx`, `places/WorkspaceInquirySystem.tsx`; `workspace-places`, `owner-entry-homes-routes`, `tests/inquiry-system-ui-preview.spec.ts` switch loading/error/permission cases. |
| IF-02 | Old fixed empty sections/order superseded by C3. Current Home remains quiet evidence lists. | `experience/workspace/BusinessHome.tsx`, `NeedsYouSection.tsx`, platform owner-entry homes; `business-home`, `needs-you-home`, `owner-entry-homes-ui` tests. |
| IF-03 | Owner Shape/Go superseded by C4 requests and exact owner decisions. Fixed draft/preview remains operator machinery. | `platform/ask`, `platform/service-requests`, `needs-you/sources/work-plan.ts`, inquiry `server.ts`, `inquiry-engine-operations.ts`; `inquiry-engine`, `inquiry-surface-actions`, `inquiry-preview-journey`, `inquiry-publication-queue`. Legacy builder now redirects current customers. |
| IF-04 | Editable fixed preview/structured receipt kept underneath C4/C5. | `inquiry-engine.ts`, `inquiry-engine-operations.ts`, `experience/inquiries` editable preview; `inquiry-engine` grouped edits/rules, `inquiry-preview-journey`, `inquiry-surface-actions`. Owner confirmation now exact current release facts. |
| IF-05 | Durable rules, immutable published definitions, fixed components. | inquiry `contracts.ts`, `repository.ts`, engine; `inquiry-repository`, `inquiry-engine`, publication suites; `tests/inquiry-workspace-schema.sql`, publication claims schema fixture. Services are at-use projection; saved release remains unchanged. |
| IF-06 | Full Inspector remains signed/operator; customer sees bounded receipts. | `delivery-surface.ts`, `record-projection.ts`, Inspector/record views, workspace inbox; `inquiry-delivery-surface`, engine selected-version Inspector, `inquiry-inbox`, `inquiry-message-review-outcome-ui`. |
| IF-07 | Exact bulk targets, per-target authority, partial results. | `inquiry-engine-pattern.ts`, `inquiry-pattern-server.ts`, `inquiry-surface-actions`; `inquiry-engine` grouped/stale reassignment, `inquiry-pattern-install`, `inquiry-pattern-updates`, `inquiry-surface-actions`. |
| IF-08 | Saved isolated rerunnable exact-release test run, eight named checks. | `inquiry-engine-operations.ts` rehearsal adapters; `inquiry-engine` eight checks/stale publication/optional steps, `inquiry-preview-journey`; SQL snapshot reload. Eight checks are not evidence of eight distinct synthetic inquiries. |
| IF-09 | Owner-only exact passing release, durable acceptance and receipt. | `publication.ts`, `server.ts` queue, generic `lib/event-actions.ts`; publication/current actor RPC125935. `inquiry-publication`, `inquiry-publication-authority`, `inquiry-publication-queue`, `event-actions`, `inquiry-publication-event-routes`; operator denied before claim and final publisher checks independently. |
| IF-10 | Undo changes configuration, retains new inquiries. | engine undo, `publication.ts`; `inquiry-engine` publish/receive/undo, `inquiry-publication` durable undo/reload, queue undo confirmation new release; record append-only SQL. |
| IF-11 | Evidence-bound Why and missing-cause honesty, owner bounce bounded operator fix. | engine Why, `delivery-surface.ts`, `platform/operator-queue/inquiry-owner-notices.ts`, connected owner repair; engine causal/missing-link and delivery-surface tests, operator inquiry review/repair suites. |
| IF-12 | Current policy gates/trust/hours/budget/pause; C6 source integrated. | engine responsibility, `delivery.ts`, `inquiry-policy-at-use.ts`, approval service and follow-up cron. `inquiry-engine`, `inquiry-delivery`, `inquiry-currentness`, `needs-you-evaluator`, `inquiry-policy-at-use`, actual operator-review executor tests, SQL125935. Promotion rejects nonsponsor and records old/new routes. |
| IF-13 | Consent/scopes/health/disconnect/secrets retained for relevant typed Connections. | inquiry connections/email-consent, platform systems; `inquiry-connections`, `inquiry-email-consent`, `inquiry-surface-actions`, systems invariants. Google/calendar/Stripe/MLS removed from inquiry customer context by C13. |
| IF-14 | Old local onboarding answers superseded by C10 shared current business record plus sourced owner-decided suggestions. | `business-context.ts`, `business-facts.ts`, infra fact proposals + Needs you source, migration125930. Business-context/facts/onboarding suites + actual fact SQL pending/approve/noaccount/currentness/direct correction fixtures. |
| IF-15 | Partner agency Attention superseded by C12 Strelva operator Queue; partners deferred. | operator queue authorization/projection, agency queue view; `operator-queue-projection`, inquiry operator review/routes, existing portfolio granted/denied tests. |
| IF-16 | Shape-only lineage copying/adaptation/fresh tests kept; customer names Versions/Library. | inquiry pattern engine/store/update; `inquiry-pattern-install`, `inquiry-pattern-updates`, portfolio scopes; `portfolio.ts` calls `patternInstallationAsVersion` at runtime; `agency-server.ts` filters existing Versions to current agency sources, `AgencyLibraryView.tsx` displays them in the actual Library tab. Portfolio/server/current-tab/browser proofs plus existing adaptation/update tests. |
| IF-17 | Buyer/seller/quote remain one engine; booking request goes to one bookings store under C14. | contracts/engine variants; new `booking-handoff.ts`, signed booking routes and migration125940 reuse platform bookings. Engine/storefront tests; handoff/routes/receipt and actual booking SQL fixtures. |
| IF-18 | All paths trusted routing or current membership/assignment before service role. | `platform/infra/auth`, workspace HTTP, linked-sites, product current scope readers, SQL member/operator/owner checks. Inquiry business-page/workspace-route/held-route/system-detail-route/booking routes, portfolio/surface/record/sql authority suites. |
| IF-19 | Stale order/version/duplicate command/actor rejection. | engine, CAS repository, immutable publication claims, current actor checks, durable email/message-purpose claims. Engine/currentness/repository/publication/delivery tests; SQL publication, urgent claim, member reply, operator authority, inbox fixtures. |
| IF-20 | Inquiry evidence survives edits/Undo/pause/send failure/exit. | `tenant_leads`, `inquiry_events`, overlays, message receipts; engine/publication/records/workspace-exit/inbox/reply/outcome suites; record/inbox SQL immutability/retention fixtures. |
| IF-21 | Provider acceptance closes send before verification; no duplicate retry. | `delivery.ts`, approval-service, workspace replies, message-purpose store; delivery/approval/reconciliation/store-contract tests, workspace replies races and accepted-unverified tests; durable purpose SQL. |
| IF-22 | Suppressed/accepted/delivered/deferred/bounced/failed based only on supporting evidence. | message-outcome/receipt, webhook reconciliation, owner notices and decision provider events. Outcome/reporting/proof, resend webhook signatures, decision provider event, delivery/outcome UI suites; notice-events SQL. |
| IF-23 | Follow-up rechecks current reply/policy/release/exit/budget/hours/recipient/provider before sending. | follow-up cron + delivery + business context + policy-at-use; follow-up cron/sweep/currentness/delivery/business-context/policy-at-use failure tests. Current owner stricter policy and commitment content block autonomous send. |
| IF-24 | Append-only structured actor-bound redacted evidence. | contracts, repository safeProviderReceipt, inquiry_events/message receipts, canonical business history. Repository/engine/record/delivery store/webhook suites; SQL grants/immutability tests. |
| IF-25 | Test run has no live adapters/arbitrary network authority. | fixed rehearsal adapter boundary in engine operations; eight-check engine tests, isolated preview journey, transport denial tests. No provider used by this thread. |
| IF-26 | Fixed schemas validate boundaries. | inquiry contracts/engine ops/receive/storefront; engine/storefront/public-submit/receive/repository/surface-action malformed/stale tests. |
| IF-27 | Additive v1/body/HMAC/frozen Redis/env compatibility retained. | legacy `lib/leads.ts` switch and additive public inquiry projection/booking reply, custom starter; public-submit/storefront/contracts/read-source/connect.js suites; parent final custom compatibility gate. No client repo touched. |
| IF-28 | Local proof never production authorization. | All new env/release/email gates off by default; prepared migrations+rollbacks. Parent full report must separate local proofs and supplied live0.2.1/backfill43 facts from unperformed deploy/flips/live sends. |

## Delta additions

| Delta | Code/evidence / current disposition |
| --- | --- |
| C1 | `system-detail.ts` + `/api/workspace/inquiries/system` + `InquirySystemDetails`: accepted form→records→Connections/History, lifecycle from invariant, health separately unknown/unverified/bouncing. Trusted managed sites project accepted forms; authorized connected sources and native website Systems are now named with explicit current-form/History unavailable, without invented live form status. System-detail/route tests and desktop/mobile external-form browser proofs. |
| C2 | Current places/business menu/Ask; workspace switch discards previous records and draft immediately; old customer builder now gated redirect via trusted owner-entry/canonical System. Current member/operator/flag-off/denied route tests plus switch browser fixture. |
| C3 | Current Home names actual Systems and receipt-backed activity; empty Needs you hidden. Business-home/needs-you-home/owner-entry tests. |
| C4 | Ask files Requests; scope decisions remain owner-only; publication/change immutable claim maps go_live/change_live, always owner_decides, adminMayDecide false. Current customers redirected away from builder; old links can't authorize changed release. |
| C5 | Signed GET confirm/POST decision pipeline; publication detail now exact release/business/site/form/routing/follow-up/sender; original owner claim or current accepted exact signed decision required at dispatcher and final executor. Not yet matches declined decision, no publication. Direct and signed authority SQL125935; HTTP/governed/product tests. |
| C6 | Supervised ordinary reply maps Strelva review; trusted allow maps handle only from current canonical policy; generic settings cannot lower floor. Commitments owner-only. Current owner stricter business/System settings read before automatic send/review. Current Strelva operator approval checked with verified role/current memberships and exact ordinary event. Promotion sponsor/route receipt; 24h review clock unchanged. |
| C7 | Shared current owner recipient/fallback for lead notices, urgent exact-item decisions; notice+draft one email if draft exists at notice time. Durable urgent claim and inbox receipt repair prevent duplicates; all new facts/publication/reply notices obey strict flags/global/customer/pertenant gates. Parent/audit suites and urgent/notice SQL fixtures. |
| C8 | Existing lead read source switch, seven complete parity days, full id/submission/value mismatch checks and expiry exclusions; postgres authority first with Redis pending fallback; held spam/events durable; deprovision refuses delete with kept leads. Parent cutover/read/retention/SQL proof. Actual seven production days and flips remain rollout steps, not missing code. |
| C9 | Capture/release upserts shared contact via durable after-capture function; booking handoff reuses same contact row. Records/contact/booking SQL fixtures. |
| C10 | Current owner/people/hours/services read at use; removed person goes owner. Verified active services project quote choices without price promises; engine receive uses current choices but stores original immutable definition. Scan proposes supported sourced name/website facts only; owner exact decision saves canonical fact, stale refused. Explicit correction canonical verified receipt and preserves other links. Migration125930/facts+context+receive tests/actualSQL. |
| C11 | Owner decisions use signed links without account; operator Why/Inspector unchanged; bounded Owner not told queue+notice repair, accepted message never resent. SQL and signed executor/notice/provider event tests. |
| C12 | Generic agency Queue/Library present; pattern shape/authority isolation preserved. The current agency Library runtime now reads existing installation lineage through `patternInstallationAsVersion` via portfolio discovery, filtered to current agency source links and current target tenant memberships. Pinned source revision and current client release are displayed separately; no second lineage store. Server/global/per-agency-off/current-tab/desktop+mobile fixture proofs passed. |
| C13 | Contextual appears-in site, reads Business details, acts-on email; shares-with added only for actual visible booking Systems. No invented calendar/Google/Stripe/MLS. Scope/secrets tests and system-detail conditional booking test. |
| C14 | Real signed inquiry→booking offers for managed and standalone/connected inputs, up to3 real times, exact service, current availability/calendarbusy, one request store, shared contact, safe retries/conflicts/expiry. Owner can select times then approve exact reply; booking failure leaves inquiry and draft. Booking handoff unit/SQL/browser fixture evidence owned parent/booking agent. |
| C15 | Per-workspace/per-tenant release resolver preserves global legacy mode. New route reads/commands/facts/booking/owner-entry redirect behind switches and current scopes. Release/source/new route gate suites. |
| C16 | New owner System/records/replies/confirmation use plain words; Strelva only automation actor. Legacy builder customer escape now redirects under current release. Internal operator terms may remain. Tests inspect customer HTML and exact event confirmation; eight checks must not be advertised as eight distinct inquiry submissions. |

## Failure history retained

Earlier checkpoints and incomplete runs are preserved in the commit history and
local `.scratch/w6-inquiries/` logs. They are not counted as passing proof:

- SQL initially rejected an invalid fixture submission hash, then a timestamp
  without UTC, then an invalid lead-id prefix. The inbox fixture now proves
  equal-time and microsecond pagination with valid inputs.
- SQL authority-race checks missed a short hold point on the shared host. The
  hold window increased from 0.6 to 2 seconds; revocation/denial assertions and
  lock timeouts remain unchanged. The full race gate then passed.
- Full-schema SQL found fixture email/id collisions after a committed reply-race
  seed. Inquiry export/member fixtures now have distinct identities; full SQL
  and the historical upgrade passed against the actual functions.
- A runner hit `ENOSPC`, causing typecheck/test import failures. Fresh complete
  runs supersede it; no test or coverage threshold was lowered.
- Full Vitest then exposed a flags-off eager booking-release mock import; release
  lookup is now lazy and that suite passed. New mock signatures were also fixed.
- Boundary and 1,000-line gates caught new imports and oversized delivery files.
  Shared entry points, trusted lookup and small authority/formatting modules
  fixed them without widening either baseline.
- The first production build used a nonstandard inherited `NODE_ENV` and failed
  during prerendering. A normal `NODE_ENV=production` run is recorded separately.
- Early browser assertions used the wrong field label, did not wait for a pending
  transition, or included Next’s global announcer. Tests now inspect the actual
  scoped surface. A real 127.0.0.1→localhost redirect violated the booking form
  CSP; the redirect now preserves the request origin and passed rendered proof.

`STRELVA_LOCAL_TEST_WORKERS=2` and `STRELVA_LOCAL_TEST_TIMEOUT_MS=30000`
limit runner capacity on the shared host. They do not change product budgets,
reply deadlines, expiry clocks, email defaults or evidence requirements.

## Rendered evidence and its limit

Real components ran through isolated development-only fixtures with all email
gates off. Desktop/mobile inspection covers the live form, records, Connections,
History, reply composer, member/unassigned permission, loading, errors, empty
records, stale/uncertain send receipt, booking availability/selection/expiry,
provider bounce and missing timeline, Library lineage and external form unknowns.
The operator held/notice-repair fixture separately covers ready, empty, loading,
error, permission and keyboard focus. Scopes and transports are tested separately
through real route/service functions and actual PostgreSQL; fixture browser proof
is not an authenticated production/provider journey.

Screenshots remain local in ignored `output/`: `w6-inquiry-system-{desktop,mobile}`,
`w6-inquiry-booking-*-mobile`, `w6-inquiry-library-{1280,390}` and
`w6-inquiry-external-{1280,390}`. Operator screenshots and browser measurements
are retained in local `.scratch/w6-inquiries/operator-proof/`. Current fixtures
and Playwright journeys are committed and can reproduce them.

Eight saved engine checks prove the named test run. They do not prove eight
different customer inquiries or a real provider delivery. Outcome reply times
measure first provider acceptance; delivery and customer response stay separate.

## Remaining rollout proof

No missing inquiry runtime code is accepted by inference from a passing test
count. The final map above is claim-specific; the remaining requirements are:

- separately authorized migrations, integration/deploy and scoped release;
- seven consecutive complete **production** parity days, plus actual oldest
  retained lead/count checks before read and authority flips;
- production recipient/consent and signed provider webhook setup, a silent
  rollout first, then an explicitly authorized owner email/no-account journey;
- actual delivery and whether owners use these decisions, measured after rollout.

Connected sites own their external forms. Their accepted current definition and
change History are unavailable to Strelva unless supplied; the UI states that
limit and does not reconstruct a live form from past captured fields. Publication
requires migration125935 even when legacy inquiries are enabled and new notices
are off. A missing authority RPC closes the action; it does not restore the old
unchecked publisher.
