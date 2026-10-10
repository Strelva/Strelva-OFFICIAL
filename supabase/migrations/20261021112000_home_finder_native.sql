begin;
set local lock_timeout='5s';
create table public.home_finder_bindings (
 id uuid primary key, business_workspace_id uuid not null references public.workspaces(id), agency_workspace_id uuid not null references public.workspaces(id),
 system_id uuid not null unique, external_installation_id text not null unique check(external_installation_id ~ '^[a-zA-Z0-9_-]{1,160}$'),
 brokerage_name text not null check(length(brokerage_name) between 1 and 160), approved_origin text not null check(approved_origin ~ '^https://[^/?#@]+$'),
 license_reference text not null check(length(license_reference) between 1 and 500), license_expires_at timestamptz not null, source_name text not null check(length(source_name) between 1 and 200),
 status text not null default 'active' check(status in ('active','revoked')), row_revision bigint not null default 1,
 qualified_at timestamptz, readiness jsonb, input_digest text not null, created_by uuid not null references public.users(id), created_at timestamptz not null default clock_timestamp(),
 foreign key(system_id,business_workspace_id) references public.systems(id,business_workspace_id)
);
create table public.home_finder_intake_receipts (
 binding_id uuid not null references public.home_finder_bindings(id), submission_id uuid not null, binding_revision bigint not null,
 input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'), status text not null check(status in ('started','pending','delivered','unavailable','unknown')),
 provider_reference text, started_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), primary key(binding_id,submission_id)
);
create table public.home_finder_binding_audit (
 id bigint generated always as identity primary key, binding_id uuid not null references public.home_finder_bindings(id), actor_id uuid references public.users(id),
 action text not null check(action in ('installed','observed','revoked')), row_revision bigint not null, occurred_at timestamptz not null default clock_timestamp(), detail jsonb not null default '{}'
);
alter table public.home_finder_bindings enable row level security;
alter table public.home_finder_intake_receipts enable row level security;
alter table public.home_finder_binding_audit enable row level security;
revoke all on public.home_finder_bindings,public.home_finder_intake_receipts,public.home_finder_binding_audit from public,anon,authenticated,service_role;
create function public.home_finder_current(b public.home_finder_bindings) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select b.status='active' and b.license_expires_at>statement_timestamp() and b.qualified_at>statement_timestamp()-interval '5 minutes'
 and b.qualified_at<=statement_timestamp()+interval '30 seconds' and jsonb_typeof(b.readiness)='array' and jsonb_array_length(b.readiness)>=9
 and not exists(select 1 from jsonb_array_elements(b.readiness) r where r->>'state' is distinct from 'confirmed')
 and exists(select 1 from public.systems s join public.system_revisions r on r.id=s.current_revision_id where s.id=b.system_id and r.implementation->>'kind'='home_finder' and r.implementation->>'ref'=b.id::text)
 and not public.workspace_exit_completed(b.business_workspace_id)
 and exists(select 1 from public.provider_seats p where p.customer_workspace_id=b.business_workspace_id and p.agency_workspace_id=b.agency_workspace_id and p.status='active')
 and public.agency_effect_allowed(b.agency_workspace_id,'email') and public.agency_effect_allowed(b.agency_workspace_id,'publish')
