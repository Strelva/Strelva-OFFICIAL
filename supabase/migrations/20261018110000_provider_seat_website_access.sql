-- #245: verified named agency staff may create/read/edit client websites without
-- inventing direct memberships. The check locks the existing seat + agency member
-- + staff rows; the outer RPC still owns identity, resource, CAS and exit checks.
-- #241 contacts/inquiries and website launch/customer approval remain unchanged.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure) into definition;
  if md5(definition) is distinct from 'ba06782b5edaf981cffab3507091d51e' then raise exception 'provider_website_authority_wrong_order_or_function_drift'; end if;
  if position($before$  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;$before$ in definition)=0 then raise exception 'provider_website_authority_function_drift'; end if;
  definition := replace(definition,$before$  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;$before$,$after$  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then
    -- Provider seats extend only website work, never other bounded payloads.
    if p_product_id is distinct from 'websites'
      or not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website')
      or coalesce(public.provider_seat_role(p_workspace_id,p_user_id,true) not in ('owner','admin','member'),true)
      then raise exception 'workspace_access_denied'; end if;
  end if;$after$);
  execute definition;
end $migration$;

commit;
