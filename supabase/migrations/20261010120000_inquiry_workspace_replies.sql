-- Owner-authored workspace replies. New RPCs only; callers are off by default.
-- Claims never expire back into sendable work: ambiguous provider acceptance
-- needs reconciliation, never an automatic second send.
begin;
set local lock_timeout = '3s';

create table public.inquiry_workspace_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  lead_row_id uuid not null references public.tenant_leads(id),
  requested_by uuid not null references public.users(id),
  request_id uuid not null,
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  recipient text not null,
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  status text not null default 'sending' check (status in ('sending','suppressed','accepted','delivered','deferred','bounced','failed','unknown')),
  provider_message_id text,
  accepted_at timestamptz,
  provider_event_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(workspace_id, request_id)
);
create unique index inquiry_workspace_message_purpose_idx on public.inquiry_workspace_messages(lead_row_id) where status <> 'suppressed';
create unique index inquiry_workspace_message_provider_idx on public.inquiry_workspace_messages(provider_message_id) where provider_message_id is not null;
create table public.inquiry_workspace_message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inquiry_workspace_messages(id),
  workspace_id uuid not null references public.workspaces(id),
  actor_id uuid not null references public.users(id),
  status text not null,
  provider_message_id text,
  provider_event_id text unique,
  at timestamptz not null default clock_timestamp()
);
alter table public.inquiry_workspace_messages enable row level security;
alter table public.inquiry_workspace_message_events enable row level security;
revoke all on public.inquiry_workspace_messages, public.inquiry_workspace_message_events from public, anon, authenticated, service_role;
create trigger inquiry_workspace_message_events_immutable before update or delete on public.inquiry_workspace_message_events
  for each row execute function public.inquiry_events_immutable();

