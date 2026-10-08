-- Public business facts come only from the owner-confirmed copy (#509 after
-- #521). 20261012110000_business_pages runs after
-- 20261011133700_business_facts_owner_decision and replaced the connected-site
-- reader with business_confirmed_public_facts, which reads the working record
-- (verified or owner-sourced rows). That let an operator's verified edit reach
-- connect.js, /biz/{handle}, llms.txt and the JSON-LD paste block with no
-- owner decision.
--
-- Now business_confirmed_public_facts reads business_record_confirmed: the
-- owner's own writes and owner Needs you decisions only. Same output shape:
--   facts        confirmed facts, never owner_recipient or policy keys.
--   policyFacts  confirmed policy facts that are also verified owner/operator
--                terms (#518's published-policy contract still holds).
--                updatedAt is when the owner confirmed it; updatedBy is
--                internal provenance (selectPublishedBusinessPolicies drops
--                it): the owner's write, else the working row's writer.
--   services     confirmed active services, in position order.
--   confirmedAt  the latest confirmation among what is served.
-- An unconfirmed edit to a confirmed fact keeps serving the confirmed value.
-- read_connected_site_context is redefined to call it again, so whichever of
-- #509 and #521 ran last, every public reader is this one read.
--
-- Rollback: rollback-20261013110000_public_facts_read_confirmed.sql restores
-- the 20261012110000 bodies (working-record reads). Run it only before
-- rolling back 20261012110000 or 20261011133700.
begin;
set local lock_timeout = '3s';

create or replace function public.business_confirmed_public_facts(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with policy_keys(k) as (
    select unnest(array['cancellation','deposit','service_area','payment_methods','age_waiver','booking_rules','response_time'])
  ), facts as (
    select c.entity_id fact_key, c.state->'value' value, c.state->>'source' source,
      coalesce((c.state->>'verified')::boolean, false) verified, c.confirmed_at, c.revision_sequence
    from public.business_record_confirmed c
    where c.workspace_id = p_workspace_id and c.entity = 'fact' and c.entity_id <> 'owner_recipient'
  ), policies as (
    select f.* from facts f
    where f.fact_key in (select k from policy_keys) and f.verified and f.source in ('owner','operator')
  ), services as (
    select c.state, c.entity_id, c.confirmed_at from public.business_record_confirmed c
    where c.workspace_id = p_workspace_id and c.entity = 'service' and coalesce((c.state->>'active')::boolean, false)
  )
  select jsonb_build_object(
    'revision', coalesce((select r.revision from public.business_records r where r.workspace_id = p_workspace_id), 0),
    'facts', coalesce((select jsonb_object_agg(fact_key, value) from facts
      where fact_key not in (select k from policy_keys)), '{}'::jsonb),
    -- Provenance stays server-side; selectPublishedBusinessPolicies strips IDs.
    'policyFacts', coalesce((select jsonb_object_agg(p.fact_key, jsonb_build_object(
      'value', p.value, 'source', p.source, 'verified', p.verified,
      'updatedBy', coalesce(
        (select v.actor_id from public.business_record_revisions v where v.workspace_id = p_workspace_id and v.sequence = p.revision_sequence),
        (select w.updated_by from public.business_record_facts w where w.workspace_id = p_workspace_id and w.fact_key = p.fact_key),
        (select r.updated_by from public.business_records r where r.workspace_id = p_workspace_id)),
      'updatedAt', p.confirmed_at)) from policies p), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', state->'name', 'description', state->'description',
        'priceText', state->'priceText') order by (state->>'position')::integer, entity_id) from services), '[]'::jsonb),
    'confirmedAt', (select max(confirmed_at) from (
      select confirmed_at from facts where fact_key not in (select k from policy_keys)
      union all select confirmed_at from policies
      union all select confirmed_at from services) t))
$$;
revoke all on function public.business_confirmed_public_facts(uuid) from public, anon, authenticated, service_role;

-- Same body as 20261012110000: connect.js uses exactly the server-surface read.
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
