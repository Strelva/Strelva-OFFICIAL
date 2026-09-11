# Persistence boundaries

Updated 2026-09-11. This is the current authority map. A Postgres table or mirror write does
not make Postgres authoritative; authority changes only when the production read path changes.

| Domain | Authority | Cache or mirror | Failure rule |
|---|---|---|---|
| Private workspace results and assessment recovery | Postgres `saved_product_work`, `workspace_operations` after the release migrations | Anonymous audit reports remain 60-day Redis bearer records, copied only on explicit save | Fail closed. Actor and direct membership are checked on every operation transition. A checkpoint survives failed completion; one operation commits one saved result. A pre-checkpoint interruption can repeat provider reads. No automatic background worker is implied. Local implementation only until migration and release acceptance. |
| Private documents, plans and accepted plan outputs | Postgres `saved_product_work` and `work_plan_output_executions` after the local release migrations | None | Documents use revision-checked edits and append-only receipts. Plans retain bounded source references. A private output and its execution receipt commit together; retries reopen that output. These are local capabilities, not a general background executor or permission to publish. |
| Internal work budgets and reported costs | Postgres `job_economics`, `job_economics_reservations`, `job_economics_usage` after the local release migration | None | The named payer accepts a budget. Reservations and usage have stable retry keys. Unknown costs remain unknown; Strelva-caused retries are recorded separately from customer usage. No Stripe charge or provider-side spending limit is implemented by this ledger. |
| Identity, memberships, super-admins | Supabase Auth + Postgres | None | Fail closed. |
| Tenant configuration and commercial plan | Postgres `tenants` | Redis tenant-list cache; dev file locally | Production never falls back to a dev file. |
| Domain ownership and verification | Postgres `domain_claims` | Redis legacy mirror/domain-map cache | Only verified claims route; explicit operator-configured production/admin domains remain trusted. |
| Published content, page configuration, collections, drafts, versions | Postgres | Redis read/write-through cache; dev file locally | Authoritative writes must succeed before reporting success. |
| Suggestions | Postgres `suggestions` | Workflow events for owner-visible approvals | Prefixed `sug_*` ids are persisted as text; a rejected mutation surfaces. |
| Audit and activity | Postgres | Store-specific cache where present | Tenant id comes from trusted auth/config. |
| Event and approval queue | Redis `event:*` + tenant sorted-set index | Postgres `unified_events` mirror | Pending governed work requires Redis; action claims precede side effects. |
| Pre-tenant delivery leads | Redis lead/status records | Postgres `delivery_leads` mirror | Delivery status is the canonical lifecycle; operator workflow is a projection. |
| Tenant Customer Inquiries | Redis `leads:{tenant}` + `lead:{tenant}:*`; delivery checkpoints, accepted-write markers, provider indexes, event claims, reply indexes/state, capture-repair jobs and daily budget in `reb:inquiry-delivery:*`, `reb:inquiry-delivery-claim:*`, `reb:inquiry-delivery-provider:*`, `reb:inquiry-delivery-event:*`, `reb:inquiry-reply:*`, `reb:inquiry-reply-state:*`, `reb:inquiry-capture-repair*`, `reb:inquiry-timeline:*`, and `reb:inquiry-budget:*` | None | 90-day recent-activity window; this is not Strelva's sales lead or a CRM. Delivery markers are tenant-scoped and must be moved with the inquiry slug. The opaque-address reverse index `reb:inquiry-reply-target:*` stores a tenant id in its value and is rewritten/deprovisioned by value. |
| Inquiry capability workspace, record overlays, and publication claims | Postgres `inquiry_workspaces`, `inquiry_record_overlays`, and `inquiry_publication_claims` after the inquiry migration | None | The workspace stores definitions, rehearsals, and receipts. Record overlays store only handling status and assignment for a Redis-authoritative inquiry id. Neither stores customer inquiry fields. A publication claim binds one exact actor and command to one accepted provider write. Accepted writes remain closed when read-back verification fails. Local implementation only until the migration and release are separately authorized. |
| Store order telemetry | Redis `orders:{tenant}` + `order:{tenant}:*` | None | 90-day/500-order visibility window; the client repository/payment provider remains financial authority. |
| Reviews | Postgres `reviews` | Provider polling/dedup markers in Redis | Provider ids dedupe; replies publish only through governed actions. |
| Booking configuration and date overrides | Redis | None | Surface degrades to an honest empty/default state. |
| Appointments | Postgres `bookings` | Redis overlap/slot locks | Booking write succeeds before a slot is confirmed. |
| Provider connections | Redis `connections:{tenant}:{provider}` | Postgres `integrations` table is not a live read path | A registry provider is not a tenant Connection. |
| Review reply voice | Redis `reb:reply-voice:{tenant}` | None | `off`, `approve`, and `auto` are live policy; auto rechecks policy before action. |
| Reward/Customer Members | Redis `reb:rewards:{tenant}:*` | Postgres reward tables are not a live read path | Distinct from Platform Memberships. |
| Pay links | Redis `reb:paylink:*` | None | A pay link is not a subscription and never implies plan state. |
| Operator CRM and lead workflow | Redis `crm:*` / `lead-workflow:*` | None | Lightweight operator metadata; unavailable data must not render as verified empty. |
| Conversation threads | Redis thread store | Postgres normalized chat tables are not a live read path | Distinct from Postgres-backed public/client chat sessions. |
| Public/client chat sessions | Postgres `chat_sessions` | Dev file locally | Opaque client-id transcript store; not the operator/agent thread model. |
| Rate limits, locks, deduplication markers | Redis | None | These are intentionally ephemeral; security-sensitive gates fail closed where documented. |
| Build-payment ledger | Postgres plus durable Redis compatibility record | Neither is a cache of an inferred subscription | A one-time payment never changes subscription status. |
| Mail log | Store-specific operational record with Postgres mirror | None | Logging failure never fabricates or cancels a send. |
| Site health scans and portfolio snapshots | Redis scan/portfolio stores | Recomputed by cron | Degrade to last-known or empty state; never invent health. |
| Email delivery | Resend/provider acceptance | Postgres/Redis mail log and CRM activity where enabled | Four audiences—client, operator, prospect, customer—have independent policy switches behind one transport boundary. |
| Legacy Sanity images | Original asset URL/CDN | `sanityImageUrl` resolver | Read-only compatibility only; no content store reads or writes Sanity. |
| Org-layer accounts, memberships, subscriptions (phase 0) | Postgres `accounts`, `account_memberships`, `subscriptions`, `subscription_items`; `tenants.account_id` (nullable FK) | None | Migration `20260729180000_org_layer_phase0_accounts` applied to prod 2026-07-30. RLS enabled deny-by-default; service-role bypasses. **The Postgres tables stay EXPAND-only option value — nothing reads them yet.** But the org-layer FEATURE is LIVE via a SEPARATE Redis accounts store (`src/lib/accounts.ts`: `account:{id}`, `account-of:{tenantId}`, `accounts:index`) that IS in use (first account: Twin Trees, 2 bundled sites). `tenants.subscription_*` remains authoritative for per-site billing; the account's bundled subscription is the payer-level truth synced by the billing webhook. `NULL account_id` = standalone/solo tenant. `subscription_items` carries `tenant_id` and is in `deprovision.ts` `TENANT_SCOPED_TABLES`. |

