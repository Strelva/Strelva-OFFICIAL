-- Immediate inquiry owner decisions and the chase share one durable send
-- purpose. New callers are behind the inquiry owner-notice/Needs you gates.
set local lock_timeout = '3s';
create table public.inquiry_decision_notice_claims (
  decision_id uuid primary key references public.owner_decisions(id),
  workspace_id uuid not null references public.workspaces(id),
  revision_hash text not null,
  recipient text not null,
  status text not null default 'sending' check(status in ('sending','accepted','suppressed','unknown')),
  provider_message_id text unique,
  accepted_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.inquiry_decision_notice_claims enable row level security;
revoke all on public.inquiry_decision_notice_claims from public,anon,authenticated,service_role;

create function public.claim_inquiry_decision_notice(p_workspace_id uuid,p_decision_id uuid,p_revision text,p_recipient text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.owner_decisions; v_claim public.inquiry_decision_notice_claims; v_inserted uuid; v_owner jsonb;
begin
  select * into v_item from public.owner_decisions where id=p_decision_id and workspace_id=p_workspace_id for update;
  if not found or v_item.source_lifecycle<>'tenant_event' or v_item.change_kind not in ('customer.message','customer.commitment')
    or v_item.route<>'owner_decides' or not v_item.urgent then raise exception 'owner_decision_invalid'; end if;
  select * into v_claim from public.inquiry_decision_notice_claims where decision_id=p_decision_id;
  if found then return jsonb_build_object('acquired',false,'status',v_claim.status); end if;
  if v_item.state<>'open' or v_item.revision_hash is distinct from p_revision or v_item.expires_at<=clock_timestamp()
    or v_item.delivery_state<>'not_sent' then raise exception 'owner_decision_not_open'; end if;
  v_owner := public.resolve_business_owner_recipient(p_workspace_id);
  if nullif(lower(btrim(p_recipient)),'') is null or lower(btrim(p_recipient)) is distinct from lower(v_owner->>'email') then
    raise exception 'owner_decision_recipient_not_owner'; end if;
  insert into public.inquiry_decision_notice_claims(decision_id,workspace_id,revision_hash,recipient)
    values(p_decision_id,p_workspace_id,p_revision,lower(btrim(p_recipient))) returning decision_id into v_inserted;
  -- A process that dies before the provider response leaves operator evidence,
  -- instead of an invisible sending purpose and a falsely unanswered owner.
  perform public.record_owner_decision_delivery(p_workspace_id,p_decision_id,'urgent','failed',p_recipient,null,'inquiry_send_result_pending');
  return jsonb_build_object('acquired',v_inserted is not null,'status','sending');
end $$;

create function public.finish_inquiry_decision_notice(p_workspace_id uuid,p_decision_id uuid,p_status text,p_provider_message_id text,p_accepted_at timestamptz,p_reason text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_claim public.inquiry_decision_notice_claims;
begin
  if p_status is null or p_status not in ('accepted','suppressed','unknown') or (p_status='accepted' and
    (nullif(btrim(p_provider_message_id),'') is null or p_accepted_at is null)) then raise exception 'owner_decision_invalid'; end if;
  select * into v_claim from public.inquiry_decision_notice_claims where decision_id=p_decision_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'owner_decision_not_found'; end if;
  if v_claim.status<>'sending' then return false; end if;
  update public.inquiry_decision_notice_claims set status=p_status,provider_message_id=p_provider_message_id,accepted_at=p_accepted_at where decision_id=p_decision_id;
  perform public.record_owner_decision_delivery(p_workspace_id,p_decision_id,'urgent',
    case p_status when 'accepted' then 'sent' when 'suppressed' then 'suppressed' else 'failed' end,
    v_claim.recipient,p_provider_message_id,coalesce(p_reason,case when p_status='unknown' then 'provider_acceptance_unknown' end));
  return true;
end $$;
revoke all on function public.claim_inquiry_decision_notice(uuid,uuid,text,text),public.finish_inquiry_decision_notice(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.claim_inquiry_decision_notice(uuid,uuid,text,text),public.finish_inquiry_decision_notice(uuid,uuid,text,text,timestamptz,text) to service_role;

-- The actor label passed by the tenant adapter grants nothing. Only the exact
-- owner-link decision already claimed by the signed confirmation boundary
-- authorizes its immutable event revision. The business owner remains the
-- approver even if the policy was prepared by a different sponsor.
create function public.authorize_inquiry_owner_link_decision(p_tenant_id text,p_event_id text,p_revision text,p_recipient text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.owner_decisions d join public.tenant_workspace_links l on l.workspace_id=d.workspace_id
      join public.tenants t on t.stable_id=l.tenant_stable_id
    where t.id=p_tenant_id and d.source_lifecycle='tenant_event' and d.source_id=p_tenant_id||':'||p_event_id
      and d.revision_hash=p_revision and d.state='approved' and d.route='owner_decides'
      and d.change_kind in ('customer.message','customer.commitment') and not d.sign_in_required
      and d.decided_by_kind='owner_link' and d.decided_by=lower(btrim(p_recipient))
      and lower(public.resolve_business_owner_recipient(d.workspace_id)->>'email')=lower(btrim(p_recipient))
  )
$$;
revoke all on function public.authorize_inquiry_owner_link_decision(text,text,text,text) from public,anon,authenticated;
grant execute on function public.authorize_inquiry_owner_link_decision(text,text,text,text) to service_role;
