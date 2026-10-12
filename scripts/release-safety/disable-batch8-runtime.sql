-- Deploy feature switches OFF first. Retains schema, rows and security repairs.
-- Expected fingerprint MUST come from the reviewed rehearsal of this exact
-- target schema/roles, INCLUDING any corrective tail, not an unreviewed live read.
\set ON_ERROR_STOP on
begin;
set local search_path=public,pg_temp;
set local lock_timeout='3s';
set local statement_timeout='120s';
\ir runtime-catalog.sql
select set_config('strelva.recovery_expected', :'expected_runtime_fingerprint', true);
do $$ begin
  if current_setting('strelva.recovery_expected') !~ '^[a-f0-9]{64}$'
    or pg_temp.batch8_runtime_fingerprint() <> current_setting('strelva.recovery_expected') then
    raise exception 'batch8_runtime_recovery_catalog_drift';
  end if;
end $$;
do $$
declare rpc record; current_state text;
begin
  select state into current_state from release_runtime_recovery.batch8_state where singleton for update;
  if current_state not in ('scoped','enabled') or current_state is null then
    raise exception 'batch8_runtime_recovery_wrong_state';
  end if;
  -- One binding checkpoint after reviewed corrective tails. Their approved
  -- catalog may retire an unsafe signature or recreate it under a repaired
  -- OID. Preserve the original identity; never add a tail's new signatures.
  if current_state='scoped' then
    update release_runtime_recovery.batch8_scope set
      retired=to_regprocedure('public.'||signature) is null,
      function_oid=coalesce(to_regprocedure('public.'||signature)::oid,introduced_function_oid);
  end if;
  if exists(select 1 from release_runtime_recovery.batch8_scope s
    left join pg_proc p on p.oid=s.function_oid
    where (not s.retired and (p.oid is null or p.oid::regprocedure::text<>s.signature))
      or (s.retired and to_regprocedure('public.'||s.signature) is not null)) then
    raise exception 'batch8_runtime_recovery_identity_drift';
  end if;
  -- No implicit/browser/inherited grant may bypass the service-role revoke.
  if exists(select 1 from release_runtime_recovery.batch8_scope s join pg_proc p on p.oid=s.function_oid
    where not s.retired and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
      and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))) then
    raise exception 'batch8_runtime_recovery_browser_exposure';
  end if;
  if exists(select 1 from release_runtime_recovery.batch8_scope s join pg_proc p on p.oid=s.function_oid
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where not s.retired and a.grantee='service_role'::regrole and a.grantor<>p.proowner) then
    raise exception 'batch8_runtime_recovery_unknown_grantor';
  end if;
  delete from release_runtime_recovery.batch8_grants;
  insert into release_runtime_recovery.batch8_grants
    select s.signature,s.function_oid,a.is_grantable from release_runtime_recovery.batch8_scope s
    join pg_proc p on p.oid=s.function_oid
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where not s.retired and a.grantee='service_role'::regrole and a.privilege_type='EXECUTE';
  update release_runtime_recovery.batch8_state set forward_catalog=pg_temp.batch8_runtime_catalog() where singleton;
  for rpc in select * from release_runtime_recovery.batch8_grants loop
    execute format('revoke execute on function public.%s from service_role',rpc.signature);
    if has_function_privilege('service_role',rpc.function_oid,'execute') then
      raise exception 'batch8_runtime_recovery_inherited_execute';
    end if;
  end loop;
  if exists(select 1 from release_runtime_recovery.batch8_scope s join pg_proc p on p.oid=s.function_oid
    where not s.retired and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
      and has_function_privilege('service_role',p.oid,'execute')) then
    raise exception 'batch8_runtime_recovery_inherited_execute';
  end if;
  update release_runtime_recovery.batch8_state set state='disabled',disabled_fingerprint=pg_temp.batch8_runtime_fingerprint(),
    disabled_role_fingerprint=pg_temp.batch8_runtime_role_fingerprint() where singleton;
end $$;
commit;
