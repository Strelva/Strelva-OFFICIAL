# Persistence boundaries

Updated 2026-09-20. This is the current authority map. A Postgres table or mirror write does
not make Postgres authoritative; authority changes only when the production read path changes.

| Domain | Authority | Cache or mirror | Failure rule |
|---|---|---|---|
| Private workspace results and assessment recovery | Postgres `saved_product_work`, `workspace_operations` after the release migrations | Anonymous audit reports remain 60-day Redis bearer records, copied only on explicit save | Fail closed. Actor and direct membership are checked on every operation transition. A checkpoint survives failed completion; one operation commits one saved result. A pre-checkpoint interruption can repeat provider reads. No automatic background worker is implied. Local implementation only until migration and release acceptance. |
| Private documents, plans and accepted plan outputs | Postgres `saved_product_work` and `work_plan_output_executions` after the local release migrations | None | Documents use revision-checked edits and append-only receipts. Plans retain bounded source references. A private output and its execution receipt commit together; retries reopen that output. These are local capabilities, not a general background executor or permission to publish. |
| Private website drafts and approval | Postgres `saved_product_work` with `product_id=websites` after `20260920120000_websites.sql` | Generated projects are reconstructed from the saved candidate and verified against its content, renderer and artifact digests | Direct workspace membership, revision checks and stopped-work guards apply. A changed candidate clears approval. Local launch preparation records an export receipt; it does not establish a deployment. |
| Agency managed website draft authority | Postgres `agency_managed_website_draft_grants`, `agency_managed_website_draft_preparations` and `agency_managed_website_draft_revisions` after `20260920121000_agency_managed_website_draft_authority.sql` | Native draft content remains in the existing managed website store | Permission requires the named active assignment, accepted delivery, native sponsor authority and explicit unexpired customer grant. Agency preparation does not grant publication. Revocation blocks further preparation. |
| Public website booking grants and visitor receipts | Postgres `public_website_booking_grants` and `public_website_bookings` after migrations `20260920122000` and `20260920123000` | Native schedule and calendar receipts retain provider operation authority | The durable visitor receipt is claimed before the calendar write. Request fingerprints and original slots are immutable. Management tokens are hashed for lookup and stored through the secret encryption boundary. Existing receipt readback reconciles native evidence without creating work. Export omits management secrets. These migrations and paths remain local until release acceptance. |
| Private onboarding cases and supplied files | Postgres `saved_product_work`; onboarding cases use `product_id=onboarding` and uploaded files use private `documents` work with the `20260920020000_onboarding_work.sql` CAS function and `20260920020100_onboarding_attachment_immutability.sql` trigger | None | Requirement payloads retain missing/supplied/correction/accepted state, assignee, append-only history, and an immutable document work id plus exact document revision. Upload provenance and file bytes up to 2 MB remain inside the workspace-authorized saved-work boundary. Local text/CSV/JSON parsing is proposed information for human review; unsupported extraction is explicitly unavailable. Replacing a supplied file creates a new immutable attachment reference and requires review; generic editing of the original attachment is blocked. Local implementation only until release and human review. |
| Internal work budgets and execution costs | Postgres `job_economics`, `job_economics_reservations`, `job_economics_usage`, `job_economics_executions`, and trusted `work_provider_receipts` after the local release migrations | None | The named payer accepts a budget. Atomic admission reserves funds and limits concurrent execution. Accepted or uncertain actions never replay; unknown costs retain their cap until verified reconciliation. A provider receipt is bound to one admitted execution and immutable request id before settlement; exact decimal amounts are preserved in each receipt. Fractional cents accumulate in `work_allowance_subcent_remainders`, `work_provider_subcent_remainders`, and separate `work_retry_subcent_remainders`; customer cap admission includes the customer remainder. Strelva-caused retries are excluded from customer costs. This does not impose provider-side quotas, pass through provider dollars to customers, or charge Stripe. |
| Native applications after the September 14 release migration | Postgres `application_states`, `application_releases`, `application_records`; `saved_product_work` retains resource identity | Application fields in `saved_product_work.payload` are a compatibility projection | Released definitions and records have separate revisions. A candidate edit leaves the current release available. Publication checks current records; rollback preserves data. Record edits keep a per-record revision and bounded correction history. Missing canonical storage fails closed. New record attribution comes from the verified actor; imported legacy attribution remains unknown. These migrations have only been exercised locally. |
| Recipient application access | Postgres `application_use_grants`, `application_use_submissions`, and `application_use_edits` after the local September 14 and September 20 migrations | None | Grants bind the verified recipient, permitted views, record read scope, explicit own/all edit scope and expiry. Submissions and corrections use the canonical application record writer. Accepted submission and edit receipts bind retries to the same actor, grant, release and content. A stale correction fails without replacing the entered input; revoked or foreign records are denied. |
| Ongoing responsibilities | Postgres `standing_responsibilities`, `standing_responsibility_jobs`, `standing_responsibility_runs`, `standing_responsibility_receipts` after the local September 14 migration | Run status and receipts project the corresponding finite responsibility; they do not authorize another execution | An approved policy admits individual jobs with distinct trigger keys and limits. The finite runner checks the current policy before acting. Current repeatable work supports saved-source investigations and one explicitly selected public website URL; paid provider execution still requires its accepted budget. Local SQL and Auth/browser checks cover approval, separate runs, pause/revocation and recovery. New claims check the accepted policy under the shared lock; interrupted projections can be repaired without repeating completed work. No production scheduling is enabled. |
| Local schedules and investigations | Postgres `saved_product_work`, revision-checked `update_bounded_product_work` | None | Private workspace membership governs commands. Reservation conflicts are checked at CAS; provider acceptance remains separate from read-back. Investigations retain exact source evidence and due time. The public website adapter reads through the existing audit engine and retains server-visible text evidence; this does not establish a connected live calendar or coverage of browser-rendered website content. |
| Workspace calendar connections and event receipts | Postgres `workspace_calendar_connections` and `workspace_calendar_event_receipts` | None | OAuth secrets use the existing encrypted-secret boundary. Selected calendars, token refresh and revocation use revision checks. Provider acceptance resolves the write; failed read-back stays separate and never authorizes a duplicate send. Workspace exit stops new connections and event changes, with explicit cancellation and read-back retained. Local adapter proof does not establish connected-account production operation. |
| Reviewed custom application artifacts | Postgres `custom_application_states`, `custom_application_artifacts`, `custom_application_reviews`, `custom_application_releases`, and `custom_application_grants` | Saved work retains resource identity | A bounded frontend artifact is built in a restricted container, reviewed at its exact digest, and released to named recipients. A grant pins its release; rollback preserves prior artifacts. This is a local operator-reviewed lifecycle, not arbitrary backend hosting or commercial Custom Software acceptance. |
| Workspace exit and retained exports | Postgres `workspace_exit_requests`; existing native records retain their own authority | Versioned JSON export is a bounded snapshot, not a new record store | Exit blocks new work while preserving accepted/unknown obligations and deliberate cleanup. Naming a successor records a review contact without transferring authority. Records remain until explicit deletion is requested; no automatic deadline or outside-service cancellation is inferred. The export manifest names included records, omitted attachment bytes and unsupported domains. |
| Accepted responsibilities and attempts | Postgres `saved_product_work`, owner-checked `update_work_responsibility` | None | Approved inputs are immutable. CAS admits one worker, native commands recheck authority, and cancellation preserves in-flight evidence. Interrupted/accepted actions require reconciliation rather than replay. `workspace-work` cron dispatch is separately gated by `STRELVA_BACKGROUND_WORK_RELEASE`; no flag or production deployment was changed. |
| Work context and scoped participation | Postgres `workspace_work_context`, `workspace_work_participation` | None | Current membership, exact source versions, expiry, revocation and append-only history are rechecked by the SQL boundary. Preferences never grant authority. Guest contributions are scoped proposals, not native mutation authority. Reported contribution costs are not payments. Work deletion cascades these rows; no automatic history purge is configured. Internal product-learning work cannot be shared through these paths. |
| Internal product learning | Postgres `saved_product_work`, internal-member create/update RPCs | None | Active super-admin and workspace membership are locked through commit. Source provenance, freshness, withdrawal, simulation labels and unknown outcomes survive transitions. The module is production-disabled. Its recurring adapter reads registered private documents, trackers and recorded experiments; it does not collect live interviews or telemetry. |
| Identity, memberships, super-admins | Supabase Auth + Postgres | None | Fail closed. |
| Tenant configuration and commercial plan | Postgres `tenants` | Redis tenant-list cache; dev file locally | Production never falls back to a dev file. |
| Domain ownership and verification | Postgres `domain_claims` | Redis legacy mirror/domain-map cache | Only verified claims route; explicit operator-configured production/admin domains remain trusted. |
| Published content, page configuration, collections, drafts, versions | Postgres | Redis read/write-through cache; dev file locally | Authoritative writes must succeed before reporting success. `content_versions.request_id` preserves governed request provenance separately from content-field changes; historical rows may have no reference. |
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

