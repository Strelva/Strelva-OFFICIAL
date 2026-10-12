-- Disable audited application reads while preserving every access record and
-- its append-only protections. Applications fail closed; there is no fallback.
-- Account deletion/retention is not a reason to delete this audit history.
begin;
set local lock_timeout = '3s';
do $$
declare contract record;
begin
  perform public.platform_operator_read_audit_check_roles();
  select * into contract from release_rollback_baseline.platform_operator_read_audit where singleton;
  if not found or contract.helper_hash is distinct from md5(pg_get_functiondef('public.platform_operator_read_audit_fingerprint()'::regprocedure))
    or public.platform_operator_read_audit_fingerprint() not in (contract.active_contract,contract.disabled_contract) then
    raise exception 'platform_operator_read_audit_contract_drift';
  end if;
end;
$$;
revoke all on function public.read_audited_platform_operator_source(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer) from public, anon, authenticated, service_role;
revoke all on function public.authorize_platform_operator_read(uuid,text,text) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
