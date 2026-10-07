# Money and the client's data

Status: implementation prepared locally through wave 6 round 5 on
`w6/agency-operator` (2026-10-10 migration series). Nothing in this work
applies production migrations, changes Stripe, sends live email or flips a
production flag. Code and local tests establish implementation; production
conversion, provider delivery and seven days of parity remain rollout proof.

| Launch requirement | Implemented path | Local evidence / remaining proof |
| --- | --- | --- |
| Billing 1–4: one state per business, conversion sources, bundled sites, additive Stripe metadata | `business-billing`, existing business billing migration, conversion trigger, checkout/webhook mirror, dry-run metadata script | `business-billing.test.ts` and SQL billing fixtures; Stripe test-mode metadata and actual converted clients still require approved rollout |
| Billing 5–8: amount/MRR from billing home, public service survives payment failure, owner decision, explicit allowances | `read_business_portfolio_billing`, `readBusinessPortfolioBilling`, billing Needs you source, existing owner email and explicit allowance configuration | Portfolio SQL fixture, business billing/public-route tests and operator tests; live owner delivery remains unproven |
| Billing 9: flat plan exists without a price | `WORKSPACE_SUBSCRIPTION_PLAN` defines `workspace`, subscription, no amount/Stripe price, `purchasable: false`; excluded from legacy checkout keys | `w6-business-outcome-reports.test.ts`; Jacob's price decision is open, no offer activated |
| Redis 10–12: every store, safe dual writes, repair and dry-run backfill | `client-records` complete store registry plus typed analytics/report, lead, booking and inquiry homes; encrypted provider records use shared secrets path | Client move/removal/parity tests; real disposable Redis rename and repair race tests prove retained snapshots survive source expiry and failed writes never replay rewards balances |
| Redis 13–15: per-store seven-day parity/read switch, rename and deprovision | Parity ledger and sweep, Postgres readers, stable tenant identity, explicit tombstones, atomic pending-repair rekey and compare-and-delete acknowledgement | Local parity, rename, deletion and SQL stale-write fixtures; seven consecutive production days and each store's read flip are outstanding |
| Export 16–17: record, every System/history, native and tenant data, assets, honest manifest | Schema 3 additive categories, credential scrub, asset manifest, native records, orders/rewards, provider metadata allowlist | Export contracts/V3/native-facet and SQL portability fixtures; unavailable provider-only or already-expired history stays explicit |
| Export 18–19: large archives, operator start, owner-only expiring link and receipt | Background parts, archive download, shared owner resolver, cron recovery with durable predispatch reservation; accepted/unknown delivery cannot auto-send again after receipt failure or worker crash | `w6-export-recovery.test.ts`, SQL recovery fixture, export UI tests; live owner delivery not exercised. Expiring download tokens do not expire the retained export receipts/exit evidence |
| Exit 20: each site's export, custom repo/files, billing and domain handoff | `complete_workspace_exit_with_handoff`, per-site/System plan and retained obligations; exit never deletes records | SQL portability and workspace-exit tests; `/preview/strelva/portability` uses the real export/exit components with local request doubles for ready/loading/error/permission states |
| Outcomes 21–23: per-business counts, attribution and first reply | PostgreSQL outcome RPC; additive lead API/starter attribution; provider-accepted first reply mirror | Outcome SQL/domain, inquiry reply and API contract tests; unavailable counts retain null rather than becoming zero |
| Outcomes 24–25: bookings joined where evidence exists, one monthly business line | Original public/legacy counts plus unique one-store bookings including Calendly imports; explicit inquiry/contact/email/normalized phone joins to earlier business leads; existing native and legacy report transports append the line | Native/legacy caller tests, domain formatter and SQL import/join fixture. Shared private business/month reservation excludes accepted, dispatching and unknown deliveries from retry; grouping outage while armed suppresses delivery |

