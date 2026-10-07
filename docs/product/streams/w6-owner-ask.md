# Wave 6 owner entry and Ask Strelva

Branch: `w6/owner-ask`. Base: `integrate/reborn-1.0` at `7b7b4d3f`.
Worktree: `REB-w6-owner-ask`. Round 5 resumed October 7, 2026.
Local only. No production call, migration, env change, provider write, client
notification, dependency addition, push, PR or merge occurred. All release
flags remain off. Settings stays on `/dashboard`.

## Launch requirements and what changed

| Requirement | Implementation and local evidence |
| --- | --- |
| Every old dashboard destination keeps its meaning | All 25 page files have dispositions: 24 ready and Settings retained. Finished Content, Sources, Health, Ownership, Members and Store. Workspace site tabs reuse the current panels and tenant routing. Owner-entry route/home/UI tests cover exact destinations and permission failures. |
| Reversible, per-business owner entry | Linked workspace membership and destination gates precede each 307 redirect. Off/unset preserves dashboard entry; `?legacy=1` remains operator-only. Return-target and route tests cover System links, trusted tenant paths and rollback. |
| Operator invitation and atomic acceptance | Separately gated panel/API prepares, emails or revokes an operator-issued invitation. Verified magic-link entry can claim an existing pending invitation, including for a member/admin; the existing SQL acceptance transaction grants both memberships. No new owner-recipient rule and no synthesized membership. Invitation sends remain deferred. |
| Owner emails reach the moved destination | Reports, Google/Yelp review alerts, health alerts, lead notices, lifecycle mail and billing returns use an optional URL adapter. Recipient selection remains agency-operator's rule. Off/unset: zero new workspace-port lookup and the old URL, send, cursor and dedup behavior. |
| Owners can decide without an account | Routine Needs you sources use exact item/revision/recipient service sessions. Website fact/copy/preview/launch decisions have narrow signed authority. Read-only signed website review renders complete copy and navigable pages, with visitor actions disabled. Access, money and exit still require sign-in. Make real retains its separate owner-link gate. |
| Ask checks authority every time | Every tool rereads membership, System/link, current tenant slug/status and relevant grant. Inactive/deprovisioned tenants, renamed links and changed roles refuse work. Subscribers use the fresh role. Credentials in the current or stored conversation are refused before persistence/model context. |
| Ask drafts reach Needs you | Typed revision-pinned business-fact drafts use durable SQL and the real source adapter. Inquiry replies retain exact authored copy through existing approval, delivery receipt and read-back. Owner-recipient changes are excluded. Failed sync keeps the saved draft and pending state; accepted effects with failed receipts are reported as outcome unknown, without a retry form. Chat never approves, publishes or sends. |
| Requests, receipts, saved conversations and operator origin | Managed work remains a Request by default. Unsupported asks preserve the person's original words, System and email/phone origin at Asked; scope/deadline are not accepted. Receipt cards name each saved/queued/opened result and its ids. History, refusals, cost logging and failure states are tested. |
| Working page-set Possibilities | Closed-catalog informational pages are real native v2 documents in durable Work, with pinned revision/hash and owner-reviewed copy. Signed Try renders the document and confines navigation. Reviewed candidates become Ready; Make real preserves their native Work identity. No empty summary masquerades as a working website. |
| Working booking Possibilities, bounded by actual Connections | An unchanged published native website with a stored System baseline can get one new booking page using its own published inquiry/booking grants, configured schedule and connected calendar. Signed Try exercises the shared form with local callbacks, discards visitor inputs and creates no reservation. Fresh authority/revision/grant/calendar checks precede publication. Missing, ambiguous, foreign or revoked bindings remain Requests. |
| Cost visibility | The existing model-call path records tokens and measured/estimated/unknown cost. Optional daily business-cost warnings only log to the operator. No pricing, quota, billing or email behavior was added. |

The broad Mooney example is **not fully implemented**: a newly introduced
service or a new site's booking/inquiry setup still needs operator preparation.
The booking effect publishes a scheduling grant tied to a real scheduling Work;
the inquiry effect consumes an already prepared tenant-specific request/change.
Ask has no contract to create/adapt that inquiry configuration after reserving
a new tenant, or to determine a new service's duration and availability.
Borrowing an existing tenant's grant would break isolation. This is a remaining
code/contract gap, not a production-only blocker. Current safe behavior is an
Asked Request, as the spec requires for unavailable tools. Do not label the
whole original Ask requirement A until this cross-product contract is supplied
and tested. The existing-service alternative is implemented locally.

## Verification — final snapshot

