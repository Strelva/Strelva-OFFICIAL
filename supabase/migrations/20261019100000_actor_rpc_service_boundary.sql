-- Supplied actor arguments are trusted server identity, not browser identity.
-- The hosted predecessor has broader ACLs than its historical source grants.
-- Capture the actual target ACLs before closing these three server-only RPCs.
begin;
set local lock_timeout='3s';
create schema if not exists release_rollback_baseline;
revoke all on schema release_rollback_baseline from public,anon,authenticated,service_role;
create table release_rollback_baseline.actor_rpc_service_boundary (
  signature text primary key,
  function_oid oid not null,
  owner_oid oid not null,
  definition_hash text not null,
  before_acl aclitem[] not null,
  after_acl aclitem[]
);
revoke all on release_rollback_baseline.actor_rpc_service_boundary from public,anon,authenticated,service_role;

insert into release_rollback_baseline.actor_rpc_service_boundary
  (signature,function_oid,owner_oid,definition_hash,before_acl)
select signature,p.oid,p.proowner,md5(pg_get_functiondef(p.oid)),p.proacl
from unnest(array[
  'public.workspace_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,jsonb,text,text)',
  'public.grant_agency_application_draft_edit(uuid,text,uuid,uuid)',
  'public.update_application_candidate(uuid,uuid,uuid,text,integer,jsonb)'
]) signature join pg_proc p on p.oid=signature::regprocedure;

do $guard$
begin
  -- These historical RPCs have explicit owner-issued grants on both the fresh
  -- schema and the observed hosted baseline. Refuse unsupported grantors rather
  -- than invent authority when recovering their exact ACLs later.
  if (select count(*) from release_rollback_baseline.actor_rpc_service_boundary)<>3
    or exists(select 1 from release_rollback_baseline.actor_rpc_service_boundary b
      where b.owner_oid<>(current_user::regrole)::oid)
    or exists(select 1 from release_rollback_baseline.actor_rpc_service_boundary b,
      lateral aclexplode(b.before_acl) a where a.grantor<>b.owner_oid
        or a.privilege_type<>'EXECUTE') then
    raise exception 'actor_rpc_service_boundary_unsupported_baseline';
  end if;
end;
$guard$;

revoke all on function public.workspace_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.grant_agency_application_draft_edit(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.update_application_candidate(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.workspace_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,jsonb,text,text) to service_role;
grant execute on function public.grant_agency_application_draft_edit(uuid,text,uuid,uuid) to service_role;
grant execute on function public.update_application_candidate(uuid,uuid,uuid,text,integer,jsonb) to service_role;

update release_rollback_baseline.actor_rpc_service_boundary b
  set after_acl=p.proacl from pg_proc p where p.oid=b.function_oid;
do $boundary$
begin
  if exists(select 1 from release_rollback_baseline.actor_rpc_service_boundary b
    where has_function_privilege('anon',b.function_oid,'EXECUTE')
      or has_function_privilege('authenticated',b.function_oid,'EXECUTE')
      or not has_function_privilege('service_role',b.function_oid,'EXECUTE')) then
    raise exception 'actor_rpc_service_boundary_inherited_browser_grant';
  end if;
end;
$boundary$;
commit;
