-- Exact counts and first provider acceptance times, including connected sites.
-- New functions only. STRELVA_INQUIRY_OUTCOMES selects them; default reads stay unchanged.
set local lock_timeout = '3s';
create function public.inquiry_safe_timestamp(p_value text) returns timestamptz
language plpgsql immutable set search_path = public,pg_temp as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}T' then return null; end if;
  return p_value::timestamptz;
exception when others then return null;
end $$;

create function public.read_tenant_lead_summary(p_tenant_id text,p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_stable uuid; v_count bigint; v_recent jsonb;
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return jsonb_build_object('count',0,'recent','[]'::jsonb); end if;
  select count(*) into v_count from public.tenant_leads where tenant_stable_id = v_stable and intake_state in ('kept','released') and captured_at >= p_since;
  select coalesce(jsonb_agg(public.inquiry_lead_json(l) order by l.captured_at desc,l.id desc),'[]'::jsonb) into v_recent
    from (select * from public.tenant_leads where tenant_stable_id = v_stable and intake_state in ('kept','released') and captured_at >= p_since
      order by captured_at desc,id desc limit 5) l;
  return jsonb_build_object('count',v_count,'recent',v_recent);
end $$;

create function public.business_inquiry_outcomes(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_count bigint; v_answered bigint; v_day bigint; v_avg numeric; v_median numeric;
begin
  perform public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email);
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

create function public.business_outcome_month_inquiries(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_month date) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_old jsonb; v_inquiry jsonb; v_from timestamptz;
begin
  v_old := public.business_outcome_month(p_workspace_id,p_user_id,p_verified_email,p_month);
  v_from := date_trunc('month',p_month::timestamp) at time zone 'UTC';
  v_inquiry := public.business_inquiry_outcomes(p_workspace_id,p_user_id,p_verified_email,v_from,v_from+interval '1 month');
  return v_old || jsonb_build_object('inquiries',jsonb_build_object('kind','counted','value',v_inquiry->'inquiries'),
    'answered',jsonb_build_object('kind','linked','value',v_inquiry->'answered','withinDay',v_inquiry->'withinDay',
      'averageReplySeconds',v_inquiry->'averageReplySeconds','medianReplySeconds',v_inquiry->'medianReplySeconds','reason',null));
end $$;

revoke all on function public.inquiry_safe_timestamp(text) from public,anon,authenticated,service_role;
revoke all on function public.read_tenant_lead_summary(text,timestamptz),public.business_inquiry_outcomes(uuid,uuid,text,timestamptz,timestamptz),
 public.business_outcome_month_inquiries(uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.read_tenant_lead_summary(text,timestamptz),public.business_inquiry_outcomes(uuid,uuid,text,timestamptz,timestamptz),
 public.business_outcome_month_inquiries(uuid,uuid,text,date) to service_role;

-- Stable tie-breaker: two submissions in the same millisecond cannot disappear
-- when the owner opens the next page.
create function public.read_tenant_leads_page(p_tenant_id text,p_limit integer,p_before timestamptz,p_before_id text) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_stable uuid;
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(public.inquiry_lead_json(l) order by l.captured_at desc,l.lead_id desc)
    from (select * from public.tenant_leads where tenant_stable_id = v_stable and intake_state in ('kept','released')
      and (p_before is null or captured_at < p_before or (captured_at = p_before and p_before_id is not null and lead_id < p_before_id))
      order by captured_at desc,lead_id desc limit least(greatest(coalesce(p_limit,50),1),500)) l),'[]'::jsonb);
end $$;
revoke all on function public.read_tenant_leads_page(text,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.read_tenant_leads_page(text,integer,timestamptz,text) to service_role;
