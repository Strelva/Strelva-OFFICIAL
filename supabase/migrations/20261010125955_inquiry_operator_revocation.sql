-- A revoked Strelva operator loses inquiry review authority immediately, like
-- every other super_admins check. 20261010125935 omitted revoked_at.
begin;
set local lock_timeout='3s';
create or replace function public.authorize_inquiry_operator_actor(p_tenant_id text,p_actor_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u join public.super_admins a on a.user_id=u.id
    where u.id=p_actor_id and u.verified_at is not null and a.revoked_at is null and lower(a.email)=lower(u.email) for share of u,a;
  if not found then return false; end if;
  perform 1 from public.memberships m join public.tenants t on t.stable_id=m.tenant_stable_id
    where t.id=p_tenant_id and m.user_id=p_actor_id for share of m,t;
  return found;
end $$;
revoke all on function public.authorize_inquiry_operator_actor(text,uuid) from public,anon,authenticated;
grant execute on function public.authorize_inquiry_operator_actor(text,uuid) to service_role;
commit;
