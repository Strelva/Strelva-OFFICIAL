\set ON_ERROR_STOP on
begin;

insert into public.users (id, email, verified_at) values
  ('a1a10000-0000-4000-8000-000000000001', 'operator@super-admin.test', now()),
  ('a1a10000-0000-4000-8000-000000000002', 'grantee@super-admin.test', now()),
  ('a1a10000-0000-4000-8000-000000000003', 'service-grantee@super-admin.test', now()),
  ('a1a10000-0000-4000-8000-000000000004', 'outsider@super-admin.test', now());

-- PostgREST on supported Supabase/PostgreSQL versions sets one JSON claim.
-- Deliberately do not set request.jwt.claim.role or request.jwt.claim.sub.
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;
select public.bootstrap_super_admin(
  'a1a10000-0000-4000-8000-000000000001',
  'initial verified operator for the SQL fixture'
);

do $$
declare
  bootstrap_refused boolean := false;
begin
  if not exists (
    select 1 from public.super_admin_access_events
    where action = 'granted'
      and via = 'service_role_key'
      and break_glass
      and actor_user_id = 'a1a10000-0000-4000-8000-000000000001'
      and target_user_id = 'a1a10000-0000-4000-8000-000000000001'
  ) then
    raise exception 'bootstrap did not record its break-glass actor and source';
  end if;
  begin
    perform public.bootstrap_super_admin(
      'a1a10000-0000-4000-8000-000000000002',
      'a second first operator must be refused'
    );
  exception when others then
    if sqlerrm <> 'super_admin_bootstrap_not_empty' then raise; end if;
    bootstrap_refused := true;
  end;
  if not bootstrap_refused then
    raise exception 'bootstrap was accepted while an active super-admin existed';
  end if;
end;
$$;

reset role;
set local request.jwt.claims = '{"role":"authenticated","sub":"a1a10000-0000-4000-8000-000000000001"}';
set local role authenticated;

do $$
declare
  self_grant_refused boolean := false;
begin
  if not public.app_is_super_admin() then
    raise exception 'the JSON-only authenticated claim was not resolved';
  end if;
  begin
    perform public.grant_super_admin(
      'a1a10000-0000-4000-8000-000000000001', 'self grant attempt'
    );
  exception when others then
    if sqlerrm <> 'super_admin_self_grant' then raise; end if;
    self_grant_refused := true;
  end;
  if not self_grant_refused then raise exception 'self grant was accepted'; end if;
end;
$$;

select public.grant_super_admin(
  'a1a10000-0000-4000-8000-000000000002',
  'temporary access for the SQL grant test'
);

do $$
declare
  self_revoke_refused boolean := false;
