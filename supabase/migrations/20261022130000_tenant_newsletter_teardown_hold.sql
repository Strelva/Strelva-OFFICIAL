-- Identify immutable newsletter holds; bounded, journaled unapplied successor.
begin;
set local lock_timeout='3s';
-- Bounded canonical341 baseline only. Refuse before CREATE/rename/write:
-- custom/delegated grants and default grants are never silently discarded.
do $baseline$
declare signature text; p record; a record; migrator oid:=(current_user::regrole)::oid;
begin
 if to_regclass('public.tenant_newsletter_teardown_function_journal') is not null
  or to_regprocedure('public.tenant_cleanup_teardown_blockers_before_newsletter(text)') is not null then
  raise exception 'newsletter_teardown_unsupported_baseline';
 end if;
 foreach signature in array array['public.tenant_cleanup_teardown_blockers(text)',
  'public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean)'] loop
  select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure(signature);
  if p.oid is null or p.proowner<>migrator or p.proacl is null or not p.prosecdef
   or p.proconfig is distinct from array['search_path=public, pg_temp']::text[]
   or p.prokind<>'f' or p.proisstrict or p.proleakproof or p.proparallel<>'u'
   or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 then raise exception 'newsletter_teardown_unsupported_baseline: %',signature; end if;
  if (select count(*) from aclexplode(p.proacl))<>case when signature='public.tenant_cleanup_teardown_blockers(text)' then 2 else 1 end then
   raise exception 'newsletter_teardown_unsupported_acl_baseline: %',signature;
  end if;
  for a in select * from aclexplode(p.proacl) loop
   if a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable
    or (a.grantee<>migrator and (signature<>'public.tenant_cleanup_teardown_blockers(text)' or a.grantee<>('service_role'::regrole)::oid)) then
    raise exception 'newsletter_teardown_unsupported_acl_baseline: %',signature;
   end if;
  end loop;
  if signature='public.tenant_cleanup_teardown_blockers(text)' then
   if p.lanname<>'sql' or p.provolatile<>'s' or not p.proretset
    or p.pronargdefaults<>0 or p.prorows<>1000
    or p.proargmodes is distinct from array['i','t','t','t','t']::"char"[]
    or p.proallargtypes is distinct from array['text'::regtype::oid,'bigint'::regtype::oid,'bigint'::regtype::oid,'bigint'::regtype::oid,'bigint'::regtype::oid]
    or p.proargnames is distinct from array['p_tenant_id','publications','reservations','booking_grants','bookings']::text[]
    or p.prosrc is distinct from $reader_source$
 select
  (select count(*) from public.website_document_publications p where p.tenant_id=p_tenant_id),
  (select count(*) from public.website_hosted_tenant_reservations r
    where r.tenant_id=p_tenant_id or r.tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id)),
  (select count(*) from public.public_website_booking_grants g
    where g.tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id)),
  (select count(*) from public.public_website_bookings b
    where b.tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id))
$reader_source$ then
    raise exception 'newsletter_teardown_unsupported_body_baseline: %',signature;
   end if;
  elsif p.lanname<>'plpgsql' or p.provolatile<>'v' or p.proretset or p.prorettype<>'jsonb'::regtype
   or p.pronargdefaults<>3 or p.prorows<>0 or p.proargmodes is not null or p.proallargtypes is not null
   or pg_get_expr(p.proargdefaults,0) is distinct from 'false, false, false'
   or p.proargnames is distinct from array['p_tenant_id','p_force','p_require_inquiry_export','p_retain_receipts']::text[]
   or p.prosrc is distinct from $helper_source$