Final runtime commits: `966a9434` and `e6545c33`; documentation follows.
All required checks completed successfully on this final runtime snapshot. Logs are local `.scratch-w6-r5-*` files.
No failed test was disabled or assertion weakened.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck` | Passed (exit 0): route types generated and `tsc --noEmit`. |
| `pnpm lint` | Passed (exit 0): `eslint .`; only the existing large database-types Babel note. |
| `pnpm check:boundaries` | Passed; shrink-only baseline remains 204 workspace→lib imports in 93 files and 46 older boundary imports. |
| `pnpm test --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000` | **699 files passed, 1 skipped; 6,589 tests passed, 37 skipped; 137.97s. Exit 0.** Existing skips unchanged. |
| `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql` | Workspace SQL checks passed on isolated PostgreSQL (62244); Customer mapping SQL passed (62132); Inquiry SQL passed (64242). Includes owner invitation claim, owner decision link races and signed read-only website preview. All clusters were local and stopped. |
| `pnpm check:custom-repos` | Custom repo workspace check passed: **196/196 checks passed** after the shared booking-form change. |
| `NODE_ENV=production pnpm build` | Passed (exit 0): compiled in 11.6s, TypeScript 17.4s, 235/235 static pages generated; full route output in `.scratch-w6-r5-final-build.log`. |
| `STRELVA_UI_PREVIEW=1 PLAYWRIGHT_BASE_URL=http://localhost:3196 pnpm exec playwright test tests/w6-owner-ask-ui.spec.ts` | **14 passed (14.9s)** at 1280px and 390px: Ask draft/loading/error/unsaved/read-only/off; invitation prepare/revoke/suppression/error/permission; complete signed review; page-set keyboard navigation; booking test with zero write requests, cleared inputs and confined navigation. |

Native collaborative browser also inspected the actual local renderers on
desktop/mobile and completed a fictional booking. Evidence screenshots:
`browser-screenshot-localhost-muy9ot9v-2e0684e3.png` (mobile page navigation),
`browser-screenshot-localhost-muya9sg8-5b56d543.png` (desktop booking form), and
`browser-screenshot-localhost-muya9yhz-3b7d9648.png` (mobile test receipt), in
`~/.t3/dev/browser-artifacts/`. These are interface fixtures, not authenticated
Supabase or provider proof. The local server on 3196 was stopped after checks.

Final focused evidence before the full run: 537 tests across 6 files passed
(3.08s); calendar publication/resolver checks 20/20 passed (1.23s); legacy
approval, signed review and conversation credential checks 75/75 passed (1.78s).
The 18 changed-cron/off checks cover both unset and `0`, existing email pauses,
suppressed sends and failed provider reads, plus an enabled-spy sensitivity
check. Existing capability resolution performs no added calendar lookup when
Ask is off; persisted Ask candidates still check their own Connection before
publication after Ask is switched off.

### Failures preserved and repaired

- Initial full unit run: 694 files and 6,372 tests passed; 37 skipped.
- A concurrent build/unit run had 696 files and 6,570 tests pass, 3 cold-import
  approval/signup failures, 37 skipped. A subsequent one-worker attempt still
  hit the default five-second cold-import budget and was stopped. Logs:
  `.scratch-w6-r5-concurrent-test-failure.log` and
  `.scratch-w6-r5-single-worker-timeouts.log`. The final command gives tests
  and hooks 30 seconds, with one worker; it changes no source assertion.
- Legacy approval routes eagerly imported workspace/provider/render code.
  They now import that runtime only for a workspace decision. Tests throw if
  a legacy tenant approval imports it; the focused checks pass.
- Disk reached 100% (~50 MiB free). An attempted full run failed imports with
  ENOSPC/Node crashes before useful results. Preserved in
  `.scratch-w6-r5-disk-full-test.log`. Removed only this worktree's disposable
  `.next-w6-r5` and `.next` outputs after stopping its server, then reran.
- Real PostgreSQL found SQL CASE parentheses and an ambiguous recipient alias;
  both repaired and full isolated SQL passed. Lint found JSX inside a try/catch;
  corrected. Product boundaries found preview deep imports; repaired via
  product entries and app composition without increasing the baseline.
- First build inherited nonstandard NODE_ENV and failed prerendering. Explicit
  `NODE_ENV=production` passed; final build uses the same environment.
- Two new booking browser tests initially matched duplicate headings; locators
  now distinguish the page heading. All 14 pass. Failure preserved in
  `.scratch-w6-r5-booking-ui-locators.log`.

## Flags and defaults

