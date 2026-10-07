-- #305: policy facts use the existing record command/history/undo machinery.
-- business_policies is a transactional read projection, never a second writer.
-- No booking enforcement, provider effect or actor-authority change.
begin;

create function public.business_policy_integer_valid(v jsonb, lo numeric, hi numeric) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(v) = 'number' then
    (v #>> '{}')::numeric between lo and hi and trunc((v #>> '{}')::numeric) = (v #>> '{}')::numeric
    else false end
$$;

create function public.business_policy_valid(p_key text, p_value jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare item jsonb; field text; allowed text[];
begin
  if p_value is null or octet_length(p_value::text) > 64000 then return false; end if;
  if p_key = 'service_area' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 1 and 100 then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      if public.business_record_text_valid(item,1,120) is not true then return false; end if;
    end loop;
    return true;
  elsif p_key = 'payment_methods' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 1 and 7 then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      if jsonb_typeof(item) <> 'string' or item #>> '{}' not in
        ('cash','credit_card','debit_card','bank_transfer','check','digital_wallet','other') then return false; end if;
    end loop;
    return (select count(distinct value) = jsonb_array_length(p_value) from jsonb_array_elements(p_value));
  end if;
  if jsonb_typeof(p_value) <> 'object' then return false; end if;
  case p_key
    when 'cancellation' then allowed := array['summary','noticeHours'];
    when 'deposit' then allowed := array['required','summary','amountCents','currency','percent'];
    when 'age_waiver' then allowed := array['minimumAge','waiverRequired','guardianRequired','summary'];
    when 'booking_rules' then allowed := array['summary','reservationRequired','advanceNoticeHours','maximumAdvanceDays'];
    when 'response_time' then allowed := array['maximumHours','summary'];
    else return false;
  end case;
  if (p_value - allowed) <> '{}'::jsonb then return false; end if;
  if p_key in ('cancellation','booking_rules') and not (p_value ? 'summary') then return false; end if;
  if p_value ? 'summary' and public.business_record_text_valid(p_value->'summary',1,2000) is not true then return false; end if;
  foreach field in array array['required','waiverRequired','guardianRequired','reservationRequired'] loop
    if p_value ? field and jsonb_typeof(p_value->field) <> 'boolean' then return false; end if;
  end loop;
  foreach field in array array['noticeHours','advanceNoticeHours'] loop
    if p_value ? field and not public.business_policy_integer_valid(p_value->field,0,8760) then return false; end if;
  end loop;
  if p_value ? 'maximumAdvanceDays' and not public.business_policy_integer_valid(p_value->'maximumAdvanceDays',0,3650) then return false; end if;
  if p_value ? 'minimumAge' and not public.business_policy_integer_valid(p_value->'minimumAge',0,120) then return false; end if;
  if p_key = 'age_waiver' and not (p_value ? 'waiverRequired') then return false; end if;
  if p_key = 'response_time' and not public.business_policy_integer_valid(p_value->'maximumHours',1,8760) then return false; end if;
  if p_key = 'deposit' then
    if not (p_value ? 'required')
      or (p_value ? 'amountCents') <> (p_value ? 'currency')
      or (p_value ? 'amountCents' and p_value ? 'percent')
      or (p_value->>'required' = 'false' and (p_value ? 'amountCents' or p_value ? 'percent')) then return false; end if;
    if p_value ? 'amountCents' and not public.business_policy_integer_valid(p_value->'amountCents',1,100000000) then return false; end if;
    if p_value ? 'percent' and not public.business_policy_integer_valid(p_value->'percent',1,100) then return false; end if;
    if p_value ? 'currency' and (jsonb_typeof(p_value->'currency') <> 'string' or p_value->>'currency' !~ '^[A-Z]{3}$') then return false; end if;
  end if;
  return true;
end;
$$;

create or replace function public.business_record_fact_valid(p_key text, p_value jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare item jsonb;
begin
  if p_value is null or octet_length(p_value::text) > 64000 then return false; end if;
  case p_key
    when 'cancellation','deposit','payment_methods','age_waiver','booking_rules','response_time' then
      return public.business_policy_valid(p_key, p_value);
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

alter table public.business_record_facts drop constraint business_record_facts_fact_key_check;
alter table public.business_record_facts add constraint business_record_facts_fact_key_check check (
  fact_key in ('legal_name','display_name','phone','email','address','service_area','hours','links','description','owner_recipient','cancellation','deposit','payment_methods','age_waiver','booking_rules','response_time')
);

create table public.business_policies (
  workspace_id uuid not null,
  policy_key text not null,
  value jsonb not null check (public.business_policy_valid(policy_key,value)),
  source text not null check (source = any(public.business_record_sources())),
  verified boolean not null check (not verified or source in ('owner','operator')),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null,
  primary key (workspace_id,policy_key),
  foreign key (workspace_id,policy_key) references public.business_record_facts(workspace_id,fact_key) on delete cascade
);
alter table public.business_policies enable row level security;
revoke all on public.business_policies from public,anon,authenticated,service_role;

create function public.business_policy_project() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.fact_key in ('service_area','cancellation','deposit','payment_methods','age_waiver','booking_rules','response_time') then
    insert into public.business_policies(workspace_id,policy_key,value,source,verified,updated_by,updated_at)
    values(new.workspace_id,new.fact_key,new.value,new.source,new.verified,new.updated_by,new.updated_at)
    on conflict(workspace_id,policy_key) do update set value=excluded.value,source=excluded.source,
      verified=excluded.verified,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;
  return new;
end;
$$;
create trigger business_policy_project after insert or update on public.business_record_facts
for each row execute function public.business_policy_project();
-- Existing service areas retain their value and confirmation status.
insert into public.business_policies(workspace_id,policy_key,value,source,verified,updated_by,updated_at)
select workspace_id,fact_key,value,source,verified,updated_by,updated_at
from public.business_record_facts where fact_key='service_area';

create function public.read_business_policies(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare record jsonb; confirmed jsonb; unconfirmed jsonb;
begin
  -- Reuse the exact actor-checked read; no new authorization function.
  record := public.read_business_record(p_workspace_id,p_user_id,p_verified_email);
  select coalesce(jsonb_object_agg(key,value) filter (where value->>'verified'='true' and value->>'source' in ('owner','operator')),'{}'),
         coalesce(jsonb_object_agg(key,value) filter (where value->>'verified'<>'true' or value->>'source' not in ('owner','operator')),'{}')
    into confirmed,unconfirmed from jsonb_each(record->'facts') where key in ('service_area','cancellation','deposit','payment_methods','age_waiver','booking_rules','response_time');
  return jsonb_build_object('workspaceId',p_workspace_id,'revision',record->'revision','confirmed',confirmed,'unconfirmed',unconfirmed);
end;
$$;
revoke all on function public.business_policy_integer_valid(jsonb,numeric,numeric),public.business_policy_valid(text,jsonb),
  public.business_policy_project(),public.read_business_policies(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_business_policies(uuid,uuid,text) to service_role;
comment on table public.business_policies is 'Read projection of policy facts. Write only through patch_business_record; history and undo remain fact revisions.';
commit;
