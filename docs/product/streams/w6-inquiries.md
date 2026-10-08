# Wave 6 inquiries — recovered and verified locally

PR: [#489 — w6/inquiries: finished and verified](https://github.com/Strelva/Strelva-OFFICIAL/pull/489), base `integrate/reborn-1.0`, Refs #336. Recovery implementation commit: `661d8c3a`; pushed with the pre-push typecheck passing. Merge remains held for #251.

Branch: `w6/inquiries`. Worktree: `/Users/jacobrhinehart/Desktop/strelva/REB-w6-inquiries`.
Recovery covers all 23 earlier commits, including tip `8a31dd88` and every WIP checkpoint. Final verification, the operator-gate inventory and the acceptance map are in [the wave 6 evidence record](../../capabilities/inquiries/inquiry-wave6-verification-2026-10-07.md).

## Objective and result

Close the inquiry launch contract and October delta in code: every lead kept, spam review, workspace replies, owner decisions without an account, exact answer/reply-time proof, and guarded Redis read cutover. The September customer builder/frame/agency requirements follow the adopted C1–C16 changes; internal fixed-component engine, isolation, testing and receipt requirements remain.

The customer opens the Inquiries System: current accepted form, records, Connections and History. Connected/native sources honestly say when their external form/history is unavailable. A current assigned or routed member can send ordinary replies; prices, dates and promises remain the owner’s decision. Strelva reviews supervised ordinary messages; trusted messages can run only inside current policy, sending permissions, hours and budget. An owner can approve or decline an exact live change or reply by signed confirmation, without an account.

Operators review durable held spam and “Owner not told” evidence, and can repair known unsent notices or a corrected recipient. Provider acceptance closes the purpose before read-back. Ambiguous sends never become retries. Inquiry-to-booking offers use the existing bookings store for managed and standalone/connected businesses, share the contact, and request a time without claiming confirmation.

Answer totals, within-day totals, unanswered totals and average/median first-reply time use the complete scoped cohort, deduplicated first provider acceptance. This proves acceptance, not delivery or customer response. Monthly and weekly reports consume the same evidence; missing or malformed proof remains unavailable.

## Production boundary

User-supplied fact: **0.2.1 is live, every lead dual-writes to `tenant_leads`, and 43 leads were backfilled.** This stream did not query production. Step 0 is already done; do not rerun the backfill merely because older delta prose says it is pending.

No deployment, production migration, env change, client repo edit, external notification, real-provider call or new dependency was performed. The recovery task explicitly authorizes committing, pushing and opening a PR against `integrate/reborn-1.0` (Refs #336); it does not authorize merge or rollout. All new email stays off until its switches and global/customer/per-origin-tenant gates permit it. A configured business owner with `tenantId:null` cannot bypass the originating tenant’s `reb:client-email` gate; every inquiry origin in a grouped digest is checked.

## Switches and defaults

| Switch | Default / dependency | Behavior |
| --- | --- | --- |
| `STRELVA_LEADS_READ` | `redis` when unset/unknown | `compare` serves Redis and records comparisons; `postgres` requires seven consecutive complete parity days across every current tenant, otherwise compare. DB errors fall back safely. |
| `STRELVA_LEADS_AUTHORITY` | Redis when unset | `postgres` writes durable first; DB refusal/timeouts keep the Redis lead and pending reconciliation. Separate from the read switch. |
| `STRELVA_INQUIRY_RECORDS` | Off; dual-write must be enabled | Durable workspace inbox, events, held-spam/contact paths and receipt metadata. |
| `STRELVA_INQUIRY_REPLIES` | Off; requires records | Owner/current assigned or routed member reply claims; one shared first-reply purpose with the governed engine. |
| `STRELVA_INQUIRY_OWNER_NOTICES` | Off | Current owner recipient, combined notice/draft when available, urgent decisions, exact authority, delivery reconciliation and bounded repair. |
| `STRELVA_INQUIRY_BUSINESS_FACTS` | Off | Current canonical facts/people/hours/services; sourced pending suggestions and owner confirmation/corrections. |
| `STRELVA_INQUIRY_OUTCOMES` | Off | Exact scoped cohort and weekly/monthly reply proof. |
| `STRELVA_INQUIRY_BOOKING_HANDOFF` | Off; records + `STRELVA_BOOKING_STORE_WRITE=1` | Signed offers into one bookings request store; actual live booking System, current services/settings/availability required. |
| `STRELVA_INQUIRIES_RELEASE` and workspace `inquiries` release row | Existing release defaults remain off | Converted tenants follow current workspace release; unconverted tenants retain the existing global legacy mode. |
| Needs you / workspace / owner-entry / Systems releases | Existing flags, off | Necessary for their customer/signed-link/Library surfaces; respect current per-workspace flags and authority. |
| `EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED`, `reb:client-email:<tenant>` | Existing gates preserved | Every new send checks global and customer gates, then every applicable origin tenant. Native business mail has no fabricated tenant. |
| `DUAL_WRITE_PG` | Existing default on; explicit `0`/`false` kills it | No new default or production flip by this stream. |

The read parity RPC now requires every current tenant on every day; a failed day remains failed even after a successful retry, and missing/error Redis reads cannot become healthy empty comparisons. Cache merges retain only genuinely pending Redis leads; durable held/excluded records cannot reappear. Positive streak reads have a five-minute cache. Repeated production misses still need explanation and a new qualifying window.

## Prepared migrations

All 19 files are in the allotted range, additive, transaction-wrapped with a three-second local lock timeout. They were applied only to throwaway local PostgreSQL. Rollbacks retain received inquiries and accepted delivery evidence, and require callers to be switched off first. Apply in timestamp order after the integrated prerequisite migrations; do not edit migrations already applied in production.

| Migration | Purpose |
| --- | --- |
| `20261010120000_inquiry_workspace_replies.sql` | Workspace reply claims and accepted receipts |
| `20261010121000_inquiry_outcome_proof.sql` | Full cohort counts, reply times, lead summaries and stable pages |
| `20261010122000_inquiry_weekly_outcomes.sql` | Weekly/service-role scoped outcome proof |
| `20261010123000_inquiry_context_notices.sql` | Current business context and owner-notice repair reads |
| `20261010124000_connected_inquiry_records.sql` | Connected/native durable records and spam review |
| `20261010125000_inquiry_urgent_decisions.sql` | Exact urgent decision source delivery |
| `20261010125500_inquiry_inbox.sql` | Bounded inbox and complete confirmation detail |
| `20261010125600_inquiry_reply_purpose.sql` | Shared engine/owner first-reply purpose |
| `20261010125700_inquiry_cache_presence.sql` | Pending cache presence and exclusion authority |
| `20261010125800_connected_inquiry_owner_notices.sql` | Connected/native owner-notice receipts |
| `20261010125900_inquiry_export_before_teardown.sql` | Export-before-teardown wrapper; preserves lead evidence |
| `20261010125910_inquiry_decision_notice_claims.sql` | Durable urgent mail claims and signed owner decisions |
| `20261010125915_inquiry_decision_notice_events.sql` | Urgent provider-event reconciliation |
| `20261010125920_tenant_lead_parity_completeness.sql` | Complete all-tenant seven-day parity gate |
| `20261010125925_inquiry_member_replies.sql` | Current assigned/routed member authority and precise cursor |
| `20261010125930_inquiry_business_facts.sql` | Sourced business fact proposals and exact owner confirmation |
| `20261010125935_inquiry_operator_authority.sql` | Current operator and exact publication/message owner authority |
| `20261010125940_inquiry_booking_handoff.sql` | Signed inquiry-to-booking requests, managed and native |
| `20261010125950_inquiry_operator_review.sql` | Operator spam review and bounded connected notice repair |
| `20261010125955_inquiry_operator_revocation.sql` | Revoked operators lose inquiry review authority (#251) |

Rollback files use the existing `supabase/migrations/rollback-*.sql` convention: workspace-replies, w6-inquiry-outcome-proof, weekly-outcomes, context-notices, w6-connected-inquiry-records, urgent-decisions, inbox, reply-purpose, cache-presence, connected-inquiry-owner-notices, export-before-teardown, decision-notice-claims/events, tenant-lead-parity-completeness, member-replies, business-facts, operator-authority, booking-handoff, operator-review and operator-revocation. The aggregate workspace SQL gate now rehearses all 20 rollback files independently and in reverse order on local clones, comparing exact retained rows. Recovery repaired destructive claim/receipt/proposal/offer rollbacks and their retained provider-event dependency. Five existing rollback files now revoke entry points rather than deleting durable state. Forward migrations remain unchanged. The full-schema upgrade proves historical identity/content/report rows survive.

Migration `20261010125935` is required before enabling publication, including the legacy combination where inquiries are enabled but owner notices are off. Direct publication now fails closed without a current owner bound to its exact claim/event; an operator can prepare but cannot decide. Signed “Not yet” is bound to the declined source and cannot authorize a send or publish.

## Crons and rollout additions

No new cron route or schedule. Existing authenticated `lead-mirror-reconcile`, `inquiry-follow-ups`, `needs-you`, `weekly-report` and `monthly-report` do the work under their existing heartbeat registration. `needs-you` shares the durable urgent mail purpose with immediate capture; it cannot double-send after a crash.

The release coordinator’s exact next action is to review this PR, complete #251 before merge, then integrate and reconcile dependent shared product/release state. The five SQL `super_admins` checks and four new application gates are inventoried in the evidence record. `authorize_inquiry_operator_actor` accepted a revoked row while tenant membership remained; `20261010125955` fixes that with a SQL regression (#251). The provider-agency versus platform-operator classification is posted on #251; moving client-serving gates to the verified provider is #255/#247 work. Production actions below need Jacob’s separate authorization and the existing release checklist:

1. Apply integrated prerequisite and inquiry migrations in order, with new switches off. Confirm readiness sentinels; the snapshot now includes all new table sentinels and inquiry switches without exposing secret values.
2. Keep the supplied 0.2.1 dual-write/backfill state. Enable read `compare` and collect seven consecutive all-tenant days with zero unexplained misses. A missing tenant, failed Redis read or an earlier miss on a day blocks that day.
3. Authorize the read switch separately. Check actual oldest durable leads, per-tenant counts and dashboard/engine reads. Restore `redis` to roll back reads; neither store is deleted.
4. Before authority, prove export-before-teardown and the retained-lead delete refusal. Authorize `STRELVA_LEADS_AUTHORITY=postgres` separately; retain Redis/pending reconciliation.
5. Enable workspace inquiry rows and scoped capabilities on the test business first. Keep all email silent until separately authorized. Verify actual owner recipient/fallback, tenant consent, sender domains, signed links, Resend webhook signature/provider payload, one notice and one provider send under retries.
6. Booking offers additionally need a live request-mode bookings System with current service/hours/calendar availability. An unavailable booking system must leave the inquiry and reply draft intact.

Do not roll back an accepted send into retryable work. Corrected-recipient notices create a new bounded purpose while preserving the original receipt. Unknown/in-flight transport outcomes require reconciliation; changing flags is not evidence that they were unsent.

## Commits

Interruption checkpoints are preserved; the final gates cover their accumulated source. Earlier implementation/checkpoint commits (recovery verifies their accumulated source):

- `9202136f` — WIP w6/inquiries: checkpoint after session interruption (unverified)
- `a102896a` — WIP w6/inquiries: checkpoint 2 after second interruption (unverified)
- `cce7b0e4` — Wire workspace inquiry receipts into signed provider webhook
- `bc1cc850` — Complete weekly inquiry proof and immediate gated owner decisions
- `72706c84` — WIP w6/inquiries: checkpoint 3 after third interruption (unverified)
- `a697a2d5` — Share first-reply authority between workspace owners and inquiry engine
- `d83acfcf` — WIP w6/inquiries: checkpoint 4 after fourth interruption (unverified)
- `647edbfa` — Require complete seven-day lead parity before durable read cutover
- `351dc208` — Validate and report inquiry answer counts and first reply times
- `cef35162` — Claim urgent inquiry notices and authorize signed owner decisions
- `0bbd5149` — Show the live inquiry System and use confirmed business facts at use
- `ec10821b` — Give operators durable spam review and bounded owner-notice repair
- `8d761f14` — Reconcile urgent inquiry notice bounces and enforce all inquiry email gates
- `0936c6b7` — Hand managed and standalone inquiries into signed booking requests
- `f2708050` — Permit current assigned-member replies and preserve precise inquiry pagination
- `569c128c` — Open the inquiry System for current customers instead of the legacy builder
- `a9172300` — Check every originating tenant before sending an inquiry decision email
- `b1df6cb4` — Keep email formatting bounded and defer inactive booking release reads
- `31f6b7e5` — Enforce current inquiry policy and exact owner authority through every decision path
- `2c354de0` — Run transactional inquiry migrations and all closure contracts in SQL gates
- `4cfefd0c` — Show accepted inquiry installations as Versions in the current agency Library
- `8654a551` — Exercise bounce and missing provider timelines through isolated inquiry fixtures
- `8a31dd88` — WIP round-5 checkpoint saved after thread stop (then unverified)
- Recovery — fix Running test-fixture typing; retain rollback evidence; add the 19-file rollback gate; replace pending proof with actual results (see current Git log).

## Current proof and remaining uncertainty

Final command results, failure history, per-criterion evidence and rendered artifacts are recorded in the linked evidence record. All proof is local. Production parity time, actual oldest durable production record, live provider acceptance/delivery, and owner adoption remain unproven. Local inquiry implementation checks are complete; #251 authority classification and the observed revoked-operator finding remain open before merge. No new dependency is required. Production rollout is a separate authorized action. Neither integration-checkout resume file was present; this handoff and its linked evidence are the continuation owners.
