-- Approval snapshots remain immutable. Delivery claims and append-only batch
-- receipts live separately. Sending/unknown claims NEVER expire into a resend.
begin;
set local lock_timeout = '2s';
create table public.workspace_newsletter_deliveries (
  issue_id uuid primary key references public.workspace_newsletter_issues(id),
  created_at timestamptz not null default clock_timestamp()
);
create table public.workspace_newsletter_batches (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.workspace_newsletter_deliveries(issue_id),
  batch_number integer not null check(batch_number >= 0),
  recipients jsonb not null check(jsonb_typeof(recipients)='array' and jsonb_array_length(recipients)<=100),
  send_recipients jsonb,
  state text not null default 'pending' check(state in ('pending','claimed','sending','accepted','gated','suppressed','unknown')),
  claim_token uuid, claim_until timestamptz, next_attempt_at timestamptz,
  unique(issue_id,batch_number)
);
create table public.workspace_newsletter_batch_receipts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.workspace_newsletter_batches(id),
  claim_token uuid not null,
  status text not null check(status in ('accepted','gated','suppressed','unknown')),
  detail text not null,
  accepted_count integer not null check(accepted_count between 0 and 100),
  suppressed_count integer not null check(suppressed_count between 0 and 100),
  provider_message_ids jsonb not null default '[]',
  created_at timestamptz not null default clock_timestamp(),
  unique(batch_id,claim_token)
);
create trigger newsletter_batch_receipt_immutable before update or delete on public.workspace_newsletter_batch_receipts
  for each row execute function public.workspace_newsletter_issue_immutable();
alter table public.workspace_newsletter_deliveries enable row level security;
alter table public.workspace_newsletter_batches enable row level security;
alter table public.workspace_newsletter_batch_receipts enable row level security;
revoke all on public.workspace_newsletter_deliveries,public.workspace_newsletter_batches,public.workspace_newsletter_batch_receipts from public,anon,authenticated;

