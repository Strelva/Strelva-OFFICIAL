-- Domain uniqueness on the REAL routing columns (2026-07-14 follow-up to 20260714200746).
-- That earlier migration put a unique index on domain_claims, but PG `domain_claims` is vestigial
-- (0 rows, 0 writers; rowToTenant hardcodes domainClaims: []). Actual host->tenant routing
-- (buildDomainMap / /api/internal/domain-map) resolves off tenants.production_domain, admin_domain,
-- and custom_domains. The /api/admin/provision + admin-create paths write production_domain with NO
-- collision check at either layer, so two tenants could be pointed at one domain.
--
-- Safe to apply during active onboarding: every write path coalesces an empty domain to NULL (never
-- ''), and Postgres treats NULLs as distinct, so any number of domain-less in-flight tenants coexist.
-- Verified 0 existing collisions on production_domain / admin_domain before applying.
--
-- Note: custom_domains is a text[] and can't be covered by a plain unique index — that array still
-- relies on the app-level guard (validateTenantDomains), which also needs wiring into the provision
-- path (see PR) so a collision returns a friendly 409 instead of a 23505/500.

create unique index if not exists tenants_production_domain_unique
  on tenants (lower(production_domain))
  where production_domain is not null and production_domain <> '';

create unique index if not exists tenants_admin_domain_unique
  on tenants (lower(admin_domain))
  where admin_domain is not null and admin_domain <> '';