The report integration requires both `STRELVA_WORKSPACE_RELEASE=1` and the
new `STRELVA_BUSINESS_OUTCOME_REPORTS=1`; the latter is off by default. It
respects the existing global/customer email gates and every linked site's
email override. Flags off retain the existing report path. An armed grouping
or receipt outage never falls back around the durable delivery reservation.
Rollback retains private monthly delivery receipts, and reapply refuses
accepted, unknown and dispatching months (`w6-business-portability-rollback.sql`).

Business-record launch mapping (`strelva-1.0.0.md` §3): facts, services,
people and contacts have one revisioned home, website/booking/inquiry readers,
and history/undo tested by the business-record contracts, reader and surface
suites. Export carries that record plus linked Systems and their history.
The stream owner audits and owns the shared owner-recipient rule; this money
slice consumes it rather than defining a second recipient policy.

Clients-moved launch mapping (`strelva-1.0.0.md` §6): conversion, bundled
billing, `/api/v1` compatibility and the complete Redis exit are prepared in
code and local fixtures. No live client is asserted converted by these tests.
Nine-repo compatibility and the full verification belong in the stream's final
handoff. The seven-day parity window, production backfills, approved conversion
and real client/storefront smoke proof cannot be replaced by local greens.

Production stop points: apply the prepared migrations only after approval;
verify the existing encryption key and backfill inputs without exposing
credentials; dry-run each store, then prove seven days of parity before reads
move; verify Stripe metadata in test mode before any live metadata action;
prove owner delivery and handoff on the Strelva-owned test business and actual
converted clients. Keep grandfathered terms and the Twin Trees bundle intact.
The flat plan stays unsellable until Jacob sets its price.

Corrections found while building: the Postgres home for these stores is one
table, `tenant_client_records`, not per-store tables (section 5); typed tables
can follow when reads move. Its `workspace_id` and `accounts.workspace_id`
carry no foreign key, because unlinking counts every foreign key to
`workspaces` as use. `subscription_items.tenant_id` did not cascade on slug
rename; the billing migration fixes it. The public booking widget's
`POST /api/booking` was billing-gated (section 10 unknown); it no longer is.

Decision 5 built and proven locally on `build/business-ownership` (Oct 6):
`tenant_leads` no longer cascade with the tenant row; a deprovisioned
client's leads in no business are kept 365 days, then purged by the hourly
`lead-mirror-reconcile` cron with a `tenant_lead_purges` receipt. The 365 is
the working default; Jacob can change it in one function
(`tenant_lead_retention`). The same cron also runs the client-records repair;
each step is failure-isolated, so a purge failure never stops the repair and
the reverse.

Analytics config and report markers: one Postgres home, not two. Both this
stream and the Systems catalog stream (§5 there) moved them out of Redis. At
integration (2026-10-06) the catalog's typed tables won: `tenant_analytics_config`
and `tenant_report_state` (`20261007194000`, via `src/lib/storage/redis-move.ts`).
They keep rules the generic `tenant_client_records` JSON row cannot express:
the last-sent marker only moves forward and is read as the later of Postgres
and Redis (no double-send), and cadence and config writes go to Postgres first
and stop before Redis on failure. They also read Postgres today, with Redis
fallback, rather than waiting for a parity flag. `analytics_settings` was
removed from the client-records store list, the table's store check and the
tests, so nothing writes those keys to two Postgres homes.

Four parts: (a) billing follows the client into the workspace, (b) no client
data is held only in Redis, (c) export and exit carry everything, (d) the
outcome loop site → inquiry → reply → booking → review is measured per
business. Stripe and production were not touched to write this. Every
production fact below comes from code and docs, not a fresh read.

## 1. The moment

**Twin Trees pays once for two places.** Twin Trees is one account paying a
bundled $300/month for `twintrees-camillus` and `twintrees-fayetteville`
(`docs/product/roadmap.md`, recorded operator state, not rechecked). After
conversion it is one business with one website System in two Versions. The
owner never signs in. Each month Stripe charges the same card the same amount.
Strelva's operator opens the business and sees "Billing: subscription, $300 a
month, covers two sites: Camillus, Fayetteville. Paid through
Nov 6." If the card fails, the owner gets an email with a payment link. The
sites stay up and every lead is kept while it's sorted out.

