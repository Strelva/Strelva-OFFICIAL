-- Durable, bounded retries and shared notice history. Nullable columns are
-- additive; no rewrite or trigger on live tenant tables. Legacy RPCs remain.
set local lock_timeout = '3s';
alter table public.internal_tool_notices add column delivery jsonb;
alter table public.internal_tool_notices add column delivery_lease uuid;
alter table public.internal_tool_notices add column delivery_lease_until timestamptz;

-- Freeze the transport once before the first attempt. A claimed send with an
-- unknown outcome is NEVER auto-replayed: it goes to the operator instead.
create function public.lease_internal_tool_notice(p_notice_id uuid, p_workspace_id uuid, p_delivery jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n public.internal_tool_notices%rowtype; token uuid := gen_random_uuid();
begin
  select * into n from public.internal_tool_notices where id=p_notice_id and workspace_id=p_workspace_id for update;
  if not found or public.workspace_exit_completed(p_workspace_id) then return null; end if;
  if n.status not in ('pending','failed') or n.attempts>=3 or n.created_at<clock_timestamp()-interval '23 hours'
    or (n.status='pending' and n.delivery is not null)
    or n.delivery_lease_until>clock_timestamp() then return null; end if;
  -- Never use an operators-only or explicitly disabled row in a cron.
  if exists(select 1 from public.workspace_release_flags where workspace_id=p_workspace_id
    and flag in ('systems','internal_tool_notices') and state in ('off','operators')) then return null; end if;
  if n.delivery is null and (p_delivery is null or jsonb_typeof(p_delivery)<>'object') then return null; end if;
  update public.internal_tool_notices set delivery=coalesce(delivery,p_delivery), delivery_lease=token,
    delivery_lease_until=clock_timestamp()+interval '5 minutes', status='pending', updated_at=clock_timestamp()
    where id=n.id returning * into n;
  return jsonb_build_object('noticeId',n.id,'workspaceId',n.workspace_id,'lease',token,'delivery',n.delivery);
end; $$;

create function public.finish_internal_tool_notice_delivery(p_notice_id uuid,p_workspace_id uuid,p_lease uuid,p_status text,p_provider_message_id text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('sent','suppressed','failed') then raise exception 'internal_tool_notice_invalid'; end if;
  update public.internal_tool_notices set status=p_status,
    detail=case when p_status='failed' then 'provider_failed' when p_status='suppressed' then 'email_suppressed_or_unconfigured' else null end,
    provider_message_id=left(p_provider_message_id,200), attempts=attempts+1,
    delivery_lease=null,delivery_lease_until=null,updated_at=clock_timestamp()
    where id=p_notice_id and workspace_id=p_workspace_id and delivery_lease=p_lease and status='pending';
  return found;
end; $$;

create function public.list_internal_tool_notice_retries() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('noticeId',id,'workspaceId',workspace_id)), '[]'::jsonb)
  from (select id,workspace_id from public.internal_tool_notices
    where status='failed' and attempts<3 and delivery is not null
      and created_at>clock_timestamp()-interval '23 hours' and updated_at<clock_timestamp()-interval '5 minutes'
    order by updated_at limit 20) due
$$;

create function public.read_catalog_tool_notices(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_since timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id;
  if not found then raise exception 'workspace_access_denied'; end if;
  return coalesce((select jsonb_agg(row_data order by at desc) from (
    select jsonb_build_object('id',n.id,'workspaceId',n.workspace_id,'workId',n.work_id,'recipient',n.recipient_email,
      'status',n.status,'attempts',n.attempts,'at',n.updated_at,'title',w.title,'recordId',n.record_id) row_data,n.updated_at at
    from public.internal_tool_notices n join public.saved_product_work w on w.id=n.work_id
    where n.workspace_id=p_workspace_id and n.updated_at>=p_since order by n.updated_at desc limit 50
  ) rows), '[]'::jsonb);
end; $$;

create function public.read_catalog_tool_notice_failures(p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.workspace_release_assert_operator(p_verified_email);
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null)
    then raise exception 'workspace_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'workspaceId',n.workspace_id,'workId',n.work_id,'at',n.updated_at,
    'reason',case when n.status='pending' then 'delivery_unconfirmed' else n.detail end))
    from public.internal_tool_notices n where (n.status='failed' and (n.attempts>=3 or n.created_at<clock_timestamp()-interval '23 hours'))
      or n.status='skipped' or (n.status='pending' and n.updated_at<clock_timestamp()-interval '15 minutes')), '[]'::jsonb);
end; $$;

revoke all on function public.lease_internal_tool_notice(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_internal_tool_notice_delivery(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.list_internal_tool_notice_retries() from public,anon,authenticated;
revoke all on function public.read_catalog_tool_notices(uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.read_catalog_tool_notice_failures(uuid,text) from public,anon,authenticated;
grant execute on function public.lease_internal_tool_notice(uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_internal_tool_notice_delivery(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.list_internal_tool_notice_retries() to service_role;
grant execute on function public.read_catalog_tool_notices(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.read_catalog_tool_notice_failures(uuid,text) to service_role;