create function public.workspace_newsletter_sender(p_action text,p_id uuid default null,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.workspace_newsletter_issues%rowtype; b public.workspace_newsletter_batches%rowtype; r jsonb; v_status text;
begin
  if p_action='list' then
    return coalesce((select jsonb_agg(id) from (select n.id from public.workspace_newsletter_issues n
      where not public.workspace_exit_completed(n.workspace_id)
      and not exists(select 1 from public.systems s where s.id=n.system_id and s.lifecycle='paused')
      and (not exists(select 1 from public.workspace_newsletter_deliveries d where d.issue_id=n.id)
        or exists(select 1 from public.workspace_newsletter_batches x where x.issue_id=n.id
          and (x.state='pending' or x.state='gated' and x.next_attempt_at<=clock_timestamp() or x.state='claimed' and x.claim_until<=clock_timestamp())))
      order by n.approved_at,n.id limit 20) q),'[]');
  elsif p_action='claim' then
    select * into i from public.workspace_newsletter_issues where id=p_id for update;
    if not found then return null; end if;
    perform public.publishing_require_tenant(i.workspace_id,i.tenant_id);
    if public.workspace_exit_completed(i.workspace_id) or exists(select 1 from public.systems where id=i.system_id and lifecycle='paused') then return null; end if;
    if not exists(select 1 from public.workspace_newsletter_deliveries where issue_id=i.id) then
      insert into public.workspace_newsletter_deliveries(issue_id) values(i.id);
      -- Membership is snapshotted once. New subscribers never reshuffle batches
      -- or cause previously accepted recipients to be mailed again.
      insert into public.workspace_newsletter_batches(issue_id,batch_number,recipients)
      select i.id, (ordinal/100)::integer, jsonb_agg(email order by email) from
        (select email,row_number() over(order by email)-1 ordinal from
          (select distinct on(lower(email)) email from public.newsletter_subscribers where tenant_id=i.tenant_id and status='active' and email=trim(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' order by lower(email),email) a) q
        group by ordinal/100;
      if not found then insert into public.workspace_newsletter_batches(issue_id,batch_number,recipients) values(i.id,0,'[]'); end if;
    end if;
    select * into b from public.workspace_newsletter_batches where issue_id=i.id
      and (state='pending' or state='gated' and next_attempt_at<=clock_timestamp() or state='claimed' and claim_until<=clock_timestamp())
      order by batch_number limit 1 for update skip locked;
    if not found then return null; end if;
    update public.workspace_newsletter_batches set state='claimed',claim_token=gen_random_uuid(),claim_until=clock_timestamp()+interval '10 minutes'
      where id=b.id returning * into b;
    return jsonb_build_object('id',b.id,'issueId',i.id,'workspaceId',i.workspace_id,'tenantId',i.tenant_id,'subject',i.subject,'body',i.body,
      'claimToken',b.claim_token,'recipients',b.recipients);
  end if;
  select * into b from public.workspace_newsletter_batches where id=p_id for update;
  if not found or b.claim_token is distinct from (p_input->>'claimToken')::uuid then raise exception 'newsletter_claim_conflict'; end if;
  select * into i from public.workspace_newsletter_issues where id=b.issue_id;
  if p_action='begin' then
    if b.state<>'claimed' or b.claim_until<=clock_timestamp() then return null; end if;
    perform public.publishing_require_tenant(i.workspace_id,i.tenant_id);
    if public.workspace_exit_completed(i.workspace_id) or exists(select 1 from public.systems where id=i.system_id and lifecycle='paused') then return null; end if;
    -- Read current opt-out/suppression status immediately before the send marker.
    select coalesce(jsonb_agg(e order by e),'[]') into r from jsonb_array_elements_text(b.recipients) e
      where exists(select 1 from public.newsletter_subscribers s where s.tenant_id=i.tenant_id and s.email=e and s.status='active');
    update public.workspace_newsletter_batches set state='sending',send_recipients=r where id=b.id;
    return r;
  elsif p_action='finish' then
    -- A receipt write can be retried even after the batch is terminal.
    select to_jsonb(x) into r from public.workspace_newsletter_batch_receipts x where batch_id=b.id and claim_token=b.claim_token;
    if found then return r; end if;
    v_status := p_input->>'status';
    if v_status is null or v_status not in ('accepted','gated','suppressed','unknown') or b.state not in ('claimed','sending') then raise exception 'newsletter_receipt_invalid'; end if;
    if v_status='accepted' and (b.state<>'sending' or jsonb_array_length(coalesce(p_input->'providerMessageIds','[]'))<>jsonb_array_length(b.send_recipients)) then raise exception 'newsletter_acceptance_unconfirmed'; end if;
    insert into public.workspace_newsletter_batch_receipts(batch_id,claim_token,status,detail,accepted_count,suppressed_count,provider_message_ids)
      values(b.id,b.claim_token,v_status,left(coalesce(p_input->>'detail',v_status),240),
        case when v_status='accepted' then jsonb_array_length(b.send_recipients) else 0 end,
        case when v_status='accepted' then jsonb_array_length(b.recipients)-jsonb_array_length(b.send_recipients) when v_status='unknown' then jsonb_array_length(b.recipients)-coalesce(jsonb_array_length(b.send_recipients),0) else jsonb_array_length(b.recipients) end,
        coalesce(p_input->'providerMessageIds','[]')) returning to_jsonb(workspace_newsletter_batch_receipts.*) into r;
    update public.workspace_newsletter_batches set state=v_status,next_attempt_at=case when v_status='gated' then clock_timestamp()+interval '1 hour' else null end where id=b.id;
    return r;
  end if;
  raise exception 'newsletter_sender_action_invalid';
end; $$;
-- Read projection exposes delivery independently of the immutable approval.
create or replace function public.read_workspace_newsletter_issues(p_workspace_id uuid,p_tenant_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.publishing_require_tenant(p_workspace_id,p_tenant_id);
  return coalesce((select jsonb_agg(to_jsonb(n)||jsonb_build_object('delivery',
    case when exists(select 1 from public.workspace_newsletter_deliveries d where d.issue_id=n.id) then
      (select jsonb_build_object('state',case
        when bool_or(b.state in ('sending','unknown')) then 'send_unconfirmed'
        when bool_or(b.state in ('pending','claimed')) then 'sending_pending'
        when bool_or(b.state='gated') then 'not_sent_gated'
        when bool_or(b.state='accepted') then 'accepted' else 'not_sent_suppressed' end,
        'accepted',coalesce(sum(case when b.state='accepted' then jsonb_array_length(b.send_recipients) else 0 end),0),
        'suppressed',coalesce(sum(case when b.state='accepted' then jsonb_array_length(b.recipients)-jsonb_array_length(b.send_recipients)
          when b.state in ('gated','suppressed') then jsonb_array_length(b.recipients) else 0 end),0),
        'unconfirmedBatches',count(*) filter(where b.state in ('sending','unknown')),
        'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'detail',r.detail,
          'accepted',r.accepted_count,'suppressed',r.suppressed_count,'createdAt',r.created_at) order by r.created_at)
          from public.workspace_newsletter_batch_receipts r join public.workspace_newsletter_batches x on x.id=r.batch_id where x.issue_id=n.id),'[]'::jsonb))
       from public.workspace_newsletter_batches b where b.issue_id=n.id) else null end) order by n.approved_at desc)
    from (select * from public.workspace_newsletter_issues where workspace_id=p_workspace_id and tenant_id=p_tenant_id order by approved_at desc limit 100) n),'[]'::jsonb);
end; $$;
revoke all on function public.workspace_newsletter_sender(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.workspace_newsletter_sender(text,uuid,jsonb) to service_role;
commit;
