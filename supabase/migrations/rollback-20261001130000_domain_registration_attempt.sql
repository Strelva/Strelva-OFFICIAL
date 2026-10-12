-- Rollback for 20261001130000_domain_registration_attempt.sql
-- Forward SHA-256: cb22976e2bfcf20804394c38e62c98a6da8905c8686124b371444ff3eb9e7fde
-- Batch 2: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
lock table public."domain_claims" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261001130000_domain_claims" as table public."domain_claims";
revoke all on release_rollback_archive."m20261001130000_domain_claims" from public, anon, authenticated, service_role;
alter table public."domain_claims" drop constraint "domain_claims_registration_attempt_check";
alter table public."domain_claims" drop column "registration_attempt";
commit;
