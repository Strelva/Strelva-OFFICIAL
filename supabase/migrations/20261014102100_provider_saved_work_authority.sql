-- Agency workflow: the staffed provider can revise saved work without a
-- personal membership in the client business. The existing workspace role
-- resolver requires the current seat, agency membership and client staff row;
-- a read delegation or per-work assignment cannot satisfy create_work.
-- Preserve the current bounded-work body, including website v2, identity,
-- workspace/exit locks, immutable creation fields, history and revision CAS.
-- Local only; production migration needs Jacob's explicit authorization.
set local lock_timeout = '3s';

do $$
declare
  definition text;
  original text := E'  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;\n  if not found then raise exception ''workspace_access_denied''; end if;';
  replacement text := E'  -- Standing provider seats use the same create_work permission as direct members.\n  begin\n    perform public.workspace_require(p_workspace_id,p_user_id,''create_work'');\n  exception when raise_exception then\n    if sqlerrm in (''workspace_membership_required'',''workspace_permission_denied'') then\n      raise exception ''workspace_access_denied'';\n    end if;\n    raise;\n  end;';
begin
  select pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure) into definition;
  if strpos(definition,original)=0 or strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 then
    raise exception 'provider_saved_work_authority_function_drift';
  end if;
  execute replace(definition,original,replacement);
end $$;
