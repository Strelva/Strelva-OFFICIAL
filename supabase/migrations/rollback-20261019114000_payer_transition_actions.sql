-- #278: removes only the two new UI read projections. Transition records,
-- accepted payer parties, old readers and every mutation remain unchanged.
-- Deploy a compatible app first; this file does not restore older app behavior.
begin;
set local lock_timeout = '3s';
do $guard$
begin
  if to_regclass('release_rollback_baseline.payer_transition_actions') is null then
    raise exception 'payer_transition_actions_rollback_baseline_missing';
  end if;
  if (select count(*) from release_rollback_baseline.payer_transition_actions) <> 2
    or exists(select 1 from release_rollback_baseline.payer_transition_actions b
      left join pg_proc p on p.oid=to_regprocedure(b.signature)
      where b.signature <> all(array[
        'public.workspace_payer_transition_snapshot_v2(uuid,uuid,text)',
        'public.workspace_payer_transition_inbox_v2(uuid,text)'])
        or p.oid is null or b.definition_hash is distinct from md5(pg_get_functiondef(p.oid))
        or b.owner_oid is distinct from p.proowner
        or b.installed_acl is distinct from coalesce(p.proacl,acldefault('f',p.proowner))) then
    raise exception 'payer_transition_actions_rollback_wrong_order_or_drift';
  end if;
end;
$guard$;
drop function public.workspace_payer_transition_snapshot_v2(uuid,uuid,text);
drop function public.workspace_payer_transition_inbox_v2(uuid,text);
drop table release_rollback_baseline.payer_transition_actions;
commit;
