\set ON_ERROR_STOP on
-- Dental intake (20261028100500-100700). Fictional rows on a disposable cluster, inside one transaction.
begin;
create function pg_temp.vi_assert(ok boolean, note text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'vertical intake assertion: %', note; end if; end $$;
create function pg_temp.vi_refuse(statement text, reason text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(reason in sqlerrm) = 0 then raise exception 'expected %, got % (%)', reason, sqlerrm, statement; end if;
    return;
  end;
  raise exception 'expected refusal %, succeeded: %', reason, statement;
end $$;

-- ---- (a) the flag ----
select pg_temp.vi_assert('vertical_intake' = any(public.workspace_release_flag_names()), '(a) vertical_intake is a known release flag');

-- ---- (b) insurance_accepted ----
select pg_temp.vi_assert(public.business_record_fact_valid('insurance_accepted', '{"carriers":["Delta Dental PPO","Cigna"]}'), '(b) a plan list is valid');
select pg_temp.vi_assert(public.business_record_fact_valid('insurance_accepted', '{"carriers":["Cigna"],"summary":"Most plans."}'), '(b) a summary is valid');
select pg_temp.vi_assert(not public.business_record_fact_valid('insurance_accepted', '{"carriers":["Delta","delta"]}'), '(b) repeats in any case are refused');
select pg_temp.vi_assert(not public.business_record_fact_valid('insurance_accepted', '{"carriers":[]}'), '(b) an empty list is refused');
select pg_temp.vi_assert(not public.business_record_fact_valid('insurance_accepted', '{"carriers":["x"],"extra":1}'), '(b) unknown keys are refused');
select pg_temp.vi_assert(not public.business_record_fact_valid('insurance_accepted', jsonb_build_object('carriers', (select jsonb_agg('p' || n) from generate_series(1,61) n))), '(b) 61 plans are refused');
select pg_temp.vi_assert(public.business_record_fact_valid('phone', '"716-555-0100"'), '(b) other keys still use the old rules');
select pg_temp.vi_assert(not public.business_record_fact_valid('phone', '"12"'), '(b) other keys still refuse bad values');
select pg_temp.vi_assert(not exists (
  select 1 from pg_constraint c where c.contype = 'c' and pg_get_constraintdef(c.oid) like '%business_record_fact_valid_before_insurance(%'),
  '(b) no CHECK constraint still calls the renamed validator');
select pg_temp.vi_assert((select count(*) from pg_constraint c where c.contype = 'c' and pg_get_constraintdef(c.oid) like '%business_record_fact_valid(%') >= 2,
  '(b) the facts table and the inquiry fact proposals call the wrapper');
select pg_temp.vi_assert((select pg_get_constraintdef(oid) from pg_constraint where conname = 'business_record_facts_fact_key_check') like '%insurance_accepted%',
  '(b) the fact key check lists insurance_accepted');

insert into public.users(id, email, verified_at) values ('28100500-0000-4000-8000-000000000001', 'vi-owner@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values ('28100500-0000-4000-8000-000000000010', 'customer', 'North Dental', '28100500-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000001', 'owner', '28100500-0000-4000-8000-000000000001');
select pg_temp.vi_refuse($$insert into public.business_record_facts(workspace_id, fact_key, value, source, verified, updated_by, updated_at)
  values ('28100500-0000-4000-8000-000000000010', 'insurance_accepted', '{"carriers":["A","a"]}', 'owner', true, '28100500-0000-4000-8000-000000000001', now())$$, 'violates check constraint');
select public.patch_business_record('28100500-0000-4000-8000-000000000010', '28100500-0000-4000-8000-000000000001', 'vi-owner@example.test', 'owner', 0,
  '{"facts":{"insurance_accepted":{"value":{"carriers":["Delta Dental PPO","Cigna"]},"verified":true}}}', gen_random_uuid(), repeat('a', 64));
select pg_temp.vi_assert((select value->'carriers'->>0 from public.business_record_facts where workspace_id = '28100500-0000-4000-8000-000000000010' and fact_key = 'insurance_accepted') = 'Delta Dental PPO',
  '(b) an owner can record the plans');
select pg_temp.vi_assert((public.business_confirmed_public_facts('28100500-0000-4000-8000-000000000010') #> '{facts,insurance_accepted,carriers,1}') = '"Cigna"',
  '(b) business_confirmed_public_facts already carries it');
select pg_temp.vi_assert(not exists (select 1 from public.business_policies where workspace_id = '28100500-0000-4000-8000-000000000010' and policy_key = 'insurance_accepted'),
  '(b) it is not a policy');

-- INSERT-SECTION-MARKER
rollback;
