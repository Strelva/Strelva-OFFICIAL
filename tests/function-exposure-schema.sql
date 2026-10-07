-- No security-definer function in public may be callable with the public
-- (anon) or signed-in (authenticated) key. Trigger functions are excluded:
-- PostgreSQL refuses to call them outside a trigger. The three row-security
-- helpers are intentionally callable by signed-in users: policies use them.
-- Newsletter backfill is a session-bound operator RPC: it derives auth.uid()
-- and checks current verified, unrevoked operator authority in its transaction.
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
    and p.oid is distinct from to_regprocedure('public.backfill_newsletter_contacts(text,uuid,boolean,text,integer)')
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));
  if exposed is not null then
    raise exception 'security-definer functions callable with a public key: %', exposed;
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
