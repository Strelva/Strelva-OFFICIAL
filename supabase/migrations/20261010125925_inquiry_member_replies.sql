-- Assigned/routed members may answer ordinary messages; commitments remain
-- the owner's decision. New callers stay behind the existing reply switch.
begin;
set local lock_timeout = '3s';
create function public.inquiry_reply_text_has_commitment(p_text text) returns boolean
language sql immutable set search_path=public,pg_temp as $$
  select coalesce(p_text ~* '[$€£][[:space:]]*[0-9]|[0-9].*(dollars|usd|bucks)|(price|pricing|cost|rate|fee|quote|deposit|discount).{0,40}[0-9]|(per|each)[[:space:]]+(head|person|guest|hour|night|plate)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|[0-9]{1,2}/[0-9]{1,2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}(:[0-9]{2})?[[:space:]]*(am|pm|a[.]m[.]|p[.]m[.])|tomorrow|tonight|next week|this weekend|next weekend|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[[:space:]]+[0-9]|(is|are)[[:space:]]+(yours|available for you)|guarantee|promise|confirmed|booked|reserved|we(''ll| will| can)[[:space:]]+(hold|reserve|book|fit you in|have it ready|deliver|do it for|match|waive|include)',true)
$$;
create function public.workspace_inquiry_reply_permission(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_lead_row_id uuid) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_role text; v_lead public.tenant_leads; v_state jsonb; v_cap jsonb; v_assignee jsonb; v_overlay text; v_status text; v_record_status text; v_destination text; v_business text;
begin
  v_role := public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email);
  select * into v_lead from public.tenant_leads where id=p_lead_row_id and workspace_id=p_workspace_id;
  if not found or v_lead.intake_state not in ('kept','released') then return 'none'; end if;
  if v_lead.tenant_stable_id is not null and not exists(select 1 from public.memberships where user_id=p_user_id and tenant_stable_id=v_lead.tenant_stable_id) then return 'none'; end if;
  if v_role='owner' then return 'owner'; end if;
  select state,business_id into v_state,v_business from public.inquiry_workspaces w where tenant_stable_id=v_lead.tenant_stable_id
    and (v_lead.capability_id is null or exists(select 1 from jsonb_array_elements(coalesce(w.state->'capabilities','[]'::jsonb)) c where c->>'id'=v_lead.capability_id));
  select o.assignee_id,o.status into v_overlay,v_status from public.inquiry_record_overlays o where o.tenant_stable_id=v_lead.tenant_stable_id and o.inquiry_id=v_lead.lead_id and o.business_id=v_business
    and (v_lead.capability_id is null or o.capability_id=v_lead.capability_id) order by o.updated_at desc limit 1;
  select i->'after' into v_assignee from jsonb_array_elements(coalesce(v_state->'changes','[]'::jsonb)) with ordinality c(change,position)
    cross join lateral jsonb_array_elements(coalesce(c.change->'items','[]'::jsonb)) i
    where c.change->>'status'='published' and i->>'path'='inquiries.'||v_lead.lead_id||'.assigneeId' order by c.position limit 1;
  if found then v_overlay := v_assignee #>> '{}'; end if;
  select i->>'after' into v_record_status from jsonb_array_elements(coalesce(v_state->'changes','[]'::jsonb)) with ordinality c(change,position)
    cross join lateral jsonb_array_elements(coalesce(c.change->'items','[]'::jsonb)) i
    where c.change->>'status'='published' and i->>'path'='inquiries.'||v_lead.lead_id||'.status' order by c.position limit 1;
  if coalesce(v_record_status,v_status) in ('handled','blocked') then return 'none'; end if;
  if v_overlay=p_user_id::text then return 'member'; end if;
  select c into v_cap from jsonb_array_elements(coalesce(v_state->'capabilities','[]'::jsonb)) c where c->>'id'=v_lead.capability_id;
  v_destination := regexp_replace(lower(btrim(v_cap->'live'->'routing'->>'destination')),'^person:','');
  if exists(select 1 from public.business_people p where p.workspace_id=p_workspace_id and p.active
    and lower(p.email)=lower(btrim(p_verified_email)) and (p.id::text=v_destination or lower(p.email)=v_destination or lower(p.name)=v_destination)) then return 'member'; end if;
  return 'none';
