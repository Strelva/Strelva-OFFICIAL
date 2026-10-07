-- Default-off durable export recovery; rebuilding interrupted archives is leased.
begin;
set local lock_timeout = '3s';
create table public.workspace_export_recovery (
  build_id uuid primary key references public.workspace_export_builds(id) on delete cascade,
  verified_email text not null,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts between 0 and 3),
  delivery_attempts integer not null default 0 check(delivery_attempts between 0 and 3),
  delivery_state text not null default 'pending' check(delivery_state in ('pending','dispatching','accepted','unknown')),
  token_ciphertext text check(token_ciphertext is null or token_ciphertext like 'enc:v1:%'),
  tenant_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(tenant_ids)='array'),
  delivered_at timestamptz,
  delivery_failure text,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.workspace_export_recovery enable row level security;
revoke all on public.workspace_export_recovery from public,anon,authenticated,service_role;
-- Every emailed archive uses the same business owner-recipient rule, including
-- requests made by another signed-in owner. Owner downloads retain membership checks.
alter function public.start_workspace_export_build(uuid,uuid,text) rename to start_workspace_export_build_before_owner_rule;
revoke all on function public.start_workspace_export_build_before_owner_rule(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.start_workspace_export_build(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text; v_recipient text; v_id uuid;
begin
  v_role := public.workspace_export_v3_role(p_workspace_id,p_user_id,p_verified_email);
  perform 1 from public.workspaces where id=p_workspace_id for update;
  v_recipient := public.resolve_business_owner_recipient(p_workspace_id)->>'email';
  if v_recipient is null then raise exception 'workspace_export_no_owner_recipient'; end if;
  if exists(select 1 from public.workspace_export_builds where workspace_id=p_workspace_id and status='building'
      and created_at>clock_timestamp()-interval '30 minutes') then raise exception 'workspace_export_in_progress'; end if;
  insert into public.workspace_export_builds(workspace_id,requested_by,requester_role,deliver_to)
    values(p_workspace_id,p_user_id,v_role,v_recipient) returning id into v_id;
  return jsonb_build_object('buildId',v_id,'requesterRole',v_role,'deliverTo',v_recipient,'status','building');
end $$;
revoke all on function public.start_workspace_export_build(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.start_workspace_export_build(uuid,uuid,text) to service_role;

create function public.enqueue_workspace_export_recovery(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_recipient text;
begin
  perform 1 from public.workspaces where id=p_workspace_id for update;
  v_result := public.start_workspace_export_build(p_workspace_id,p_user_id,p_verified_email);
  v_recipient := public.resolve_business_owner_recipient(p_workspace_id)->>'email';
  if v_recipient is null then raise exception 'workspace_export_no_owner_recipient'; end if;
  update public.workspace_export_builds set deliver_to=v_recipient where id=(v_result->>'buildId')::uuid;
  v_result := jsonb_set(v_result,'{deliverTo}',to_jsonb(v_recipient));
  insert into public.workspace_export_recovery(build_id,verified_email)
    values((v_result->>'buildId')::uuid,lower(btrim(p_verified_email)));
  return v_result;
end $$;
create function public.claim_workspace_export_recovery(p_build_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.workspace_export_recovery%rowtype; v_build public.workspace_export_builds%rowtype; v_token uuid;
begin
  -- Terminal exhausted builds remain visible with an explicit failure.
  update public.workspace_export_builds build_row set status='failed',failure='export_worker_attempts_exhausted',completed_at=clock_timestamp()
    from public.workspace_export_recovery q where q.build_id=build_row.id and build_row.status='building' and q.attempts>=3
      and (q.lease_until is null or q.lease_until<=clock_timestamp());
  select q.* into v from public.workspace_export_recovery q join public.workspace_export_builds build_row on build_row.id=q.build_id
    where (p_build_id is null or q.build_id=p_build_id) and (q.lease_until is null or q.lease_until<=clock_timestamp())
      and ((build_row.status='building' and q.attempts<3) or (build_row.status='ready' and q.delivered_at is null and q.delivery_state='pending' and q.delivery_attempts<3
        and build_row.expires_at>clock_timestamp() and q.token_ciphertext is not null))
    order by q.created_at for update of q skip locked limit 1;
  if not found then return null; end if;
  select * into v_build from public.workspace_export_builds where id=v.build_id for update;
  -- Revoked membership or changed/unverified requester email stops all recovery.
  begin
    perform public.workspace_export_v3_role(v_build.workspace_id,v_build.requested_by,v.verified_email);
  exception when others then
    update public.workspace_export_builds set status='failed',failure='export_requester_access_revoked',completed_at=clock_timestamp()
      where id=v_build.id and status='building';
    update public.workspace_export_recovery set delivery_attempts=3,token_ciphertext=null,
      delivery_failure='export_requester_access_revoked' where build_id=v_build.id;
    return null;
  end;
  v_build.deliver_to := public.resolve_business_owner_recipient(v_build.workspace_id)->>'email';
  if v_build.deliver_to is null then
    update public.workspace_export_builds set status='failed',failure='export_owner_recipient_missing',completed_at=clock_timestamp()
      where id=v_build.id and status='building';
    update public.workspace_export_recovery set delivery_attempts=3,token_ciphertext=null,
      delivery_failure='export_owner_recipient_missing' where build_id=v_build.id;
    return null;
  end if;
  update public.workspace_export_builds set deliver_to=v_build.deliver_to where id=v_build.id;
  v_token := gen_random_uuid();
  update public.workspace_export_recovery set lease_token=v_token,lease_until=clock_timestamp()+interval '10 minutes',
    attempts=attempts+case when v_build.status='building' then 1 else 0 end,
    delivery_attempts=delivery_attempts+case when v_build.status='ready' then 1 else 0 end where build_id=v.build_id;
  if v_build.status='building' then
    delete from public.workspace_export_build_parts where build_id=v_build.id;
    update public.workspace_export_builds set part_count=0,byte_size=0 where id=v_build.id;
  end if;
  return jsonb_build_object('buildId',v_build.id,'workspaceId',v_build.workspace_id,'userId',v_build.requested_by,
    'verifiedEmail',v.verified_email,'deliverTo',v_build.deliver_to,'requesterRole',v_build.requester_role,'leaseToken',v_token,
    'stage',case when v_build.status='building' then 'build' else 'delivery' end,
    'tokenCiphertext',v.token_ciphertext,'tenantIds',v.tenant_ids,'manifest',v_build.manifest);
end $$;
create function public.write_workspace_export_recovery(p_build_id uuid,p_lease_token uuid,p_operation text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.workspace_export_recovery%rowtype; v_result jsonb;
begin
  select * into q from public.workspace_export_recovery where build_id=p_build_id for update;
  if not found or q.lease_token is distinct from p_lease_token or q.lease_until<=clock_timestamp() then
    raise exception 'workspace_export_lease_lost';
  end if;
  if p_operation='append_workspace_export_build_part' then
    perform public.append_workspace_export_build_part(p_build_id,(p_args->>'p_part')::integer,p_args->>'p_body');
  elsif p_operation='complete_workspace_export_build' then
    if p_args->>'tokenCiphertext' is null or p_args->>'tokenCiphertext' not like 'enc:v1:%' then
      raise exception 'workspace_export_token_encryption_required';
    end if;
    v_result := public.complete_workspace_export_build(p_build_id,p_args->'p_manifest',p_args->>'p_token_hash',p_args->'p_category_counts');
    update public.workspace_export_recovery set token_ciphertext=p_args->>'tokenCiphertext',
      tenant_ids=p_args->'tenantIds',delivery_attempts=delivery_attempts+1 where build_id=p_build_id;
  elsif p_operation='fail_workspace_export_build' then
    perform public.fail_workspace_export_build(p_build_id,p_args->>'p_failure');
    update public.workspace_export_recovery set lease_token=null,lease_until=null where build_id=p_build_id;
  elsif p_operation='reserve_delivery' then
    if q.delivery_state<>'pending' or q.delivered_at is not null
      or not exists(select 1 from public.workspace_export_builds where id=p_build_id and status='ready') then
      raise exception 'workspace_export_delivery_already_reserved';
    end if;
    update public.workspace_export_recovery set delivery_state='dispatching',delivery_failure=null where build_id=p_build_id;
  elsif p_operation='delivered' then
    if q.delivery_state<>'dispatching' then raise exception 'workspace_export_delivery_not_reserved'; end if;
    update public.workspace_export_recovery set delivered_at=clock_timestamp(),lease_token=null,lease_until=null,
      token_ciphertext=null,delivery_failure=null,delivery_state='accepted' where build_id=p_build_id;
  elsif p_operation='delivery_unknown' then
    if q.delivery_state<>'dispatching' then raise exception 'workspace_export_delivery_not_reserved'; end if;
    update public.workspace_export_recovery set delivery_state='unknown',delivery_failure='export_link_delivery_unknown'
      where build_id=p_build_id;
  elsif p_operation='delivery_failed' then
    if q.delivery_state not in ('pending','dispatching') then raise exception 'workspace_export_delivery_not_reserved'; end if;
    update public.workspace_export_recovery set lease_until=clock_timestamp()+interval '10 minutes',delivery_failure='export_link_delivery_failed',delivery_state='pending'
      where build_id=p_build_id;
  else raise exception 'workspace_export_invalid'; end if;
  return coalesce(v_result,'{}'::jsonb);
end $$;
revoke all on function public.enqueue_workspace_export_recovery(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.claim_workspace_export_recovery(uuid) from public,anon,authenticated;
revoke all on function public.write_workspace_export_recovery(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_workspace_export_recovery(uuid,uuid,text) to service_role;
grant execute on function public.claim_workspace_export_recovery(uuid) to service_role;
grant execute on function public.write_workspace_export_recovery(uuid,uuid,text,jsonb) to service_role;
commit;