Schema presence alone does not establish authority. In particular,
`integrations`, `reward_members`, `reward_transactions`, normalized dashboard
chat tables, and other migration-era tables remain inactive until their read
paths deliberately cut over.

Tenant isolation is enforced in application code. Routes derive a tenant from trusted headers,
session membership, or server configuration and call the access/permission guard before using
the service-role client. RLS remains defense-in-depth because the service-role client bypasses it.

When moving an operational store to Postgres, change its read path, failure semantics, tests,
and this table in the same change. Do not update documentation based on a shadow write alone.

## Tenant rename registry completeness

The `authoritativePatterns` list in `src/lib/tenant-rename.ts` is derived from this table.
Every Redis-authoritative store with a slug-keyed key MUST appear there or it will silently
not move on a tenant slug rename. Confirmed present as of 2026-08-01:

`connections:*`, `crm:*`, `reb:crm-lock:*`, `leads:*`, `lead:*`, `orders:*`, `order:*`,
`reb:reply-voice:*`, `reb:rewards:*`, `reb:booking:config:*`, `reb:booking:overrides:*`,
`reb:booking:slot:*`, `reb:content-autonomy:*`, `reb:engagement:*`, `threads:*`,
`goal:*`, `analytics:cfg:*`, `reb:report-cadence:*`, `reb:report-sent:*`,
`reb:scan:baseline:*`, `google-meta:*`, `review-replies:recent:*`,
`reb:review-nudge-sent:*`, `reb:order-review-request-sent:*`, and
`reb:review-reply-declined:*`, `reb:inquiry-delivery:*`,
`reb:inquiry-delivery-claim:*`, `reb:inquiry-delivery-provider:*`,
`reb:inquiry-delivery-event:*`, `reb:inquiry-reply:*`,
`reb:inquiry-reply-state:*`, `reb:inquiry-capture-repair*`,
`reb:inquiry-timeline:*`, and `reb:inquiry-budget:*`. The opaque-address
`reb:inquiry-reply-target:*` reverse index is handled separately because the
tenant id is in its value rather than its key.