end $$;
revoke all on function public.inquiry_reply_text_has_commitment(text),public.workspace_inquiry_reply_permission(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.claim_workspace_inquiry_reply_v2(p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_lead_row_id uuid, p_request_id uuid, p_digest text, p_subject text, p_body text, p_is_commitment boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lead public.tenant_leads; v_message public.inquiry_workspace_messages; v_inserted uuid; v_state jsonb; v_cap jsonb; v_overlay text; v_role text; v_effective_status text;
begin
  v_role := public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email);
  if p_request_id is null or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
    or p_subject is null or char_length(btrim(p_subject)) not between 1 and 200 or p_subject ~ '[\r\n]'
    or p_body is null or char_length(btrim(p_body)) not between 1 and 5000 then raise exception 'inquiry_record_invalid'; end if;
  select * into v_lead from public.tenant_leads where id = p_lead_row_id and workspace_id = p_workspace_id for share;
  if not found then raise exception 'inquiry_not_found'; end if;
  if v_lead.tenant_stable_id is not null then
    perform 1 from public.memberships where user_id=p_user_id and tenant_stable_id=v_lead.tenant_stable_id for share;
    if not found then raise exception 'inquiry_access_denied'; end if;
  end if;
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
  -- Pin the current overlay before evaluating delegated authority; assignment
  -- revocation takes the same row lock. Published assignments share the
  -- capability-state lock above.
  perform 1 from public.inquiry_record_overlays o where o.tenant_stable_id=v_lead.tenant_stable_id and o.inquiry_id=v_lead.lead_id
    and o.business_id=(select business_id from public.inquiry_workspaces where tenant_stable_id=v_lead.tenant_stable_id)
    and (v_lead.capability_id is null or o.capability_id=v_lead.capability_id) for share;
  if v_role <> 'owner' then
    perform 1 from public.business_people where workspace_id=p_workspace_id and lower(email)=lower(btrim(p_verified_email)) for share;
    if coalesce(p_is_commitment,true) or public.inquiry_reply_text_has_commitment(p_subject||E'\n'||p_body) then raise exception 'inquiry_reply_commitment_owner_only'; end if;
    if public.workspace_inquiry_reply_permission(p_workspace_id,p_user_id,p_verified_email,p_lead_row_id)<>'member' then raise exception 'inquiry_access_denied'; end if;
  end if;
  -- Newer published status receipts override the old overlay too.
  select i->>'after' into v_effective_status from jsonb_array_elements(coalesce(v_state->'changes','[]'::jsonb)) with ordinality c(change,position)
    cross join lateral jsonb_array_elements(coalesce(c.change->'items','[]'::jsonb)) i
    where c.change->>'status'='published' and i->>'path'='inquiries.'||v_lead.lead_id||'.status' order by c.position limit 1;
  if v_effective_status in ('handled','blocked') then raise exception 'inquiry_reply_closed'; end if;
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
  return jsonb_build_object('isOwner',v_role='owner','acquired',v_inserted is not null,'id',v_message.id,'status',v_message.status,
    'recipient',v_message.recipient,'subject',v_message.subject,'body',v_message.body,
    'tenantId',(select id from public.tenants where stable_id = v_lead.tenant_stable_id),
    'replyTo',public.resolve_business_owner_recipient(p_workspace_id)->>'email',
    'businessName',(select name from public.workspaces where id = p_workspace_id),
    'providerMessageId',v_message.provider_message_id,'acceptedAt',v_message.accepted_at);
end $$;

revoke all on function public.claim_workspace_inquiry_reply_v2(uuid,uuid,text,uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_workspace_inquiry_reply_v2(uuid,uuid,text,uuid,uuid,text,text,text,boolean) to service_role;

create or replace function public.read_workspace_inquiry_leads_with_receipts(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_states text[],p_limit integer,p_before timestamptz) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
  v_rows := public.read_workspace_leads(p_workspace_id,p_user_id,p_verified_email,p_states,p_limit,p_before);
  return coalesce((select jsonb_agg(item || jsonb_build_object(
    'replyPermission',public.workspace_inquiry_reply_permission(p_workspace_id,p_user_id,p_verified_email,(item->>'id')::uuid),
    'reply',(select jsonb_build_object('status',m.status,'providerMessageId',m.provider_message_id,'acceptedAt',m.accepted_at)
      from public.inquiry_workspace_messages m where m.lead_row_id=(item->>'id')::uuid order by m.created_at desc limit 1)))
    from jsonb_array_elements(v_rows) item),'[]'::jsonb);
end $$;
create or replace function public.read_workspace_inquiry_inbox_page(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_states text[],p_limit integer,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_states text[] := coalesce(p_states,array['kept','released']);
begin
  perform public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email);
  if not(v_states <@ array['kept','released','held_as_spam','confirmed_spam']) then raise exception 'inquiry_record_invalid'; end if;
  return coalesce((select jsonb_agg(public.inquiry_lead_json(l) || jsonb_build_object(
    'capturedAt',to_char(l.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'replyPermission',public.workspace_inquiry_reply_permission(p_workspace_id,p_user_id,p_verified_email,l.id),
    'reply',(select jsonb_build_object('status',m.status,'providerMessageId',m.provider_message_id,'acceptedAt',m.accepted_at)
      from public.inquiry_workspace_messages m where m.lead_row_id=l.id order by m.created_at desc limit 1)) order by l.captured_at desc,l.id desc)
    from (select * from public.tenant_leads lead where workspace_id=p_workspace_id and intake_state=any(v_states)
      and (tenant_stable_id is null or exists(select 1 from public.memberships membership where membership.user_id=p_user_id and membership.tenant_stable_id=lead.tenant_stable_id))
      and (p_before is null or captured_at<p_before or (captured_at=p_before and p_before_id is not null and id<p_before_id))
      order by captured_at desc,id desc limit least(greatest(coalesce(p_limit,100),1),500)) l),'[]'::jsonb);
end $$;
commit;
