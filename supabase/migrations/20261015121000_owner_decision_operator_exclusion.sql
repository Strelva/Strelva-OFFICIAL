-- Acting-provider gates widen platform work to staffed agencies, but an active
-- Strelva operator's direct admin membership must never decide an owner item.
-- Keep the positive provider path and the serving-agency exclusion unchanged.
begin;
set local lock_timeout='3s';

do $$
declare definition text; original text; replacement text;
begin
  definition:=pg_get_functiondef('public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)'::regprocedure);
  original:='if actor_role <> ''owner'' and public.needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email) is not null then';
  replacement:=E'if actor_role <> ''owner'' and (\n      public.needs_you_operator_id(p_user_id, p_verified_email) is not null\n      or public.needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email) is not null\n    ) then';
  if strpos(definition,original)=0
    or strpos(substr(definition,strpos(definition,original)+length(original)),original)>0
    or strpos(definition,'if actor_role <> ''owner'' and public.business_agency_seat(p_workspace_id, p_user_id) is not null then')=0 then
    raise exception 'owner_decision_operator_exclusion_drift';
  end if;
  execute replace(definition,original,replacement);
end $$;
commit;
