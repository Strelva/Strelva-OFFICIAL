\set ON_ERROR_STOP on
begin;
create function pg_temp.ior_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry operator revocation: %',message; end if; end $$;
insert into public.users(id,email,verified_at) values('c9360000-0000-4000-8000-000000000001','ior@example.test',now());
insert into public.super_admins(user_id,email) values('c9360000-0000-4000-8000-000000000001','ior@example.test');
insert into public.tenants(id,stable_id,site_name) values('ior-site','c9360000-0000-4000-8000-000000000002','Inquiry revocation fixture');
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) values('c9360000-0000-4000-8000-000000000001','ior-site','c9360000-0000-4000-8000-000000000002','admin');
select pg_temp.ior_assert(public.authorize_inquiry_operator_actor('ior-site','c9360000-0000-4000-8000-000000000001'),'active operator with tenant membership authorized');
-- Revocation marks the row; it does not delete it. Membership stays.
update public.super_admins set revoked_at=now() where user_id='c9360000-0000-4000-8000-000000000001';
select pg_temp.ior_assert(not public.authorize_inquiry_operator_actor('ior-site','c9360000-0000-4000-8000-000000000001'),'revoked operator refused while tenant membership remains');
update public.super_admins set revoked_at=null where user_id='c9360000-0000-4000-8000-000000000001';
select pg_temp.ior_assert(public.authorize_inquiry_operator_actor('ior-site','c9360000-0000-4000-8000-000000000001'),'reinstated operator authorized again');
update public.super_admins set revoked_at=now()+interval '1 day' where user_id='c9360000-0000-4000-8000-000000000001';
select pg_temp.ior_assert(not public.authorize_inquiry_operator_actor('ior-site','c9360000-0000-4000-8000-000000000001'),'any revoked_at refuses, matching other operator checks');
select pg_temp.ior_assert(not has_function_privilege('authenticated','public.authorize_inquiry_operator_actor(text,uuid)','execute'),'service only');
select pg_temp.ior_assert(not has_function_privilege('anon','public.authorize_inquiry_operator_actor(text,uuid)','execute'),'anon refused');
rollback;
