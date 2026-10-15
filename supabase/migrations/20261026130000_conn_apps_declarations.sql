-- ADR0016: closed package behavior declares outside accounts. Historical
-- immutable declarations derive the missing field at validation/read time only.
begin;
set local lock_timeout='3s';
create schema conn_apps_rollback;
revoke all on schema conn_apps_rollback from public,anon,authenticated,service_role;
create table conn_apps_rollback.functions(signature text primary key,before_definition text,after_fingerprint text);
alter table conn_apps_rollback.functions enable row level security;
revoke all on conn_apps_rollback.functions from public,anon,authenticated,service_role;
insert into conn_apps_rollback.functions(signature,before_definition)
select signature,pg_get_functiondef(signature::regprocedure) from unnest(array[
 'public.system_package_behavior(jsonb,text[])',
 'public.system_package_assert_declaration(jsonb,jsonb,text[])']) signature;
-- Preserve the exact closed runtime adapters. No new executable kind is added.
do $$ declare definition text; begin
 select before_definition into definition from conn_apps_rollback.functions where signature='public.system_package_behavior(jsonb,text[])';
 execute replace(definition,'FUNCTION public.system_package_behavior(', 'FUNCTION public.system_package_behavior_before_conn_apps(');
end $$;
revoke all on function public.system_package_behavior_before_conn_apps(jsonb,text[]) from public,anon,authenticated,service_role;
insert into conn_apps_rollback.functions(signature) values('public.system_package_behavior_before_conn_apps(jsonb,text[])');

create or replace function public.system_package_behavior(p_definition jsonb,p_bindings text[]) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare behavior jsonb; requirements jsonb:='[]'::jsonb;
begin
 behavior:=public.system_package_behavior_before_conn_apps(p_definition,p_bindings);
 if behavior->'outsideEffects' @> '["email"]'::jsonb then
  requirements:=requirements||jsonb_build_array(jsonb_build_object('provider','resend','access','act','optional',false,'purpose','Send System email to approved recipients'));
 end if;
 if behavior->'outsideEffects' @> '["google"]'::jsonb then
  requirements:=requirements||jsonb_build_array(jsonb_build_object('provider','google_business_profile','access','act','optional',false,'purpose','Apply approved Google Business Profile changes'));
 end if;
 return behavior||jsonb_build_object('requiredConnections',requirements);
end $$;

create or replace function public.system_package_assert_declaration(p_definition jsonb,p_declaration jsonb,p_bindings text[]) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare actual jsonb; declared jsonb; k text; value jsonb; item jsonb;
begin
 actual:=public.system_package_behavior(p_definition,p_bindings);
 if p_declaration is null or jsonb_typeof(p_declaration) is distinct from 'object' or
  (p_declaration-array['recordsRead','recordsWritten','businessRecordFields','outsideEffects','bindingKinds','dataLeavingBusiness','requiredConnections'])<>'{}'::jsonb then
  raise exception 'system_package_declaration_required';
 end if;
 declared:=p_declaration;
 -- Old published revisions keep their original declaration bytes and digest.
 if not declared ? 'requiredConnections' then declared:=declared||jsonb_build_object('requiredConnections',actual->'requiredConnections'); end if;
 for k in select jsonb_object_keys(actual) loop
  if jsonb_typeof(declared->k) is distinct from 'array' or jsonb_array_length(declared->k)>100 then raise exception 'system_package_declaration_invalid'; end if;
  for value in select jsonb_array_elements(actual->k) loop
   if not (declared->k @> jsonb_build_array(value)) then raise exception 'system_package_declaration_exceeded'; end if;
  end loop;
 end loop;
 for item in select jsonb_array_elements(declared->'requiredConnections') loop
  if jsonb_typeof(item) is distinct from 'object' or (item-array['provider','access','optional','purpose'])<>'{}'::jsonb
   or coalesce(item->>'provider','') not in ('google_business_profile','google_calendar','calendly','highlevel','connected_site','stripe','resend','instagram')
   or coalesce(item->>'access','') not in ('read','act') or jsonb_typeof(item->'optional') is distinct from 'boolean'
   or jsonb_typeof(item->'purpose') is distinct from 'string' or char_length(btrim(item->>'purpose')) not between 1 and 200 then
   raise exception 'system_package_declaration_invalid';
  end if;
 end loop;
 -- Canonical set equality keeps Works with truthful: no unused provider claims.
 if not ((actual->'requiredConnections') @> (declared->'requiredConnections')) then
  raise exception 'system_package_declaration_exceeded';
 end if;
end $$;
-- Existing helper ACLs stay private; exposed commands retain current authority.
revoke all on function public.system_package_behavior(jsonb,text[]),public.system_package_assert_declaration(jsonb,jsonb,text[]) from public,anon,authenticated,service_role;
update conn_apps_rollback.functions s set after_fingerprint=md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
from pg_proc p where p.oid=s.signature::regprocedure;
notify pgrst,'reload schema';
commit;
