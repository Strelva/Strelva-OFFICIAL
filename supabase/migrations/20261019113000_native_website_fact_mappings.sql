begin;
set local lock_timeout = '3s';
create schema if not exists release_rollback_baseline;
revoke all on schema release_rollback_baseline from public,anon,authenticated,service_role;
create table release_rollback_baseline.native_fact_mappings (
  prior_confirmation text not null, forward_confirmation_hash text,
  prior_constraint_name text not null, prior_constraint_definition text not null
);
revoke all on release_rollback_baseline.native_fact_mappings from public,anon,authenticated,service_role;
insert into release_rollback_baseline.native_fact_mappings(prior_confirmation,prior_constraint_name,prior_constraint_definition)
select pg_get_functiondef('public.business_fact_confirmation_json(public.business_record_fact_confirmations)'::regprocedure),c.conname,pg_get_constraintdef(c.oid)
from pg_constraint c where c.conrelid='public.website_native_fact_reviews'::regclass and c.contype='u'
  and (select array_agg(a.attname::text order by k.ordinality) from unnest(c.conkey) with ordinality k(attnum,ordinality)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=array['workspace_id','tenant_stable_id','record_revision'];
do $$ begin
  if (select count(*) from release_rollback_baseline.native_fact_mappings)<>1 then raise exception 'native_website_mapping_unsupported_baseline'; end if;
end $$;


-- A website mapping is scoped by stable tenant identity and business identity.
-- Legacy external_ref strings are never service matching authority.
-- Reads/claims retain the current acting-provider boundary from 20261014112000;
-- a global operator role alone never substitutes for the business provider.
create table public.website_native_fact_mappings (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete restrict,
  revision bigint not null check (revision > 0),
  mapping jsonb not null,
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, tenant_stable_id)
);
alter table public.website_native_fact_mappings enable row level security;
revoke all on public.website_native_fact_mappings from public, anon, authenticated, service_role;

-- Retain existing contact claims, including every uncertain dispatch. One
-- unresolved section blocks that section on later revisions, not other content.
alter table public.website_native_fact_reviews add column section text not null default 'contact' check(section in ('contact','settings','services'));
alter table public.website_native_fact_reviews add column mapping_revision bigint not null default 0 check(mapping_revision >= 0);
do $$ declare constraint_name text; begin
  select c.conname into strict constraint_name from pg_constraint c
  where c.conrelid='public.website_native_fact_reviews'::regclass and c.contype='u'
    and (select array_agg(a.attname::text order by k.ordinality) from unnest(c.conkey) with ordinality k(attnum,ordinality)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=array['workspace_id','tenant_stable_id','record_revision'];
  execute format('alter table public.website_native_fact_reviews drop constraint %I',constraint_name);
end $$;
alter table public.website_native_fact_reviews add constraint website_native_fact_reviews_revision_section_key unique(workspace_id,tenant_stable_id,record_revision,section);
drop index public.website_native_fact_reviews_dispatch_idx;
create unique index website_native_fact_reviews_dispatch_idx on public.website_native_fact_reviews(tenant_stable_id,section) where status in ('claimed','unconfirmed');

create function public.read_native_website_fact_mapping(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare access text; t public.tenants; m public.website_native_fact_mappings;
begin
  access := public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,false);
  if access <> 'owner' and not(access='admin' and public.needs_you_provider_id(p_workspace_id,p_user_id,p_verified_email) is not null) then raise exception 'business_record_access_denied'; end if;
  select * into t from public.tenants where id=p_tenant_id and active and delivery_model='custom_repo';
  if t.id is null or public.workspace_exit_completed(p_workspace_id) or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id) then raise exception 'business_record_access_denied'; end if;
  select * into m from public.website_native_fact_mappings where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id;
  return jsonb_build_object(
    'mapping', coalesce(m.mapping,'{"fields":["phone","email","address","hours"],"services":[]}'::jsonb) || jsonb_build_object('revision',coalesce(m.revision,0)),
    'recordRevision', coalesce((select revision from public.business_records where workspace_id=p_workspace_id),0),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id',c.entity_id,'name',c.state->'name','description',c.state->'description','priceText',c.state->'priceText','durationMinutes',c.state->'durationMinutes','active',c.state->'active') order by c.entity_id)
      from public.business_record_confirmed c where c.workspace_id=p_workspace_id and c.entity='service'
        and exists(select 1 from jsonb_array_elements(coalesce(m.mapping->'services','[]'::jsonb)) binding where binding->>'serviceId'=c.entity_id)), '[]'::jsonb));
