\set ON_ERROR_STOP on
begin;
insert into public.users (id, email, verified_at)
values
  ('a1a10000-0000-4000-8000-000000000011', 'rollback-operator@super-admin.test', now()),
  ('a1a10000-0000-4000-8000-000000000012', 'rollback-target@super-admin.test', now());
insert into public.super_admins (user_id, email, granted_at)
values ('a1a10000-0000-4000-8000-000000000011', 'rollback-operator@super-admin.test', now());
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1a10000-0000-4000-8000-000000000011';
set local role authenticated;
select public.grant_super_admin(
  'a1a10000-0000-4000-8000-000000000012',
  'rollback must preserve the appended audit event'
);
reset role;
commit;
