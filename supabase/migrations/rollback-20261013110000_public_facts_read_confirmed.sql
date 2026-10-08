-- Reverses 20261013110000_public_facts_read_confirmed.sql: restores the
-- 20261012110000_business_pages bodies, which read the working record
-- (verified or owner-sourced rows) instead of the owner-confirmed copy.
-- WARNING: an operator's verified edit then reaches connect.js, /biz pages,
-- llms.txt and the JSON-LD block with no owner decision (#509). Run only to
-- unblock a failed release, and reapply the forward migration before rollout.
-- Nothing is dropped; the confirmed copy is untouched.
begin;
set local lock_timeout = '3s';

create or replace function public.business_confirmed_public_facts(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with facts as (
    select f.fact_key, f.value, f.source, f.verified, f.updated_by, f.updated_at from public.business_record_facts f
    where f.workspace_id = p_workspace_id and f.fact_key <> 'owner_recipient' and (f.verified or f.source = 'owner')
      and (f.fact_key not in ('cancellation','deposit','service_area','payment_methods','age_waiver','booking_rules','response_time')
        or (f.verified and f.source in ('owner','operator')))
  ), services as (
    select s.name, s.description, s.price_text, s.position, s.id, s.updated_at from public.business_services s
    where s.workspace_id = p_workspace_id and s.active and (s.verified or s.source = 'owner')
  )
  select jsonb_build_object(
    'revision', coalesce((select r.revision from public.business_records r where r.workspace_id = p_workspace_id), 0),
    'facts', coalesce((select jsonb_object_agg(fact_key, value) from facts
      where fact_key not in ('cancellation','deposit','service_area','payment_methods','age_waiver','booking_rules','response_time')), '{}'::jsonb),
    -- Provenance stays server-side; selectPublishedBusinessPolicies strips IDs.
    'policyFacts', coalesce((select jsonb_object_agg(fact_key, jsonb_build_object(
      'value', value, 'source', source, 'verified', verified, 'updatedBy', updated_by, 'updatedAt', updated_at)) from facts
      where fact_key in ('cancellation','deposit','service_area','payment_methods','age_waiver','booking_rules','response_time')
        and verified and source in ('owner','operator')), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'description', description, 'priceText', price_text) order by position, id) from services), '[]'::jsonb),
    'confirmedAt', (select max(updated_at) from (select updated_at from facts union all select updated_at from services) t))
$$;
revoke all on function public.business_confirmed_public_facts(uuid) from public, anon, authenticated, service_role;

create or replace function public.read_connected_site_context(p_public_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites;
begin
  select * into v_site from public.connected_sites where public_key = p_public_key and status = 'active';
  if v_site.id is null then return null; end if;
  return public.business_confirmed_public_facts(v_site.business_workspace_id)
    || jsonb_build_object('site', jsonb_build_object('captureForms', v_site.capture_forms, 'injectSchema', v_site.inject_schema));
end $$;

commit;
