# Strelva migration integrity audit

Audit scope: read-only review of the dirty `strelvav2` working tree. I read the
repository instructions, `CONTEXT.md`, `docs/strelvav2.md`, the September 15
acceptance ledger, the persistence/auth/governance records, the workspace and
offering migrations, and their focused SQL/server tests. This is a sampled audit,
not a production certification.

## Scores

Scores use a 0-10 readiness scale: 0 means no trustworthy evidence for the
dimension, 5 means a meaningful local implementation with material unverified
boundaries, and 10 means the relevant behavior is proven through the intended
release environment, failure paths, and operating evidence. Confidence is my
confidence in the score from the inspected evidence, not confidence that the
product is safe in every uninspected path.

| Dimension | Score | Confidence | Basis |
| --- | ---: | --- | --- |
| Migration integrity | 6/10 | High | Additive migrations have strong constraints and focused SQL checks, but the aggregate harness starts from a synthetic schema and does not replay the full migration chain or a staging database. |
| Tenant/workspace isolation | 7/10 | Medium-high | New workspace, handoff, application, agent-access, and website RPCs bind identity, membership, workspace, and resource keys. The application uses a service-role client, so server adapters remain the live authorization boundary and one inquiry economics path explicitly depends on that adapter. |
| Execution authority and economics | 6/10 | High | Native execution has service-only RPCs, idempotency, reservations, measured/unknown outcomes, and retry treatment. Model planning has request/token/deadline bounds and rate limiting but is not connected to a dollar budget or usage receipt. |
| Website continuity | 7/10 local / 3/10 release | High | Stable tenant identity, slug cascades, binding tombstones, rename/revoke/delete behavior, and explicit business-versus-tenant access are well represented locally. No live migration, real Auth/Postgres browser proof for the newest website paths, or deployed continuity evidence exists. |
| Release safety | 2/10 | High | The branch is explicitly internal and dirty; the records hold production migration, deployment, provider, billing, and customer activation. This score describes release readiness, not code quality. |
| Product experience continuity | 5/10 | Medium | The business-to-offering-to-website relationship is becoming legible and preserves existing website ownership. The customer still has to understand separate business, tenant website, offering installation, assignment, allowance, and work concepts, while several promising journeys remain fixture or local-only evidence. |

## Established protections

1. **Website binding preserves existing tenant authority.**
   `supabase/migrations/20260915060000_offering_websites.sql:1-2` explicitly
   states that attaching a business offering to a managed website does not
   change tenant membership, domain/routing, or billing/provider terms. The
   binding stores immutable tenant identity and labels at
   `:4-24`, keeps active/revoked history, and uses a unique active binding per
   stable tenant at `:25-29`. `bind_offering_website` requires the business
   manager and current tenant owner membership at `:133-156`; business access
   alone cannot open the site. The route/service presentation also preserves
   that distinction (`src/platform/offerings/service.ts:162-180`).

2. **The website failure and lifecycle cases are tested in isolation.**
   `tests/offering-websites-schema.sql:64-223` covers non-owner denial,
   idempotent replay, one-tenant/one-business binding, business visibility
   without website access, install payload validation, rename label refresh,
   revision-checked revoke, and tenant deletion retaining an unavailable
   tombstone. This is good evidence for the intended local data model.

3. **Workspace and application writes are bounded by database transitions.**
   The workspace migration uses composite `(id, workspace_id)` foreign keys for
   delegations and handoffs (`supabase/migrations/20260905190000_release_one_workspaces.sql:44-95`).
   Application release and record mutations are service-only and go through
   locked, manager-authorized RPCs
   (`supabase/migrations/20260914020000_application_releases.sql:60-67,
   :172-218, :528-617`). Application use access additionally binds the
   recipient to verified email, current release, expiry, view scope, and an
   idempotent receipt (`supabase/migrations/20260914030000_application_use_access.sql:79-245, :485-674`).

4. **Handoffs now require an explicit destination.**
   The newer destination migration rejects the stale signature rather than
   inferring a customer workspace (`supabase/migrations/20260914010000_handoff_destinations.sql:205-227`).
   The current function checks recipient identity before replay and requires
   either an existing customer membership or a named new customer workspace in
   the same transaction (`:70-155`). A copied application is rejected before a
   destination or copy is created (`:125-129`).

