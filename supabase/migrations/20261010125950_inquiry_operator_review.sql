-- Operator review adds no workspace membership and sends no mail. Every RPC
-- verifies a confirmed, active Strelva operator independently of the app.
begin;
set local lock_timeout = '3s';
create function public.inquiry_assert_operator(p_user_id uuid,p_verified_email text) returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.super_admins a join public.users u on u.id=a.user_id
    where a.user_id=p_user_id and a.revoked_at is null and u.verified_at is not null
      and lower(u.email)=lower(btrim(p_verified_email))) then raise exception 'inquiry_access_denied'; end if;
end $$;
create function public.read_operator_held_inquiries(p_user_id uuid,p_verified_email text,p_state text,p_limit integer,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.inquiry_assert_operator(p_user_id,p_verified_email);
  if p_state is null or p_state not in ('held_as_spam','released','confirmed_spam') then raise exception 'inquiry_record_invalid'; end if;
  return coalesce((select jsonb_agg(public.inquiry_lead_json(l) || jsonb_build_object('workspaceId',l.workspace_id,
    'connectedSiteId',l.connected_site_id,'capturedAt',to_char(l.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'businessName',coalesce(w.name,t.site_name,l.tenant_slug_at_capture,'Connected business')) order by l.captured_at desc,l.id desc)
    from (select * from public.tenant_leads where intake_state=p_state
      and (p_before is null or captured_at<p_before or (captured_at=p_before and p_before_id is not null and id<p_before_id))
      order by captured_at desc,id desc limit least(greatest(coalesce(p_limit,50),1),100)) l
    left join public.workspaces w on w.id=l.workspace_id left join public.tenants t on t.stable_id=l.tenant_stable_id),'[]'::jsonb);
end $$;
create function public.decide_operator_held_inquiry(p_user_id uuid,p_verified_email text,p_lead_row_id uuid,p_decision text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lead public.tenant_leads; v_result jsonb; v_state text; v_event text;
begin
  perform public.inquiry_assert_operator(p_user_id,p_verified_email);
  select * into v_lead from public.tenant_leads where id=p_lead_row_id for update;
  if not found then raise exception 'inquiry_not_found'; end if;
  if v_lead.workspace_id is not null then
    v_result := public.decide_held_workspace_lead(v_lead.workspace_id,p_user_id,p_verified_email,p_lead_row_id,p_decision);
    return jsonb_build_object('status',v_result->>'status','state',v_result#>>'{lead,intakeState}');
  end if;
  if p_decision is null or p_decision not in ('release','confirm_spam','hold') then raise exception 'inquiry_record_invalid'; end if;
  if v_lead.intake_state='kept' then raise exception 'inquiry_not_held'; end if;
  v_state := case p_decision when 'release' then 'released' when 'hold' then 'held_as_spam' else 'confirmed_spam' end;
  if v_lead.intake_state=v_state then return jsonb_build_object('status','unchanged','state',v_state); end if;
  update public.tenant_leads set intake_state=v_state,intake_state_at=clock_timestamp() where id=v_lead.id returning * into v_lead;
  v_event := case p_decision when 'release' then 'released' when 'hold' then 'reheld' else 'confirmed_spam' end;
  perform public.inquiry_lead_event_write(v_lead,v_event,'operator',p_user_id::text,'{}'::jsonb,null);
  return jsonb_build_object('status','decided','state',v_state);
end $$;

-- Each corrected recipient gets a separate purpose. Original provider ids and
-- receipts stay immutable; in-flight or unknown acceptance never reopens.
create table public.connected_inquiry_owner_notice_repairs (
  id uuid primary key default gen_random_uuid(),lead_row_id uuid not null references public.tenant_leads(id),
  workspace_id uuid not null references public.workspaces(id),actor_id uuid not null references public.users(id),
  recipient text not null,gate_tenant_id text,subject text not null,
  status text not null default 'sending' check(status in ('sending','suppressed','accepted','delivered','deferred','bounced','failed','unknown')),
  provider_message_id text unique,accepted_at timestamptz,provider_event_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),unique(lead_row_id,recipient)
);
alter table public.connected_inquiry_owner_notice_repairs enable row level security;
revoke all on public.connected_inquiry_owner_notice_repairs from public,anon,authenticated,service_role;
create function public.claim_connected_inquiry_owner_notice_repair(p_user_id uuid,p_verified_email text,p_lead_row_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_notice public.connected_inquiry_owner_notices; v_prior public.connected_inquiry_owner_notice_repairs;
  v_repair public.connected_inquiry_owner_notice_repairs; v_lead public.tenant_leads; v_recipient jsonb; v_email text; v_status text; v_old_email text; v_id uuid;
begin
  perform public.inquiry_assert_operator(p_user_id,p_verified_email);
  select * into v_notice from public.connected_inquiry_owner_notices where lead_row_id=p_lead_row_id for update;
  if not found then raise exception 'inquiry_not_found'; end if;
  select * into v_lead from public.tenant_leads where id=p_lead_row_id and intake_state in ('kept','released');
  if not found then raise exception 'inquiry_not_found'; end if;
  v_recipient := public.resolve_business_owner_recipient(v_notice.workspace_id); v_email := lower(btrim(v_recipient->>'email'));
  select * into v_prior from public.connected_inquiry_owner_notice_repairs where lead_row_id=p_lead_row_id order by created_at desc,id desc limit 1;
  v_status := coalesce(v_prior.status,v_notice.status); v_old_email := coalesce(v_prior.recipient,v_notice.recipient);
  -- Known unsent suppression can be retried only by this explicit operator
  -- command, for the same corrected owner. Ambiguous/provider-accepted states
  -- never reacquire. The provider idempotency key stays the same purpose.
  if v_prior.status='suppressed' and v_prior.provider_message_id is null and v_email=v_prior.recipient
    and v_email is distinct from v_notice.recipient then
    update public.connected_inquiry_owner_notice_repairs set status='sending',gate_tenant_id=coalesce(v_recipient->>'tenantId',
      (select t.id from public.tenant_workspace_links k join public.tenants t on t.stable_id=k.tenant_stable_id
       where k.workspace_id=v_notice.workspace_id order by k.linked_at,k.id limit 1)) where id=v_prior.id;
    v_id := v_prior.id;
  elsif nullif(v_email,'') is null or v_email is not distinct from v_old_email or v_status not in ('bounced','failed','suppressed') then
    return jsonb_build_object('acquired',false,'status',v_status,'reason','correct_owner_recipient_before_resending');
  else
  insert into public.connected_inquiry_owner_notice_repairs(lead_row_id,workspace_id,actor_id,recipient,gate_tenant_id,subject)
    values(p_lead_row_id,v_notice.workspace_id,p_user_id,v_email,coalesce(v_recipient->>'tenantId',
      (select t.id from public.tenant_workspace_links k join public.tenants t on t.stable_id=k.tenant_stable_id
       where k.workspace_id=v_notice.workspace_id order by k.linked_at,k.id limit 1)),v_notice.subject)
    on conflict(lead_row_id,recipient) do nothing returning id into v_id;
  end if;
  select * into v_repair from public.connected_inquiry_owner_notice_repairs where lead_row_id=p_lead_row_id and recipient=v_email;
  if v_id is not null then perform public.inquiry_lead_event_write(v_lead,'timeline','operator',p_user_id::text,
    jsonb_build_object('ownerNoticeRepair',true,'repairId',v_id),'connected-notice-repair:'||v_id::text); end if;
  return jsonb_build_object('acquired',v_id is not null,'status',v_repair.status,'repairId',v_repair.id,
    'recipient',v_repair.recipient,'tenantId',v_repair.gate_tenant_id,'subject',v_repair.subject,'workspaceId',v_repair.workspace_id,
    'name',v_lead.name,'email',v_lead.email,'message',v_lead.message,'siteHost',(select site_host from public.connected_sites where id=v_notice.connected_site_id));
end $$;
create function public.verify_connected_inquiry_owner_notice_repair(p_repair_id uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v public.connected_inquiry_owner_notice_repairs; v_owner jsonb;
begin
  select * into v from public.connected_inquiry_owner_notice_repairs where id=p_repair_id;
  if not found or v.status<>'sending' then return false; end if;
  v_owner := public.resolve_business_owner_recipient(v.workspace_id);
  return lower(btrim(v_owner->>'email'))=v.recipient and exists(select 1 from public.tenant_leads where id=v.lead_row_id and intake_state in ('kept','released'));
end $$;
create function public.finish_connected_inquiry_owner_notice_repair(p_repair_id uuid,p_status text,p_provider_message_id text,p_accepted_at timestamptz) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.connected_inquiry_owner_notice_repairs; v_lead public.tenant_leads;
begin
  if p_status is null or p_status not in ('suppressed','accepted','unknown')
    or (p_status='accepted' and (nullif(p_provider_message_id,'') is null or p_accepted_at is null)) then raise exception 'inquiry_record_invalid'; end if;
  select * into v from public.connected_inquiry_owner_notice_repairs where id=p_repair_id for update;
  if not found then raise exception 'inquiry_not_found'; end if;
  if v.status<>'sending' then return false; end if;
  update public.connected_inquiry_owner_notice_repairs set status=p_status,provider_message_id=p_provider_message_id,accepted_at=p_accepted_at where id=p_repair_id;
  select * into v_lead from public.tenant_leads where id=v.lead_row_id;
  perform public.inquiry_lead_event_write(v_lead,'delivery','system',null,jsonb_build_object('ownerNotice',true,'repairId',p_repair_id,
    'status',p_status,'providerMessageId',p_provider_message_id,'acceptedAt',p_accepted_at),'connected-notice-repair-result:'||p_repair_id::text||':'||p_status);
  return true;
end $$;
create function public.record_connected_inquiry_owner_notice_repair_event(p_repair_id uuid,p_lead_row_id uuid,p_workspace_id uuid,p_provider_message_id text,
 p_event_id text,p_status text,p_event_at timestamptz,p_accepted_at timestamptz,p_recipients text[],p_subject text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.connected_inquiry_owner_notice_repairs; v_lead public.tenant_leads; v_accepted timestamptz;
begin
  if p_status is null or p_status not in ('accepted','delivered','deferred','bounced','failed','suppressed')
    or nullif(btrim(p_provider_message_id),'') is null or char_length(p_provider_message_id)>240
    or nullif(btrim(p_event_id),'') is null or char_length(p_event_id)>240
    or p_event_at is null or p_event_at>clock_timestamp()+interval '5 minutes' or p_accepted_at>p_event_at then raise exception 'inquiry_record_invalid'; end if;
  select * into v from public.connected_inquiry_owner_notice_repairs where id=p_repair_id and lead_row_id=p_lead_row_id and workspace_id=p_workspace_id for update;
  if not found or (v.status='suppressed' and v.provider_message_id is null) or v.subject is distinct from p_subject
    or not exists(select 1 from unnest(p_recipients) email where lower(btrim(email))=v.recipient)
    or (v.provider_message_id is not null and v.provider_message_id<>p_provider_message_id) then return jsonb_build_object('status','unmatched'); end if;
  v_accepted := coalesce(v.accepted_at,p_accepted_at);
  if v_accepted is null or v_accepted<v.created_at-interval '5 minutes' or v_accepted>p_event_at then return jsonb_build_object('status','unmatched'); end if;
  select * into v_lead from public.tenant_leads where id=p_lead_row_id;
  if not public.inquiry_lead_event_write(v_lead,'delivery','system',null,jsonb_build_object('ownerNotice',true,'repairId',p_repair_id,
    'status',p_status,'providerMessageId',p_provider_message_id,'acceptedAt',v_accepted),'connected-notice-repair-event:'||p_repair_id::text||':'||p_event_id)
    then return jsonb_build_object('status','duplicate'); end if;
  if (v.provider_event_at is null or p_event_at>v.provider_event_at)
    and (v.status not in ('bounced','failed','suppressed') or p_status=v.status)
    and (p_status<>'accepted' or v.status in ('sending','unknown','accepted'))
    and (p_status<>'deferred' or v.status<>'delivered') then
    update public.connected_inquiry_owner_notice_repairs set status=p_status,provider_message_id=p_provider_message_id,accepted_at=v_accepted,provider_event_at=p_event_at where id=p_repair_id;
  end if;
  return jsonb_build_object('status','recorded');
end $$;

create function public.read_operator_inquiry_notice_issues(p_user_id uuid,p_verified_email text,p_limit integer,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.inquiry_assert_operator(p_user_id,p_verified_email);
  return coalesce((with latest_tenant as (
    select distinct on(e.tenant_stable_id,e.lead_id) e.*,t.id as tenant_id
    from public.inquiry_events e join public.tenants t on t.stable_id=e.tenant_stable_id
    where e.kind='delivery' and e.detail->>'ownerNotice'='true' order by e.tenant_stable_id,e.lead_id,e.at desc,e.id desc
  ), issues as (
    select e.id,e.at,jsonb_build_object('id',e.id,'workspaceId',e.workspace_id,'businessName',coalesce(w.name,t.site_name),
      'tenantId',e.tenant_id,'connectedSiteId',null,'inquiryId',e.lead_id,'name',l.name,'at',e.at,'status',e.detail->>'status','reason',e.detail->>'reason') as item
    from latest_tenant e join public.tenant_leads l on l.tenant_stable_id=e.tenant_stable_id and l.lead_id=e.lead_id
    join public.tenants t on t.id=e.tenant_id left join public.workspaces w on w.id=e.workspace_id
    where e.detail->>'status' not in ('accepted','accepted_unverified','verified','delivered','deferred')
    union all
    select coalesce(r.id,n.lead_row_id),coalesce(r.provider_event_at,r.created_at,n.provider_event_at,n.created_at),
      jsonb_build_object('id',coalesce(r.id,n.lead_row_id),'workspaceId',n.workspace_id,'businessName',w.name,
        'tenantId',null,'connectedSiteId',n.connected_site_id,'inquiryId',n.lead_row_id,'name',l.name,
        'at',coalesce(r.provider_event_at,r.created_at,n.provider_event_at,n.created_at),'status',coalesce(r.status,n.status),'reason','owner_notice_delivery_not_confirmed')
    from public.connected_inquiry_owner_notices n join public.tenant_leads l on l.id=n.lead_row_id join public.workspaces w on w.id=n.workspace_id
    left join lateral(select * from public.connected_inquiry_owner_notice_repairs where lead_row_id=n.lead_row_id order by created_at desc,id desc limit 1) r on true
    where coalesce(r.status,n.status) not in ('accepted','delivered','deferred')
  ) select jsonb_agg(item order by at desc,id desc) from (select * from issues
    where p_before is null or at<p_before or (at=p_before and p_before_id is not null and id<p_before_id)
    order by at desc,id desc limit least(greatest(coalesce(p_limit,50),1),100)) page),'[]'::jsonb);
end $$;

create or replace function public.list_connected_inquiry_owner_notices_not_told() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('tenantId',null,'workspaceId',n.workspace_id,'connectedSiteId',n.connected_site_id,
    'inquiryId',n.lead_row_id,'at',coalesce(r.provider_event_at,r.created_at,n.provider_event_at,n.created_at),'status',coalesce(r.status,n.status),
    'reason','owner_notice_delivery_not_confirmed')),'[]'::jsonb)
  from public.connected_inquiry_owner_notices n
  left join lateral(select * from public.connected_inquiry_owner_notice_repairs where lead_row_id=n.lead_row_id order by created_at desc,id desc limit 1) r on true
  where coalesce(r.status,n.status) not in ('accepted','delivered','deferred')
$$;
revoke all on function public.inquiry_assert_operator(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.read_operator_held_inquiries(uuid,text,text,integer,timestamptz,uuid),
 public.decide_operator_held_inquiry(uuid,text,uuid,text),public.read_operator_inquiry_notice_issues(uuid,text,integer,timestamptz,uuid),
 public.claim_connected_inquiry_owner_notice_repair(uuid,text,uuid),public.verify_connected_inquiry_owner_notice_repair(uuid),
 public.finish_connected_inquiry_owner_notice_repair(uuid,text,text,timestamptz),
 public.record_connected_inquiry_owner_notice_repair_event(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text) from public,anon,authenticated;
grant execute on function public.read_operator_held_inquiries(uuid,text,text,integer,timestamptz,uuid),
 public.decide_operator_held_inquiry(uuid,text,uuid,text),public.read_operator_inquiry_notice_issues(uuid,text,integer,timestamptz,uuid),
 public.claim_connected_inquiry_owner_notice_repair(uuid,text,uuid),public.verify_connected_inquiry_owner_notice_repair(uuid),
 public.finish_connected_inquiry_owner_notice_repair(uuid,text,text,timestamptz),
 public.record_connected_inquiry_owner_notice_repair_event(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text) to service_role;
commit;
