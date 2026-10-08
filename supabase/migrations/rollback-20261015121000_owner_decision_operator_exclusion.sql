-- Restore exactly the acting-provider claim body before this exclusion fix.
-- Roll back before the earlier Needs you or acting-provider migrations.
begin;
set local lock_timeout='3s';

do $$
declare definition text; original text; replacement text;
begin
  definition:=pg_get_functiondef('public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)'::regprocedure);
  if md5(definition) is distinct from '67438386879c6c1dcdfe39fbdca4de80' then
    raise exception 'rollback_wrong_order_or_function_drift: owner decision operator exclusion';
  end if;
  original:='if actor_role <> ''owner'' and public.needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email) is not null then';
  replacement:=E'if actor_role <> ''owner'' and (\n      public.needs_you_operator_id(p_user_id, p_verified_email) is not null\n      or public.needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email) is not null\n    ) then';
  if strpos(definition,replacement)=0 then
    raise exception 'rollback_wrong_order_or_function_drift: owner decision operator exclusion';
  end if;
  execute replace(definition,replacement,original);
end $$;
commit;