| Flag | Default and scope |
| --- | --- |
| `STRELVA_OWNER_ENTRY` | Unset/0 off; existing 0/workspace/1 release layering. Requires workspace and destination gates; no redirects or URL-port reads when off. |
| `STRELVA_OWNER_INVITATIONS_RELEASE` | 0; operator panel/endpoint only when 1 and owner entry possible. No automatic invitation/send. |
| `STRELVA_OWNER_INVITATION_CLAIM` | 0; 1 permits only verified entry claiming an existing pending invitation. Sends nothing. |
| `STRELVA_OWNER_DECISION_LINKS_RELEASE` | 0; additive 0/workspace/1 flag. Routine account-free decisions and private website review only. Exact recipient/item/revision checked again at execution. |
| `STRELVA_ASK_RELEASE` | Unset/0 off; workspace/Systems prerequisites. Business-fact source performs no read while off and preserves existing pending items. |
| `STRELVA_ASK_COST_ALERT_USD` | Unset disabled; optional positive USD threshold for operator logs only. |

Existing Needs you, Inquiries, website rebuild, Make real live/owner-link and
workspace/Systems gates still apply. These commits change no existing defaults.
`EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED` and per-tenant `reb:client-email`
remain required for client sends. The rollout is silent; owner invites stay off.

## Migrations and rollback

All are additive, in this stream's range, with transaction-local 3-second
lock timeout and no hot-table rewrite. Apply only after explicit authorization.

| Migration | Rollback |
| --- | --- |
| `20261010100000_owner_invitation_claim.sql` | `rollback-w6-owner-invitation-claim.sql`; accepted memberships retained. |
| `20261010102000_owner_decision_links.sql` | `rollback-owner-decision-links.sql`; link sessions/audit history retained. |
| `20261010102100_website_owner_link_launch.sql` | Same combined `rollback-owner-decision-links.sql`, removing narrow reserve/publish entry points. |
| `20261010103000_ask_business_fact_drafts.sql` | `rollback-20261010103000-ask-business-fact-drafts.sql`; export needed draft/audit data before dropping this new store. |
| `20261010104000_owner_decision_website_preview.sql` | `rollback-20261010104000-owner-decision-website-preview.sql`; removes read-only RPC only. |

Disable relevant flags first; apply rollback in reverse dependency order.
Neither forward migration nor rollback was run against production.

## Changed crons and shared-file coordination

Changed crons: `weekly-report`, `monthly-report`, `poll-google-reviews`,
`poll-yelp`, `portfolio-scan`. No new schedule, sender or heartbeat definition.
Only new owner destination selection is a no-op while its flag is off. Existing
client cron work continues; shutting it down would violate flags-off parity.

Agency-operator still owns the recipient rule. Shared deltas are additive:

- `src/lib/workspace-ports.ts`: optional owner destination URL method;
  `src/server/workspace-ports.ts`: loader composes it beside business-record
  service. `src/lib/owner-notice-url.ts` contains no workspace import.
- `src/platform/workspaces/business-ownership.ts`: one pending invitation RPC
  wrapper. No recipient-resolution rule changed.
- `src/platform/release-flags/resolve.ts`: owner-decision-link flag name/label.
- `src/platform/needs-you/{contracts,adapters,repository,service-actor,service,server}.ts`
  and existing source adapters: opt-in exact owner-link authority and typed
  fact-draft source registration. Existing owner/member/Make real routes remain.
- `src/app/api/approve/route.ts`: complete review URL and honest unknown outcome;
  workspace imports deferred on legacy tenant approvals.
- `src/app/api/admin/tenants/[id]/lifecycle-email/route.ts`, `src/lib/{billing,leads}.ts`
  and the five crons: owner URL only; recipient, money, send, cadence and provider
  contracts unchanged when flags are off.
- `src/products/inquiries` delivery/message review: preserve authored reply and
  approval receipts through the existing path, no second sender/store.
- `src/products/websites` document store/rebuild/capability resolver/entries:
  narrow signed owner publication and native candidate preparation. Calendar
  revalidation is opt-in for persisted Ask booking candidates; legacy resolution
  does no new calendar read.
- `src/products/scheduling/{contracts,public-booking,server}.ts`: browser-safe
  public schedule schema extracted with existing exports retained.
- `custom-repo-starter/StrelvaBookingForm.tsx`: optional `testOnly=false` prop;
  existing client behavior remains default. 196/196 compatibility checks pass.
- `src/experience/systems`, workspace contracts and Make real systems adapter:
  native Work identity, durable Possibility state and optional safe signed Try
  link. Existing comparison preview remains unchanged; external href is refused.