declare v_stable uuid; v_status text; v_counts jsonb; v_paused bigint;
begin
  if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])$'
    or p_tenant_id=any(array['www','admin','app','api']::text[])
    or p_force is null or p_require_inquiry_export is null or p_retain_receipts is null then
    raise exception 'tenant_teardown_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
  select stable_id,subscription_status into v_stable,v_status from public.tenants where id=p_tenant_id for update;
  if not p_force and (p_tenant_id=any(array['gldf','rohlax']::text[])
    or v_status=any(array['active','trialing','past_due']::text[])
    or exists(select 1 from public.build_payments where tenant_id=p_tenant_id)) then
    raise exception 'tenant_teardown_active_subscription';
  end if;
  if exists(select 1 from public.website_document_publications where tenant_id=p_tenant_id)
    or exists(select 1 from public.website_hosted_tenant_reservations where tenant_id=p_tenant_id or tenant_stable_id=v_stable)
    or exists(select 1 from public.public_website_booking_grants where tenant_stable_id=v_stable)
    or exists(select 1 from public.public_website_bookings where tenant_stable_id=v_stable) then
    raise exception 'tenant_teardown_blocked_by_workspace_owned_records';
  end if;
  -- Failures after this point roll back the pause and all deletions together.
  if p_require_inquiry_export then perform public.assert_tenant_inquiry_export(p_tenant_id); end if;
  v_paused:=public.pause_tenant_systems(p_tenant_id);
  if p_require_inquiry_export then
    if p_retain_receipts then v_counts:=public.deprovision_tenant_rows_retained_after_inquiry_export(p_tenant_id);
    else v_counts:=public.deprovision_tenant_rows_after_inquiry_export(p_tenant_id); end if;
  elsif p_retain_receipts then v_counts:=public.deprovision_tenant_rows_retained(p_tenant_id);
  else v_counts:=public.deprovision_tenant_rows(p_tenant_id); end if;
  return jsonb_build_object('counts',v_counts,'paused',v_paused);
end $helper_source$ then
   raise exception 'newsletter_teardown_unsupported_body_baseline: %',signature;
  end if;
 end loop;
 -- PostgreSQL combines global and public-schema defaults for new objects.
 -- The named standard defaults are explicitly revoked below; custom ones refuse.
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
  where d.defaclrole=migrator and d.defaclnamespace in (0,'public'::regnamespace)
   and d.defaclobjtype in ('f','r') and (a.grantor<>migrator or a.is_grantable
    or a.grantee not in (0,migrator,('anon'::regrole)::oid,('authenticated'::regrole)::oid,('service_role'::regrole)::oid))) then
  raise exception 'newsletter_teardown_unsupported_default_acl_baseline';
 end if;
end $baseline$;

create table public.tenant_newsletter_teardown_function_journal (
 signature text primary key, before_definition text, before_acl aclitem[],
 owner_id oid not null, after_definition text, after_acl jsonb,
 check ((before_definition is null)=(before_acl is null))
);
alter table public.tenant_newsletter_teardown_function_journal enable row level security;
revoke all on public.tenant_newsletter_teardown_function_journal from public,anon,authenticated,service_role;
insert into public.tenant_newsletter_teardown_function_journal(signature,before_definition,before_acl,owner_id)
 select signature,pg_get_functiondef(signature::regprocedure),p.proacl,p.proowner
 from unnest(array['public.tenant_cleanup_teardown_blockers(text)',
 'public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean)']) signature
 join pg_proc p on p.oid=signature::regprocedure;
-- Keep the exact predecessor reader for an inverse without rebuilding its guards.
alter function public.tenant_cleanup_teardown_blockers(text) rename to tenant_cleanup_teardown_blockers_before_newsletter;
revoke all on function public.tenant_cleanup_teardown_blockers_before_newsletter(text) from public,anon,authenticated,service_role;
create function public.tenant_cleanup_teardown_blockers(p_tenant_id text)
returns table(publications bigint,reservations bigint,booking_grants bigint,bookings bigint,newsletter_issues bigint)
language sql stable security definer set search_path=public,pg_temp as $$
 select b.publications,b.reservations,b.booking_grants,b.bookings,
  (select count(*) from public.workspace_newsletter_issues where tenant_id=p_tenant_id)
 from public.tenant_cleanup_teardown_blockers_before_newsletter(p_tenant_id) b
