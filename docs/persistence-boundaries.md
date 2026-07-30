# Persistence boundaries

Updated 2026-07-30. This is the current authority map. A Postgres table or mirror write does
not make Postgres authoritative; authority changes only when the production read path changes.

| Domain | Authority | Cache or mirror | Failure rule |
|---|---|---|---|
| Identity, memberships, super-admins | Supabase Auth + Postgres | None | Fail closed. |
| Tenant configuration and commercial plan | Postgres `tenants` | Redis tenant-list cache; dev file locally | Production never falls back to a dev file. |
| Domain ownership and verification | Postgres `domain_claims` | Redis legacy mirror/domain-map cache | Only verified claims route; explicit operator-configured production/admin domains remain trusted. |
| Published content, page configuration, collections, drafts, versions | Postgres | Redis read/write-through cache; dev file locally | Authoritative writes must succeed before reporting success. |
| Suggestions | Postgres `suggestions` | Workflow events for owner-visible approvals | Prefixed `sug_*` ids are persisted as text; a rejected mutation surfaces. |
| Audit and activity | Postgres | Store-specific cache where present | Tenant id comes from trusted auth/config. |
| Event and approval queue | Redis `event:*` + tenant sorted-set index | Postgres `unified_events` mirror | Pending governed work requires Redis; action claims precede side effects. |
| Pre-tenant delivery leads | Redis lead/status records | Postgres `delivery_leads` mirror | Delivery status is the canonical lifecycle; operator workflow is a projection. |
| Tenant Customer Inquiries | Redis `leads:{tenant}` + `lead:{tenant}:*` | None | 90-day recent-activity window; this is not Strelva's sales lead or a CRM. |
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
| Org-layer accounts, memberships, subscriptions (phase 0) | Postgres `accounts`, `account_memberships`, `subscriptions`, `subscription_items`; `tenants.account_id` (nullable FK) | None | Migration `20260729180000_org_layer_phase0_accounts` applied to prod 2026-07-30. RLS enabled deny-by-default; service-role bypasses. **Dormant at the read level** — nothing reads these tables yet. `tenants.subscription_*` remains authoritative for billing. `NULL account_id` = standalone/solo tenant. `subscription_items` carries `tenant_id` and is in `deprovision.ts` `TENANT_SCOPED_TABLES`. |

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
not move on a tenant slug rename. Confirmed present as of 2026-07-15:

`connections:*`, `crm:*`, `reb:crm-lock:*`, `leads:*`, `lead:*`, `orders:*`, `order:*`,
`reb:reply-voice:*`, `reb:rewards:*`, `reb:booking:config:*`, `reb:booking:overrides:*`,
`reb:booking:slot:*`, `reb:content-autonomy:*`, `reb:engagement:*`, `threads:*`,
`goal:*`, `analytics:cfg:*`, `reb:report-cadence:*`, `reb:report-sent:*`,
`reb:scan:baseline:*`.

Caches (`reb:tenants:all`, content/page-config/google-meta/analytics/brief/domain-map
caches) are intentionally NOT rekeyed — they regenerate from Postgres.

## Known issues / TODO (2026-07-30)

Items resolved as of 2026-07-30:

- **FIXED** Missing `Cache-Control: private` on collections v1 routes — collections list
  and single-entry routes now send `Cache-Control: private`
  (`src/app/api/v1/collections/[tenant]/[type]/route.ts`).
- **FIXED** Split-brain between content and draft/version stores — `DATA_SOURCE` now has
  a prod hard-fail guard mirroring `CONTENT_SOURCE`
  (`src/lib/storage/draft-store.ts`).
- **FIXED** `SUPABASE_URL` missing from env examples and production checklist — added to
  `.env.production.example` and `scripts/production-checklist.ts`.
- **FIXED** `SECRETS_ENC_KEY` absent from env examples and production checklist — added
  to `.env.production.example` (with `openssl rand -hex 32` generation note) and
  `scripts/production-checklist.ts`. `SUPER_ADMIN_EMAILS` and `APPROVE_LINK_SECRET` also
  added.

Items still open:

- **[HIGH][bug] `google-meta:*`, `review-replies:recent:*`, `reb:review-nudge-sent:*`,
  `reb:order-review-request-sent:*`, and `reb:review-reply-declined:*` are NOT in the
  `authoritativePatterns` registry** (`src/lib/tenant-rename.ts` line ~32-55). These
  keys are Redis-authoritative (or durable operational markers) and will silently not
  move on a tenant rename. Add each to `authoritativePatterns` and update the
  completeness unit test assertions to cover them. The `google-meta:${t}` key is a plain
  JSON object; the blob rewriter handles embedded `tenant`/`tenantId` fields but the key
  itself must be SCAN-moved.

- **[MEDIUM][security] `INTERNAL_API_SECRET` is overloaded** — it serves as the domain-map
  auth key, the OAuth state secret fallback, and the approve-link signing fallback
  (`src/lib/approve-link.ts:40-44`, `src/lib/oauth-state.ts:15-16`,
  `src/app/api/internal/domain-map/route.ts:12-14`). A key compromise has wider blast
  radius than this table implies. Prefer dedicated named secrets for each role.

- **[MEDIUM][security] `INTERNAL_API_SECRET` empty-string bypass**: when the variable is
  unset or empty, the domain-map route and proxy can be reached unauthenticated
  (`src/proxy.ts:341`). Ensure `INTERNAL_API_SECRET` is set in production and add it to
  `scripts/production-checklist.ts`.