**gldf leaves with everything.** Great Lakes Dried Fruits is grandfathered,
runs a store with rewards, takes leads, and holds a Google connection. A year
from now the owner emails "we're moving to another provider, send me our
stuff." The operator starts the export. The owner gets a link by email to one
download: the business record, the website content and assets, every lead
ever received (not just the last 90 days), every order, every rewards member
and their points, bookings and booking hours, reviews and replies, and a list
of the outside accounts Strelva was connected to. No passwords or tokens. The
receipt says what was included and what wasn't, and why.

**Every month, one line per business.** The Mooney Firm's monthly report says:
"412 visits. 9 inquiries; 8 answered within a day. 3 booked a consult, 2 of
them from a website inquiry. 2 new Google reviews." Each number says whether
it is counted or linked, and nothing is claimed that the data can't join.

## 2. In the model

- **Business** owns the money relationship and the data. Billing hangs off the
  business workspace, not a site or a System. One business can pay for many
  Systems and Versions (Twin Trees). The payer is the **owner** role.
- **Systems** produce records (leads, orders, bookings, members). Those
  records belong to the business and are stored in Postgres keyed so they
  survive renames, rebuilds and conversion. A System pausing never deletes
  them (`RULE_SYSTEM_PAUSE_HEALTH`).
- **Connections** are what Systems act through (Google Business, Calendly,
  GA4, Stripe). Their secrets move to Postgres through `crypto/secrets.ts`.
  Export lists them; it never carries their secrets. Knowing about Stripe is
  never permission to charge (`RULE_SYSTEM_CONNECTION_CONTRACT`).
- **Running** carries the data promises: "Every inquiry is kept", "Every
  inquiry is answered within a day". The outcome loop is how Running proves
  them.
- **Needs you** carries only money decisions that are the owner's: a failed
  payment, a payer change, an exit. Strelva handled carries receipts:
  "Strelva sent your export", "Strelva recorded your payment".
- **Strelva operator** does conversions, billing setup and exports for owners
  who never sign in. The operator is `admin` on the workspace, never `owner`.

## 3. What it does at 1.0.0

### (a) Billing follows the client

1. Every converted business has exactly one billing state in Postgres, keyed
   by `workspace_id`. States: `subscription`, `custom`, `comped`,
   `grandfathered`, `none`. `none` is the only one flagged as an open item.
2. The state is derived at conversion from today's tenant fields and recorded
   with its sources: `resolveBillingType` (`src/lib/billing-type.ts`) maps
   `tier` → `subscription`, `custom` → `custom`, `case_study` → `comped`;
   `PROTECTED_TENANTS` (`src/lib/deprovision.ts:24`) and
   `STRIPE_BILLING_GRANDFATHER_TENANTS` (`src/lib/subscription.ts`) mark
   `grandfathered`. A test proves each tenant shape lands in the right state.
3. One billing state covers every linked site. Twin Trees converts into one
   workspace whose billing state lists both tenants and the per-site line
   items now in Redis `account:{id}`.
4. Every Stripe subscription and customer for a converted business carries
   `workspaceId` (and keeps `tenantId`). New checkouts set both. The webhook
   resolves workspace first by `workspaceId`, then through
   `tenant_workspace_links` from `tenantId`. Additive only: amount, price,
   cycle and card never change.
5. The workspace's monthly amount comes from the billing state, not from
   `PLANS` in `billing-plans.ts`. Portfolio MRR reads the same numbers.
6. A lapsed or past-due state never takes down a live site, stops `/api/v1`,
   or drops a lead. Today `requireActiveSubscription` gates only dashboard
   routes; the test pins that `/api/v1/*` and hosted public pages stay
   ungated.
