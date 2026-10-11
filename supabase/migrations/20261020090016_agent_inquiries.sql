-- Native agent intake shares tenant_leads, spam states, workspace reads and owner replies.
-- Prepared only: no release row or email gate is armed here.
alter table public.tenant_leads add column agent_workspace_id uuid references public.workspaces(id) on delete cascade,
  add column origin text check(origin is null or origin='agent'),
  add column agent_name text check(agent_name is null or char_length(agent_name) between 1 and 120),
  add column agent_request_id text check(agent_request_id is null or agent_request_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  add column agent_request_digest text check(agent_request_digest is null or agent_request_digest ~ '^[a-f0-9]{64}$'),
  add column agent_status_hash text unique check(agent_status_hash is null or agent_status_hash ~ '^[a-f0-9]{64}$'),
  add column agent_status_ciphertext text,
  add column agent_status_expires_at timestamptz,
  add column inquiry_type text not null default 'inquiry' check(inquiry_type in ('inquiry','quote')),
  add column quote_service_id uuid references public.business_services(id) on delete set null,
  add column reply_by timestamptz;
alter table public.tenant_leads drop constraint tenant_leads_one_origin;
alter table public.tenant_leads add constraint tenant_leads_one_origin check(num_nonnulls(tenant_stable_id,connected_site_id,agent_workspace_id)=1);
alter table public.tenant_leads drop constraint tenant_leads_recorded_via_check;
alter table public.tenant_leads add constraint tenant_leads_recorded_via_check check(recorded_via in ('dual_write','repair','backfill','connected_site','spam_hold','agent'));
create unique index agent_inquiry_request_idx on public.tenant_leads(workspace_id,agent_request_id) where origin='agent';
create index agent_inquiry_budget_idx on public.tenant_leads(workspace_id,captured_at) where origin='agent';
create table public.agent_quote_receipts (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 lead_id uuid not null references public.tenant_leads(id) on delete cascade, request_id uuid not null,
 owner_id uuid not null references public.users(id), amount_cents bigint not null check(amount_cents between 0 and 999999999),
 currency text not null check(currency ~ '^[A-Z]{3}$'), terms text not null check(char_length(btrim(terms)) between 1 and 5000),
 at timestamptz not null default clock_timestamp(), unique(workspace_id,request_id), unique(lead_id)
);
alter table public.agent_quote_receipts enable row level security;
revoke all on public.agent_quote_receipts from public,anon,authenticated,service_role;
create function public.agent_quote_receipt_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin if tg_op='DELETE' and (current_setting('strelva.purging_expired_tenant_leads',true)='on' or not exists(select 1 from public.workspaces where id=old.workspace_id)) then return old; end if;
 raise exception 'agent_quote_receipt_immutable'; end $$;
create trigger agent_quote_receipt_guard before update or delete on public.agent_quote_receipts for each row execute function public.agent_quote_receipt_guard();
create function public.receive_agent_inquiry(p_scope text,p_input jsonb,p_digest text,p_status_hash text,p_status_ciphertext text,p_spam_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx jsonb; w uuid; stable uuid; l public.tenant_leads; sid uuid; hours integer; t timestamptz:=clock_timestamp();
begin
 ctx:=public.read_tenant_booking_context(p_scope); w:=(ctx->>'workspaceId')::uuid;
 if w is null or public.workspace_exit_completed(w)
 or (p_scope like 'workspace:%' and not exists(select 1 from public.business_pages where workspace_id=w and published))
 or (p_scope not like 'workspace:%' and not exists(select 1 from public.tenants where id=p_scope and active))
 or exists(select 1 from public.systems where business_workspace_id=w and kind='inquiry' and lifecycle='paused') then raise exception 'inquiry_unavailable'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>16000
 or p_input->>'origin' is distinct from 'agent' or coalesce(p_input->>'requestId','') !~ '^[A-Za-z0-9_-]{8,80}$'
 or char_length(btrim(coalesce(p_input#>>'{agent,name}',''))) not between 1 and 120
 or char_length(btrim(coalesce(p_input#>>'{customer,name}',''))) not between 1 and 160
 or not coalesce(public.business_record_email_valid(p_input#>>'{customer,email}'),false)
 or char_length(btrim(coalesce(p_input->>'message',''))) not between 1 and 5000
 or coalesce(p_digest,'') !~ '^[a-f0-9]{64}$' or coalesce(p_status_hash,'') !~ '^[a-f0-9]{64}$' or char_length(coalesce(p_status_ciphertext,'')) not between 10 and 4000
 or coalesce(p_input->>'type','') not in ('inquiry','quote') then raise exception 'inquiry_record_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended('agent-inquiry:'||w::text,1611));
 select * into l from public.tenant_leads where workspace_id=w and agent_request_id=p_input->>'requestId' and origin='agent';
 if found then
  if l.agent_request_digest<>p_digest then raise exception 'agent_inquiry_request_conflict'; end if;
  return jsonb_build_object('inquiryId',l.id,'statusCiphertext',l.agent_status_ciphertext,'replyBy',l.reply_by,'expiresAt',l.agent_status_expires_at);
 end if;
 if (select count(*) from public.tenant_leads where workspace_id=w and origin='agent' and captured_at>t-interval '1 hour')>=40
 or (select count(*) from public.tenant_leads where workspace_id=w and origin='agent' and lower(agent_name)=lower(p_input#>>'{agent,name}') and captured_at>t-interval '1 hour')>=20
 or (select count(*) from public.tenant_leads where workspace_id=w and origin='agent' and public.booking_email_identity(email)=public.booking_email_identity(p_input#>>'{customer,email}') and captured_at>t-interval '1 hour')>=5 then raise exception 'agent_inquiry_limit'; end if;
 if p_input->>'type'='quote' then
  select id into sid from public.business_services where workspace_id=w and active and (id::text=p_input->>'serviceId' or external_ref=p_input->>'serviceId');
  if sid is null or char_length(btrim(coalesce(p_input#>>'{fields,scope}',''))) not between 1 and 2000 or char_length(btrim(coalesce(p_input#>>'{fields,area}',''))) not between 1 and 500 then raise exception 'inquiry_record_invalid'; end if;
  select (value->>'maximumHours')::integer into hours from public.business_record_facts where workspace_id=w and fact_key='response_time' and verified and source in ('owner','operator');
 end if;
 if p_scope not like 'workspace:%' then select stable_id into stable from public.tenants where id=p_scope; end if;
 insert into public.tenant_leads(tenant_stable_id,agent_workspace_id,tenant_slug_at_capture,workspace_id,lead_id,submission_hash,name,email,message,fields,source,captured_at,recorded_via,intake_state,held_reason,intake_state_at,
 origin,agent_name,agent_request_id,agent_request_digest,agent_status_hash,agent_status_ciphertext,agent_status_expires_at,inquiry_type,quote_service_id,reply_by)
 values(stable,case when stable is null then w end,p_scope,w,'lead_agent_'||replace(gen_random_uuid()::text,'-',''),substr(p_digest,1,16),p_input#>>'{customer,name}',lower(btrim(p_input#>>'{customer,email}')),p_input->>'message',coalesce(p_input->'fields','{}'::jsonb),null,t,'agent',case when p_spam_reason is null then 'kept' else 'held_as_spam' end,p_spam_reason,case when p_spam_reason is not null then t end,
 'agent',p_input#>>'{agent,name}',p_input->>'requestId',p_digest,p_status_hash,p_status_ciphertext,t+interval '30 days',p_input->>'type',sid,case when hours is not null then t+make_interval(hours=>hours) end) returning * into l;
 -- Same held state consumed by owner review. No notification or provider action here.
 return jsonb_build_object('inquiryId',l.id,'statusCiphertext',l.agent_status_ciphertext,'replyBy',l.reply_by,'expiresAt',l.agent_status_expires_at);
end $$;
create function public.read_agent_inquiry_status(p_scope text,p_status_hash text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('inquiryId',l.id,'status',case when q.id is not null then 'quoted' else 'received' end,'replyBy',l.reply_by,
 'quote',case when q.id is not null then jsonb_build_object('receiptId',q.id,'amountCents',q.amount_cents,'currency',q.currency,'terms',q.terms,'at',q.at) end)
 from public.tenant_leads l left join public.agent_quote_receipts q on q.lead_id=l.id
 where l.agent_status_hash=p_status_hash and l.agent_status_expires_at>clock_timestamp() and l.workspace_id=(public.read_tenant_booking_context(p_scope)->>'workspaceId')::uuid
$$;
create function public.record_agent_quote(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_lead_id uuid,p_request_id uuid,p_amount_cents bigint,p_currency text,p_terms text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.agent_quote_receipts; l public.tenant_leads;
begin
 if public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email)<>'owner' then raise exception 'inquiry_access_denied'; end if;
 select * into l from public.tenant_leads where id=p_lead_id and workspace_id=p_workspace_id and inquiry_type='quote' for share;
 if not found or l.intake_state not in ('kept','released') then raise exception 'inquiry_not_found'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'inquiry_unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('agent-quote:'||p_lead_id::text,1611));
 select * into q from public.agent_quote_receipts where lead_id=p_lead_id or (workspace_id=p_workspace_id and request_id=p_request_id);
 if found then
 if q.lead_id<>p_lead_id or q.request_id<>p_request_id or q.owner_id<>p_user_id or q.amount_cents<>p_amount_cents or q.currency<>p_currency or q.terms<>p_terms then raise exception 'agent_quote_conflict'; end if;
 else insert into public.agent_quote_receipts(workspace_id,lead_id,request_id,owner_id,amount_cents,currency,terms) values(p_workspace_id,p_lead_id,p_request_id,p_user_id,p_amount_cents,p_currency,p_terms) returning * into q; end if;
 return jsonb_build_object('receiptId',q.id,'amountCents',q.amount_cents,'currency',q.currency,'terms',q.terms,'at',q.at);
end $$;
revoke all on function public.agent_quote_receipt_guard(),public.receive_agent_inquiry(text,jsonb,text,text,text,text),public.read_agent_inquiry_status(text,text),public.record_agent_quote(uuid,uuid,text,uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.receive_agent_inquiry(text,jsonb,text,text,text,text),public.read_agent_inquiry_status(text,text),public.record_agent_quote(uuid,uuid,text,uuid,uuid,bigint,text,text) to service_role;