- `scripts/check-workspace-sql.sh`: registers new signed-preview SQL checks.
- Component inventory/specs updated here. Prior checkpoint illustration/motion
  work was retained, not expanded in Round 5. The `c3dc3879` readiness repair is
  the earlier integration carry, not a new owner-ask capability.

## Production steps for the coordinator

1. Review the exact integrated SHA and migration order against other streams;
   repeat the combined release checks. Do not inherit this worktree's results
   for a different merged snapshot.
2. After Jacob's authorization, apply the five additive migrations; confirm
   least-privilege RPC grants and recipient rule before activation.
3. Any env change requires a **new production deploy**, not a redeploy. Follow
   [the existing release checklist](../../operations/horizontal-release-checklist-2026-09-11.md#september-21-production-preparation).
   Keep all email and invitation gates off. Inventory client dependencies first.
4. On an isolated Auth/preview stack, prove verified admin-host sign-in,
   magic-link pending claim, destination preservation and per-business 307
   rollback. Those local HTTP/Auth journeys have not been run in this thread.
5. Use a Strelva-owned test business for Ask → draft → Needs you → exact signed
   recipient review/decision → publication/send → read-back → receipt → undo.
   Include late recipient/Connection changes and accepted-write/read-back failure.
   Provider credentials, real delivery, calendar authority and live undo remain
   unproven. Activate only the test business's approved flags, silently.
6. No client invite, provider write, migration, deploy or rollout is authorized
   by this handoff. Owner adoption, model quality/latency and measured delivered
   cost still need observed use; local tests prove none of those.

## Model, vault and factory evidence for integration

Canonical model is main checkout's `PRODUCT_MODEL.md`; this thread does not
edit another worktree or create competing state. Coordinator delta:
`COMP_OWNER_BY_EMAIL` and its link/recipient/email dependencies now have local
SQL/render/failure proof for routine decisions and complete website review.
They remain inactive and not operationally proven. Record the bounded working
page-set/existing-booking capability and the missing new-tenant inquiry contract.
The canonical model records no separate feature/product vaults; reconcile its
strategic/feature records there. No new buyer, offer, pricing or future bet was
activated, and no frontier change is warranted from local implementation alone.

Factory observation: repeated cold imports and disk exhaustion consumed full
verification reruns and human attention. Baseline: eager provider/render imports
plus concurrent heavy checks. Delivered improvement: legacy imports deferred,
asserted isolation, serial full test/build and disposable output cleanup.
Three-month savings = avoided reruns × measured rerun time + avoided manual
recovery; future frequency, founder-time value and maintenance cost are unknown.
Do not invent a financial return. Next test: compare complete runs on the
integrated snapshot with recorded load/free space; retire any heavier factory
proposal if it adds maintenance without reducing failures or attention.

## Exact next action

Coordinator reviews these commits and the new booking/inquiry contract gap,
then incorporates flags/migrations/stop points into the shared release packet
and reconciles the canonical model. Production proof and owner invitations
remain separately authorized work. This stream has no further runtime edit
in progress. All required local checks passed; production and the broader
booking contract remain unproven. The final documentation commit records this
handoff and the honest spec statuses.

## Commit ledger

Final documentation commit follows this runtime ledger.

```text
de25bac0 WIP w6/owner-ask: checkpoint after session interruption (unverified)
f37cc8d9 WIP w6/owner-ask: checkpoint 2 after second interruption (unverified)
a79bce72 WIP w6/owner-ask: checkpoint 3 after third interruption (unverified)
c3dc3879 Preserve readiness counts for missing tables
3127273c Bind account-free fact decisions to their signed writer
c66d59a7 WIP w6/owner-ask: checkpoint 4 after fourth interruption (unverified)
1889e582 Recheck Ask authority and refuse credentials before persistence
7f6cf909 Claim pending owner invitations for existing workspace members
de36db17 Keep Ask draft sources dormant and repair signed decision SQL
d5354556 Verify owner and Ask failure states on desktop and mobile
373be6c4 Let owners review exact website previews through signed email links
9569be6a Register signed preview SQL proof and use website entry points
cf3f2dbb Prepare real isolated Ask website page-set Possibilities
77d50a71 Prepare and try booking pages on authorized native websites
629c3b80 Keep legacy approvals isolated from workspace decision runtime
31a0f6f6 Prove isolated website navigation and booking on desktop and mobile
966a9434 Scope booking calendar revalidation to prepared Ask candidates
e6545c33 Open prepared Ask alternatives in their isolated signed Try
```