7. A failed payment reaches the owner by email from `updates.strelva.com`
   with a payment link, and shows in Needs you. No sign-in is needed to pay.
8. Allowances attach only when terms are explicitly configured
   (`STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG`, `allowanceConfigKey` metadata).
   A converted client with no configured terms gets no allowance and loses
   nothing it has today.
9. The one flat workspace plan exists as a billing state `subscription` with a
   plan key `workspace` once Jacob sets a price. Until then it is defined in
   code without a Stripe price and cannot be sold.

### (b) No client data held only in Redis

10. Every store in the table in section 5 has a Postgres home keyed by
    `tenant_stable_id` with a nullable `workspace_id` filled by the link
    trigger, the `tenant_leads` pattern.
11. Each store dual-writes before any read moves. A failed Postgres write never
    fails the client's request; it is queued and retried, like
    `src/lib/lead-mirror.ts`.
12. A backfill script per store, dry run by default, copies what Redis still
    holds.
13. A parity check per store compares Redis and Postgres counts and record
    hashes per tenant. Reads flip per store behind a flag only after parity
    holds for 7 days.
14. After the flip, Redis TTLs and caps no longer lose data. Redis is a cache.
15. Tenant rename moves nothing for flipped stores, because they key on
    `stable_id`. Deprovision handles every store explicitly (see section 6).

### (c) Export and exit

16. Workspace export schema 3 is additive over schema 2
    (`src/platform/workspace-exports/contracts.ts`). It adds: business record
    (facts, services, people, contacts, revisions), `systems[]` with their
    Connections (names, direction, status; no secrets), each linked tenant's
    content, assets manifest, leads, spam held for review, inquiry timelines
    and replies, bookings and booking hours, orders, rewards members and
    transactions, reviews and replies, and the billing state (no card data).
17. The manifest lists every category as included, omitted (with the reason)
    or unavailable. Nothing is silently dropped.
18. An export too large for one JSON body is built as a background job and
    delivered as an archive, not refused. The 2,000,000-byte limit stays for
    the inline JSON response only.
19. An owner who never signs in can get an export: the operator starts it on
    the owner's request; the link goes only to the business record's owner
    recipient (`resolve_business_owner_recipient`), expires, and leaves a
    receipt in `workspace_export_receipts`.
20. Exit (`workspace_exit_requests`) adds a step per linked site: export,
    repo and file handoff (custom repo), billing cancel, domain move. Exit
    never deletes data. Deletion is a separate, later action with its own
    yes.

### (d) The outcome loop

21. Each step is counted per business per month: visits, inquiries, inquiries
    answered, bookings, reviews. Counts read Postgres, not Redis.
22. Leads accept optional `page`, `referrer` and `utm_*` fields on
    `/api/v1/leads/[tenant]` (additive). The starter form in
    `custom-repo-starter/` sends them first; client repos adopt them only on
    their next change.
23. Every inquiry records the time of its first reply, by owner or Strelva,
    in Postgres.
24. Bookings link to a lead where one exists: native bookings already do
    (`public_website_bookings.inquiry_id`); legacy `bookings` and Calendly
    bookings link through `business_contacts` by email or phone.