5. **Tenant slug and stable identity have separate continuity mechanisms.**
   The slug cascade migration applies `ON UPDATE CASCADE` to slug foreign keys
   while leaving immutable stable-ID references alone
   (`supabase/migrations/20260715160000_tenant_slug_on_update_cascade.sql:4-12,
   :15-42`). The rename implementation performs the database rename first and
   reports Redis catch-up errors for rerun (`src/lib/tenant-rename.ts:104-114,
   :211-234`). The current authoritative registry includes provider secrets,
   CRM, leads/orders, bookings, reviews, and inquiry delivery keys
   (`src/lib/tenant-rename.ts:24-73`). The admin endpoint is super-admin-only
   and records the rename result (`src/app/api/admin/tenants/[id]/rename/route.ts:15-18, :51-68`).

6. **Execution authority is separated from model output.**
   Planner instructions prohibit direct tools, publishing, messaging, and
   spending (`src/products/work-plans/server.ts:56-67`); the server resolves
   generated operation IDs against the supported capability catalog and rejects
   unknown IDs (`:211-227`). Native output persistence uses an idempotency key,
   current plan revision, source references, and a durable receipt
   (`:600-634`).

7. **The economics migration has real local invariants.**
   Runtime execution rows are bounded by kind, maximum, attribution, effect,
   and status (`supabase/migrations/20260912010000_budgeted_execution.sql:3-20`).
   The execution command locks the job, limits concurrent reservations, prevents
   runtime/operator ledger mixing, records accepted/none/unknown effects, and
   excludes Strelva retries from customer billing (`:54-140`). Direct table
   access is revoked and mutation is service-role-only (`:22-24, :145-146`).

## Material findings and proof limits

### 1. The aggregate SQL proof is additive, not a full migration replay

**Finding:** The focused SQL gate is useful and passed, but its shape cannot
prove upgrade safety from the actual production schema. The harness creates only
roles, a minimal `users` table, and a minimal `tenants` table
(`scripts/check-workspace-sql.sh:54-70`), then applies a selected set of new
migrations (`:72-144`). It does not apply the complete historical chain, inspect
real production drift, or run against a staging clone. The website fixture also
manually creates tenant columns and memberships before the website migration
(`:129-143`).

**Established:** The selected migration/test sequence passed locally in an
isolated PostgreSQL cluster, including workspace, recovery, economics,
application release/use, handoff, standing execution, installations,
assignments, allowances, agent access, offering websites, customer mapping, and
inquiry workspace checks.

**Unverified:** Ordering conflicts, missing prerequisites, existing-row backfill
failures, privilege drift, or data-dependent constraints in the full historical
schema and hosted database.

**Recommended check:** Build a disposable database by replaying every migration
from the repository in order, load anonymized representative rows, and run the
same failure-path assertions. Before any production action, compare migration
history and object/privilege shape against a hosted staging clone. Keep the
synthetic aggregate gate as a fast additive check, but do not treat it as a
release gate for data migration safety.

### 2. Service-role authorization is the live boundary and needs adapter coverage

**Finding:** Workspace tables explicitly revoke browser access and grant the
service role (`supabase/migrations/20260905190000_release_one_workspaces.sql:132-145`).
The auth architecture correctly documents that service-role Postgres bypasses
RLS, making application guards the live boundary. This is a coherent local
choice, but it makes every service adapter a security-critical caller. The job
economics migration says existing inquiry tenant access is rechecked by the
server native adapter rather than in SQL
(`supabase/migrations/20260912010000_budgeted_execution.sql:379-386`).

**Established:** Workspace, application, agent, handoff, offering, and website
focused SQL tests pass; routes require confirmed Supabase identity and the
service layer checks workspace/business/tenant access before mutation.

**Unverified:** No complete caller inventory proves that every future or legacy
service-role call preserves those checks. A new adapter that calls the RPC with
an actor and target from different tenants could bypass the protection that RLS
would otherwise provide.

**Recommended check:** Add a CI inventory or static rule for service-role
repositories/RPCs and require each entry to cite its actor, tenant/workspace
guard, and failure-path test. Add negative integration tests that call every
public server adapter with a valid user from a different workspace/tenant,
including inquiry economics where the SQL comment places the check outside the
RPC.

### 3. Model planning has bounded calls but no spend receipt

**Finding:** `defaultGenerate` returns provider output only
(`src/products/work-plans/server.ts:158-187`). It enforces a 20-second shared
deadline, 1,800 output-token ceiling, no SDK retries, and fallback behavior, and
the route rate-limits planning to five requests per minute
(`src/app/api/work-plans/route.ts:24-26, :114-130`). It does not reserve a
job-economics budget or record provider usage. The acceptance ledger makes the
same limitation explicit (`docs/strelvav2-horizontal-acceptance.md:84-90`).

