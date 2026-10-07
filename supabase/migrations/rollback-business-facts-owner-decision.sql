-- Reverses 20261011133700_business_facts_owner_decision.sql.
-- WARNING: restoring these readers lets operator-written facts render on
-- client sites again with no owner decision (#509). Run only to unblock a
-- failed release, and reapply the forward migration before rollout.
-- The confirmed copy and decision receipts are dropped; the working record
-- (business_record_facts, business_services, revisions) is untouched.
begin;
set local lock_timeout = '3s';

create or replace function public.read_hosted_website_business_facts(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare ws uuid;
begin
  select p.workspace_id into ws from public.website_document_publications p
    join public.tenants t on t.id=p.tenant_id
    join public.business_records b on b.workspace_id=p.workspace_id
    where p.tenant_id=p_tenant_id and t.active and t.delivery_model='platform_template'
      and not public.workspace_exit_completed(p.workspace_id)
      and not exists(select 1 from public.tenant_workspace_links l where l.tenant_stable_id=t.stable_id and l.workspace_id<>p.workspace_id);
  if ws is null then return null; end if;
  return jsonb_build_object('revision',coalesce((select revision from public.business_records where workspace_id=ws),0),
    'facts',coalesce((select jsonb_object_agg(fact_key,value) from public.business_record_facts where workspace_id=ws
      and fact_key in ('display_name','phone','email','address','hours') and (verified or source in ('owner','operator'))),'{}'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('name',name,'description',description,'priceText',price_text) order by position,id)
      from (select * from public.business_services where workspace_id=ws and active and (verified or source in ('owner','operator')) order by position,id limit 40) s),'[]'::jsonb));
end $$;

create or replace function public.read_connected_site_context(p_public_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_revision bigint;
begin
  select * into v_site from public.connected_sites where public_key = p_public_key and status = 'active';
  if v_site.id is null then return null; end if;
  select revision into v_revision from public.business_records where workspace_id = v_site.business_workspace_id;
  return jsonb_build_object(
    'revision', coalesce(v_revision, 0),
    'facts', coalesce((select jsonb_object_agg(f.fact_key, f.value) from public.business_record_facts f
      where f.workspace_id = v_site.business_workspace_id and f.fact_key <> 'owner_recipient' and (f.verified or f.source in ('owner','operator'))), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'description', s.description, 'priceText', s.price_text) order by s.position, s.id)
      from public.business_services s where s.workspace_id = v_site.business_workspace_id and s.active and (s.verified or s.source in ('owner','operator'))), '[]'::jsonb),
    'site', jsonb_build_object('captureForms', v_site.capture_forms, 'injectSchema', v_site.inject_schema));
end $$;

drop function if exists public.read_confirmed_business_facts(uuid, uuid, text);
drop function if exists public.confirm_business_facts(uuid, uuid, text);
drop function if exists public.business_fact_confirmation_json(public.business_record_fact_confirmations);
drop function if exists public.read_business_fact_review(uuid);
drop function if exists public.business_trusted_owner_recipient(uuid);
drop trigger if exists business_record_revisions_confirm_owner_write on public.business_record_revisions;
drop function if exists public.business_record_confirm_owner_write();
drop function if exists public.business_record_owner_actor(uuid, uuid);
drop function if exists public.business_record_public_content(text, jsonb);
drop table if exists public.business_record_fact_confirmations;
drop function if exists public.business_record_fact_confirmation_immutable();
drop table if exists public.business_record_confirmed;
commit;
