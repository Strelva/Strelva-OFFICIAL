-- Disable public business pages first. Export saved settings before reversal.
-- Refuse to discard publication consent/handles once any business adopted it.
begin;
set local lock_timeout = '3s';
lock table public.business_pages in access exclusive mode;
do $$ begin
  if exists(select 1 from public.business_pages) then
    raise exception 'business_pages_rollback_requires_data_preservation';
  end if;
end $$;

-- Restore the pre-migration connected-site reader, including its old filter.
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

-- With 20261011133700 still applied (#509), restore its confirmed-copy reader
-- instead: the old filter would serve operator edits with no owner decision.
do $do$ begin
  if to_regclass('public.business_record_confirmed') is not null then
    execute $f$
create or replace function public.read_connected_site_context(p_public_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_revision bigint;
begin
  select * into v_site from public.connected_sites where public_key = p_public_key and status = 'active';
  if v_site.id is null then return null; end if;
  select revision into v_revision from public.business_records where workspace_id = v_site.business_workspace_id;
  return jsonb_build_object(
    'revision', coalesce(v_revision, 0),
    'facts', coalesce((select jsonb_object_agg(c.entity_id, c.state->'value') from public.business_record_confirmed c
      where c.workspace_id = v_site.business_workspace_id and c.entity = 'fact' and c.entity_id <> 'owner_recipient'), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', c.state->'name', 'description', c.state->'description', 'priceText', c.state->'priceText')
        order by (c.state->>'position')::integer, c.entity_id)
      from public.business_record_confirmed c where c.workspace_id = v_site.business_workspace_id and c.entity = 'service'
        and (c.state->>'active')::boolean), '[]'::jsonb),
    'site', jsonb_build_object('captureForms', v_site.capture_forms, 'injectSchema', v_site.inject_schema));
end $$
$f$;
  end if;
end $do$;

drop function public.read_published_business_page(text);
drop function public.read_business_public_facts(uuid,uuid,text);
drop function public.set_business_page(uuid,uuid,text,text,boolean);
drop function public.read_business_page(uuid,uuid,text);
drop function public.business_page_json(public.business_pages);
drop function public.business_confirmed_public_facts(uuid);
drop table public.business_pages;
commit;
