-- Reused cohort for member reads and trusted report jobs; no identity invented
-- for an owner who has never signed in. Only bounded service-role RPCs exposed.
begin;
set local lock_timeout = '3s';
create function public.inquiry_outcome_cohort(p_workspace_id uuid,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_count bigint; v_answered bigint; v_day bigint; v_avg numeric; v_median numeric;
begin
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '366 days' then raise exception 'inquiry_record_invalid'; end if;
  with first_replies as (
    select l.id,l.captured_at,min(r.accepted_at) as replied_at
    from public.tenant_leads l
    left join lateral (
      -- Workspace replies are counted only with a provider acceptance receipt.
      select m.accepted_at from public.inquiry_workspace_messages m where m.lead_row_id = l.id
        and m.provider_message_id is not null and m.accepted_at is not null
      union all
      -- Governed engine deliveries already mirror one first acceptance.
      select public.inquiry_safe_timestamp(c.payload->>'firstReplyAt') from public.tenant_client_records c
        where c.tenant_stable_id = l.tenant_stable_id and c.store = 'inquiry_reply' and c.record_id = l.lead_id and c.removed_at is null
      union all
      -- Receipt copies survive Redis loss and mirror retry failures.
      select public.inquiry_safe_timestamp(e.detail->>'acceptedAt') from public.inquiry_events e
        where e.tenant_stable_id = l.tenant_stable_id and e.lead_id = l.lead_id and e.kind = 'delivery'
        and e.detail->>'action' in ('reply','send_message') and nullif(e.detail->>'providerMessageId','') is not null
    ) r on r.accepted_at >= l.captured_at and r.accepted_at <= now()
    where l.workspace_id = p_workspace_id and l.intake_state in ('kept','released') and l.captured_at >= p_from and l.captured_at < p_to
    group by l.id,l.captured_at
  ) select count(*),count(replied_at),count(*) filter(where replied_at <= captured_at + interval '1 day'),
    avg(extract(epoch from replied_at - captured_at)),percentile_cont(0.5) within group(order by extract(epoch from replied_at - captured_at))
    into v_count,v_answered,v_day,v_avg,v_median from first_replies;
  return jsonb_build_object('workspaceId',p_workspace_id,'from',p_from,'to',p_to,
    'inquiries',v_count,'answered',v_answered,'withinDay',v_day,'unanswered',v_count-v_answered,
    'averageReplySeconds',v_avg,'medianReplySeconds',v_median,
    'evidence','First provider acceptance; delivery and customer response are separate evidence.');
end $$;


revoke all on function public.inquiry_outcome_cohort(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;
create or replace function public.business_inquiry_outcomes(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email);
  return public.inquiry_outcome_cohort(p_workspace_id,p_from,p_to);
end $$;
create function public.business_inquiry_outcomes_for_tenant(p_tenant_id text,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_workspace uuid;
begin
  select l.workspace_id into v_workspace from public.tenant_workspace_links l
    join public.tenants t on t.stable_id=l.tenant_stable_id where t.id=p_tenant_id;
  if v_workspace is null then return jsonb_build_object('status','unavailable'); end if;
  return public.inquiry_outcome_cohort(v_workspace,p_from,p_to);
end $$;
revoke all on function public.business_inquiry_outcomes_for_tenant(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.business_inquiry_outcomes_for_tenant(text,timestamptz,timestamptz) to service_role;
commit;
