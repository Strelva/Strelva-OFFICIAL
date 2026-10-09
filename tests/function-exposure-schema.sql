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
