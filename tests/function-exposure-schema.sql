-- No security-definer function in public may be callable with the public
-- (anon) or signed-in (authenticated) key. Trigger functions are excluded:
-- PostgreSQL refuses to call them outside a trigger. The row-security
-- helpers are intentionally callable by signed-in users: policies use them.
-- Newsletter backfill is a session-bound operator RPC: it derives auth.uid()
-- and checks current verified, unrevoked operator authority in its transaction.
-- Super-admin grant/revoke are also session-bound operator RPCs: authenticated
-- calls derive the actor from auth.uid() and require a verified active operator.
do $$
declare
  exposed text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into exposed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and p.proname not in ('app_is_super_admin', 'app_tenant_ids', 'app_tenant_stable_ids')
    and p.oid is distinct from to_regprocedure('public.agency_prospect_member(uuid)')
    and p.oid is distinct from to_regprocedure('public.backfill_newsletter_contacts(text,uuid,boolean,text,integer)')
    and p.oid is distinct from to_regprocedure('public.grant_super_admin(uuid,text,uuid)')
    and p.oid is distinct from to_regprocedure('public.revoke_super_admin(uuid,text,uuid)')
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));
  if exposed is not null then
    raise exception 'security-definer functions callable with a public key: %', exposed;
  end if;
end $$;

-- Access RPCs are available only to a signed-in active operator or the
-- service-role CLI; the anonymous key cannot execute them.
do $$
declare
  grant_rpc regprocedure := to_regprocedure('public.grant_super_admin(uuid,text,uuid)');
  revoke_rpc regprocedure := to_regprocedure('public.revoke_super_admin(uuid,text,uuid)');
begin
  if (grant_rpc is null) <> (revoke_rpc is null) then
    raise exception 'only one super-admin access RPC is present';
  end if;
  if grant_rpc is not null then
    if not has_function_privilege('authenticated', grant_rpc, 'execute')
      or has_function_privilege('anon', grant_rpc, 'execute')
      or not has_function_privilege('service_role', grant_rpc, 'execute')
      or not has_function_privilege('authenticated', revoke_rpc, 'execute')
      or has_function_privilege('anon', revoke_rpc, 'execute')
      or not has_function_privilege('service_role', revoke_rpc, 'execute') then
      raise exception 'super-admin access RPC execute boundary is incorrect';
    end if;
  end if;
end $$;

-- The service role keeps the one direct call the app makes.
do $$
begin
  if not has_function_privilege('service_role', 'public.create_owned_workspace(uuid,text,text,text)'::regprocedure, 'execute') then
    raise exception 'service_role lost execute on create_owned_workspace';
  end if;
end $$;

-- This one request-session RPC is intentional, but it must never become an
-- anonymous or service-role backfill path. Its authority tests run separately.
do $$
declare backfill regprocedure := to_regprocedure('public.backfill_newsletter_contacts(text,uuid,boolean,text,integer)');
begin
  if backfill is not null and (
    not has_function_privilege('authenticated', backfill, 'execute')
    or has_function_privilege('anon', backfill, 'execute')
    or has_function_privilege('service_role', backfill, 'execute')
  ) then raise exception 'newsletter backfill lost its request-session execute boundary'; end if;
end $$;

-- JWT-bound RLS helper exposes only whether the caller belongs to this agency.
do $$
declare helper regprocedure := to_regprocedure('public.agency_prospect_member(uuid)');
begin
  if helper is not null and (
    not has_function_privilege('authenticated', helper, 'execute')
    or has_function_privilege('anon', helper, 'execute')
  ) then raise exception 'agency prospect RLS helper lost its request-session boundary'; end if;
end $$;

-- Creator operations remain absent on older focused fixtures. When installed,
-- both exact supplied-actor RPCs must be private service-only; no direct journal.
do $$
declare reader regprocedure:=to_regprocedure('public.read_creator_maintenance_operations(uuid,uuid,text)');writer regprocedure:=to_regprocedure('public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz)');j regclass:=to_regclass('release_rollback_baseline.creator_maintenance_operations_catalog');
begin
 if (reader is null)<>(writer is null) or (reader is null)<>(j is null) then raise exception 'creator maintenance operations incomplete exposure boundary';end if;
 if reader is not null and (not has_function_privilege('service_role',reader,'EXECUTE') or not has_function_privilege('service_role',writer,'EXECUTE') or has_function_privilege('anon',reader,'EXECUTE') or has_function_privilege('anon',writer,'EXECUTE') or has_function_privilege('authenticated',reader,'EXECUTE') or has_function_privilege('authenticated',writer,'EXECUTE') or has_table_privilege('service_role',j,'SELECT') or has_table_privilege('anon',j,'SELECT') or has_table_privilege('authenticated',j,'SELECT')) then raise exception 'creator maintenance operations lost exact private service-only boundary';end if;
end $$;