## September 15 local product additions

These additions remain behind the workspace release gate. Their migrations have
been exercised only in the isolated SQL harness, not applied to production.

| Concern | Local source of truth | Rules |
| --- | --- | --- |
| Offering installations | Postgres through `src/platform/offerings` | Existing customer workspace identity; installation/configuration/retirement require current owner or admin authority. Native records retain their own lifecycle and authorization. A requested provider is not an accepted service. |
| Business website attachments | Postgres `offering_website_bindings` | Binding requires current workspace owner/admin and tenant owner authority. Store stable tenant identity; no membership or domain authority transfers. Revocation retains history. Existing tenant deletion clears the physical reference and preserves an unavailable binding record. |
| Operational assignments | Postgres through `src/platform/work-participation/assignments.ts` and the assignment repository | Owner offers, verified assignee accepts, expiry and revocation stop subsequent work. Approved zero-cost finite work uses direct membership or an exact accepted agency delivery/assignment grant. Agency draft editing additionally requires `agency_application_draft_grants`; the customer retains publication authority. Assignment scope does not narrow broader permissions the assignee already holds. Acting identity remains distinct from sponsor. |
| Configured period allowances and subscription included usage | Postgres `work_allowances`, `work_allowance_ledger`, `work_allowance_reservations`, and the optional `work_allowance_subscription_entitlements` projection | Operator awards or an explicitly configured Stripe subscription event creates the same payer-accepted operational cap and named-unit ledger. Subscription terms come only from server configuration keyed by event metadata; a Stripe price, invoice amount, one-off payment, or grandfathered agreement never supplies units or a customer price. Replays and older events do not create duplicate allowances, and a cancellation can close an unaccepted period while retaining its record. Strelva retries consume no customer allowance. Unknown effects/costs retain holds; contribution credits remain separate from subscription included usage. |
| Personal AI integration tokens | Postgres through `src/platform/agent-access` | Store token hashes only. Bind to the issuing verified user, exact work and native participation grant. Current membership, scope, expiry and revocation govern read/propose access. Proposals stay pending; tokens confer no execution authority or independent agent identity. |

