-- Reverse only this migration's authority replacement. All earlier bounded
-- work body changes remain intact; reject a changed or already rolled-back gate.
set local lock_timeout = '3s';

do $$
declare
  definition text;
  original text := E'  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;\n  if not found then raise exception ''workspace_access_denied''; end if;';
  replacement text := E'  -- Standing provider seats use the same create_work permission as direct members.\n  begin\n    perform public.workspace_require(p_workspace_id,p_user_id,''create_work'');\n  exception when raise_exception then\n    if sqlerrm in (''workspace_membership_required'',''workspace_permission_denied'') then\n      raise exception ''workspace_access_denied'';\n    end if;\n    raise;\n  end;';
begin
  select pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure) into definition;
  if strpos(definition,replacement)=0 or strpos(substr(definition,strpos(definition,replacement)+length(replacement)),replacement)>0 then
    raise exception 'rollback_wrong_order_or_function_drift: update_bounded_product_work';
  end if;
  execute replace(definition,replacement,original);
end $$;
