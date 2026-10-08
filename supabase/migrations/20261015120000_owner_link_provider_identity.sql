-- Ordinary agency owner links retain the provider's seated execution identity.
-- The owner recipient stays independently trusted; this grants no membership,
-- recipient trust or resource mandate. Source effects remain #560's gates.
begin;
set local lock_timeout='3s';

do $$
declare definition text; original text; replacement text;
begin
  definition:=pg_get_functiondef('public.strelva_owner_decision_link_session(uuid,uuid,text,text,text)'::regprocedure);
  original:=E'  select u.id as user_id,lower(u.email) as email,m.role into reader from public.workspace_memberships m\n    join public.users u on u.id=m.user_id and u.verified_at is not null\n    where m.workspace_id=p_workspace_id and m.role in (''owner'',''admin'') and (creator is null or m.user_id=creator)\n    order by case m.role when ''owner'' then 0 else 1 end,m.created_at,m.user_id limit 1;';
  replacement:=E'  if creator is null then\n    -- Verified direct owners/admins retain priority; otherwise use only staff\n    -- on this provider of record''s active seat, with no customer membership.\n    select * into reader from public.platform_service_identity(p_workspace_id,provider);\n  else\n    -- Creator-only responsibilities retain their exact creator restriction.\n    select u.id as user_id,lower(u.email) as email,m.role into reader from public.workspace_memberships m\n      join public.users u on u.id=m.user_id and u.verified_at is not null\n      where m.workspace_id=p_workspace_id and m.role in (''owner'',''admin'') and m.user_id=creator\n      order by case m.role when ''owner'' then 0 else 1 end,m.created_at,m.user_id limit 1;\n  end if;';
  if strpos(definition,original)=0 then raise exception 'owner_link_provider_identity_drift: session'; end if;
  execute replace(definition,original,replacement);

  definition:=pg_get_functiondef('public.assert_owner_decision_link(uuid,uuid,uuid,text,text)'::regprocedure);
  original:=E'  if not exists(select 1 from public.workspace_memberships m\n    join public.users u on u.id=m.user_id and u.verified_at is not null\n    where m.workspace_id=p_workspace_id and m.user_id=session_row.on_behalf_user_id and m.role=session_row.on_behalf_role) then';
  replacement:=E'  if not public.platform_service_identity_holds(p_workspace_id,session_row.provider_workspace_id,\n    session_row.on_behalf_user_id,session_row.on_behalf_role) then';
  if strpos(definition,original)=0 then raise exception 'owner_link_provider_identity_drift: assertion'; end if;
  execute replace(definition,original,replacement);

  -- #560 replaced the launch body after #534 had added this native resource
  -- check. Restore it at both reserve/publish's shared choke point.
  definition:=pg_get_functiondef('public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text)'::regprocedure);
  original:='  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);';
  replacement:=E'  if public.platform_provider_for_resource(p_workspace_id,session_row.provider_workspace_id,''publish'',''website'',\n    public.system_origin_id(p_workspace_id,''saved_work'',p_work_id::text)::text) is null then\n    raise exception ''strelva_service_access_denied'';\n  end if;\n  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);';
  if strpos(definition,original)=0 then raise exception 'owner_link_provider_identity_drift: website'; end if;
  execute replace(definition,original,replacement);
end $$;
commit;
