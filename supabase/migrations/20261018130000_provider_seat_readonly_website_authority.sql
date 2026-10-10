-- Snapshot counterpart of the provider website authority added in 141120.
-- Draft/history reads require a verified actor with a direct membership or an
-- active staffed provider seat. Live effects retain verification and mandates
-- in the existing writer helpers; this migration changes no writer authority.
CREATE OR REPLACE FUNCTION public.website_document_read_actor(p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_manage boolean, p_write boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare seat_role text;
begin
  if p_write is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;

  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and (not p_manage or role in ('owner','admin'));
  if not found then
    seat_role := public.provider_seat_read_role(p_workspace_id,p_user_id,false);
    if seat_role is null or (p_manage and seat_role not in ('owner','admin')) then raise exception 'workspace_access_denied'; end if;
  end if;
  if p_work_id is not null and not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website') then raise exception 'workspace_access_denied'; end if;
end $function$
;
