-- Signed provider reports reconcile urgent owner decision mail independently
-- of send retries. Existing flags select only the new exact-subject claim RPC.
set local lock_timeout = '3s';
alter table public.inquiry_decision_notice_claims add column subject text, add column provider_event_at timestamptz;
alter table public.inquiry_decision_notice_claims drop constraint inquiry_decision_notice_claims_status_check;
alter table public.inquiry_decision_notice_claims add constraint inquiry_decision_notice_claims_status_check
  check(status in ('sending','accepted','delivered','deferred','bounced','failed','suppressed','unknown')) not valid;
alter table public.inquiry_decision_notice_claims validate constraint inquiry_decision_notice_claims_status_check;
create table public.inquiry_decision_notice_events (
  provider_event_id text primary key,
  decision_id uuid not null references public.inquiry_decision_notice_claims(decision_id),
  status text not null,
  provider_message_id text not null,
  event_at timestamptz not null
);
alter table public.inquiry_decision_notice_events enable row level security;
revoke all on public.inquiry_decision_notice_events from public,anon,authenticated,service_role;
create trigger inquiry_decision_notice_events_immutable before update or delete on public.inquiry_decision_notice_events
  for each row execute function public.needs_you_history_immutable();

create function public.claim_inquiry_decision_notice_v2(p_workspace_id uuid,p_decision_id uuid,p_revision text,p_recipient text,p_subject text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_claim jsonb;
begin
  if nullif(btrim(p_subject),'') is null or char_length(p_subject)>200 or p_subject ~ '[\r\n]' then raise exception 'owner_decision_invalid'; end if;
  v_claim := public.claim_inquiry_decision_notice(p_workspace_id,p_decision_id,p_revision,p_recipient);
  if (v_claim->>'acquired')::boolean then update public.inquiry_decision_notice_claims set subject=p_subject where decision_id=p_decision_id; end if;
  return v_claim;
end $$;

create function public.record_inquiry_decision_notice_event(p_decision_id uuid,p_workspace_id uuid,p_provider_message_id text,p_event_id text,p_status text,p_event_at timestamptz,p_accepted_at timestamptz,p_recipients text[],p_subject text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_claim public.inquiry_decision_notice_claims; v_accepted timestamptz; v_changed boolean;
begin
  if p_status is null or p_status not in ('accepted','delivered','deferred','bounced','failed','suppressed')
    or nullif(btrim(p_provider_message_id),'') is null or char_length(p_provider_message_id)>240
    or nullif(btrim(p_event_id),'') is null or char_length(p_event_id)>240
    or p_event_at is null or p_event_at>clock_timestamp()+interval '5 minutes' or p_accepted_at>p_event_at then raise exception 'owner_decision_invalid'; end if;
  select * into v_claim from public.inquiry_decision_notice_claims where decision_id=p_decision_id and workspace_id=p_workspace_id for update;
  if not found or v_claim.subject is null or v_claim.subject is distinct from p_subject
    or (v_claim.status='suppressed' and v_claim.provider_message_id is null)
    or not exists(select 1 from unnest(p_recipients) recipient where lower(btrim(recipient))=v_claim.recipient)
    or (v_claim.provider_message_id is not null and v_claim.provider_message_id<>p_provider_message_id)
    then return jsonb_build_object('status','unmatched'); end if;
  v_accepted := coalesce(v_claim.accepted_at,p_accepted_at);
  if v_accepted is null or v_accepted<v_claim.created_at-interval '5 minutes' or v_accepted>p_event_at then return jsonb_build_object('status','unmatched'); end if;
  if exists(select 1 from public.inquiry_decision_notice_events where provider_event_id=p_event_id) then return jsonb_build_object('status','duplicate'); end if;
  insert into public.inquiry_decision_notice_events(provider_event_id,decision_id,status,provider_message_id,event_at) values(p_event_id,p_decision_id,p_status,p_provider_message_id,p_event_at);
  v_changed := (v_claim.provider_event_at is null or p_event_at>v_claim.provider_event_at)
    and (v_claim.status not in ('bounced','failed','suppressed') or p_status=v_claim.status)
    and (p_status<>'accepted' or v_claim.status in ('sending','unknown','accepted'))
    and (p_status<>'deferred' or v_claim.status<>'delivered');
  if v_changed then
    update public.inquiry_decision_notice_claims set status=p_status,provider_message_id=p_provider_message_id,accepted_at=v_accepted,provider_event_at=p_event_at where decision_id=p_decision_id;
    perform public.record_owner_decision_delivery(p_workspace_id,p_decision_id,'urgent',
      case when p_status in ('accepted','delivered','deferred') then 'sent' when p_status in ('bounced','suppressed') then p_status else 'failed' end,
      v_claim.recipient,p_provider_message_id,'provider_'||p_status);
  end if;
  return jsonb_build_object('status','recorded');
end $$;
revoke all on function public.claim_inquiry_decision_notice_v2(uuid,uuid,text,text,text),public.record_inquiry_decision_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text) from public,anon,authenticated;
grant execute on function public.claim_inquiry_decision_notice_v2(uuid,uuid,text,text,text),public.record_inquiry_decision_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text) to service_role;
