-- Isolated guarded lock-order successor; historical evidence remains unchanged.
begin;
set local lock_timeout='3s';
do $catalog0$
declare p record; migrator oid:=(current_user::regrole)::oid;
begin
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='system_version_assert_source_manager')<>1 then raise exception 'private_source_order_catalog_drift';end if;
 select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure('public.system_version_assert_source_manager(uuid,uuid,text)');
 if p.oid is null or p.proowner<>migrator or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'void'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.protrftypes is not null or p.probin is not null or p.prosqlbody is not null or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from array['p_workspace_id','p_user_id','p_verified_email']::text[] or p.pronargs<>3 or md5(p.prosrc)<>'b1899c36f203a3d07230a31a6d5a299f' then raise exception 'private_source_order_catalog_drift';end if;
 if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>1 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.grantee not in(migrator) or a.privilege_type<>'EXECUTE' or a.is_grantable) then raise exception 'private_source_order_acl_drift';end if;
end $catalog0$;
do $catalog1$
declare p record; migrator oid:=(current_user::regrole)::oid;
begin
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='register_neutral_creator_listing')<>1 then raise exception 'private_source_order_catalog_drift';end if;
 select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure('public.register_neutral_creator_listing(uuid,text,jsonb)');
 if p.oid is null or p.proowner<>migrator or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.protrftypes is not null or p.probin is not null or p.prosqlbody is not null or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from array['p_user_id','p_verified_email','p_command']::text[] or p.pronargs<>3 or md5(p.prosrc)<>'65070ed346aaff39df0c08a56c1afe2f' then raise exception 'private_source_order_catalog_drift';end if;
 if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=('service_role'::regrole)::oid) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.grantee not in(migrator,('service_role'::regrole)::oid) or a.privilege_type<>'EXECUTE' or a.is_grantable) then raise exception 'private_source_order_acl_drift';end if;
end $catalog1$;
create or replace function public.system_version_assert_source_manager(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns void language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare kind text; route_kind text; role text;
begin
 -- Discovery only chooses a lock route; it grants no authority.
 select w.kind into route_kind from public.workspaces w where w.id=p_workspace_id;
 if route_kind in('agency','customer') then
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 end if;
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 select w.kind into kind from public.workspaces w where w.id=p_workspace_id for share;
 if kind is distinct from route_kind then raise exception 'business_record_access_denied'; end if;
 select m.role into role from public.workspace_memberships m where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role in ('owner','admin') for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 if kind='customer' then perform public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
 elsif kind='agency' then
  -- Higher isolation retains a transaction snapshot even after the wait.
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
   raise exception 'private_source_snapshot_unsupported';
  end if;
  -- Fresh after advisory and current identity/workspace/membership waits.
  -- The workspace FOR SHARE lock above
  -- serializes this boundary against complete_workspace_exit's FOR UPDATE.
  if exists(select 1 from public.workspace_exit_requests where workspace_id=p_workspace_id and state->>'status'='completed') then
   raise exception 'workspace_exit_future_work_blocked';
  end if;
 else raise exception 'business_record_access_denied'; end if;
end $$;
create or replace function public.register_neutral_creator_listing(p_user_id uuid,p_verified_email text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare route_kind text; workspace uuid:=(p_command->>'workspaceId')::uuid; revision uuid:=(p_command->>'sourceRevisionId')::uuid; r public.system_version_source_revisions; result jsonb;
begin
 if jsonb_typeof(p_command) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['agreementVersion','rateReference','sourceRevisionId','workspaceId'] then raise exception 'neutral_creator_invalid';end if;
 -- Discovery never admits work. Supported routes take 7415 before any row lock.
 select kind into route_kind from public.workspaces where id=workspace;
 if route_kind in('agency','customer') then
  perform pg_advisory_xact_lock(hashtextextended(workspace::text,7415));
 end if;
 perform 1 from public.users where id=p_user_id and verified_at is not null and lower(btrim(email))=lower(btrim(p_verified_email)) for share;
 if not found then raise exception 'neutral_creator_denied';end if;
 perform 1 from public.workspaces where id=workspace and kind=route_kind and kind in('agency','customer') for share;
 if not found then raise exception 'neutral_creator_denied';end if;
 perform public.connect_assert_manager(workspace,p_user_id,p_verified_email);
 perform public.system_version_assert_source_manager(workspace,p_user_id,p_verified_email);
 select * into r from public.system_version_source_revisions where id=revision and creator_workspace_id=workspace for share;
 if r.id is null or coalesce(r.definition->>'kind','') not in('internal_app','bundle') then raise exception 'neutral_creator_source_required';end if;
 if not public.lock_system_revision_qualification(r.id) then raise exception 'creator_listing_unqualified';end if;
 perform 1 from public.money_agreements where beneficiary_workspace_id=workspace and kind='creator' and version=p_command->>'agreementVersion' and rate_reference=p_command->>'rateReference' and effective_from<=clock_timestamp() and (effective_until is null or effective_until>clock_timestamp()) for share;
 if not found then raise exception 'approved_creator_agreement_required';end if;
 if public.workspace_exit_completed(workspace) then raise exception 'workspace_exit_future_work_blocked';end if;
 result:=public.register_creator_listing('system-source:'||r.source_system_id::text,r.id,workspace,p_user_id,p_verified_email,p_command->>'agreementVersion',p_command->>'rateReference');
 return jsonb_build_object('id',result->'id','creatorWorkspaceId',workspace,'sourceSystemId',r.source_system_id,'sourceRevisionId',r.id,'definitionId',result->'definition_id','agreementVersion',result->'agreement_version','rateReference',result->'rate_reference');
end $$;
notify pgrst,'reload schema';
commit;
