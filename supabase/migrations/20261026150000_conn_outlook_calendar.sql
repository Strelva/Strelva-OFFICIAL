-- ADR0016: Outlook calendar becomes a Connection provider. Metadata only; no
-- provider call, no credential and no flag. Bodies are the newest definitions
-- (conn_core_holders and conn_apps_declarations) plus the outlook_calendar branch.
begin;
set local lock_timeout='3s';
create schema conn_outlook_rollback;
revoke all on schema conn_outlook_rollback from public,anon,authenticated,service_role;
create table conn_outlook_rollback.functions(signature text primary key,before_definition text,after_fingerprint text);
alter table conn_outlook_rollback.functions enable row level security;
revoke all on conn_outlook_rollback.functions from public,anon,authenticated,service_role;
insert into conn_outlook_rollback.functions(signature,before_definition)
select signature,pg_get_functiondef(signature::regprocedure) from unnest(array[
 'public.connection_provider_area(text)',
 'public.connection_holder_usable(uuid,uuid,text,text,jsonb,jsonb)',
 'public.connection_source_workspace(text,text,boolean)',
 'public.connection_lock_source(text,text)',
 'public.system_package_assert_declaration(jsonb,jsonb,text[])']) signature;

alter table public.connection_holders drop constraint connection_holders_provider_check,
 add constraint connection_holders_provider_check check(provider in ('google_business_profile','google_calendar','outlook_calendar','calendly','highlevel','connected_site','stripe','resend','instagram'));

