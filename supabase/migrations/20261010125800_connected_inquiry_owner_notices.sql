-- Connected-site owner notices retain acceptance and delivery evidence without
-- inventing a tenant. New callers require INQUIRY_RECORDS + OWNER_NOTICES.
begin;
set local lock_timeout = '3s';
create table public.connected_inquiry_owner_notices (
  lead_row_id uuid primary key references public.tenant_leads(id),
  workspace_id uuid not null references public.workspaces(id),
  connected_site_id uuid not null,
  recipient text,
  tenant_id text,
  subject text not null,
  status text not null default 'sending' check(status in ('sending','suppressed','accepted','delivered','deferred','bounced','failed','unknown')),
  provider_message_id text unique,
  accepted_at timestamptz,
  provider_event_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.connected_inquiry_owner_notices enable row level security;
revoke all on public.connected_inquiry_owner_notices from public,anon,authenticated,service_role;

create function public.claim_connected_inquiry_owner_notice(p_lead_row_id uuid,p_site_id uuid,p_workspace_id uuid,p_subject text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lead public.tenant_leads; v_notice public.connected_inquiry_owner_notices; v_recipient jsonb; v_inserted uuid;
begin
  if nullif(btrim(p_subject),'') is null or char_length(p_subject)>200 or p_subject ~ '[\r\n]' then raise exception 'inquiry_record_invalid'; end if;
  select * into v_lead from public.tenant_leads where id=p_lead_row_id and connected_site_id=p_site_id and workspace_id=p_workspace_id for update;
  if not found or v_lead.intake_state not in ('kept','released') then raise exception 'inquiry_not_found'; end if;
  v_recipient := public.resolve_business_owner_recipient(p_workspace_id);
  insert into public.connected_inquiry_owner_notices(lead_row_id,workspace_id,connected_site_id,recipient,tenant_id,subject)
    values(v_lead.id,p_workspace_id,p_site_id,lower(v_recipient->>'email'),coalesce(v_recipient->>'tenantId',
      (select t.id from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id
       where l.workspace_id=p_workspace_id order by l.linked_at,l.id limit 1)),p_subject)
    on conflict do nothing returning lead_row_id into v_inserted;
  select * into v_notice from public.connected_inquiry_owner_notices where lead_row_id=v_lead.id;
  if v_notice.subject is distinct from p_subject then raise exception 'inquiry_record_invalid'; end if;
  return jsonb_build_object('acquired',v_inserted is not null,'status',v_notice.status,'recipient',v_notice.recipient,'tenantId',v_notice.tenant_id);
end $$;

create function public.finish_connected_inquiry_owner_notice(p_lead_row_id uuid,p_status text,p_provider_message_id text,p_accepted_at timestamptz) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_notice public.connected_inquiry_owner_notices; v_lead public.tenant_leads;
begin
  if p_status is null or p_status not in ('suppressed','accepted','unknown')
    or (p_status='accepted' and (nullif(p_provider_message_id,'') is null or p_accepted_at is null)) then raise exception 'inquiry_record_invalid'; end if;
  select * into v_notice from public.connected_inquiry_owner_notices where lead_row_id=p_lead_row_id for update;
  if not found then raise exception 'inquiry_not_found'; end if;
  if v_notice.status<>'sending' then return false; end if;
  update public.connected_inquiry_owner_notices set status=p_status,provider_message_id=p_provider_message_id,accepted_at=p_accepted_at where lead_row_id=p_lead_row_id;
  select * into v_lead from public.tenant_leads where id=p_lead_row_id;
  perform public.inquiry_lead_event_write(v_lead,'delivery','system',null,
    jsonb_build_object('ownerNotice',true,'status',p_status,'providerMessageId',p_provider_message_id,'acceptedAt',p_accepted_at),
    'connected-owner-notice:'||p_status);
  return true;
end $$;

create function public.record_connected_inquiry_owner_notice_event(p_lead_row_id uuid,p_workspace_id uuid,p_provider_message_id text,
 p_event_id text,p_status text,p_event_at timestamptz,p_accepted_at timestamptz,p_recipients text[],p_subject text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_notice public.connected_inquiry_owner_notices; v_lead public.tenant_leads; v_accepted timestamptz; v_dedupe text;
begin
  if p_status is null or p_status not in ('accepted','delivered','deferred','bounced','failed','suppressed')
    or nullif(btrim(p_provider_message_id),'') is null or char_length(p_provider_message_id)>240
    or nullif(btrim(p_event_id),'') is null or char_length(p_event_id)>240
    or p_event_at is null or p_event_at>clock_timestamp()+interval '5 minutes' or p_accepted_at>p_event_at then raise exception 'inquiry_record_invalid'; end if;
  select * into v_notice from public.connected_inquiry_owner_notices where lead_row_id=p_lead_row_id and workspace_id=p_workspace_id for update;
  if not found or (v_notice.status='suppressed' and v_notice.provider_message_id is null) or v_notice.subject is distinct from p_subject
    or not exists(select 1 from unnest(p_recipients) email where lower(btrim(email))=v_notice.recipient)
    or (v_notice.provider_message_id is not null and v_notice.provider_message_id<>p_provider_message_id)
    then return jsonb_build_object('status','unmatched'); end if;
  v_accepted := coalesce(v_notice.accepted_at,p_accepted_at);
  if v_accepted is null or v_accepted<v_notice.created_at-interval '5 minutes' or v_accepted>p_event_at then return jsonb_build_object('status','unmatched'); end if;
  select * into v_lead from public.tenant_leads where id=p_lead_row_id;
  v_dedupe := 'connected-owner-provider:'||p_event_id;
  if not public.inquiry_lead_event_write(v_lead,'delivery','system',null,
    jsonb_build_object('ownerNotice',true,'status',p_status,'providerMessageId',p_provider_message_id,'acceptedAt',v_accepted),v_dedupe)
    then return jsonb_build_object('status','duplicate'); end if;
  if (v_notice.provider_event_at is null or p_event_at>v_notice.provider_event_at)
    and (v_notice.status not in ('bounced','failed','suppressed') or p_status=v_notice.status)
    and (p_status<>'accepted' or v_notice.status in ('sending','unknown','accepted'))
    and (p_status<>'deferred' or v_notice.status<>'delivered') then
    update public.connected_inquiry_owner_notices set status=p_status,provider_message_id=p_provider_message_id,accepted_at=v_accepted,provider_event_at=p_event_at where lead_row_id=p_lead_row_id;
  end if;
  return jsonb_build_object('status','recorded');
end $$;

-- The Queue's authenticated super-admin boundary owns this service-only read.
-- Standalone businesses have no tenant row and must remain visible here.
create function public.list_connected_inquiry_owner_notices_not_told() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('tenantId',null,'workspaceId',workspace_id,'connectedSiteId',connected_site_id,
    'inquiryId',lead_row_id,'at',coalesce(provider_event_at,created_at),'status',status,
    'reason',case status when 'suppressed' then 'email_gates_closed_or_no_recipient' when 'bounced' then 'provider_bounced' when 'failed' then 'provider_failed' else 'send_not_confirmed' end)), '[]'::jsonb)
  from public.connected_inquiry_owner_notices where status not in ('accepted','delivered','deferred')
$$;
revoke all on function public.claim_connected_inquiry_owner_notice(uuid,uuid,uuid,text),public.finish_connected_inquiry_owner_notice(uuid,text,text,timestamptz),
 public.record_connected_inquiry_owner_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text),public.list_connected_inquiry_owner_notices_not_told() from public,anon,authenticated;
grant execute on function public.claim_connected_inquiry_owner_notice(uuid,uuid,uuid,text),public.finish_connected_inquiry_owner_notice(uuid,text,text,timestamptz),
 public.record_connected_inquiry_owner_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text),public.list_connected_inquiry_owner_notices_not_told() to service_role;
commit;
