-- ADR 0016: metadata only. Products retain credentials; no provider calls or activation.
begin;
set local lock_timeout='3s';
create schema conn_core_rollback;
revoke all on schema conn_core_rollback from public,anon,authenticated,service_role;
create table conn_core_rollback.functions(signature text primary key,before_definition text,after_fingerprint text);
alter table conn_core_rollback.functions enable row level security;
revoke all on conn_core_rollback.functions from public,anon,authenticated,service_role;
insert into conn_core_rollback.functions(signature,before_definition)
select signature,pg_get_functiondef(signature::regprocedure) from unnest(array[
 'public.system_version_connection_owner(text)',
 'public.read_system_version_connection_owner(uuid,text,text)',
 'public.save_system_version_owner_grants_core(uuid,text,uuid,bigint,jsonb)']) signature;

create table public.connection_holders(
 ref text primary key check(char_length(ref) between 3 and 200),
 provider text not null check(provider in ('google_business_profile','google_calendar','calendly','highlevel','connected_site','stripe','resend','instagram')),
 workspace_id uuid not null references public.workspaces(id),
 account_holder jsonb not null,
 access_through jsonb not null,
 recorded_by uuid not null references public.users(id),
 recorded_at timestamptz not null default clock_timestamp(),
 check (ref like provider||':%')
);
create index connection_holders_workspace_idx on public.connection_holders(workspace_id);
create table public.connection_holder_commands(
 workspace_id uuid not null references public.workspaces(id),command_id uuid not null,
 ref text not null references public.connection_holders(ref),digest text not null check(digest ~ '^[0-9a-f]{64}$'),
 actor_id uuid not null references public.users(id),body jsonb not null, primary key(workspace_id,command_id)
);
alter table public.connection_holders enable row level security;
alter table public.connection_holder_commands enable row level security;
revoke all on public.connection_holders,public.connection_holder_commands from public,anon,authenticated,service_role;