Caches (`reb:tenants:all`, content/page-config/analytics/brief/domain-map
caches) are intentionally NOT rekeyed — they regenerate from Postgres.

## Current security notes

- Collections v1 responses use private caching; content and draft source flags
  fail closed in production; required Postgres and encryption configuration is
  covered by the production checklist.
- The internal domain-map route fails closed when `INTERNAL_API_SECRET` is absent.
  `INTERNAL_API_SECRET` and `OAUTH_STATE_SECRET` are required by the production
  checklist. `APPROVE_LINK_SECRET` is the dedicated approval-link key and retains
  the older secrets only as a compatibility fallback.
- A tenant rename must keep the completeness test aligned with every new
  slug-keyed Redis authority added to this table.

## Workspace recovery retention and limits

The September 8 additive migration retains assessment input and execution state
inside the owning workspace. Completed operations retain their identity and saved
work pointer for deduplication; the redundant checkpoint payload is cleared on
completion. Workspace deletion cascades to its operations; deleting a saved result
clears the pointer without making the completed operation executable again.
No time-based operation purge has been introduced. Individual privacy/deletion
workflows must include this table when those workflows are implemented.

A lease lasts two minutes, with at most three execution attempts for one operation.
Each actual provider retry still consumes the existing assessment budget. Recovery
of a checkpointed or completed result does not consume provider budget. At most
100 incomplete operations per actor/workspace are retained before rejecting new
attempts. This is an implementation safeguard, not a paid allowance or promise.
Only the initiating actor can recover an operation, even when other people belong
to the workspace. Pending operation listing never extends to delegated readers.

## Tracker and internal experiment work

The September 11 tracker slice uses the existing `saved_product_work` authority.
A tracker payload retains the original CSV, field mapping, cell source references,
current rows, and attributable edit history. Re-import creates separate work;
it cannot replace an edited tracker. `update_tracker_work` checks a verified
actor, locks the direct membership and saved work, and accepts only the next
revision with unchanged tracker identity and source. Delegated read access does
not permit this update. No client-supplied snapshot is accepted as an edit.

Internal experiment records use separate immutable saved-work rows linked to a
tracker and its tested revision. They record operator-reported baseline, setup,
review and correction time, evidence, and optional provider cost. Missing cost is
unknown. Recording an experiment does not promote or publish a capability.
These records follow existing workspace retention; no new automatic purge exists.

The local comparison format supports a baseline and several candidates against
the same workload version. Evidence distinguishes simulation, operator reports,
and measurements. Support and maintenance effort are included; recording a
comparison does not qualify an offering automatically.

## Private documents and work plans

Documents remain plain text in `saved_product_work`. They retain creation
identity and a bounded history of before-and-after revisions. An Undo appends a
compensating edit and refuses to overwrite a later edit. Creating or editing a
document does not send it or publish it to a website.

Planning requires `STRELVA_PLANNING_ENABLED=1`, an authenticated workspace
member, and a configured model. Selected source work is authorized and reduced
to bounded excerpts before the model call. The saved plan retains source
identities and versions. A model's operation names cannot grant authority.
Private document and empty tracker creation use the native product engines and
an explicit user action. `work_plan_output_executions` binds a plan output to its
one created work item and receipt. This does not extend the assessment-specific
`workspace_operations` executor to arbitrary work.

These records have no new automatic retention period or purge worker. Production
migration, retention acceptance, and activation remain separate release actions.

Website setup suggestions and corrections are structured evidence inside inquiry
workspace action receipts. Public-page metadata is a suggestion, not independent
verification. Corrections survive later website reads and do not directly mutate
published tenant settings. Customer inquiry fields remain in their Redis authority.
