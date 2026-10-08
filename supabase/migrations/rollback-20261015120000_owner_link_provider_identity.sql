-- Restore precisely the three #560 bodies. Recipient trust, mandate history
-- and existing sessions remain durable. Roll back before earlier owner-link
-- or acting-provider migrations.
begin;
set local lock_timeout='3s';

do $$
declare definition text; original text; replacement text;
begin
  if md5(pg_get_functiondef('public.strelva_owner_decision_link_session(uuid,uuid,text,text,text)'::regprocedure)) is distinct from '1d7f803b9e086457b14d577b5ec747b7'
    or md5(pg_get_functiondef('public.assert_owner_decision_link(uuid,uuid,uuid,text,text)'::regprocedure)) is distinct from '8a2809a5081a14acbd31def007befa73'
    or md5(pg_get_functiondef('public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text)'::regprocedure)) is distinct from 'e3035ea67d4c83fd27c7057a6711584c' then
    raise exception 'rollback_wrong_order_or_function_drift: owner link provider identity';
  end if;
  definition:=pg_get_functiondef('public.strelva_owner_decision_link_session(uuid,uuid,text,text,text)'::regprocedure);
  original:=E'  select u.id as user_id,lower(u.email) as email,m.role into reader from public.workspace_memberships m\n    join public.users u on u.id=m.user_id and u.verified_at is not null\n    where m.workspace_id=p_workspace_id and m.role in (''owner'',''admin'') and (creator is null or m.user_id=creator)\n    order by case m.role when ''owner'' then 0 else 1 end,m.created_at,m.user_id limit 1;';
  replacement:=E'  if creator is null then\n    -- Verified direct owners/admins retain priority; otherwise use only staff\n    -- on this provider of record''s active seat, with no customer membership.\n    select * into reader from public.platform_service_identity(p_workspace_id,provider);\n  else\n    -- Creator-only responsibilities retain their exact creator restriction.\n    select u.id as user_id,lower(u.email) as email,m.role into reader from public.workspace_memberships m\n      join public.users u on u.id=m.user_id and u.verified_at is not null\n      where m.workspace_id=p_workspace_id and m.role in (''owner'',''admin'') and m.user_id=creator\n      order by case m.role when ''owner'' then 0 else 1 end,m.created_at,m.user_id limit 1;\n  end if;';
  if strpos(definition,replacement)=0 then raise exception 'rollback_wrong_order_or_function_drift: owner link session'; end if;
  execute replace(definition,replacement,original);
  definition:=pg_get_functiondef('public.assert_owner_decision_link(uuid,uuid,uuid,text,text)'::regprocedure);
  original:=E'  if not exists(select 1 from public.workspace_memberships m\n    join public.users u on u.id=m.user_id and u.verified_at is not null\n    where m.workspace_id=p_workspace_id and m.user_id=session_row.on_behalf_user_id and m.role=session_row.on_behalf_role) then';
  replacement:=E'  if not public.platform_service_identity_holds(p_workspace_id,session_row.provider_workspace_id,\n    session_row.on_behalf_user_id,session_row.on_behalf_role) then';
  if strpos(definition,replacement)=0 then raise exception 'rollback_wrong_order_or_function_drift: owner link assertion'; end if;
  execute replace(definition,replacement,original);
  definition:=pg_get_functiondef('public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text)'::regprocedure);
  original:='  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);';
  replacement:=E'  if public.platform_provider_for_resource(p_workspace_id,session_row.provider_workspace_id,''publish'',''website'',\n    public.system_origin_id(p_workspace_id,''saved_work'',p_work_id::text)::text) is null then\n    raise exception ''strelva_service_access_denied'';\n  end if;\n  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);';
  if strpos(definition,replacement)=0 then raise exception 'rollback_wrong_order_or_function_drift: owner link website'; end if;
  execute replace(definition,replacement,original);
end $$;
commit;
