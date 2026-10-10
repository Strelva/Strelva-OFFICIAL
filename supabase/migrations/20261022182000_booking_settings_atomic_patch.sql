-- Qualified native primary saves, distinct from never-throw legacy mirrors.
-- ON CONFLICT updates only the requested field group under the row lock.
-- No companion snapshot, native policy reset, or historical function replacement.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create function public.write_tenant_booking_settings_fields(
  p_tenant_id text, p_kind text, p_settings jsonb, p_initial_config jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v record;
  v_config jsonb;
  v_row public.booking_settings;
  v_keys text[] := array['bufferMinutes','minNoticeMinutes','maxAdvanceDays','defaultLengthMinutes','timezone','bookableHours','legacyRequiresPayment'];
  v_key text;
begin
  if p_kind is null or p_kind not in ('config','overrides')
    or jsonb_typeof(p_settings) is distinct from 'object'
    or jsonb_typeof(p_initial_config) is distinct from 'object'
    or octet_length(p_settings::text)>40000 or octet_length(p_initial_config::text)>40000 then
    raise exception 'booking_invalid';
  end if;
  -- Insert defaults are the existing legacy defaults supplied by the producer,
  -- never a read of the current row. They are ignored on conflict.
  foreach v_config in array array[p_initial_config,case when p_kind='config' then p_settings else p_initial_config end] loop
    if not (v_config ?& v_keys) or exists(select 1 from jsonb_object_keys(v_config) k where not (k=any(v_keys)))
      or jsonb_typeof(v_config->'timezone') is distinct from 'string'
      or jsonb_typeof(v_config->'bookableHours') is distinct from 'array'
      or jsonb_typeof(v_config->'legacyRequiresPayment') is distinct from 'boolean' then
      raise exception 'booking_invalid';
    end if;
    foreach v_key in array array['bufferMinutes','minNoticeMinutes','maxAdvanceDays','defaultLengthMinutes'] loop
      if jsonb_typeof(v_config->v_key) is distinct from 'number' or (v_config->>v_key) !~ '^[0-9]+$' then
        raise exception 'booking_invalid';
      end if;
    end loop;
  end loop;
  if p_kind='overrides' and (jsonb_typeof(p_settings->'bookableOverrides') is distinct from 'array'
    or not (p_settings ? 'bookableOverrides')
    or exists(select 1 from jsonb_object_keys(p_settings) k where k<>'bookableOverrides')) then
    raise exception 'booking_invalid';
  end if;
  select * into v from public.booking_tenant(p_tenant_id);
  if coalesce(v.tenant_stable_id,v.workspace_id) is null then raise exception 'booking_unknown_tenant'; end if;
  v_config := case when p_kind='config' then p_settings else p_initial_config end;
  begin
    if p_kind='config' then
      insert into public.booking_settings as s(calendar_key,tenant_stable_id,workspace_id,
        buffer_minutes,min_notice_minutes,max_advance_days,default_length_minutes,timezone,bookable_hours,legacy_requires_payment,recorded_via)
      values(coalesce(v.tenant_stable_id,v.workspace_id),v.tenant_stable_id,v.workspace_id,
        (v_config->>'bufferMinutes')::integer,(v_config->>'minNoticeMinutes')::integer,
        (v_config->>'maxAdvanceDays')::integer,(v_config->>'defaultLengthMinutes')::integer,
        v_config->>'timezone',v_config->'bookableHours',(v_config->>'legacyRequiresPayment')::boolean,'native')
      on conflict(calendar_key) do update set
        buffer_minutes=excluded.buffer_minutes,min_notice_minutes=excluded.min_notice_minutes,
        max_advance_days=excluded.max_advance_days,default_length_minutes=excluded.default_length_minutes,
        timezone=excluded.timezone,bookable_hours=excluded.bookable_hours,legacy_requires_payment=excluded.legacy_requires_payment,
        recorded_via='native',revision=s.revision+1,updated_at=clock_timestamp()
      returning * into v_row;
    else
      insert into public.booking_settings as s(calendar_key,tenant_stable_id,workspace_id,
        buffer_minutes,min_notice_minutes,max_advance_days,default_length_minutes,timezone,bookable_hours,legacy_requires_payment,
        bookable_overrides,recorded_via)
      values(coalesce(v.tenant_stable_id,v.workspace_id),v.tenant_stable_id,v.workspace_id,
        (v_config->>'bufferMinutes')::integer,(v_config->>'minNoticeMinutes')::integer,
        (v_config->>'maxAdvanceDays')::integer,(v_config->>'defaultLengthMinutes')::integer,
        v_config->>'timezone',v_config->'bookableHours',(v_config->>'legacyRequiresPayment')::boolean,
        p_settings->'bookableOverrides','native')
      on conflict(calendar_key) do update set bookable_overrides=excluded.bookable_overrides,
        recorded_via='native',revision=s.revision+1,updated_at=clock_timestamp()
      returning * into v_row;
    end if;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'booking_invalid';
  end;
  return jsonb_build_object('status',case when v_row.revision=1 then 'recorded' else 'updated' end,'revision',v_row.revision);
end;
$$;
revoke all on function public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb) to service_role;
-- Default function privileges can add EXECUTE grants not named above.
-- Reject all unexpected authority atomically before admitting the new RPC.
do $admission$
declare
  target oid := to_regprocedure('public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)');
  catalog pg_proc%rowtype;
  service_owner oid := (select oid from pg_roles where rolname='service_role');
begin
  select * into catalog from pg_proc where oid=target;
  if not found or encode(sha256(convert_to(catalog.prosrc,'UTF8')),'hex') is distinct from
    '438660a6cd739eb617287ea2ab2ecbddf54d93b687ce8afba043be485d388010' then raise exception 'booking_settings_atomic_create_source_drift'; end if;
  if catalog.proowner is distinct from (select relowner from pg_class where oid='public.booking_settings'::regclass)
    or (select lanname from pg_language where oid=catalog.prolang) is distinct from 'plpgsql'
    or catalog.prokind<>'f' or not catalog.prosecdef or catalog.proisstrict or catalog.proleakproof or catalog.proretset
    or catalog.provolatile<>'v' or catalog.proparallel<>'u' or catalog.prosupport<>0 or catalog.provariadic<>0
    or catalog.procost<>100 or catalog.prorows<>0 or catalog.probin is not null or catalog.prosqlbody is not null
    or catalog.prorettype<>'jsonb'::regtype or catalog.proargtypes is distinct from '25 25 3802 3802'::oidvector
    or catalog.proargnames is distinct from array['p_tenant_id','p_kind','p_settings','p_initial_config']::text[]
    or catalog.proallargtypes is not null or catalog.proargmodes is not null or catalog.pronargdefaults<>0
    or catalog.proconfig is distinct from array['search_path=public, pg_temp']::text[]
    or service_owner is null
    or exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
      where a.grantee not in (catalog.proowner,service_owner) or a.grantor<>catalog.proowner
        or a.privilege_type<>'EXECUTE' or a.is_grantable)
    or (select count(*) from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))))<>2
    or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
      where a.grantee=catalog.proowner and a.privilege_type='EXECUTE' and not a.is_grantable)
    or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
      where a.grantee=service_owner and a.privilege_type='EXECUTE' and not a.is_grantable)
    then raise exception 'booking_settings_atomic_create_authority_drift'; end if;
end $admission$;
commit;
