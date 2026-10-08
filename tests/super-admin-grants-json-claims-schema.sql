\set ON_ERROR_STOP on
begin;
insert into public.users (id, email, verified_at) values
  ('a1a10000-0000-4000-8000-000000000021', 'json-operator@super-admin.test', now()),
  ('a1a10000-0000-4000-8000-000000000022', 'json-target@super-admin.test', now());
insert into public.super_admins (user_id, email, granted_at)
values ('a1a10000-0000-4000-8000-000000000021', 'json-operator@super-admin.test', now());

-- PostgREST sets the role and subject in request.jwt.claims on this path.
-- Neither legacy request.jwt.claim.role nor request.jwt.claim.sub is set.
set local request.jwt.claims = '{"role":"authenticated","sub":"a1a10000-0000-4000-8000-000000000021"}';
set local role authenticated;
select public.grant_super_admin(
  'a1a10000-0000-4000-8000-000000000022',
  'PostgREST JSON-only claims regression test'
);

do $$
begin
  if not exists (
    select 1 from public.super_admin_access_events
    where target_user_id = 'a1a10000-0000-4000-8000-000000000022'
      and via = 'authenticated_session'
      and not break_glass
  ) then
    raise exception 'JSON-only PostgREST claims did not create a signed-in grant event';
  end if;
end;
$$;
rollback;