25. Reports show linked figures ("2 of 3 bookings came from a website
    inquiry") only where a join exists, and plain counts elsewhere.

## 4. States and rules

**Billing states** (per business): `subscription` (Stripe recurring),
`custom` (negotiated amount, Stripe or off-platform), `comped` (free by
choice: case study, beta), `grandfathered` (old terms kept, whatever they
are), `none` (open item). Payment status (`active`, `trialing`, `past_due`,
`cancelled`) sits beside the billing state, mirroring Stripe. Grandfathered is
not the same as comped: `subscription.ts` treats a grandfathered tenant as
"$0, full access", but whether rohlax pays through `/pay/rohlax` is unknown
(section 10).

**Who can do what**

| Action | Owner | Member | Strelva operator |
| --- | --- | --- | --- |
| See billing state and amount | Yes | No | Yes |
| Pay, update card (Stripe portal) | Yes, by emailed link or signed in | No | No |
| Set or change billing state | No | No | Yes, with receipt; money changes need Jacob's yes |
| Propose payer change | Yes (`workspace_payer_transitions`) | No | No |
| Request export | Yes, in app or by email | No | Starts it for the owner |
| Receive export link | Owner recipient only | No | No |
| Start exit | Yes | No | Prepares, owner confirms |

**What never happens**

- Conversion never touches Stripe or allowances. It records billing state
  only (decided Oct 2, `docs/product/strelva-reborn.md` section 3).
- No price, amount, plan or card changes as part of moving a client.
- A billing lapse never stops a site, the v1 API or lead capture.
- Export never contains credentials, tokens or card data.
- Exit never deletes data.
- No Redis `reb:` key is renamed (AGENTS.md frozen names). Stores move by
  copying, not renaming.

## 5. Built on

### Money

| Piece | Today | At 1.0.0 |
| --- | --- | --- |
| Tenant billing fields | `TenantConfig` in `src/lib/types.ts` (`billingType`, `subscriptionStatus`, `stripeSubscriptionId`, `planMonthlyCents`, legacy `planOverride`) | Kept as the tenant mirror for `/dashboard`; source for conversion |
| Plan truth | `src/lib/billing-plans.ts`: Presence $99, Growth $199, Scale $499 | Kept for existing tier clients. Flat plan added when priced |
| Checkout | `createTenantSubscriptionCheckout` in `src/lib/billing.ts`, metadata `tenantId` only | Adds `workspaceId` |
| Webhook | `src/app/api/billing/webhook/route.ts`: tenant by metadata, bundle sync to Redis account, calls `syncConfiguredSubscriptionAllowance` | Resolves workspace; writes Postgres billing state |
| Accounts (multi-site) | Redis `account:{id}`, `account-of:{t}`, `accounts:index` (`src/lib/accounts.ts`), operator truth | Postgres. See option below |
| Dormant org tables | `accounts`, `account_memberships`, `subscriptions`, `subscription_items` (`20260729180000_org_layer_phase0_accounts.sql`), no reader | Recommended billing home |
| Allowances | `src/platform/work-economics/` (`work_allowances`, `work_allowance_subscription_entitlements`, `job_economics*`) | Unchanged. Reads `workspaceId` + `payerId` already |
| Conversion receipt | `convert_tenant_to_business` stores `billing` and `account` JSON in the receipt only (`20261002120000_business_record.sql:1158`); built by `scripts/convert-tenant-to-workspace.ts:77-90` | Same data written to the billing home |

**Constraint found.** `work_allowance_subscription_entitlements.payer_id` and
`job_economics.payer_id` reference `users(id)`. An owner who never signed in
has no user row, so a converted client can't hold an allowance or a job until
someone signs in. Billing state therefore must not depend on a payer user. It
names the payer by the business record's owner recipient; the user link is
added if and when they sign in.

**Recommended billing home.** Activate the dormant `accounts` tables and add
`accounts.workspace_id` (unique), `billing_type`, `billing_sources jsonb` and a
`grandfathered_terms` note. One account per business workspace; Twin Trees is
one account with two `subscription_items`. `tenants.account_id` already exists.
This is new behavior on existing tables, plus one migration. It is
workspace-model data keyed to tenant-model rows through `subscription_items`.

### What the flat price must cover

No price is proposed here. This is the cost floor the price has to clear, and
what we know about each line.

| Cost line | Evidence today | Fact or estimate | How to measure |
| --- | --- | --- | --- |
| Operator minutes per business | PR #205 (`feat/business-effort-minutes`, open, unmerged) records minutes per workspace; no client measured because none is in a workspace | Unmeasured | Merge #205, log 30 days on converted clients. Note: #205 keys on `offering_website_bindings`, conversion uses `tenant_workspace_links`; one must change |
| Model calls | Rebuild targets under $0.05 model cost per site (`website-rebuild-spec-2026-10-01.md:451`), a target, not a measurement. 12 call sites, no per-call cost recorded. `job_economics_usage` has kind `model`, operator-reported | Unmeasured | The one model-call helper (1.0.0 "Underneath") records cost per call per workspace |
| Hosting | Hosted sites are served by REB by hostname; custom-repo clients have their own repo and Vercel project | No per-site figure in the repo | Vercel and Supabase invoices divided by sites; custom-repo sites separately |
| Email | Resend for owner notices, inquiry replies, reports | No per-business figure | Resend volume per tenant from `mail_log` |
| Payment fees | Stripe on each charge | Rate for this account not checked | Stripe dashboard, Jacob |
| Redis and Postgres growth | This spec moves more data to Postgres | Unmeasured | Row counts per business after backfill |

The floor per business per month is: operator minutes × loaded hourly rate +
model + hosting share + email + payment fees + storage. The price is that
floor divided by (1 − target margin). The target margin is Jacob's to set.
Today's revenue anchors are the tiers ($99, $199, $499), Twin Trees at $300
for two sites, and the GBP add-on at $149 per location (`roadmap.md`). Minutes
will dominate; the others are likely cents to a few dollars (inference, not
measured).

### Client data in Redis → Postgres

| Store (key) | Holds | Limit today | Postgres home | Order |
| --- | --- | --- | --- | --- |
| `orders:{t}`, `order:{t}:{id}` (`src/lib/orders.ts`) | Store orders | 90 days, 500 | New `tenant_orders` | 1. No copy at all |
| `leads:{t}`, `lead:{t}:{id}` (`src/lib/leads.ts`) | Inquiries | 90 days, 500 | `tenant_leads` (built, 0.2.1) | 0. Ships first |
| `reb:spam-pit:{t}`, `reb:spam-pit:item:*` (`src/lib/spam-pit.ts`) | Submissions held as spam, incl. false positives | 30 days, 1000 | `tenant_leads` with a `held_as_spam` state | 1 |
| `reb:inquiry-delivery*`, `reb:inquiry-reply*`, `reb:inquiry-timeline:*` (`src/products/inquiries/delivery-store.ts`, `reconciliation.ts`) | Delivery receipts, replies, timelines | 90 days | New `inquiry_events` keyed by lead id | 1 |
| `events:{t}`, `event:{id}` (`src/lib/events.ts`) | Approvals, activity, needs-you, change requests | 90 days | `unified_events` (dual-write on by default, unverified in prod); approvals per the needs-you spec | 2 |
| `threads:{t}:*` (`src/lib/threads.ts`) | Owner conversations with Strelva | 90 days, 200 | `chat_threads`, `chat_messages` (exist, unused) | 2 |
| `connections:{t}:{provider}` (`src/lib/connections.ts`) | OAuth tokens, encrypted | No TTL | New `tenant_provider_connections`, ciphertext through `crypto/secrets.ts`, no re-consent | 2 |
| `google-meta:{t}`, `calendly-meta:{t}`, `calendly-user-uri:*` | Provider account and location ids | 1 year | Same table, as connection metadata | 2 |
| `reb:booking:config:{t}`, `reb:booking:overrides:{t}` (`src/lib/storage/booking-store.ts`) | Hours, services, closures | No TTL | Booking System config (bookings spec); hours and services read the business record | 3 |
| `reb:rewards:{t}:*` (`src/lib/rewards/`) | Members, points, transactions | No TTL; txns unbounded | `reward_members`, `reward_transactions` (exist, unused) | 3 |
| `account:{id}`, `account-of:{t}`, `accounts:index` | Multi-site billing grouping | No TTL | `accounts`, `subscriptions`, `subscription_items` | 3 |
| `analytics:cfg:{t}`, `reb:report-cadence:{t}`, `reb:report-sent:{t}` | GA4 / Search Console property, report cadence and last send | No TTL | `tenant_analytics_config`, `tenant_report_state` (built locally, Systems catalog §5) | 4 |
| `reb:reply-voice:{t}`, `reb:content-autonomy:{t}`, `goal:{t}`, `reb:client-email:{t}` | Owner settings | No TTL | `tenant_settings`; owner email reads the business record's owner recipient | 4 |

Store-level facts come from a read of the code on 2026-10-06 with line
references in the working notes; `docs/architecture/persistence-boundaries.md`
lists the same Redis-authoritative domains. Operator-only data (`crm:{t}`,
scan history, `briefs:{t}`, `reb:visibility:{t}`) is Strelva's, not the
client's, and is out of this spec.

Retires after each flip: the Redis copy as authority. Keys stay as cache
under their frozen names.

## 6. Moving today's clients

1. **0.2.1 first.** `tenant_leads` migration, backfill and deploy, on
   Jacob's yes. Leads are expiring every day until this lands.
2. **Orders and spam next, before conversion.** They have no copy anywhere.
   Same dual-write, backfill and reconcile shape as leads.
3. **Conversion records billing state.** `convert_tenant_to_business` already
   takes `billing` and `account`; it also writes the billing home row. Still
   no Stripe call.
4. **Stripe metadata backfill, separate step.** A script lists every
   subscription and customer tied to a converted tenant and the exact
   `workspaceId` it would add. Dry run by default; `--apply` needs Jacob's
   yes (already on the Reborn "Needs Jacob's yes" list). Run in Stripe test
   mode against a copy first.
5. **Remaining stores** in the order in the table. Each: migration, dual
   write, backfill, 7 days of parity, read flip behind a per-store flag.
6. **Fix what the move exposes.** Found while reading code, not run:
   - `tenant-rename.ts:235-257` moves keys with `get`/`set`. On sorted sets,
     hashes, sets and lists (leads index, orders index, rewards) Redis returns
     a type error, the pattern is recorded as failed, and the rest of that
     pattern is skipped. It also drops TTLs. Until stores flip, rename must
     handle each type; a test with non-string keys is added first.
   - Deprovision (`src/lib/deprovision.ts:117-144`) leaves leads, orders,
     events, threads, connections (encrypted secrets), booking config,
     accounts and settings in Redis. After the move, deprovision acts on
     Postgres rows by explicit rule, and the Redis cache is cleared.
   - `tenant_leads` cascades on tenant delete. Whether a deprovisioned
     client's records are kept is Jacob's call (section 9).
7. **Clients who never sign in** see no change. Their sites, forms, reports
   and Stripe charges behave the same throughout.

## 7. Failure and undo

| What fails | What the person sees | Undo |
| --- | --- | --- |
| Postgres write during dual-write | Nothing; submission succeeds. Operator sees pending count | Reconcile cron retries |
| Parity check disagrees | Operator alert; read stays on Redis | Flag stays off |
| Read flip shows a wrong number | Operator turns the per-store flag off | Yes, flag |
| Stripe metadata update partly applied | Script receipt lists each subscription: added, skipped, failed | Metadata can be removed; nothing charged |
| Webhook can't resolve a workspace | Event processed on tenant as today; operator alert | Not needed |
| Card fails | Owner email with payment link; Needs you; site stays up | Owner pays |
| Export too large / job fails | "Your export is being prepared" then a link, or an operator alert | Retry; no partial export is sent as complete |
| Exit started by mistake | Exit request shows pending | Cancel before completion (existing exit states) |
| Backfill run twice | No duplicates (idempotent on Redis id) | Not needed |

Not undoable: a sent export link (it expires), a Stripe charge, an email.

## 8. Proof

- SQL tests for each new table in `check:workspace-sql`: RLS on, grants
  revoked, cross-workspace denial, link trigger fills `workspace_id`.
- Unit tests: each tenant billing shape → billing state (tier, custom,
  case_study, founder_comp, grandfathered gldf and rohlax, none, multi-site
  account); webhook resolves by `workspaceId` and by `tenantId`; v1 routes
  never gated by billing.
- Per-store tests: dual-write never fails the request; backfill dry run
  changes nothing; parity check finds an injected mismatch.
- Rename test with zset, hash, set and list keys.
- `pnpm scrubbed-copy` dry run against a scrubbed copy: every active tenant
  converts with a billing state, and every Redis store backfills with parity.
- Stripe test mode: checkout carries both ids; metadata script round-trips.
- Export schema 3 test on a Strelva-owned test business with a store, leads
  older than 90 days (from Postgres), bookings, rewards and a connection; the
  archive has every category and no secret (grep for token prefixes).
- Production proof on the Strelva-owned test business: one lead, one order,
  one booking, one reply, one review flow through to the monthly report with
  correct linked and counted figures.
- Byte-identical storefront comparison for converted clients, as Sept 30
  (60/60).

## 9. Open decisions

1. **Do existing clients move to the flat plan?** Options: (a) every existing
   client keeps its current terms at 1.0.0 and the flat plan is for new
   businesses; (b) move tier clients onto the flat plan at a set date with
   notice; (c) offer it, never force it. Recommendation: (a), then (c) once a
   price exists. Changing a client's charge is a money and trust decision;
   1.0.0 shouldn't bundle it with moving their data.
2. **The price.** Open. Section 5 is the floor it must clear. Recommendation:
   don't set it until 30 days of operator minutes (PR #205) exist for at
   least the converted clients.
3. **Billing home.** (a) Activate the dormant `accounts` tables plus
   `workspace_id` (recommended: they already model one payer, many sites);
   (b) a new `workspace_billing` table. (b) is cleaner but leaves dormant
   tables to retire.
4. **Twin Trees: one business or two.** `systems-transition.md` says
   conversion must ask. One workspace means one billing state and two
   Versions; two means two businesses and a split or shared payment.
5. **Records of a deprovisioned client.** Keep (soft delete, export
   possible) or cascade-delete (today's `tenant_leads` behavior).
   Recommendation: keep for a stated period, then delete with a receipt.
6. **Review requests to the business's customers.** Today requests go only
   to the owner. Closing the loop at "review" needs client-branded email
   from `mail.strelva.com` to end customers after a booking or order. That is
   new outbound mail on clients' behalf and needs Jacob's yes. Without it, the
   loop stops at counting reviews.
7. **What grandfathered means for rohlax.** Free, or paying a one-off deal
   through `/pay/rohlax`? The billing state records whichever is true.

## 10. Unknowns

| Unknown | Fact or inference | How to find out |
| --- | --- | --- |
| How much is in each Redis store per tenant | Unknown | Read-only key scan on the scrubbed copy (needs Jacob's yes for the copy) |
| Whether `unified_events` dual-write lands in production | Code says on by default; not verified | `scripts/workspace-target-snapshot.sql`, read-only |
| Which tenants pay, how, and through which Stripe objects | Partly in tenant rows; Stripe not read | Jacob, or a read-only Stripe listing on his yes |
| Whether Stripe already emails failed payments to clients | Unknown | Stripe settings, Jacob |
| Whether `/api/booking` POST (public widget) is billing-gated | It calls `requireActiveSubscription`; whether the public widget uses it is not checked | Read the route and the widget before item 6's test |
| Whether gldf's export exceeds 2 MB | Unknown | Size the scrubbed copy |
| Cost per business: minutes, model, hosting, email | Not measured anywhere | PR #205, model-call helper, invoices |
| Whether the `integrations` table fits provider connections | Exists in initial schema, unused, slug-keyed (inference) | Read the schema; likely a new stable_id-keyed table instead |
| Whether the rename type error happens in production | Inference from code; not run | Rename test against local Redis |