end $$;

create function public.save_native_website_fact_mapping(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_expected_revision bigint,p_mapping jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare access text; t public.tenants; m public.website_native_fact_mappings; binding jsonb; field jsonb;
begin
  access:=public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
  if access<>'owner' then raise exception 'business_record_access_denied'; end if;
  select * into t from public.tenants where id=p_tenant_id and active and delivery_model='custom_repo' for share;
  if t.id is null or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id) then raise exception 'business_record_access_denied'; end if;
  if exists(select 1 from public.workspace_release_flags where workspace_id=p_workspace_id and flag='systems' and state='off') then raise exception 'business_record_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision<0 or jsonb_typeof(p_mapping) is distinct from 'object' or (p_mapping-array['fields','services'])<>'{}'::jsonb
    or jsonb_typeof(p_mapping->'fields') is distinct from 'array' or jsonb_typeof(p_mapping->'services') is distinct from 'array' then raise exception 'native_website_mapping_invalid'; end if;
  if jsonb_array_length(p_mapping->'fields')>5 or jsonb_array_length(p_mapping->'services')>200
    or (select count(*)<>count(distinct value) from jsonb_array_elements(p_mapping->'fields')) then raise exception 'native_website_mapping_invalid'; end if;
  for field in select * from jsonb_array_elements(p_mapping->'fields') loop
    if jsonb_typeof(field)<>'string' or field #>> '{}' not in ('display_name','phone','email','address','hours') then raise exception 'native_website_mapping_invalid'; end if;
  end loop;
  for binding in select * from jsonb_array_elements(p_mapping->'services') loop
    if jsonb_typeof(binding) is distinct from 'object' or (binding-array['serviceId','nativeServiceId','fields'])<>'{}'::jsonb
      or jsonb_typeof(binding->'serviceId') is distinct from 'string' or jsonb_typeof(binding->'nativeServiceId') is distinct from 'string'
      or char_length(binding->>'nativeServiceId') not between 1 and 200 or btrim(binding->>'nativeServiceId')<>binding->>'nativeServiceId'
      or not exists(select 1 from public.business_services where workspace_id=p_workspace_id and id::text=binding->>'serviceId')
      or jsonb_typeof(binding->'fields') is distinct from 'array' then raise exception 'native_website_mapping_invalid'; end if;
    if jsonb_array_length(binding->'fields') not between 1 and 4 or (select count(*)<>count(distinct value) from jsonb_array_elements(binding->'fields')) then raise exception 'native_website_mapping_invalid'; end if;
    for field in select * from jsonb_array_elements(binding->'fields') loop
      if jsonb_typeof(field)<>'string' or field #>> '{}' not in ('name','description','priceText','durationMinutes') then raise exception 'native_website_mapping_invalid'; end if;
    end loop;
  end loop;
  if (select count(*)<>count(distinct value->>'serviceId') or count(*)<>count(distinct value->>'nativeServiceId') from jsonb_array_elements(p_mapping->'services')) then raise exception 'native_website_mapping_invalid'; end if;
  select * into m from public.website_native_fact_mappings where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id for update;
  -- Safe retry after a lost response is accepted only for this exact mapping.
  if m.revision=p_expected_revision+1 and m.mapping=p_mapping then
    return public.read_native_website_fact_mapping(p_workspace_id,p_user_id,p_verified_email,p_tenant_id);
  end if;
  if coalesce(m.revision,0)<>p_expected_revision then raise exception 'native_website_mapping_revision_conflict'; end if;
  insert into public.website_native_fact_mappings(workspace_id,tenant_stable_id,revision,mapping,updated_by)
    values(p_workspace_id,t.stable_id,p_expected_revision+1,p_mapping,p_user_id)
    on conflict(workspace_id,tenant_stable_id) do update set revision=excluded.revision,mapping=excluded.mapping,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  return public.read_native_website_fact_mapping(p_workspace_id,p_user_id,p_verified_email,p_tenant_id);
