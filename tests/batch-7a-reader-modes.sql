\set ON_ERROR_STOP on
-- Batch 7A functions in the transaction mode PostgREST picks (see
-- reader-rpc-volatility-schema.sql): STABLE/IMMUTABLE run READ ONLY, where a
-- row lock fails with SQLSTATE 25006. No 7A function that is STABLE or
-- IMMUTABLE may lock rows itself or call a check that does; the service-role
-- readers are then called READ ONLY as service_role.

do $$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.provolatile <> 'v'
      and p.proname = any(array['provider_seat_direct_role', 'provider_seat_businesses', 'read_version_actor',
        'system_version_member_role', 'system_version_actor_workspaces', 'list_provided_clients', 'read_agency_provider_seats',
        'agency_effect_names', 'agency_effect_allowed', 'agency_verification_state', 'read_agency_verification',
        'read_agency_verification_history', 'platform_service_effect', 'platform_serving_provider', 'platform_serves_business',
        'strelva_runs_business', 'platform_service_identity', 'business_payer_party', 'agency_billing_recipient',
        'business_billing_json', 'read_business_billing'])
      and p.prosrc ~* '(for (no key |key )?(share|update)|tenant_conversion_assert_operator|business_record_assert_actor|provider_seat_assert_owner|workspace_require|provider_seat_role|system_actor_scope)';
  if bad is not null then raise exception 'batch 7A reader locks rows but is not VOLATILE: %', bad; end if;
  if (select provolatile from pg_proc where oid = 'public.read_agency_verification_history(text,uuid)'::regprocedure) <> 'v' then
    raise exception 'read_agency_verification_history must be VOLATILE (its operator check locks)';
  end if;
end $$;

begin transaction isolation level read committed read only;
set local role service_role;
do $$
declare
  call text;
begin
  foreach call in array array[
    'select public.read_version_actor(gen_random_uuid(), ''nobody@example.test'')',
    'select public.list_provided_clients(gen_random_uuid(), ''nobody@example.test'', gen_random_uuid())',
    'select public.read_agency_provider_seats(gen_random_uuid(), ''nobody@example.test'', gen_random_uuid())',
    'select public.agency_effect_allowed(gen_random_uuid(), ''email'')',
    'select public.read_agency_verification(gen_random_uuid(), ''nobody@example.test'', gen_random_uuid())',
    'select public.platform_serves_business(gen_random_uuid(), ''publish'')',
    'select public.read_business_billing(gen_random_uuid(), gen_random_uuid(), ''nobody@example.test'')'
  ] loop
    begin
      execute call;
    exception when others then
      if sqlstate = '25006' then raise exception 'READ ONLY refused a batch 7A reader: %', call; end if;
    end;
  end loop;
end $$;
rollback;
