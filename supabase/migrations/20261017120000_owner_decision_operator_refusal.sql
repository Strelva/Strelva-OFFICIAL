-- Restore the platform-operator refusal on owner decisions after the neutral
-- provider gate replaced operator predicates. Provider authority never makes
-- an operator's direct admin membership owner decision authority (#530).
-- Prepared SQL only; no production execution or activation authorized.
begin;
set local lock_timeout='3s';
create schema if not exists release_rollback_baseline;
revoke all on schema release_rollback_baseline from public,anon,authenticated,service_role;
create table release_rollback_baseline.owner_decision_operator_refusal (
  singleton boolean primary key check(singleton), definition text not null, after_hash text
);
revoke all on release_rollback_baseline.owner_decision_operator_refusal from public,anon,authenticated,service_role;
insert into release_rollback_baseline.owner_decision_operator_refusal(singleton,definition)
  values(true,pg_get_functiondef('public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)'::regprocedure));
do $patch$
declare original text; patched text; member_patch text;
begin
  select definition into original from release_rollback_baseline.owner_decision_operator_refusal where singleton;
  patched:=replace(original,
    'if actor_role <> ''owner'' and public.needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email) is not null then',
    'if actor_role <> ''owner'' and (public.needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email) is not null
      or public.needs_you_operator_id(p_user_id, p_verified_email) is not null) then');
  if patched=original then raise exception 'owner_decision_operator_refusal_patch_drift: member'; end if;
  member_patch:=patched;
  patched:=replace(member_patch,
    'elsif p_by_kind = ''operator'' then
    if public.needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email) is null then',
    'elsif p_by_kind = ''operator'' then
    -- Refuse platform operators on owner items before checking provider admission.
    -- Other provider decisions still require the neutral staffed provider gate.
    if item.route = ''owner_decides'' and public.needs_you_operator_id(p_user_id, p_verified_email) is not null then
      raise exception ''owner_decision_owner_only'';
    end if;
    if public.needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email) is null then');
  if patched=member_patch then raise exception 'owner_decision_operator_refusal_patch_drift: operator'; end if;
  execute patched;
  update release_rollback_baseline.owner_decision_operator_refusal
    set after_hash=md5(pg_get_functiondef('public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)'::regprocedure));
end;
$patch$;
commit;