create or replace function public.connection_provider_area(p_provider text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_provider when 'google_business_profile' then 'google' when 'google_calendar' then 'bookings' when 'outlook_calendar' then 'bookings'
 when 'calendly' then 'bookings' when 'connected_site' then 'website' when 'instagram' then 'website' else null end
$$;
create or replace function public.connection_holder_usable(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_provider text,p_account jsonb,p_access jsonb) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope jsonb; agency uuid; holder uuid; area text;
begin
 scope:=public.read_connection_actor_scope(p_workspace_id,p_user_id,p_verified_email);
 if not coalesce(public.connection_holder_valid(p_account,false),false) or not coalesce(public.connection_holder_valid(p_access,true),false) then return false; end if;
 agency:=case when p_access->>'kind'='agency' then (p_access->>'workspaceId')::uuid when p_account->>'kind'='agency' then (p_account->>'workspaceId')::uuid else null end;
 if agency is not null and agency<>p_workspace_id and not (scope->'actingAgencyWorkspaceIds' ? agency::text) then return false; end if;
 area:=public.connection_provider_area(p_provider);
 if p_account->>'kind'='business' and (p_account->>'workspaceId')::uuid<>p_workspace_id then return false; end if;
 if p_account->>'kind'='agency' then
 holder:=(p_account->>'workspaceId')::uuid;
 if not exists(select 1 from public.workspaces where id=holder and kind='agency') then return false; end if;
 if holder<>p_workspace_id and (holder is distinct from agency or (area is not null and not public.connection_agency_holds_area(holder,p_workspace_id,area))) then return false; end if;
 end if;
 if p_access->>'kind'='agency' then
 holder:=(p_access->>'workspaceId')::uuid;
 if not exists(select 1 from public.workspaces where id=holder and kind='agency') then return false; end if;
 if holder<>p_workspace_id and (holder is distinct from agency or (area is not null and not public.connection_agency_holds_area(holder,p_workspace_id,area))) then return false; end if;
 end if;
 -- Provider-specific holder contracts. No broad platform default for legacy rows.
 return case p_provider
 when 'google_business_profile' then p_account->>'kind' in ('business','agency')
 when 'highlevel' then p_account->>'kind'='agency'
 when 'connected_site' then p_account->>'kind' in ('business','agency') and p_access->>'kind'='platform'
 when 'stripe' then p_access->>'kind'='platform'
 when 'resend' then p_account->>'kind'='platform' and p_access->>'kind'='platform'
 when 'google_calendar' then p_account->>'kind'='business' and p_access->>'kind'='platform'
 when 'outlook_calendar' then p_account->>'kind'='business' and p_access->>'kind'='platform'
 when 'calendly' then p_account->>'kind'='business' and p_access->>'kind'='platform'
 when 'instagram' then p_account->>'kind'='business' and p_access->>'kind'='platform'
 else false end;
end $$;
create or replace function public.connection_source_workspace(p_provider text,p_ref text,p_connected boolean) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_ref_id uuid; owner uuid; suffix text; generation_text text; read_grant boolean:=false;
begin
 if left(p_ref,char_length(p_provider)+1) is distinct from p_provider||':' then return null; end if;
 suffix:=substr(p_ref,char_length(p_provider)+2);
 if p_provider='stripe' then
 generation_text:=split_part(suffix,':',2);
 if generation_text !~ '^(0|[1-9][0-9]{0,18})$' or array_length(string_to_array(suffix,':'),1)<>2 then return null; end if;
 suffix:=split_part(suffix,':',1);
 elsif p_provider='google_business_profile' and left(suffix,11)='read-grant:' then
 read_grant:=true; suffix:=substr(suffix,12);
 end if;
 if suffix !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return null; end if;
 v_ref_id:=suffix::uuid;
 if p_provider in ('google_calendar','outlook_calendar') then
 select workspace_id into owner from public.workspace_calendar_connections c where c.id=v_ref_id
 and c.provider=case p_provider when 'google_calendar' then 'google' else 'outlook' end
 and (case when p_connected then c.status='connected' else c.status in ('authorized','connected') end);
 elsif p_provider='google_business_profile' and read_grant then
 select g.workspace_id into owner from public.workspace_google_read_grants g where g.workspace_id=v_ref_id and g.status='connected';
 elsif p_provider='google_business_profile' then
 select b.workspace_id into owner from public.workspace_account_bindings b where b.provider='google' and b.status='connected'
 and (b.id=v_ref_id or exists(select 1 from public.workspace_google_locations l where l.id=v_ref_id and l.binding_id=b.id and l.workspace_id=b.workspace_id));
 elsif p_provider='connected_site' then
 select business_workspace_id into owner from public.connected_sites c where c.id=v_ref_id and c.status='active' and (not p_connected or c.verified_at is not null);
 elsif p_provider='highlevel' then
 select workspace_id into owner from public.agency_source_connections c where c.id=v_ref_id and c.provider='gohighlevel' and c.status='connected';
 elsif p_provider in ('calendly','instagram') then
 if not p_connected then
 select l.workspace_id into owner from public.tenant_workspace_links l where l.tenant_stable_id=v_ref_id;
 if owner is not null then return owner; end if;
 end if;
 select l.workspace_id into owner from public.tenant_client_records r join public.tenant_workspace_links l on l.tenant_stable_id=r.tenant_stable_id
 where (r.id=v_ref_id or r.tenant_stable_id=v_ref_id) and r.store='provider_connections' and r.record_id=p_provider and r.removed_at is null
 and r.payload->>'status'='connected' and (r.workspace_id is null or r.workspace_id=l.workspace_id) limit 1;
 elsif p_provider='stripe' then
 select workspace_id into owner from public.connected_accounts c where c.workspace_id=v_ref_id and c.generation::numeric=generation_text::numeric
 and (case when p_connected then c.state='ready' and c.stripe_account_id is not null and cardinality(c.configurations)>0 else c.state<>'disconnected' end);
 elsif p_provider='resend' then
 -- Platform sending is a workspace-scoped service, no outside account id.
 select w.id into owner from public.workspaces w where w.id=v_ref_id;
 end if;
 return owner;
end $$;
create or replace function public.connection_lock_source(p_provider text,p_ref text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ref_id uuid; suffix text; read_grant boolean:=false;
begin
 suffix:=substr(p_ref,char_length(p_provider)+2);
 if p_provider='stripe' then suffix:=split_part(suffix,':',1);
 elsif p_provider='google_business_profile' and left(suffix,11)='read-grant:' then read_grant:=true; suffix:=substr(suffix,12); end if;
 if suffix !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return; end if;
 v_ref_id:=suffix::uuid;
 if p_provider in ('google_calendar','outlook_calendar') then perform 1 from public.workspace_calendar_connections c where c.id=v_ref_id for share;
 elsif p_provider='google_business_profile' and read_grant then perform 1 from public.workspace_google_read_grants g where g.workspace_id=v_ref_id for share;
 elsif p_provider='google_business_profile' then
 perform 1 from public.workspace_google_locations l where l.id=v_ref_id for share;
 perform 1 from public.workspace_account_bindings b where b.id=v_ref_id or b.id in(select l.binding_id from public.workspace_google_locations l where l.id=v_ref_id) for share;
 elsif p_provider='connected_site' then perform 1 from public.connected_sites c where c.id=v_ref_id for share;
 elsif p_provider='highlevel' then perform 1 from public.agency_source_connections c where c.id=v_ref_id for share;
 elsif p_provider in ('calendly','instagram') then
 perform 1 from public.tenant_workspace_links l where l.tenant_stable_id=v_ref_id for share;
 perform 1 from public.tenant_client_records r join public.tenant_workspace_links l on l.tenant_stable_id=r.tenant_stable_id
 where (r.id=v_ref_id or r.tenant_stable_id=v_ref_id) and r.store='provider_connections' and r.record_id=p_provider for share of r,l;
 elsif p_provider='stripe' then perform 1 from public.connected_accounts c where c.workspace_id=v_ref_id for share;
 elsif p_provider='resend' then perform 1 from public.workspaces w where w.id=v_ref_id for share;
 end if;
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
   or coalesce(item->>'provider','') not in ('google_business_profile','google_calendar','outlook_calendar','calendly','highlevel','connected_site','stripe','resend','instagram')
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
-- Re-apply the original private ACLs: replacement keeps them, and this states them.
revoke all on function public.connection_provider_area(text),public.connection_holder_usable(uuid,uuid,text,text,jsonb,jsonb),
 public.connection_source_workspace(text,text,boolean),public.connection_lock_source(text,text),
 public.system_package_assert_declaration(jsonb,jsonb,text[]) from public,anon,authenticated,service_role;
update conn_outlook_rollback.functions s set after_fingerprint=md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
from pg_proc p where p.oid=s.signature::regprocedure;
notify pgrst,'reload schema';
commit;
