-- Shared first-reply exclusion between owner-authored and governed replies.
-- New engine callers are gated by STRELVA_INQUIRY_REPLIES + INQUIRY_RECORDS.
set local lock_timeout = '3s';

create table public.inquiry_engine_reply_claims (
  lead_row_id uuid primary key references public.tenant_leads(id),
  attempt_id uuid not null,
  claimed_at timestamptz not null default clock_timestamp(),
  released_at timestamptz
);
alter table public.inquiry_engine_reply_claims enable row level security;
revoke all on public.inquiry_engine_reply_claims from public,anon,authenticated,service_role;

create function public.claim_engine_inquiry_reply(p_tenant_id text,p_lead_id text,p_attempt_id uuid) returns boolean
language plpgsql security definer set search_path = public,pg_temp as $$
declare v_lead public.tenant_leads;
begin
  if p_attempt_id is null then raise exception 'inquiry_record_invalid'; end if;
  select l.* into v_lead from public.tenant_leads l join public.tenants t on t.stable_id=l.tenant_stable_id
    where t.id=p_tenant_id and l.lead_id=p_lead_id;
  if not found then raise exception 'inquiry_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_lead.id::text || ':first-reply',9106));
  if v_lead.intake_state not in ('kept','released') or exists (
    select 1 from public.inquiry_workspace_messages where lead_row_id=v_lead.id and status<>'suppressed')
    or exists(select 1 from public.inquiry_engine_reply_claims where lead_row_id=v_lead.id and released_at is null)
    or exists(select 1 from public.tenant_client_records where tenant_stable_id=v_lead.tenant_stable_id
      and store='inquiry_reply' and record_id=v_lead.lead_id and removed_at is null and payload->>'firstReplyAt' is not null)
    then return false; end if;
  insert into public.inquiry_engine_reply_claims(lead_row_id,attempt_id) values(v_lead.id,p_attempt_id)
    on conflict(lead_row_id) do update set attempt_id=excluded.attempt_id,claimed_at=excluded.claimed_at,released_at=null;
  return true;
end $$;

create function public.release_rejected_engine_inquiry_reply(p_tenant_id text,p_lead_id text,p_attempt_id uuid) returns boolean
language plpgsql security definer set search_path = public,pg_temp as $$
declare v_id uuid;
begin
  select l.id into v_id from public.tenant_leads l join public.tenants t on t.stable_id=l.tenant_stable_id
    where t.id=p_tenant_id and l.lead_id=p_lead_id;
  if v_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text || ':first-reply',9106));
  update public.inquiry_engine_reply_claims set released_at=clock_timestamp()
    where lead_row_id=v_id and attempt_id=p_attempt_id and released_at is null;
  return found;
end $$;

create function public.guard_workspace_inquiry_reply_purpose() returns trigger
language plpgsql security definer set search_path = public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.lead_row_id::text || ':first-reply',9106));
  if exists(select 1 from public.inquiry_engine_reply_claims where lead_row_id=new.lead_row_id and released_at is null)
    then raise exception 'inquiry_reply_already_sent'; end if;
  return new;
end $$;
create trigger inquiry_workspace_reply_shared_purpose before insert on public.inquiry_workspace_messages
  for each row execute function public.guard_workspace_inquiry_reply_purpose();

revoke all on function public.guard_workspace_inquiry_reply_purpose() from public,anon,authenticated,service_role;
revoke all on function public.claim_engine_inquiry_reply(text,text,uuid),public.release_rejected_engine_inquiry_reply(text,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_engine_inquiry_reply(text,text,uuid),public.release_rejected_engine_inquiry_reply(text,text,uuid) to service_role;