end $$;

create function public.claim_native_website_mapped_fact_review(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_record_revision bigint,p_claim_token uuid,p_section text,p_mapping_revision bigint) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare access text; t public.tenants; actual_revision bigint; m public.website_native_fact_mappings;
begin
  access:=public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
  if access<>'owner' and not(access='admin' and public.needs_you_provider_id(p_workspace_id,p_user_id,p_verified_email) is not null) then raise exception 'business_record_access_denied'; end if;
  if p_section is null or p_section not in ('contact','settings','services') or p_mapping_revision is null or p_mapping_revision<0 then raise exception 'native_website_mapping_invalid'; end if;
  select revision into actual_revision from public.business_records where workspace_id=p_workspace_id for share;
  if not found or actual_revision is distinct from p_record_revision then return false; end if;
  select * into t from public.tenants where id=p_tenant_id and active and delivery_model='custom_repo' for share;
  if t.id is null or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id) then raise exception 'business_record_access_denied'; end if;
  if exists(select 1 from public.workspace_release_flags where workspace_id=p_workspace_id and flag='systems' and state='off') then return false; end if;
  select * into m from public.website_native_fact_mappings where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id for share;
  if coalesce(m.revision,0)<>p_mapping_revision then return false; end if;
  if (p_section='settings' and not coalesce(m.mapping->'fields' ? 'display_name',false))
    or (p_section='services' and jsonb_array_length(coalesce(m.mapping->'services','[]'::jsonb))=0)
    or (p_section='contact' and not coalesce(m.mapping->'fields','["phone","email","address","hours"]'::jsonb) ?| array['phone','email','address','hours']) then return false; end if;
  insert into public.website_native_fact_reviews(claim_token,workspace_id,tenant_stable_id,record_revision,claimed_by,section,mapping_revision)
    values(p_claim_token,p_workspace_id,t.stable_id,p_record_revision,p_user_id,p_section,p_mapping_revision) on conflict do nothing;
  return found;
end $$;

-- Additive receipt detail: service-only owner confirmations must prepare mapped
-- service drafts too, without widening the public confirmed-facts projection.
create or replace function public.business_fact_confirmation_json(r public.business_record_fact_confirmations) returns jsonb
language sql stable set search_path=public,pg_temp as $$
  select jsonb_build_object('decisionId',r.decision_id,'workspaceId',r.workspace_id,'recordRevision',r.record_revision,
    'revisionHash',r.revision_hash,'decidedByKind',r.decided_by_kind,'changeCount',jsonb_array_length(r.changes),
    'factKeys',coalesce((select jsonb_agg(c->>'id' order by c->>'id') from jsonb_array_elements(r.changes) c where c->>'entity'='fact'),'[]'::jsonb),
    'servicesChanged',exists(select 1 from jsonb_array_elements(r.changes) c where c->>'entity'='service'),
    'serviceIds',coalesce((select jsonb_agg(c->>'id' order by c->>'id') from jsonb_array_elements(r.changes) c where c->>'entity'='service'),'[]'::jsonb), 'confirmedAt',r.confirmed_at)
$$;

update release_rollback_baseline.native_fact_mappings set forward_confirmation_hash=md5(pg_get_functiondef('public.business_fact_confirmation_json(public.business_record_fact_confirmations)'::regprocedure));

revoke all on function public.read_native_website_fact_mapping(uuid,uuid,text,text),public.save_native_website_fact_mapping(uuid,uuid,text,text,bigint,jsonb),public.claim_native_website_mapped_fact_review(uuid,uuid,text,text,bigint,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.read_native_website_fact_mapping(uuid,uuid,text,text),public.save_native_website_fact_mapping(uuid,uuid,text,text,bigint,jsonb),public.claim_native_website_mapped_fact_review(uuid,uuid,text,text,bigint,uuid,text,bigint) to service_role;
commit;