create function public.connection_provider_area(p_provider text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_provider when 'google_business_profile' then 'google' when 'google_calendar' then 'bookings'
 when 'calendly' then 'bookings' when 'connected_site' then 'website' when 'instagram' then 'website' else null end
$$;
create function public.connection_agency_holds_area(p_agency_workspace_id uuid,p_workspace_id uuid,p_area text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select p_area in ('website','inquiries','bookings','google','internal_tools') and exists(
 select 1 from public.agency_scope_grants g join public.provider_seats s
 on s.customer_workspace_id=g.customer_workspace_id and s.agency_workspace_id=g.agency_workspace_id and s.status='active'
 where g.customer_workspace_id=p_workspace_id and g.agency_workspace_id=p_agency_workspace_id
 and g.scope=p_area and g.status='active' and g.level in ('prepare','full_control'))
$$;
-- Reads use no writer locks: PostgREST may run them READ ONLY.
create function public.read_connection_actor_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare agencies uuid[];
begin
 if not exists(select 1 from public.users where id=p_user_id and verified_at is not null and lower(email)=lower(btrim(p_verified_email))) then
 raise exception 'connection_access_denied'; end if;
 if exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id) then
 return jsonb_build_object('actingAgencyWorkspaceId',null,'actingAgencyWorkspaceIds','[]'::jsonb); end if;
 select array_agg(s.agency_workspace_id order by s.agency_workspace_id) into agencies from public.provider_seats s
 join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id and st.customer_workspace_id=s.customer_workspace_id
 and st.user_id=p_user_id and st.status='active'
 join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=p_user_id
 where s.customer_workspace_id=p_workspace_id and s.status='active';
 if coalesce(cardinality(agencies),0)=0 then raise exception 'connection_access_denied'; end if;
 return jsonb_build_object('actingAgencyWorkspaceId',case when cardinality(agencies)=1 then agencies[1] else null end,'actingAgencyWorkspaceIds',to_jsonb(agencies));
end $$;
create function public.connection_holder_valid(p_holder jsonb,p_access boolean) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
begin
 if p_holder is null or jsonb_typeof(p_holder)<>'object' then return false; end if;
 if p_holder->>'kind'='platform' then return p_holder=jsonb_build_object('kind','platform'); end if;
 if p_holder->>'kind'='agency' or (not p_access and p_holder->>'kind'='business') then
 return (p_holder-array['kind','workspaceId'])='{}'::jsonb and jsonb_typeof(p_holder->'workspaceId')='string'
 and coalesce(p_holder->>'workspaceId','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; end if;
 return false;
end $$;
-- Only an actor's current staffed provider seat may carry agency-held credentials.
create function public.connection_holder_usable(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_provider text,p_account jsonb,p_access jsonb) returns boolean
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
 when 'calendly' then p_account->>'kind'='business' and p_access->>'kind'='platform'
 when 'instagram' then p_account->>'kind'='business' and p_access->>'kind'='platform'
 else false end;
end $$;
-- A ref is evidence of a real source row, never just a caller's holder claim.
-- p_connected=false allows recording an authorized calendar/unverified installed site.
create function public.connection_source_workspace(p_provider text,p_ref text,p_connected boolean) returns uuid
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
 if p_provider='google_calendar' then
 select workspace_id into owner from public.workspace_calendar_connections c where c.id=v_ref_id and c.provider='google'
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
-- Binding/holder writes retain a source witness through commit; concurrent revoke waits.
create function public.connection_lock_source(p_provider text,p_ref text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ref_id uuid; suffix text; read_grant boolean:=false;
begin
 suffix:=substr(p_ref,char_length(p_provider)+2);
 if p_provider='stripe' then suffix:=split_part(suffix,':',1);
 elsif p_provider='google_business_profile' and left(suffix,11)='read-grant:' then read_grant:=true; suffix:=substr(suffix,12); end if;
 if suffix !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return; end if;
 v_ref_id:=suffix::uuid;
 if p_provider='google_calendar' then perform 1 from public.workspace_calendar_connections c where c.id=v_ref_id for share;
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
create function public.record_connection_holder(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_ref text,p_provider text,
 p_account_holder jsonb,p_access_through jsonb,p_command_id uuid,p_command_digest text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.connection_holder_commands; existing public.connection_holders; body jsonb;
begin
 perform public.system_command_valid(p_command_id,p_command_digest);
 -- Serialize one ref and command, including first insert/reconnect races.
 perform pg_advisory_xact_lock(hashtextextended('connection-ref:'||coalesce(p_ref,''),0));
 perform pg_advisory_xact_lock(hashtextextended('connection-command:'||p_workspace_id||':'||p_command_id,0));
 perform 1 from public.users where id=p_user_id for share;
 perform 1 from public.workspace_memberships where user_id=p_user_id for share;
 perform 1 from public.provider_seats where customer_workspace_id=p_workspace_id and status='active' for share;
 perform 1 from public.agency_client_staff where customer_workspace_id=p_workspace_id and user_id=p_user_id and status='active' for share;
 perform 1 from public.agency_scope_grants where customer_workspace_id=p_workspace_id and status='active' for share;
 if not coalesce(public.connection_holder_usable(p_workspace_id,p_user_id,p_verified_email,p_provider,p_account_holder,p_access_through),false) then raise exception 'connection_access_denied'; end if;
 perform public.connection_lock_source(p_provider,p_ref);
 if public.connection_source_workspace(p_provider,p_ref,false) is distinct from p_workspace_id then raise exception 'connection_access_denied'; end if;
 if p_ref is null or char_length(p_ref) not between 3 and 200 or left(p_ref,char_length(p_provider)+1)<>p_provider||':' then raise exception 'connection_input_invalid'; end if;
 body:=jsonb_build_object('ref',p_ref,'provider',p_provider,'workspaceId',p_workspace_id,'accountHolder',p_account_holder,'accessThrough',p_access_through);
 select * into prior from public.connection_holder_commands where workspace_id=p_workspace_id and command_id=p_command_id;
 if found then
 if prior.ref<>p_ref or prior.digest<>p_command_digest or prior.actor_id<>p_user_id or prior.body<>body then raise exception 'connection_command_conflict'; end if;
 return 'null'::jsonb;
 end if;
 select * into existing from public.connection_holders where ref=p_ref for update;
 if found and (existing.workspace_id<>p_workspace_id or existing.provider<>p_provider) then raise exception 'connection_access_denied'; end if;
 insert into public.connection_holders(ref,provider,workspace_id,account_holder,access_through,recorded_by)
 values(p_ref,p_provider,p_workspace_id,p_account_holder,p_access_through,p_user_id)
 on conflict(ref) do update set account_holder=excluded.account_holder,access_through=excluded.access_through,recorded_by=excluded.recorded_by,recorded_at=clock_timestamp();
 insert into public.connection_holder_commands values(p_workspace_id,p_command_id,p_ref,p_command_digest,p_user_id,body);
 return 'null'::jsonb;
end $$;
create function public.read_connection_holders(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('ref',ref,'accountHolder',account_holder,'accessThrough',access_through) order by ref),'[]'::jsonb)
 from public.connection_holders where workspace_id=p_workspace_id
$$;
-- Preserve calendar:/tenant: compatibility. New refs must have an explicit holder.
create or replace function public.system_version_connection_owner(p_connection_ref text) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare kind text; ref text; owner uuid;
begin
 select workspace_id into owner from public.connection_holders where connection_holders.ref=p_connection_ref;
 if found then
 if public.connection_source_workspace(split_part(p_connection_ref,':',1),p_connection_ref,true) is distinct from owner then return null; end if;
 return owner; end if;
 if p_connection_ref is null or p_connection_ref !~ '^[a-z_]+:.+$' then return null; end if;
 kind:=split_part(p_connection_ref,':',1); ref:=substr(p_connection_ref,char_length(kind)+2);
 if ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
 if kind='calendar' then select workspace_id into owner from public.workspace_calendar_connections where id=ref::uuid and status<>'revoked';
 elsif kind='tenant' then select workspace_id into owner from public.tenant_workspace_links where tenant_stable_id=ref::uuid; end if;
 return owner;
end $$;
create or replace function public.read_system_version_connection_owner(p_user_id uuid,p_verified_email text,p_connection_ref text) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare owner uuid; h public.connection_holders;
begin
 owner:=public.system_version_connection_owner(p_connection_ref);
 if owner is null then return null; end if;
 select * into h from public.connection_holders where ref=p_connection_ref;
 if found then
 if not coalesce(public.connection_holder_usable(owner,p_user_id,p_verified_email,h.provider,h.account_holder,h.access_through),false) then return null; end if;
 elsif not (owner=any(public.system_version_actor_workspaces(p_user_id,p_verified_email))) then return null;
 end if;
 return owner;
exception when raise_exception then
 if sqlerrm='connection_access_denied' then return null; end if; raise;
end $$;
-- Writer-only counterpart locks current authority and metadata until the binding is saved.
create function public.connection_version_binding_owner(p_user_id uuid,p_verified_email text,p_connection_ref text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid;
begin
 select workspace_id into owner from public.connection_holders where ref=p_connection_ref for share;
 if owner is not null then
 perform 1 from public.users where id=p_user_id for share;
 perform 1 from public.workspace_memberships where user_id=p_user_id for share;
 perform 1 from public.provider_seats where customer_workspace_id=owner and status='active' for share;
 perform 1 from public.agency_client_staff where customer_workspace_id=owner and user_id=p_user_id and status='active' for share;
 perform 1 from public.agency_scope_grants where customer_workspace_id=owner and status='active' for share;
 end if;
 perform public.connection_lock_source(split_part(p_connection_ref,':',1),p_connection_ref);
 return public.read_system_version_connection_owner(p_user_id,p_verified_email,p_connection_ref);
end $$;
-- Patch the original private binding check, retaining all later wrappers and CAS.
do $$ declare definition text; patched text; begin
 select pg_get_functiondef('public.save_system_version_owner_grants_core(uuid,text,uuid,bigint,jsonb)'::regprocedure) into definition;
 patched:=replace(definition, 'public.system_version_connection_owner(item->>''connectionId'')',
 'public.connection_version_binding_owner(p_user_id,p_verified_email,item->>''connectionId'')');
 if patched=definition then raise exception 'conn_core_binding_predecessor_drift'; end if;
 execute replace(patched,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
end $$;

-- All new helpers/RPCs are private to the service-role server boundary.
do $$ declare f record; begin
 for f in select p.proname,p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
 ('connection_lock_source','connection_source_workspace','connection_version_binding_owner','connection_provider_area','connection_agency_holds_area','read_connection_actor_scope','connection_holder_valid','connection_holder_usable','record_connection_holder','read_connection_holders') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in ('connection_agency_holds_area','read_connection_actor_scope','record_connection_holder','read_connection_holders') then
 execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $$;
insert into conn_core_rollback.functions(signature)
select p.oid::regprocedure::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
 ('connection_lock_source','connection_source_workspace','connection_version_binding_owner','connection_provider_area','connection_agency_holds_area','read_connection_actor_scope','connection_holder_valid','connection_holder_usable','record_connection_holder','read_connection_holders');
update conn_core_rollback.functions s set after_fingerprint=md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
from pg_proc p where p.oid=to_regprocedure(s.signature);
notify pgrst,'reload schema';
commit;
