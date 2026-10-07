-- Run immediately before batch 4, on the separately approved target.
-- Captures metadata only; no business rows. Refuses an existing capture.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
create schema if not exists release_rollback_baseline;
revoke all on schema release_rollback_baseline from public, anon, authenticated, service_role;
create table release_rollback_baseline.m20261007180000_billing_grants (
  relation_name text primary key,
  relation_oid oid not null,
  owner_oid oid not null,
  grants aclitem[] not null
);
revoke all on release_rollback_baseline.m20261007180000_billing_grants
  from public, anon, authenticated, service_role;
lock table public.accounts, public.account_memberships, public.subscriptions,
  public.subscription_items in access share mode;
insert into release_rollback_baseline.m20261007180000_billing_grants
select c.relname, c.oid, c.relowner, coalesce(c.relacl, acldefault('r', c.relowner))
from pg_class c where c.oid in ('public.accounts'::regclass,
  'public.account_memberships'::regclass, 'public.subscriptions'::regclass,
  'public.subscription_items'::regclass);
do $capture_guard$
begin
  if (select count(*) from release_rollback_baseline.m20261007180000_billing_grants) <> 4
    or exists(select 1 from release_rollback_baseline.m20261007180000_billing_grants b,
      lateral aclexplode(b.grants) a where a.grantor <> b.owner_oid) then
    raise exception 'billing_grant_capture_incomplete_or_nonowner_grantor';
  end if;
end; $capture_guard$;
commit;
