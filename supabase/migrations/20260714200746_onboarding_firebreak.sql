-- Onboarding firebreak (2026-07-14): correctness + identity-hedge fixes ahead of the 2->6 client scale-up.
-- All additive / low-risk. Rationale + full triage: vault 1-projects/scaffold-web/ontology-redesign-triage-2026-07-14.

-- 1) unified_events.id type. The runtime generates TEXT ids (`evt_<ts>_<rand>`) but the column was uuid,
--    so every Postgres event dual-write silently failed (thrown `invalid input syntax for type uuid`,
--    swallowed by bestEffort in repositories.ts) -- the PG event shadow has never received a row.
--    App ids are text; keep a uuid-as-text fallback default so any path that omits id still satisfies
--    NOT NULL. No child FK references this column, no RLS policy compares its type.
alter table unified_events alter column id type text using id::text;
alter table unified_events alter column id set default gen_random_uuid()::text;

-- 2) Global domain uniqueness. domain_claims PK is (tenant_id, domain), so two DIFFERENT tenants could
--    each claim the same domain with no DB conflict. Enforce one live claim per normalized (lower)
--    domain; exclude dead conflict/error rows so recording a conflict never trips the constraint.
create unique index if not exists domain_claims_domain_unique
  on domain_claims (lower(domain))
  where status not in ('conflict', 'error');

-- 3) Stable tenant identity -- an option-value hedge, NOT the identity-spine rewrite. tenants PK is the
--    mutable subdomain slug (load-bearing across ~30 tables + RLS). Add a stable uuid now, while row
--    count is tiny, so a future migration off the slug is possible without a mass backfill. Unused by
--    app code today; nothing reads it yet.
alter table tenants add column if not exists stable_id uuid not null default gen_random_uuid();
create unique index if not exists tenants_stable_id_key on tenants (stable_id);