$$;
create function public.home_finder_binding_json(b public.home_finder_bindings) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',b.id,'workspaceId',b.business_workspace_id,'agencyId',b.agency_workspace_id,'systemId',b.system_id,'externalInstallationId',b.external_installation_id,'brokerageName',b.brokerage_name,'approvedOrigin',b.approved_origin,'licenseReference',b.license_reference,'licenseExpiresAt',public.system_version_ts(b.license_expires_at),'sourceName',b.source_name,'status',b.status,'revision',b.row_revision,'lifecycle',(select s.lifecycle from public.systems s where s.id=b.system_id),'qualifiedAt',case when b.qualified_at is null then null else public.system_version_ts(b.qualified_at) end,'readiness',b.readiness,'runtimeAllowed',coalesce(public.home_finder_current(b),false))
$$;
create function public.install_home_finder(p_user_id uuid,p_verified_email text,p_input jsonb,p_digest text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings; system jsonb; revision jsonb; command uuid:=(p_input->>'commandId')::uuid; business uuid:=(p_input->>'workspaceId')::uuid; agency uuid:=(p_input->>'agencyId')::uuid;
begin
 perform public.require_agency_authoring_scope(agency,business,p_user_id,p_verified_email);
 perform public.enterprise_require(agency,p_user_id,p_verified_email,true);
 -- Native creation requires current business owner/admin (including its normal provider-seat scope).
 perform public.system_actor_scope(business,p_user_id,p_verified_email,true);
 perform pg_advisory_xact_lock(hashtextextended('home-finder:'||command::text,0));
 select * into b from public.home_finder_bindings where id=command;
 if found then
  if b.input_digest<>p_digest or b.created_by<>p_user_id or b.business_workspace_id<>business then raise exception 'system_command_conflict'; end if;
  return public.home_finder_binding_json(b);
 end if;
 if p_digest !~ '^[a-f0-9]{64}$' or (p_input->>'licenseExpiresAt')::timestamptz<=clock_timestamp() then raise exception 'home_finder_license_required'; end if;
 system:=public.create_business_system(business,p_user_id,p_verified_email,jsonb_build_object('name',p_input->>'name','kind','home_finder'),command,p_digest);
 insert into public.home_finder_bindings(id,business_workspace_id,agency_workspace_id,system_id,external_installation_id,brokerage_name,approved_origin,license_reference,license_expires_at,source_name,input_digest,created_by)
 values(command,business,agency,(system->>'id')::uuid,p_input->>'externalInstallationId',p_input->>'brokerageName',p_input->>'approvedOrigin',p_input->>'licenseReference',(p_input->>'licenseExpiresAt')::timestamptz,p_input->>'sourceName',p_digest,p_user_id) returning * into b;
 revision:=public.record_system_revision(business,p_user_id,p_verified_email,b.system_id,(system->>'changeNumber')::bigint,jsonb_build_object('implementation',jsonb_build_object('kind','home_finder','ref',b.id::text),'summary','Brokerage-owned Home Finder installation'),gen_random_uuid(),p_digest,true);
 perform public.connect_system(business,p_user_id,p_verified_email,jsonb_build_object('source',jsonb_build_object('businessId',business,'systemId',b.system_id),'kind','read','target',jsonb_build_object('type','api','api','home_finder:'||b.external_installation_id),'propagation','follow_current','purpose','Licensed IDX inventory and display evidence'),gen_random_uuid(),p_digest);
 insert into public.home_finder_binding_audit(binding_id,actor_id,action,row_revision) values(b.id,p_user_id,'installed',1);
 return public.home_finder_binding_json(b);
end;$$;
create function public.read_home_finder_bindings(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope record; result jsonb;
begin
 scope:=public.system_read_scope(p_workspace_id,p_user_id,p_verified_email,false);
 select coalesce(jsonb_agg(public.home_finder_binding_json(b) order by b.created_at,b.id),'[]'::jsonb) into result from public.home_finder_bindings b join public.systems s on s.id=b.system_id where b.business_workspace_id=p_workspace_id and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids);
 return result;
end;$$;
create function public.observe_home_finder(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_binding_id uuid,p_revision bigint,p_readiness jsonb,p_qualified boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings; scope record;
begin
 scope:=public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,true);
 select * into b from public.home_finder_bindings where id=p_binding_id and business_workspace_id=p_workspace_id for update;
 if not found then raise exception 'system_not_found'; end if;
 perform public.system_load(p_workspace_id,b.system_id,true,scope.work_ids);
 if b.row_revision<>p_revision then raise exception 'enterprise_stale'; end if;
 if jsonb_typeof(p_readiness) is distinct from 'array' or jsonb_array_length(p_readiness)>30 then raise exception 'system_input_invalid'; end if;
 if p_qualified and (jsonb_array_length(p_readiness)<9 or exists(select 1 from jsonb_array_elements(p_readiness) r where r->>'state' is distinct from 'confirmed')) then raise exception 'home_finder_license_required'; end if;
 update public.home_finder_bindings set readiness=p_readiness,qualified_at=case when p_qualified then clock_timestamp() else null end where id=b.id returning * into b;
 insert into public.home_finder_binding_audit(binding_id,actor_id,action,row_revision,detail) values(b.id,p_user_id,'observed',b.row_revision,jsonb_build_object('qualified',p_qualified));
 return public.home_finder_binding_json(b);
end;$$;
create function public.revoke_home_finder(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_binding_id uuid,p_revision bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings; scope record;
begin
 scope:=public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,true);
 select * into b from public.home_finder_bindings where id=p_binding_id and business_workspace_id=p_workspace_id for update;
 if not found then raise exception 'system_not_found'; end if;
 perform public.system_load(p_workspace_id,b.system_id,true,scope.work_ids);
 if b.row_revision<>p_revision then raise exception 'enterprise_stale'; end if;
 update public.home_finder_bindings set status='revoked',qualified_at=null,row_revision=row_revision+1 where id=b.id returning * into b;
 insert into public.home_finder_binding_audit(binding_id,actor_id,action,row_revision) values(b.id,p_user_id,'revoked',b.row_revision);
 return public.home_finder_binding_json(b);
end;$$;
create function public.home_finder_lifecycle_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings;
begin
 select * into b from public.home_finder_bindings where system_id=new.id;
 if found and new.lifecycle='live' and (old.lifecycle is distinct from 'live' or new.current_revision_id is distinct from old.current_revision_id) and (not public.home_finder_current(b) or not exists(select 1 from public.system_revisions r where r.id=new.current_revision_id and r.implementation->>'kind'='home_finder' and r.implementation->>'ref'=b.id::text)) then raise exception 'home_finder_license_required'; end if;
 return new;
end;$$;
create trigger home_finder_live_gate before update on public.systems for each row execute function public.home_finder_lifecycle_guard();
-- Public admission exposes no secret, mailbox or buyer data. Current lifecycle,
-- license, ordinary agency and qualification are checked independently.
create function public.read_home_finder_public(p_binding_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings;
begin
 select * into b from public.home_finder_bindings where id=p_binding_id;
 if not found or not public.home_finder_current(b) or not exists(select 1 from public.systems s where s.id=b.system_id and s.lifecycle='live') then raise exception 'home_finder_unavailable'; end if;
 return public.home_finder_binding_json(b);
end;$$;
create function public.begin_home_finder_intake(p_binding_id uuid,p_submission_id uuid,p_revision bigint,p_digest text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings; r public.home_finder_intake_receipts;
begin
 select * into b from public.home_finder_bindings where id=p_binding_id for update;
 if not found then raise exception 'home_finder_unavailable'; end if;
 select * into r from public.home_finder_intake_receipts where binding_id=b.id and submission_id=p_submission_id for update;
 if found then
  if r.input_digest<>p_digest then raise exception 'system_command_conflict'; end if;
  if r.status in ('pending','delivered') then return jsonb_build_object('status',r.status,'reference',r.provider_reference); end if;
  if r.started_at<clock_timestamp()-interval '24 hours' then raise exception 'home_finder_unknown_expired'; end if;
  if r.binding_revision<>b.row_revision then raise exception 'home_finder_unavailable'; end if;
  if r.status='started' and r.updated_at>clock_timestamp()-interval '30 seconds' then raise exception 'home_finder_inflight'; end if;
 end if;
 perform public.read_home_finder_public(b.id);
 if b.row_revision<>p_revision then raise exception 'enterprise_stale'; end if;
 if p_submission_id is null or p_digest !~ '^[a-f0-9]{64}$' then raise exception 'system_input_invalid'; end if;
 insert into public.home_finder_intake_receipts(binding_id,submission_id,binding_revision,input_digest,status) values(b.id,p_submission_id,b.row_revision,p_digest,'started')
 on conflict(binding_id,submission_id) do update set status='started',updated_at=clock_timestamp();
 return jsonb_build_object('status','started','reference',null);
end;$$;
create function public.finish_home_finder_intake(p_binding_id uuid,p_submission_id uuid,p_digest text,p_status text,p_reference text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_status not in ('pending','delivered','unavailable','unknown') then raise exception 'system_input_invalid'; end if;
 update public.home_finder_intake_receipts set status=p_status,provider_reference=coalesce(provider_reference,p_reference),updated_at=clock_timestamp()
 where binding_id=p_binding_id and submission_id=p_submission_id and input_digest=p_digest and status in ('started','unknown','unavailable');
 if not found then raise exception 'enterprise_stale'; end if;
end;$$;
revoke all on function public.home_finder_binding_json(public.home_finder_bindings),public.home_finder_current(public.home_finder_bindings),public.home_finder_lifecycle_guard() from public,anon,authenticated,service_role;
revoke all on function public.install_home_finder(uuid,text,jsonb,text),public.read_home_finder_bindings(uuid,uuid,text),public.observe_home_finder(uuid,uuid,text,uuid,bigint,jsonb,boolean),public.revoke_home_finder(uuid,uuid,text,uuid,bigint),public.read_home_finder_public(uuid),public.begin_home_finder_intake(uuid,uuid,bigint,text),public.finish_home_finder_intake(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.install_home_finder(uuid,text,jsonb,text),public.read_home_finder_bindings(uuid,uuid,text),public.observe_home_finder(uuid,uuid,text,uuid,bigint,jsonb,boolean),public.revoke_home_finder(uuid,uuid,text,uuid,bigint),public.read_home_finder_public(uuid),public.begin_home_finder_intake(uuid,uuid,bigint,text),public.finish_home_finder_intake(uuid,uuid,text,text,text) to service_role;
create function public.read_home_finder_probe(p_binding_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings;
begin
 select * into b from public.home_finder_bindings where id=p_binding_id;
 if not found or b.status<>'active' or b.license_expires_at<=statement_timestamp() or public.workspace_exit_completed(b.business_workspace_id) or not exists(select 1 from public.systems s where s.id=b.system_id and s.lifecycle='live') then raise exception 'home_finder_unavailable'; end if;
 return public.home_finder_binding_json(b);
end;$$;
create function public.refresh_home_finder_probe(p_binding_id uuid,p_revision bigint,p_readiness jsonb,p_qualified boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings;
begin
 select * into b from public.home_finder_bindings where id=p_binding_id for update;
 if not found or b.status<>'active' or b.row_revision<>p_revision then raise exception 'home_finder_unavailable'; end if;
 if jsonb_typeof(p_readiness) is distinct from 'array' or jsonb_array_length(p_readiness)>30 then raise exception 'system_input_invalid'; end if;
 if p_qualified and (jsonb_array_length(p_readiness)<9 or exists(select 1 from jsonb_array_elements(p_readiness) r where r->>'state' is distinct from 'confirmed')) then raise exception 'home_finder_license_required'; end if;
 update public.home_finder_bindings set readiness=p_readiness,qualified_at=case when p_qualified then clock_timestamp() else null end where id=b.id;
end;$$;
create function public.read_home_finder_receipt_scope(p_binding_id uuid,p_submission_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare b public.home_finder_bindings; r public.home_finder_intake_receipts;
begin
 select * into b from public.home_finder_bindings where id=p_binding_id;
 select * into r from public.home_finder_intake_receipts where binding_id=p_binding_id and submission_id=p_submission_id;
 if b.id is null or r.submission_id is null then raise exception 'home_finder_unavailable'; end if;
 return jsonb_build_object('binding',public.home_finder_binding_json(b),'status',r.status,'reference',r.provider_reference);
end;$$;
revoke all on function public.read_home_finder_probe(uuid),public.refresh_home_finder_probe(uuid,bigint,jsonb,boolean),public.read_home_finder_receipt_scope(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_home_finder_probe(uuid),public.refresh_home_finder_probe(uuid,bigint,jsonb,boolean),public.read_home_finder_receipt_scope(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