An execution receipt remains authoritative after allowance settlement fails.
Retrying accounting must never repeat the native action. Existing per-job dollar
limits continue to apply alongside configured period allowances. Unconfigured
legacy jobs retain their accepted per-job budget behavior.
If a pre-action failure cannot be recorded durably, the reservation stays held
and requires explicit reconciliation. The runtime preserves both errors and
does not treat a second request as permission to act.

Tenant isolation is enforced in application code. Routes derive a tenant from trusted headers,
session membership, or server configuration and call the access/permission guard before using
the service-role client. RLS remains defense-in-depth because the service-role client bypasses it.

When moving an operational store to Postgres, change its read path, failure semantics, tests,
and this table in the same change. Do not update documentation based on a shadow write alone.

## September 19 local request and application additions

Pre-installation service requests use Postgres `service_requests` and
`service_request_commands` through `src/platform/service-requests`. A request
retains the customer business, need, scope, selected provider, review decision
and revision. Command receipts prevent repeated saves and decisions after a
lost response. Customer edits and provider reviews check the revision they saw.
A review decision does not create an installation, price, assignment or execution
permission; linking an existing delivery is a separate checked command.

Request history is bounded to 100 entries. No time-based purge is configured.
Deleting the customer workspace cascades its requests and command receipts;
referenced provider workspaces and linked deliveries use restrictive foreign
keys. Missing request storage reports unavailable rather than an empty inbox.
This is local implementation behind the workspace release gate, not a deployed
migration or live provider service.

Application choice fields use the existing application tables and writers.
Allowed options belong to the versioned definition. Publication and rollback
validate current records against that definition; adding an option preserves
records, while removing an option still in use is rejected. No separate record
store or migration of customer values is introduced.

Application date fields use calendar strings in `YYYY-MM-DD` form. The owner,
editor, recipient boundary, SQL validator, publication and rollback paths all
reject rollover dates and preserve the value without a timezone conversion.

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
Private documents, empty trackers and application definitions are created through
the native product engines after an explicit user action. A ready application
proposal must contain a validated definition; model output cannot assign its
owner, access grants or customer records. `work_plan_output_executions` binds a plan output to its
one created work item and receipt. This does not extend the assessment-specific
`workspace_operations` executor to arbitrary work.

These records have no new automatic retention period or purge worker. Production
migration, retention acceptance, and activation remain separate release actions.

Website setup suggestions and corrections are structured evidence inside inquiry
workspace action receipts. Public-page metadata is a suggestion, not independent
verification. Corrections survive later website reads and do not directly mutate
published tenant settings. Customer inquiry fields remain in their Redis authority.