-- Public Checkout final admission has no anonymous or request-session RPC.
do $$declare f regprocedure:=to_regprocedure('public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text)');begin
 if f is not null and (not has_function_privilege('service_role',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE')) then raise exception 'Checkout admission lost private service-only boundary';end if;
end$$;

-- Additive ordinary money producers are all service-only supplied-actor ports.
-- Older focused fixtures contain none; a partially installed group is refused.
do $$declare signature text; f regprocedure; installed integer;begin
 select count(*) into installed from pg_proc where pronamespace='public'::regnamespace and proname in('record_governed_money_configuration','read_governed_money_configuration','read_governed_money_preparation','prepare_governed_collection_terms','register_governed_creator_listing','assert_governed_payout_dispatch');
 if installed not in(0,6) then raise exception 'governed money incomplete supplied-actor boundary';end if;
 if installed=6 then foreach signature in array array['public.record_governed_money_configuration(uuid,text,jsonb)','public.read_governed_money_configuration(uuid,uuid,text)','public.read_governed_money_preparation(uuid,uuid,text)','public.prepare_governed_collection_terms(uuid,text,jsonb)','public.register_governed_creator_listing(uuid,text,jsonb)','public.assert_governed_payout_dispatch(uuid,uuid,text,text,text,text,bigint,text,bigint)'] loop
  f:=to_regprocedure(signature);
  if f is null or not has_function_privilege('service_role',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'governed money lost private service-only boundary';end if;
 end loop;end if;
end$$;

-- Neutral source-money ports are either all absent on older focused fixtures
-- or installed as an exact eight-port service-only group. Inverse keeps paid
-- history, so an absent port group does not imply an absent history table.
do $$declare signature text; f regprocedure; installed integer;t regclass:=to_regclass('public.creator_version_paid_periods');r text;begin
 select count(*) into installed from pg_proc where pronamespace='public'::regnamespace and proname in('register_neutral_creator_listing','record_neutral_creator_money','prepare_neutral_version_collection','record_neutral_version_settlement','observe_neutral_creator_settlement','read_neutral_creator_sources','read_neutral_version_money','export_neutral_creator_paid_periods');
 if installed not in(0,8) then raise exception 'neutral source money incomplete private boundary';end if;
 if installed=8 then
  if t is null then raise exception 'neutral source money retained history missing';end if;
  foreach signature in array array['public.register_neutral_creator_listing(uuid,text,jsonb)','public.record_neutral_creator_money(uuid,text,jsonb)','public.prepare_neutral_version_collection(uuid,text,jsonb)','public.record_neutral_version_settlement(uuid,text,text,bigint,text,text,text)','public.observe_neutral_creator_settlement(uuid)','public.read_neutral_creator_sources(uuid,uuid,text)','public.read_neutral_version_money(uuid,uuid,text)','public.export_neutral_creator_paid_periods(uuid,uuid,text,text,integer,integer)'] loop
   f:=to_regprocedure(signature);
   if f is null or not has_function_privilege('service_role',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'neutral source money lost private service-only boundary';end if;
  end loop;
 end if;
 if t is not null then
  if not exists(select 1 from pg_class where oid=t and relrowsecurity) then raise exception 'neutral source money retained history lost RLS';end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r,t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'neutral source money retained history exposed directly';end if;
  end loop;
 end if;
end$$;

-- Native Google hash portability preserves both exact service-only ports. Older
-- fixtures have neither; overloads or a partly installed group are refused.
do $$declare signature text; f regprocedure; installed integer;begin
 select count(*) into installed from pg_proc where pronamespace='public'::regnamespace and proname in('native_google_owner_lifecycle','verify_native_google_inverse_intent');
 if installed not in(0,2) then raise exception 'native Google lifecycle incomplete private boundary';end if;
 if installed=2 then foreach signature in array array['public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb)','public.verify_native_google_inverse_intent(uuid,uuid,text,jsonb,uuid,uuid,text)'] loop
  f:=to_regprocedure(signature);
  if f is null or not has_function_privilege('service_role',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'native Google lifecycle lost private service-only boundary';end if;
 end loop;end if;
end$$;

-- Rewards canonicalization/fence helpers stay owner-only; the one supplied
-- tenant mutation port is service-only. No direct receipt/table/column access.
-- Complete custom/default ACL and catalog checks belong to the current contract.
do $$declare signature text; f regprocedure; installed integer;t regclass:=to_regclass('public.tenant_reward_mutations');r text;begin
 select count(*) into installed from pg_proc where pronamespace='public'::regnamespace and proname in('reward_record_canonical_json','reward_record_native_fence','mutate_tenant_reward_record');
 if installed not in(0,3) or (installed=0)<>(t is null) then raise exception 'rewards native mutation incomplete private boundary';end if;
 if installed=3 then
  foreach signature in array array['public.reward_record_canonical_json(jsonb)','public.reward_record_native_fence()','public.mutate_tenant_reward_record(text,text,jsonb)'] loop
   f:=to_regprocedure(signature);
   if f is null or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE')<>(signature='public.mutate_tenant_reward_record(text,text,jsonb)') then raise exception 'rewards native mutation lost exact helper/writer boundary';end if;
  end loop;
  if not exists(select 1 from pg_class where oid=t and relrowsecurity) then raise exception 'rewards mutation receipts lost RLS';end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r,t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'rewards mutation receipts exposed directly';end if;
  end loop;
 end if;
end$$;

-- Internal source authority stays owner-only after1740/1745. No new service
-- call path is created; the existing private/neutral producer ports admit actors.
do $$declare f regprocedure:=to_regprocedure('public.system_version_assert_source_manager(uuid,uuid,text)');r text;begin
 if f is not null then foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,f,'EXECUTE') then raise exception 'private source manager exposed directly';end if;
 end loop;end if;
end$$;
