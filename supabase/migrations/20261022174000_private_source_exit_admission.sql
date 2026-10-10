-- Agency source admission after waits; customer authority and historical bytes stay unchanged.
begin;
set local lock_timeout='3s';
do $catalog$
declare p record; migrator oid:=(current_user::regrole)::oid;
begin
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='system_version_assert_source_manager')<>1 then raise exception 'private_source_exit_catalog_drift';end if;
 select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure('public.system_version_assert_source_manager(uuid,uuid,text)');
 if p.oid is null or p.proowner<>migrator or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'void'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.protrftypes is not null or p.probin is not null or p.prosqlbody is not null or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from array['p_workspace_id','p_user_id','p_verified_email']::text[] or p.pronargs<>3 or md5(p.prosrc)<>'c38d391dfc5030244639e5a60d3aeafa' then raise exception 'private_source_exit_catalog_drift';end if;
 -- This internal manager remains owner-only. Service-role callers continue
 -- through the existing security-definer producer RPCs, never this function.
 if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>1 or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.grantee<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable) then raise exception 'private_source_exit_acl_drift';end if;
end $catalog$;
create or replace function public.system_version_assert_source_manager(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns void language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare kind text; role text;
begin
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 select w.kind into kind from public.workspaces w where w.id=p_workspace_id for share;
 select m.role into role from public.workspace_memberships m where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role in ('owner','admin') for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 if kind='customer' then perform public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
 elsif kind='agency' then
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
  -- Higher isolation retains a transaction snapshot even after the wait.
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
   raise exception 'private_source_snapshot_unsupported';
  end if;
  -- A fresh statement after every wait. The workspace FOR SHARE lock above
  -- serializes this boundary against complete_workspace_exit's FOR UPDATE.
  if exists(select 1 from public.workspace_exit_requests where workspace_id=p_workspace_id and state->>'status'='completed') then
   raise exception 'workspace_exit_future_work_blocked';
  end if;
 else raise exception 'business_record_access_denied'; end if;
end $$;
notify pgrst,'reload schema';
commit;
