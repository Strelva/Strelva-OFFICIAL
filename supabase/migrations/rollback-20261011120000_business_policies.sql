-- Rollback is safe before new policy facts are accepted. After use, refuse
-- rather than discard facts or leave history/undo referring to unsupported keys.
-- service_area already existed and is unaffected.
begin;
set local lock_timeout = '3s';
lock table public.business_record_facts in access exclusive mode;
do $$ begin
  if md5(pg_get_functiondef(to_regprocedure('public.business_record_fact_valid(text,jsonb)')))
    is distinct from '727a4c516e769ed089e2684021359a70' then
    raise exception 'business_policies_rollback_wrong_order_or_validator_drift';
  end if;
  if exists(select 1 from public.business_record_facts where fact_key in ('cancellation','deposit','payment_methods','age_waiver','booking_rules','response_time'))
    or exists(select 1 from public.business_record_revisions r, jsonb_array_elements(r.changes) c
      where c->>'entity'='fact' and c->>'id' in ('cancellation','deposit','payment_methods','age_waiver','booking_rules','response_time')) then
    raise exception 'business_policies_rollback_requires_data_preservation';
  end if;
end $$;
drop function public.read_business_policies(uuid,uuid,text);
drop trigger business_policy_project on public.business_record_facts;
drop function public.business_policy_project();
drop table public.business_policies;
alter table public.business_record_facts drop constraint business_record_facts_fact_key_check;
alter table public.business_record_facts add constraint business_record_facts_fact_key_check check (
  fact_key in ('legal_name','display_name','phone','email','address','service_area','hours','links','description','owner_recipient')
);
create or replace function public.business_record_fact_valid(p_key text, p_value jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare item jsonb;
begin
  if p_value is null or octet_length(p_value::text) > 64000 then return false; end if;
  case p_key
    when 'legal_name', 'display_name' then
      return public.business_record_text_valid(p_value, 1, 160);
    when 'phone' then
      return public.business_record_text_valid(p_value, 3, 40)
        and public.business_contact_phone_key(p_value #>> '{}') is not null;
    when 'email' then
      return jsonb_typeof(p_value) = 'string'
        and public.business_record_email_valid(p_value #>> '{}')
        and (p_value #>> '{}') = lower(btrim(p_value #>> '{}'));
    when 'description' then
      return public.business_record_text_valid(p_value, 1, 2000);
    when 'owner_recipient' then
      -- Who Strelva notifies on the business's behalf. Recorded, never sent here.
      return jsonb_typeof(p_value) = 'object'
        and (p_value - array['email','name']::text[]) = '{}'::jsonb
        and jsonb_typeof(p_value->'email') = 'string'
        and public.business_record_email_valid(p_value->>'email')
        and (p_value->>'email') = lower(btrim(p_value->>'email'))
        and (not (p_value ? 'name') or public.business_record_text_valid(p_value->'name', 1, 160));
    when 'address' then
      if jsonb_typeof(p_value) <> 'object'
        or (p_value - array['formatted','line1','line2','city','region','postalCode','country']::text[]) <> '{}'::jsonb
        or (p_value->'formatted' is null and p_value->'line1' is null) then return false; end if;
      for item in select value from jsonb_each(p_value) loop
        if not public.business_record_text_valid(item, 1, 200) then return false; end if;
      end loop;
      return true;
    when 'service_area' then
      if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 1 and 100 then return false; end if;
      for item in select value from jsonb_array_elements(p_value) loop
        if not public.business_record_text_valid(item, 1, 120) then return false; end if;
      end loop;
      return true;
    when 'links' then
      if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 1 and 30 then return false; end if;
      for item in select value from jsonb_array_elements(p_value) loop
        if jsonb_typeof(item) <> 'object'
          or (item - array['kind','url','label']::text[]) <> '{}'::jsonb
          or item->>'kind' is null
          or item->>'kind' not in ('website','booking','google_maps','google_business','instagram','facebook','linkedin','yelp','tiktok','x','youtube','other')
          or jsonb_typeof(item->'url') is distinct from 'string'
          or char_length(item->>'url') not between 8 and 2048
          or item->>'url' !~ '^https?://[^[:space:]]+$'
          or (item ? 'label' and not public.business_record_text_valid(item->'label', 1, 80)) then
          return false;
        end if;
      end loop;
      return true;
    when 'hours' then
      if jsonb_typeof(p_value) <> 'object'
        or (p_value - array['timezone','weekly','overrides']::text[]) <> '{}'::jsonb
        or not public.business_record_text_valid(p_value->'timezone', 1, 64)
        or jsonb_typeof(p_value->'weekly') is distinct from 'array'
        or jsonb_array_length(p_value->'weekly') > 70
        or (p_value ? 'overrides' and (jsonb_typeof(p_value->'overrides') <> 'array' or jsonb_array_length(p_value->'overrides') > 366)) then
        return false;
      end if;
      for item in select value from jsonb_array_elements(p_value->'weekly') loop
        if jsonb_typeof(item) <> 'object'
          or (item - array['day','opens','closes']::text[]) <> '{}'::jsonb
          or jsonb_typeof(item->'day') is distinct from 'number'
          or (item->>'day') !~ '^[0-6]$'
          or not public.business_record_time_valid(item->'opens')
          or not public.business_record_time_valid(item->'closes')
          or item->>'opens' >= item->>'closes' then
          return false;
        end if;
      end loop;
      for item in select value from jsonb_array_elements(coalesce(p_value->'overrides', '[]'::jsonb)) loop
        if jsonb_typeof(item) <> 'object'
          or (item - array['date','closed','opens','closes','label']::text[]) <> '{}'::jsonb
          or jsonb_typeof(item->'date') is distinct from 'string'
          or (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
          or jsonb_typeof(item->'closed') is distinct from 'boolean'
          or ((item->>'closed')::boolean and (item ? 'opens' or item ? 'closes'))
          or (not (item->>'closed')::boolean and (
               not public.business_record_time_valid(item->'opens')
               or not public.business_record_time_valid(item->'closes')
               or item->>'opens' >= item->>'closes'))
          or (item ? 'label' and not public.business_record_text_valid(item->'label', 1, 120)) then
          return false;
        end if;
        begin
          if to_char((item->>'date')::date, 'YYYY-MM-DD') <> item->>'date' then return false; end if;
        exception when others then return false;
        end;
      end loop;
      return true;
    else
      return false;
  end case;
end;
$$;

drop function public.business_policy_valid(text,jsonb);
drop function public.business_policy_integer_valid(jsonb,numeric,numeric);
commit;