**Established:** Request size, identity, saved-work capacity, deadline, output
schema, operation allowlist, and route rate limit are present. Native execution
after planning has durable output receipts.

**Unverified:** Cost attribution, provider invoice reconciliation, retry cost,
and payer authorization for a real model call.

**Recommended check:** Decide whether planning is a Strelva cost, a payer-funded
execution, or a separately capped capability. Then create the economics job and
reservation before the provider call, settle it with actual/unknown usage, and
test lost responses, fallback calls, timeout, provider rejection, and retry
exclusion. Do not describe planning as fully spend-controlled until that exists.

### 4. Tenant rename is intentionally eventually consistent for Redis

**Finding:** The database rename is the commit point and Redis is best-effort;
the implementation documents that a partial Redis failure can leave stale keys
until a rerun (`src/lib/tenant-rename.ts:12-15, :104-114`). This is a reasonable
operating model for a mutable slug, but the user-facing continuity risk is real:
provider secrets, review deduplication/veto state, inquiry delivery checkpoints,
and other authoritative operational state can be unavailable under the new slug
until recovery finishes.

**Established:** The registry is explicit, the rename is super-admin-only, the
DB cascades atomically, and the result includes Redis errors. Unit tests cover
anchored key rewriting and input guards (`src/__tests__/tenant-rename.test.ts:4-35`);
website/inquiry SQL tests cover stable identity and label continuity.

**Unverified:** There is no inspected hosted rehearsal proving interruption and
rerun behavior across all authoritative Redis types. The script
`scripts/verify-tenant-rename.ts` is an integration proof harness, not evidence
that it ran in this audit.

**Recommended check:** Run a disposable Redis+Postgres rehearsal with every
registered authoritative key type, inject failure after each phase, rerun the
rekey, and assert no old authoritative key or embedded old tenant identity
remains. Make the admin response operationally prominent when `redisErrors` is
non-empty; treat the rename as incomplete until the catch-up is green.

### 5. Release and customer continuity are explicitly unproven

**Finding:** The repository records are unusually clear that this is local
implementation evidence. `docs/strelvav2.md:18-18` says the first slice is not
production readiness; `:39-42` holds merge, deploy, production migration, and
live provider activation. The September 15 ledger says the new website and
offering paths still require real local Auth/Postgres browser execution and
provider acceptance (`docs/strelvav2-horizontal-acceptance.md:30-48`), and says
no migration has reached a live database (`:41-48`). `CONTEXT.md:169-178` also
records that the earlier production verification did not expose the new
workspace schema or prove authenticated production behavior.

**Established:** Local focused tests and the aggregate isolated SQL command
passed. Root separately reported passing typecheck, boundaries, version parity,
and 27 focused workspace/economics/learning tests.

**Unverified:** Hosted migration replay, production auth, existing client-site
continuity, live domain/provider behavior, billing, and human product acceptance.

**Recommended check:** Keep the release hold. The next evidence should be a
staging full-chain migration and authenticated browser run against representative
tenant data, followed by a reviewed migration plan and rollback/forward-repair
procedure. Only then prepare a production action for explicit authorization.

## Product experience and business implications

The strongest product boundary is now visible: a business can install an
offering and see a website association without receiving website access by
accident. That protects customer ownership and leaves room for agency-managed
work. The customer-facing cost is conceptual load. The workspace currently joins
business, managed website tenant, offering installation, assignments, allowances,
and saved work. The interface should answer, at the point of action, three
questions: “which business pays or owns this?”, “which website or work does it
change?”, and “what access or ongoing responsibility follows?”

The current local implementation handles many of those distinctions in service
state (`src/platform/offerings/service.ts:162-180`) and migration constraints,
but local fixtures are not evidence that a customer can understand the
relationship under rename, revoked access, provider-requested responsibility, or
an unavailable installation. Those states should be part of the next real
Auth/Postgres journey and human review, alongside the technical checks.

## Test status

Ran, read-only:

```text
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
```

Result: passed. The command's isolated cluster checks passed for workspace
schema/recovery, tracker, economics and runtime, document/work-plan output,
context, product learning, responsibilities, application lifecycle and use,
handoff destinations, standing execution, installations, assignments,
allowances, agent access, offering websites, customer mapping, and inquiry
workspace. The command explicitly stops and preserves only a temporary local
cluster; it does not connect to or migrate production.

No product files were edited. No deployment, live provider call, production
migration, external write, or billing action was performed. Root's broad checks
and 27 focused tests are reported separately by the parent agent.
