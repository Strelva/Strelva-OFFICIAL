-- Rollback for 20261028100600_business_record_insurance_fact.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
begin;
set local lock_timeout='3s';

do $$ begin
  if exists (select 1 from public.business_record_facts where fact_key = 'insurance_accepted') then
    raise exception 'insurance_accepted facts exist';
  end if;
end $$;

alter table public.business_record_facts drop constraint business_record_facts_fact_key_check;
alter table public.business_record_facts add constraint business_record_facts_fact_key_check check (
  fact_key in ('legal_name','display_name','phone','email','address','service_area','hours','links','description','owner_recipient','cancellation','deposit','payment_methods','age_waiver','booking_rules','response_time')
);

-- Constraints that call the wrapper must be dropped before it can be; re-add them against the restored original.
create temporary table _insurance_fact_checks on commit drop as
  select c.conrelid::regclass::text rel, c.conname, pg_get_constraintdef(c.oid) def from pg_constraint c
  where c.contype = 'c' and pg_get_constraintdef(c.oid) like '%business_record_fact_valid(%';
do $$ declare r record; begin
  for r in select * from _insurance_fact_checks loop
    execute format('alter table %s drop constraint %I', r.rel, r.conname);
  end loop;
end $$;

drop function public.business_record_fact_valid(text,jsonb);
alter function public.business_record_fact_valid_before_insurance(text,jsonb) rename to business_record_fact_valid;
revoke all on function public.business_record_fact_valid(text,jsonb) from public, anon, authenticated;

do $$ declare r record; begin
  for r in select * from _insurance_fact_checks loop
    execute format('alter table %s add constraint %I %s not valid', r.rel, r.conname, r.def);
    execute format('alter table %s validate constraint %I', r.rel, r.conname);
  end loop;
end $$;

commit;
