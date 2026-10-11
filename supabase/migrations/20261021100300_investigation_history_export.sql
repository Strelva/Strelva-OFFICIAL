begin;
set local lock_timeout='3s';

-- Complete immutable check history participates in paged portability.
alter function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) rename to export_workspace_v3_category_before_investigation_history;
revoke all on function public.export_workspace_v3_category_before_investigation_history(uuid,uuid,text,text,integer,integer) from public,anon,authenticated,service_role;
create function public.export_workspace_v3_category(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_category text,p_offset integer default 0,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare role text; items jsonb;
begin
 if p_category<>'investigation_history' then return public.export_workspace_v3_category_before_investigation_history(p_workspace_id,p_user_id,p_verified_email,p_category,p_offset,p_limit); end if;
 role:=public.workspace_export_v3_read_role(p_workspace_id,p_user_id,p_verified_email);
 if role is null then raise exception 'workspace_access_denied'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>1000 then raise exception 'workspace_export_invalid'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('workId',work_id,'revision',revision,'event',event,'run',run) order by ordinal),'[]'::jsonb) into items from (
 select e.* from public.investigation_history_events e join public.saved_product_work w on w.id=e.work_id
 where w.workspace_id=p_workspace_id order by e.ordinal offset p_offset limit p_limit) page;
 return jsonb_build_object('items',items,'next',case when jsonb_array_length(items)=p_limit then p_offset+p_limit else null end);
end $$;
revoke all on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) to service_role;

commit;