create function public.claim_workspace_inquiry_reply(p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_lead_row_id uuid, p_request_id uuid, p_digest text, p_subject text, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lead public.tenant_leads; v_message public.inquiry_workspace_messages; v_inserted uuid; v_state jsonb; v_cap jsonb; v_overlay text;
begin
  if public.inquiry_assert_member(p_workspace_id, p_user_id, p_verified_email) <> 'owner' then raise exception 'inquiry_access_denied'; end if;
  if p_request_id is null or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
    or p_subject is null or char_length(btrim(p_subject)) not between 1 and 200 or p_subject ~ '[\r\n]'
    or p_body is null or char_length(btrim(p_body)) not between 1 and 5000 then raise exception 'inquiry_record_invalid'; end if;
  select * into v_lead from public.tenant_leads where id = p_lead_row_id and workspace_id = p_workspace_id for share;
  if not found then raise exception 'inquiry_not_found'; end if;
  if v_lead.tenant_stable_id is not null and not exists (select 1 from public.memberships where user_id = p_user_id and tenant_stable_id = v_lead.tenant_stable_id) then raise exception 'inquiry_access_denied'; end if;
  -- Receipt checks remain available after a pause, exit, closure or edit. They
  -- can never send: only a newly acquired claim crosses the transport boundary.
  select * into v_message from public.inquiry_workspace_messages where workspace_id = p_workspace_id
    and (request_id = p_request_id or (lead_row_id = p_lead_row_id and status <> 'suppressed'))
    order by (request_id = p_request_id) desc,created_at desc limit 1;
  if not found then
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if v_lead.intake_state not in ('kept','released') then raise exception 'inquiry_reply_held'; end if;
  if not coalesce(public.business_record_email_valid(v_lead.email),false) then raise exception 'inquiry_reply_recipient_missing'; end if;
  -- The capability lock serializes a reply claim against a System pause.
  select state into v_state from public.inquiry_workspaces w where tenant_stable_id = v_lead.tenant_stable_id
    and (v_lead.capability_id is null or exists (select 1 from jsonb_array_elements(coalesce(w.state->'capabilities','[]'::jsonb)) c where c->>'id' = v_lead.capability_id)) for share;
  if v_lead.capability_id is not null then
    select c into v_cap from jsonb_array_elements(coalesce(v_state->'capabilities','[]'::jsonb)) c where c->>'id' = v_lead.capability_id;
    if v_cap is null or v_cap->>'status' not in ('live','live_unverified') then raise exception 'inquiry_reply_paused'; end if;
    if v_lead.capability_version is null or v_cap->'live'->>'version' is distinct from v_lead.capability_version::text then raise exception 'inquiry_reply_version_changed'; end if;
  elsif exists (select 1 from jsonb_array_elements(coalesce(v_state->'capabilities','[]'::jsonb)) c where c->>'status' = 'paused') then
    raise exception 'inquiry_reply_paused';
  end if;
  select status into v_overlay from public.inquiry_record_overlays
    where tenant_stable_id = v_lead.tenant_stable_id and inquiry_id = v_lead.lead_id
      and (v_lead.capability_id is null or capability_id = v_lead.capability_id) for share;
  if v_overlay in ('handled','blocked') then raise exception 'inquiry_reply_closed'; end if;
  if exists (select 1 from public.tenant_client_records where tenant_stable_id = v_lead.tenant_stable_id and store = 'inquiry_reply' and record_id = v_lead.lead_id
      and removed_at is null and payload->>'firstReplyAt' is not null) then raise exception 'inquiry_reply_already_sent'; end if;
  insert into public.inquiry_workspace_messages(workspace_id,lead_row_id,requested_by,request_id,digest,recipient,subject,body)
    values(p_workspace_id,p_lead_row_id,p_user_id,p_request_id,p_digest,lower(btrim(v_lead.email)),btrim(p_subject),btrim(p_body))
    on conflict do nothing returning id into v_inserted;
  select * into v_message from public.inquiry_workspace_messages where workspace_id = p_workspace_id and (request_id = p_request_id or (lead_row_id = p_lead_row_id and status <> 'suppressed'))
    order by (request_id = p_request_id) desc,created_at desc limit 1;
  if v_message.lead_row_id <> p_lead_row_id or v_message.digest <> p_digest or v_message.requested_by <> p_user_id then raise exception 'inquiry_reply_changed'; end if;
  if v_inserted is not null then
    insert into public.inquiry_workspace_message_events(message_id,workspace_id,actor_id,status) values(v_message.id,p_workspace_id,p_user_id,'sending');
  end if;
  end if;
  if v_message.lead_row_id <> p_lead_row_id or v_message.digest <> p_digest or v_message.requested_by <> p_user_id then raise exception 'inquiry_reply_changed'; end if;
  return jsonb_build_object('acquired',v_inserted is not null,'id',v_message.id,'status',v_message.status,
    'recipient',v_message.recipient,'subject',v_message.subject,'body',v_message.body,
    'tenantId',(select id from public.tenants where stable_id = v_lead.tenant_stable_id),
    'replyTo',public.resolve_business_owner_recipient(p_workspace_id)->>'email',
    'businessName',(select name from public.workspaces where id = p_workspace_id),
    'providerMessageId',v_message.provider_message_id,'acceptedAt',v_message.accepted_at);
end $$;

create function public.finish_workspace_inquiry_reply(p_message_id uuid,p_status text,p_provider_message_id text,p_accepted_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_message public.inquiry_workspace_messages;
begin
  if p_status is null or p_status not in ('suppressed','accepted','delivered','deferred','bounced','failed','unknown') then raise exception 'inquiry_record_invalid'; end if;
  select * into v_message from public.inquiry_workspace_messages where id = p_message_id for update;
  if not found then raise exception 'inquiry_not_found'; end if;
  if p_status in ('accepted','delivered','deferred','bounced') and (p_provider_message_id is null or p_accepted_at is null) then raise exception 'inquiry_record_invalid'; end if;
  if v_message.provider_message_id is not null and (v_message.provider_message_id is distinct from p_provider_message_id or v_message.accepted_at is distinct from p_accepted_at) then
    raise exception 'inquiry_reply_changed';
  end if;
  if v_message.status in ('suppressed','delivered','bounced','failed','unknown') then
    return jsonb_build_object('status',v_message.status,'providerMessageId',v_message.provider_message_id,'acceptedAt',v_message.accepted_at);
  end if;
  update public.inquiry_workspace_messages set status = p_status, provider_message_id = p_provider_message_id, accepted_at = p_accepted_at
    where id = p_message_id returning * into v_message;
  insert into public.inquiry_workspace_message_events(message_id,workspace_id,actor_id,status,provider_message_id)
    values(v_message.id,v_message.workspace_id,v_message.requested_by,p_status,p_provider_message_id);
  return jsonb_build_object('status',v_message.status,'providerMessageId',v_message.provider_message_id,'acceptedAt',v_message.accepted_at);
end $$;

-- Called only after provider signature verification. Correlation metadata is
-- insufficient alone: destination, subject and immutable provider id must agree.
-- Sending/unknown can be recovered from provider evidence without another send.
create function public.record_workspace_inquiry_provider_event(p_message_id uuid,p_workspace_id uuid,
  p_provider_message_id text,p_event_id text,p_status text,p_event_at timestamptz,p_accepted_at timestamptz,
  p_recipients text[],p_subject text) returns jsonb
language plpgsql security definer set search_path = public,pg_temp as $$
declare v_message public.inquiry_workspace_messages; v_accepted timestamptz; v_changed boolean;
begin
  if p_status is null or p_status not in ('accepted','delivered','deferred','bounced','failed')
    or nullif(btrim(p_provider_message_id),'') is null or char_length(p_provider_message_id)>240
    or nullif(btrim(p_event_id),'') is null or char_length(p_event_id)>240
    or p_event_at is null or p_event_at > clock_timestamp() + interval '5 minutes'
    or p_accepted_at > p_event_at then raise exception 'inquiry_record_invalid'; end if;
  select * into v_message from public.inquiry_workspace_messages where id=p_message_id and workspace_id=p_workspace_id for update;
  if not found or v_message.status='suppressed' or v_message.subject is distinct from p_subject
    or not exists(select 1 from unnest(p_recipients) email where lower(btrim(email))=v_message.recipient)
    or (v_message.provider_message_id is not null and v_message.provider_message_id<>p_provider_message_id)
    then return jsonb_build_object('status','unmatched'); end if;
  v_accepted := coalesce(v_message.accepted_at,p_accepted_at);
  if v_accepted is null or v_accepted<v_message.created_at-interval '5 minutes' or v_accepted>p_event_at then return jsonb_build_object('status','unmatched'); end if;
  if exists(select 1 from public.inquiry_workspace_message_events where provider_event_id=p_event_id) then
    return jsonb_build_object('status','duplicate'); end if;
  -- Record old events as evidence but never let them reverse a newer outcome.
  v_changed := (v_message.provider_event_at is null or p_event_at>v_message.provider_event_at)
    and (v_message.status not in ('bounced','failed') or p_status=v_message.status)
    and (p_status<>'accepted' or v_message.status in ('sending','unknown','accepted'))
    and (p_status<>'deferred' or v_message.status<>'delivered');
  insert into public.inquiry_workspace_message_events(message_id,workspace_id,actor_id,status,provider_message_id,provider_event_id,at)
    values(v_message.id,v_message.workspace_id,v_message.requested_by,p_status,p_provider_message_id,p_event_id,p_event_at);
  if v_changed then
    update public.inquiry_workspace_messages set status=p_status,provider_message_id=p_provider_message_id,
      accepted_at=v_accepted,provider_event_at=p_event_at where id=v_message.id;
  end if;
  return jsonb_build_object('status','recorded');
end $$;
revoke all on function public.record_workspace_inquiry_provider_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text) from public,anon,authenticated;
grant execute on function public.record_workspace_inquiry_provider_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text) to service_role;
revoke all on function public.claim_workspace_inquiry_reply(uuid,uuid,text,uuid,uuid,text,text,text),
  public.finish_workspace_inquiry_reply(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_workspace_inquiry_reply(uuid,uuid,text,uuid,uuid,text,text,text),
  public.finish_workspace_inquiry_reply(uuid,text,text,timestamptz) to service_role;
comment on table public.inquiry_workspaces is 'Configuration and immutable releases; tenant_leads is the durable inquiry record after the flagged Redis cutover.';

create function public.read_workspace_inquiry_reply_receipts(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
begin
  perform public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email);
  return coalesce((select jsonb_agg(jsonb_build_object('rowId',m.lead_row_id,'status',m.status,'providerMessageId',m.provider_message_id,'acceptedAt',m.accepted_at) order by m.created_at desc)
    from public.inquiry_workspace_messages m where m.workspace_id = p_workspace_id),'[]'::jsonb);
end $$;
revoke all on function public.read_workspace_inquiry_reply_receipts(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_workspace_inquiry_reply_receipts(uuid,uuid,text) to service_role;

create function public.read_workspace_inquiry_leads_with_receipts(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_states text[],p_limit integer,p_before timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_rows jsonb;
begin
  v_rows := public.read_workspace_leads(p_workspace_id,p_user_id,p_verified_email,p_states,p_limit,p_before);
  return coalesce((select jsonb_agg(item || jsonb_build_object('reply',(
    select jsonb_build_object('status',m.status,'providerMessageId',m.provider_message_id,'acceptedAt',m.accepted_at)
      from public.inquiry_workspace_messages m where m.lead_row_id=(item->>'id')::uuid order by m.created_at desc limit 1)))
    from jsonb_array_elements(v_rows) item),'[]'::jsonb);
end $$;
revoke all on function public.read_workspace_inquiry_leads_with_receipts(uuid,uuid,text,text[],integer,timestamptz) from public,anon,authenticated;
grant execute on function public.read_workspace_inquiry_leads_with_receipts(uuid,uuid,text,text[],integer,timestamptz) to service_role;
commit;
