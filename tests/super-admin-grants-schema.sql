\set ON_ERROR_STOP on
begin;

insert into public.users (id, email, verified_at) values
  ('a1a10000-0000-4000-8000-000000000001', 'operator@super-admin.test', now()),
  ('a1a10000-0000-4000-8000-000000000002', 'grantee@super-admin.test', now()),
  ('a1a10000-0000-4000-8000-000000000003', 'service-grantee@super-admin.test', now()),
  ('a1a10000-0000-4000-8000-000000000004', 'outsider@super-admin.test', now());
insert into public.super_admins (user_id, email, granted_at)
values ('a1a10000-0000-4000-8000-000000000001', 'operator@super-admin.test', now());

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1a10000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare
  self_grant_refused boolean := false;
begin
  if not public.app_is_super_admin() then
    raise exception 'active operator was not recognized';
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
begin
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
  if position('super_admin_bootstrap' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0 then
    raise exception 'auth account creation can still grant super-admin access from the bootstrap list';
  end if;
  if not has_function_privilege('authenticated', 'public.grant_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.grant_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or not has_function_privilege('service_role', 'public.grant_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or not has_function_privilege('authenticated', 'public.revoke_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.revoke_super_admin(uuid,text,uuid)'::regprocedure, 'execute')
    or not has_function_privilege('service_role', 'public.revoke_super_admin(uuid,text,uuid)'::regprocedure, 'execute') then
    raise exception 'grant/revoke function execute boundary is incorrect';
  end if;
end;
$$;

set local request.jwt.claim.sub = 'a1a10000-0000-4000-8000-000000000004';
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

-- The CLI uses service_role and supplies the active human operator explicitly.
reset role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
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
select public.revoke_super_admin(
  'a1a10000-0000-4000-8000-000000000001',
  'end the SQL fixture operator grant',
  'a1a10000-0000-4000-8000-000000000001'
);

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1a10000-0000-4000-8000-000000000001';
do $$
declare
  active_operator_refused boolean := false;
begin
  if public.app_is_super_admin() then
    raise exception 'revoked operator passed app_is_super_admin';
  end if;
  begin
    perform public.business_effort_assert_operator(
      'a1a10000-0000-4000-8000-000000000001', 'operator@super-admin.test'
    );
  exception when others then
    if sqlerrm <> 'business_effort_access_denied' then raise; end if;
    active_operator_refused := true;
  end;
  if not active_operator_refused then
    raise exception 'revoked operator passed the verified-email SQL gate';
  end if;
  if exists (
    select 1 from public.super_admin_access_review
    where user_id in (
      'a1a10000-0000-4000-8000-000000000001',
      'a1a10000-0000-4000-8000-000000000002',
      'a1a10000-0000-4000-8000-000000000003'
    )
  ) then
    raise exception 'revoked operators remain in the access review';
  end if;
end;
$$;

-- Even the table owner cannot rewrite or erase an access event.
do $$
declare
  update_refused boolean := false;
  delete_refused boolean := false;
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
  if not update_refused or not delete_refused then
    raise exception 'the grant/revoke audit trail was mutable';
  end if;
  if (select count(*) from public.super_admin_access_events) <> 5 then
    raise exception 'expected one append-only event per grant/revoke';
  end if;
  if (select count(*) from public.super_admin_access_events where action = 'granted') <> 2
    or (select count(*) from public.super_admin_access_events where action = 'revoked') <> 3 then
    raise exception 'grant/revoke audit actions were not recorded';
  end if;
end;
$$;

rollback;