$$;
revoke all on function public.tenant_cleanup_teardown_blockers(text) from public,anon,authenticated;
grant execute on function public.tenant_cleanup_teardown_blockers(text) to service_role;
create or replace function public.deprovision_tenant_guarded_before_cleanup(
  p_tenant_id text, p_force boolean default false,
  p_require_inquiry_export boolean default false, p_retain_receipts boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stable uuid; v_status text; v_counts jsonb; v_paused bigint;
begin
  if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])$'
    or p_tenant_id=any(array['www','admin','app','api']::text[])
    or p_force is null or p_require_inquiry_export is null or p_retain_receipts is null then
    raise exception 'tenant_teardown_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
  select stable_id,subscription_status into v_stable,v_status from public.tenants where id=p_tenant_id for update;
  if not p_force and (p_tenant_id=any(array['gldf','rohlax']::text[])
    or v_status=any(array['active','trialing','past_due']::text[])
    or exists(select 1 from public.build_payments where tenant_id=p_tenant_id)) then
    raise exception 'tenant_teardown_active_subscription';
  end if;
  if exists(select 1 from public.website_document_publications where tenant_id=p_tenant_id)
    or exists(select 1 from public.website_hosted_tenant_reservations where tenant_id=p_tenant_id or tenant_stable_id=v_stable)
    or exists(select 1 from public.public_website_booking_grants where tenant_stable_id=v_stable)
    or exists(select 1 from public.public_website_bookings where tenant_stable_id=v_stable) then
    raise exception 'tenant_teardown_blocked_by_workspace_owned_records';
  end if;
  if exists(select 1 from public.workspace_newsletter_issues where tenant_id=p_tenant_id) then
    raise exception 'tenant_teardown_blocked_by_newsletter_history';
  end if;
  -- Failures after this point roll back the pause and all deletions together.
  if p_require_inquiry_export then perform public.assert_tenant_inquiry_export(p_tenant_id); end if;
  v_paused:=public.pause_tenant_systems(p_tenant_id);
  if p_require_inquiry_export then
    if p_retain_receipts then v_counts:=public.deprovision_tenant_rows_retained_after_inquiry_export(p_tenant_id);
    else v_counts:=public.deprovision_tenant_rows_after_inquiry_export(p_tenant_id); end if;
  elsif p_retain_receipts then v_counts:=public.deprovision_tenant_rows_retained(p_tenant_id);
  else v_counts:=public.deprovision_tenant_rows(p_tenant_id); end if;
  return jsonb_build_object('counts',v_counts,'paused',v_paused);
end $$;
revoke all on function public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean) from public,anon,authenticated,service_role;

-- Do not merely journal accidental authority: assert the final closed boundary.
do $final_acl$
declare signature text; expected_service boolean; p record;
begin
 foreach signature in array array['public.tenant_cleanup_teardown_blockers(text)',
  'public.tenant_cleanup_teardown_blockers_before_newsletter(text)',
  'public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean)'] loop
  select * into p from pg_proc where oid=signature::regprocedure;
  expected_service:=signature='public.tenant_cleanup_teardown_blockers(text)';
  if p.proowner<>(current_user::regrole)::oid or p.proacl is null
   or (select count(*) from aclexplode(p.proacl))<>case when expected_service then 2 else 1 end
   or exists(select 1 from aclexplode(p.proacl) a
   where a.grantor<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable
    or (a.grantee<>p.proowner and (not expected_service or a.grantee<>('service_role'::regrole)::oid)))
   or (expected_service and not has_function_privilege('service_role',p.oid,'EXECUTE')) then
   raise exception 'newsletter_teardown_final_acl_mismatch: %',signature;
  end if;
 end loop;
 if exists(select 1 from pg_class t cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
  where t.oid='public.tenant_newsletter_teardown_function_journal'::regclass and a.grantee<>t.relowner) then
  raise exception 'newsletter_teardown_journal_acl_mismatch';
 end if;
end $final_acl$;

-- Every created/replaced/renamed function is checked on inverse, including the
-- closed predecessor. This records actual catalog definitions and ACLs.
insert into public.tenant_newsletter_teardown_function_journal(signature,owner_id)
 select 'public.tenant_cleanup_teardown_blockers_before_newsletter(text)',proowner
 from pg_proc where oid='public.tenant_cleanup_teardown_blockers_before_newsletter(text)'::regprocedure;
update public.tenant_newsletter_teardown_function_journal j set
 after_definition=pg_get_functiondef(j.signature::regprocedure),
 after_acl=(select coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
  order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb)
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=j.signature::regprocedure);
commit;
