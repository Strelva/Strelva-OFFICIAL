-- Database removal commits with an outstanding cleanup receipt. A crash or
-- unavailable external/cache store must not make this slug reusable.
begin;
set local lock_timeout = '3s';
create table public.tenant_deprovision_cleanup (
  tenant_id text primary key,
  receipt_id uuid not null unique default gen_random_uuid(),
  tenant_stable_id uuid,
  database_receipt jsonb not null,
  redis_complete boolean not null default false,
  provider_complete boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.tenant_deprovision_cleanup enable row level security;
revoke all on public.tenant_deprovision_cleanup from public,anon,authenticated,service_role;

-- Same exact protected identities as 220900's atomic execution guard. No
-- lock or pause: previews must remain valid inside BEGIN READ ONLY.
create function public.tenant_cleanup_teardown_blockers(p_tenant_id text)
returns table(publications bigint,reservations bigint,booking_grants bigint,bookings bigint)
language sql stable security definer set search_path=public,pg_temp as $$
 select
  (select count(*) from public.website_document_publications p where p.tenant_id=p_tenant_id),
  (select count(*) from public.website_hosted_tenant_reservations r
    where r.tenant_id=p_tenant_id or r.tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id)),
  (select count(*) from public.public_website_booking_grants g
    where g.tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id)),
  (select count(*) from public.public_website_bookings b
    where b.tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id))
$$;
revoke all on function public.tenant_cleanup_teardown_blockers(text) from public,anon,authenticated;
grant execute on function public.tenant_cleanup_teardown_blockers(text) to service_role;

create function public.tenant_cleanup_receipt(p_slug text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',receipt_id,'tenantId',tenant_id,'databaseDeleted',true,
   'redisComplete',redis_complete,'providerComplete',provider_complete,
   'complete',redis_complete and provider_complete,'slugReusable',false,'summary',summary,
   'databaseReceipt',database_receipt)
 from public.tenant_deprovision_cleanup where tenant_id=p_slug
$$;

alter function public.deprovision_tenant_guarded(text,boolean,boolean,boolean)
  rename to deprovision_tenant_guarded_before_cleanup;
revoke all on function public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean)
 from public,anon,authenticated,service_role;
create function public.deprovision_tenant_guarded(
 p_tenant_id text,p_force boolean default false,
 p_require_inquiry_export boolean default false,p_retain_receipts boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.tenant_deprovision_cleanup%rowtype; v_stable uuid; v_result jsonb;
begin
 if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])$'
   or p_force is null or p_require_inquiry_export is null or p_retain_receipts is null then
   raise exception 'tenant_teardown_invalid';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
 select * into v_existing from public.tenant_deprovision_cleanup where tenant_id=p_tenant_id for update;
 select stable_id into v_stable from public.tenants where id=p_tenant_id for update;
 if v_existing.receipt_id is not null then
   if v_stable is not null then raise exception 'tenant_cleanup_identity_conflict'; end if;
   return v_existing.database_receipt || jsonb_build_object('cleanup',public.tenant_cleanup_receipt(p_tenant_id));
 end if;
 v_result:=public.deprovision_tenant_guarded_before_cleanup(p_tenant_id,p_force,p_require_inquiry_export,p_retain_receipts);
 insert into public.tenant_deprovision_cleanup(tenant_id,tenant_stable_id,database_receipt)
 values(p_tenant_id,v_stable,v_result);
 return v_result || jsonb_build_object('cleanup',public.tenant_cleanup_receipt(p_tenant_id));
end $$;

create function public.finish_tenant_deprovision_cleanup(
 p_tenant_id text,p_receipt_id uuid,p_redis_complete boolean,p_provider_complete boolean,p_summary jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_redis_complete is null or p_provider_complete is null or jsonb_typeof(p_summary) is distinct from 'object'
   then raise exception 'tenant_cleanup_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
 if exists(select 1 from public.tenants where id=p_tenant_id) then raise exception 'tenant_cleanup_identity_conflict'; end if;
 update public.tenant_deprovision_cleanup set
 redis_complete=redis_complete or p_redis_complete,provider_complete=provider_complete or p_provider_complete,
 summary=p_summary,updated_at=clock_timestamp()
 where tenant_id=p_tenant_id and receipt_id=p_receipt_id;
 if not found then raise exception 'tenant_cleanup_receipt_changed'; end if;
 return public.tenant_cleanup_receipt(p_tenant_id);
end $$;

create function public.tenant_cleanup_reuse_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||new.id,7416));
 -- Retained identity is not a permission to reallocate a slug. A second
 -- cleanup worker or old slug-scoped writer could still finish after another
 -- worker confirmed cleanup. Generation-safe reuse needs a separate protocol.
 if exists(select 1 from public.tenant_deprovision_cleanup where tenant_id=new.id)
   then raise exception 'tenant_slug_retired'; end if;
 return new;
end $$;
create trigger tenant_cleanup_reuse_guard before insert or update of id on public.tenants
 for each row execute function public.tenant_cleanup_reuse_guard();
revoke all on function public.tenant_cleanup_receipt(text),
 public.deprovision_tenant_guarded(text,boolean,boolean,boolean),
 public.finish_tenant_deprovision_cleanup(text,uuid,boolean,boolean,jsonb),
 public.tenant_cleanup_reuse_guard() from public,anon,authenticated;
grant execute on function public.tenant_cleanup_receipt(text),
 public.deprovision_tenant_guarded(text,boolean,boolean,boolean),
 public.finish_tenant_deprovision_cleanup(text,uuid,boolean,boolean,jsonb) to service_role;
commit;
