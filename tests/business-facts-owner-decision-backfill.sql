\set ON_ERROR_STOP on
-- #509: the forward migration rebuilds the confirmed copy from the owner's
-- own history (fixture: business-facts-owner-decision-backfill-seed.sql).
-- Later provider overwrites, deletions and undos stay pending; they never
-- erase what the owner last decided. Read-only checks, rolled back.
begin;
do $$
declare
  ws uuid := '65091000-0000-4000-8000-000000000001';
  owner_id uuid := '65091000-0000-4000-8000-000000000002';
  facts jsonb; review jsonb;
begin
  facts := public.read_confirmed_business_facts(ws, owner_id, 'fb-owner@example.test')->'facts';
  if facts->>'phone' is distinct from '716-555-0301' then raise exception 'backfill: provider overwrite replaced the owner phone (%)', facts; end if;
  if facts->>'display_name' is distinct from 'Owner Backfill Co' then raise exception 'backfill: provider deletion erased the owner name (%)', facts; end if;
  if facts->>'email' is distinct from 'owner@backfill.example.test' then raise exception 'backfill: owner undo not honoured (%)', facts; end if;
  if facts ? 'description' then raise exception 'backfill: owner deletion not honoured (%)', facts; end if;
  if facts->'hours'->'weekly'->0->>'opens' is distinct from '08:00' then raise exception 'backfill: provider undo erased the owner hours (%)', facts; end if;
  if exists (select 1 from public.business_record_confirmed where workspace_id = ws and (confirmed_by_kind <> 'owner_write' or revision_sequence is null)) then
    raise exception 'backfill: confirmed rows cite the owner revision';
  end if;
  review := public.read_business_fact_review(ws);
  if (select jsonb_object_agg(c->>'id', jsonb_build_array(c->'before', c->'after')) from jsonb_array_elements(review->'changes') c) is distinct from jsonb_build_object(
      'phone', jsonb_build_array('716-555-0301', '716-555-0399'),
      'display_name', jsonb_build_array('Owner Backfill Co', null),
      'description', jsonb_build_array(null, 'Operator copy.'),
      'hours', jsonb_build_array('{"timezone":"America/New_York","weekly":[{"day":2,"opens":"08:00","closes":"16:00"}]}'::jsonb, null)) then
    raise exception 'backfill: exactly the provider changes wait on the owner (%)', review->'changes';
  end if;
end $$;
rollback;
