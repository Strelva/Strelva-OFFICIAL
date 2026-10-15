-- Dental intake: one new business-record fact, insurance_accepted.
-- Chains on the newest business_record_fact_valid by renaming it and wrapping it,
-- so no other fact key's rule is copied or changed.
begin;
set local lock_timeout='3s';

alter function public.business_record_fact_valid(text,jsonb) rename to business_record_fact_valid_before_insurance;
revoke all on function public.business_record_fact_valid_before_insurance(text,jsonb) from public, anon, authenticated;

create function public.business_record_fact_valid(p_key text, p_value jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare item jsonb;
begin
  if p_key <> 'insurance_accepted' then
    return public.business_record_fact_valid_before_insurance(p_key, p_value);
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_value) k where k not in ('carriers','summary')) then return false; end if;
  if not (p_value ? 'carriers') or jsonb_typeof(p_value->'carriers') <> 'array'
    or jsonb_array_length(p_value->'carriers') not between 1 and 60 then return false; end if;
  for item in select value from jsonb_array_elements(p_value->'carriers') loop
    if public.business_record_text_valid(item, 1, 120) is not true then return false; end if;
  end loop;
  if (select count(distinct lower(value #>> '{}')) from jsonb_array_elements(p_value->'carriers')) <> jsonb_array_length(p_value->'carriers') then return false; end if;
  if p_value ? 'summary' and public.business_record_text_valid(p_value->'summary', 1, 500) is not true then return false; end if;
  return true;
end;
$$;
revoke all on function public.business_record_fact_valid(text,jsonb) from public, anon, authenticated;

-- A CHECK constraint binds to the function it was created with (by OID), so after the rename
-- every constraint prints the renamed name. Re-point each one at the wrapper under the original name.
do $$ declare r record; begin
  for r in select c.conrelid::regclass::text rel, c.conname, pg_get_constraintdef(c.oid) def from pg_constraint c
    where c.contype = 'c' and pg_get_constraintdef(c.oid) like '%business_record_fact_valid_before_insurance(%' loop
    execute format('alter table %s drop constraint %I', r.rel, r.conname);
    execute format('alter table %s add constraint %I %s not valid', r.rel, r.conname, replace(r.def, 'business_record_fact_valid_before_insurance(', 'business_record_fact_valid('));
    execute format('alter table %s validate constraint %I', r.rel, r.conname);
  end loop;
end $$;

alter table public.business_record_facts drop constraint business_record_facts_fact_key_check;
alter table public.business_record_facts add constraint business_record_facts_fact_key_check check (
  fact_key in ('legal_name','display_name','phone','email','address','service_area','hours','links','description','owner_recipient','cancellation','deposit','payment_methods','age_waiver','booking_rules','response_time','insurance_accepted')
);

commit;