begin
  begin
    perform public.revoke_super_admin(
      'a1a10000-0000-4000-8000-000000000001', 'self revoke attempt'
    );
  exception when others then
    if sqlerrm <> 'super_admin_self_revoke_refused' then raise; end if;
    self_revoke_refused := true;
  end;
  if not self_revoke_refused then raise exception 'self revoke was accepted'; end if;
  if not exists (
    select 1 from public.super_admin_access_review
    where user_id = 'a1a10000-0000-4000-8000-000000000002'
      and email = 'grantee@super-admin.test'
      and granted_by = 'a1a10000-0000-4000-8000-000000000001'
  ) then
    raise exception 'access review omitted the active operator';
  end if;
  if not exists (
    select 1 from public.super_admin_access_review
    where user_id = 'a1a10000-0000-4000-8000-000000000001'
      and last_activity_at is not null
  ) then
    raise exception 'access review omitted the operator activity timestamp';
  end if;
  if has_table_privilege('authenticated', 'public.super_admins', 'insert')
    or has_table_privilege('service_role', 'public.super_admins', 'update')
    or has_table_privilege('authenticated', 'public.super_admin_access_events', 'insert')
    or has_table_privilege('service_role', 'public.super_admin_access_events', 'delete') then
    raise exception 'a client role can write super-admin authority or its audit trail';
  end if;
  if to_regclass('public.super_admin_bootstrap') is not null then
    raise exception 'the unused bootstrap allowlist table was retained';
  end if;
  if position('super_admin_bootstrap' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0 then
    raise exception 'auth account creation can still grant super-admin access from the bootstrap list';
  end if;
  if not has_function_privilege('authenticated', 'public.grant_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.grant_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or not has_function_privilege('service_role', 'public.grant_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or not has_function_privilege('authenticated', 'public.revoke_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.revoke_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or not has_function_privilege('service_role', 'public.revoke_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'public.bootstrap_super_admin(uuid,text)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.bootstrap_super_admin(uuid,text)'::regprocedure, 'execute')
    or not has_function_privilege('service_role', 'public.bootstrap_super_admin(uuid,text)'::regprocedure, 'execute') then
    raise exception 'grant/revoke/bootstrap function execute boundary is incorrect';
  end if;
  if not exists (
    select 1 from public.super_admin_access_events
    where target_user_id = 'a1a10000-0000-4000-8000-000000000002'
      and via = 'authenticated_session'
      and not break_glass
  ) then
    raise exception 'signed-in grant did not record its caller channel';
  end if;
end;
$$;

set local request.jwt.claims = '{"role":"authenticated","sub":"a1a10000-0000-4000-8000-000000000004"}';
do $$
declare
  non_operator_refused boolean := false;
begin
  begin
    perform public.grant_super_admin(
      'a1a10000-0000-4000-8000-000000000003', 'attempt by a non-operator'
    );
  exception when others then
    if sqlerrm <> 'super_admin_actor_required' then raise; end if;
    non_operator_refused := true;
  end;
  if not non_operator_refused then raise exception 'a non-operator changed super-admin access'; end if;
end;
$$;

-- The CLI uses only the service-role claim and names its active human operator.
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;
select public.grant_super_admin(
  'a1a10000-0000-4000-8000-000000000003',
  'temporary access for the service-role SQL test',
  'a1a10000-0000-4000-8000-000000000001'
);
select public.revoke_super_admin(
  'a1a10000-0000-4000-8000-000000000002',
  'the first SQL grant test is complete',
  'a1a10000-0000-4000-8000-000000000001'
);
select public.revoke_super_admin(
  'a1a10000-0000-4000-8000-000000000003',
  'the service-role SQL test is complete',
  'a1a10000-0000-4000-8000-000000000001'
);

do $$
declare
  last_operator_refused boolean := false;
begin
  begin
    perform public.revoke_super_admin(
      'a1a10000-0000-4000-8000-000000000001', 'last operator revoke attempt',
      'a1a10000-0000-4000-8000-000000000001'
    );
  exception when others then
    if sqlerrm <> 'super_admin_last_active_refused' then raise; end if;
    last_operator_refused := true;
  end;
  if not last_operator_refused then raise exception 'the last active super-admin was revoked'; end if;
end;
$$;

reset role;
set local request.jwt.claims = '{"role":"authenticated","sub":"a1a10000-0000-4000-8000-000000000002"}';
do $$
declare
  revoked_operator_refused boolean := false;
begin
  if public.app_is_super_admin() then
    raise exception 'revoked operator passed app_is_super_admin';
  end if;
  begin
    perform public.business_effort_assert_operator(
      'a1a10000-0000-4000-8000-000000000002', 'grantee@super-admin.test'
    );
  exception when others then
    if sqlerrm <> 'business_effort_access_denied' then raise; end if;
    revoked_operator_refused := true;
  end;
  if not revoked_operator_refused then
    raise exception 'revoked operator passed the verified-email SQL gate';
  end if;
end;
$$;

reset role;
set local request.jwt.claims = '{"role":"authenticated","sub":"a1a10000-0000-4000-8000-000000000001"}';
do $$
begin
  if exists (
    select 1 from public.super_admin_access_review
    where user_id in (
      'a1a10000-0000-4000-8000-000000000002',
      'a1a10000-0000-4000-8000-000000000003'
    )
  ) then
    raise exception 'revoked operators remain in the access review';
  end if;
end;
$$;

reset role;
-- Even the table owner cannot rewrite, erase or truncate an access event.
do $$
declare
  update_refused boolean := false;
  delete_refused boolean := false;
  truncate_refused boolean := false;
begin
  begin
    update public.super_admin_access_events set reason = 'tampered'
    where target_user_id = 'a1a10000-0000-4000-8000-000000000002';
  exception when others then
    if sqlerrm <> 'super_admin_access_events_append_only' then raise; end if;
    update_refused := true;
  end;
  begin
    delete from public.super_admin_access_events
    where target_user_id = 'a1a10000-0000-4000-8000-000000000002';
  exception when others then
    if sqlerrm <> 'super_admin_access_events_append_only' then raise; end if;
    delete_refused := true;
  end;
  begin
    truncate public.super_admin_access_events;
  exception when others then
    if sqlerrm <> 'super_admin_access_events_append_only' then raise; end if;
    truncate_refused := true;
  end;
  if not update_refused or not delete_refused or not truncate_refused then
    raise exception 'the grant/revoke audit trail was mutable';
  end if;
  if (select count(*) from public.super_admin_access_events) <> 5 then
    raise exception 'expected one append-only event per successful grant/revoke';
  end if;
  if (select count(*) from public.super_admin_access_events where action = 'granted') <> 3
    or (select count(*) from public.super_admin_access_events where action = 'revoked') <> 2
    or (select count(*) from public.super_admin_access_events where via = 'service_role_key') <> 4
    or (select count(*) from public.super_admin_access_events where via = 'authenticated_session') <> 1
    or (select count(*) from public.super_admin_access_events where break_glass) <> 1 then
    raise exception 'grant/revoke audit action source or break-glass marker was not recorded';
  end if;
end;
$$;

rollback;
