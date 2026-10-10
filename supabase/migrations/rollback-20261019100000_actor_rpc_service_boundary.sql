-- MANUAL RECOVERY ONLY: the observed predecessor permits supplied-actor
-- impersonation. Restoring it requires separate recovery authorization and
-- disabled browser/server callers; release authorization does not authorize it.
-- In the approved recovery session explicitly SET both custom settings below
-- to 'on'. No inferred or blanket grant restoration is permitted.
begin;
set local lock_timeout='3s';
do $authority$
begin
  if current_setting('strelva.actor_rpc_recovery_authorized',true) is distinct from 'on'
    or current_setting('strelva.actor_rpc_callers_disabled',true) is distinct from 'on' then
    raise exception 'actor_rpc_rollback_requires_authorized_disabled_callers';
  end if;
end;
$authority$;
lock table release_rollback_baseline.actor_rpc_service_boundary in access exclusive mode;
do $restore$
declare baseline_row record; grant_row record; role_name text;
begin
  -- Check every function and recorded grant before altering any ACL. OID,
  -- owner, body or privilege drift refuses the entire recovery transaction.
  if (select count(*) from release_rollback_baseline.actor_rpc_service_boundary)<>3
    or exists(select 1 from release_rollback_baseline.actor_rpc_service_boundary b
      left join pg_proc p on p.oid=b.signature::regprocedure
      where b.signature not in (
        'public.workspace_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,jsonb,text,text)',
        'public.grant_agency_application_draft_edit(uuid,text,uuid,uuid)',
        'public.update_application_candidate(uuid,uuid,uuid,text,integer,jsonb)')
        or p.oid is distinct from b.function_oid
        or p.proowner is distinct from b.owner_oid
        or b.owner_oid<>(current_user::regrole)::oid
        or md5(pg_get_functiondef(p.oid)) is distinct from b.definition_hash
        or p.proacl is distinct from b.after_acl
        or b.after_acl is null)
    or exists(select 1 from release_rollback_baseline.actor_rpc_service_boundary b,
      lateral aclexplode(b.before_acl) a left join pg_roles r on r.oid=a.grantee
      where a.grantor<>b.owner_oid or a.privilege_type<>'EXECUTE'
        or (a.grantee<>0 and r.oid is null)) then
    raise exception 'actor_rpc_rollback_wrong_order_or_metadata_drift';
  end if;
  for baseline_row in select * from release_rollback_baseline.actor_rpc_service_boundary order by signature loop
    for grant_row in select distinct grantee from aclexplode(baseline_row.after_acl||baseline_row.before_acl) loop
      if grant_row.grantee=0 then role_name:='PUBLIC';
      else select quote_ident(rolname) into role_name from pg_roles where oid=grant_row.grantee;
      end if;
      execute format('revoke all on function %s from %s',baseline_row.signature,role_name);
    end loop;
    -- Preserve actual grant order and grant options, including owner grants.
    for grant_row in select x.* from unnest(baseline_row.before_acl) with ordinality item(acl,position),
      lateral aclexplode(array[item.acl]) x order by item.position loop
      if grant_row.grantee=0 then role_name:='PUBLIC';
      else select quote_ident(rolname) into role_name from pg_roles where oid=grant_row.grantee;
      end if;
      execute format('grant execute on function %s to %s%s',baseline_row.signature,role_name,
        case when grant_row.is_grantable then ' with grant option' else '' end);
    end loop;
  end loop;
  if exists(select 1 from release_rollback_baseline.actor_rpc_service_boundary b
    join pg_proc p on p.oid=b.function_oid where p.proacl is distinct from b.before_acl) then
    raise exception 'actor_rpc_rollback_acl_not_exact';
  end if;
end;
$restore$;
drop table release_rollback_baseline.actor_rpc_service_boundary;
commit;
