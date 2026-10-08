-- #547 review (#301 #310): the public MCP opens agent holds to anonymous
-- callers, so they are anonymous requests too.
-- 1. Agent holds join #529's business budget, one-email rule and email-only
--    confirmation with website and inquiry requests. Origin 'agent' stays as
--    attribution (#532).
-- 2. The agent cap counts only live holds: expired or cancelled holds no
--    longer block the next legitimate request for an hour.
-- 3. Email caps count the mailbox an address reaches (plus tags; Gmail dots),
--    never the stored or delivery address.
-- 4. A public listing of published /biz pages for the platform MCP directory.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- Same rule as emailCapIdentity in src/platform/agent-channel/limits.ts.
create function public.booking_email_identity(p_email text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare v_email text := lower(btrim(p_email)); v_local text; v_domain text;
begin
 if v_email is null or v_email !~ '^.+@' then return v_email; end if;
 v_local := regexp_replace(substring(v_email from '^(.*)@[^@]*$'), '\+.*$', '');
 v_domain := substring(v_email from '@([^@]*)$');
 if v_domain in ('gmail.com','googlemail.com') then v_local := replace(v_local, '.', ''); v_domain := 'gmail.com'; end if;
 return v_local || '@' || v_domain;
end $$;

create or replace function public.check_public_booking_budget(p_business uuid,p_email text,p_start timestamptz,p_end timestamptz,p_fingerprint text,p_booking_id uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_email text:=public.booking_email_identity(p_email);
begin
 if p_business is null or coalesce(v_email,'')='' then raise exception 'booking_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business::text,529));
 -- Release expired anonymous holds before an exclusion check, without
 -- depending on the cron. Preserve their receipt/history; never reopen one.
 with expired as (
   update public.business_bookings set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp()
   where workspace_id=p_business and origin in ('site','inquiry','agent') and status='held'
     and created_at<=clock_timestamp()-interval '15 minutes' and id is distinct from p_booking_id returning id,origin
 ) insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
   select id,'system','held','cancelled',case when origin='agent' then 'Hold expired: the customer did not confirm in 15 minutes'
     else 'Public hold expired without email confirmation' end from expired;
 select count(*) into v_count from (
   select customer_email,start_at,end_at from public.public_booking_requests
   where workspace_id=p_business and state in ('held','confirming') and expires_at>clock_timestamp()
     and fingerprint is distinct from p_fingerprint
   union all
   select customer_email,start_at,block_end_at from public.business_bookings
   where workspace_id=p_business and origin in ('site','inquiry','agent') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint
 ) pending;
 if v_count>=20 then raise exception 'booking_public_limit_business'; end if;
 if exists(select 1 from public.public_booking_requests where workspace_id=p_business and state in ('held','confirming')
     and expires_at>clock_timestamp() and fingerprint is distinct from p_fingerprint and public.booking_email_identity(customer_email)=v_email)
   or exists(select 1 from public.business_bookings where workspace_id=p_business and origin in ('site','inquiry','agent') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint and public.booking_email_identity(customer_email)=v_email)
 then raise exception 'booking_public_limit_email'; end if;
 if exists(select 1 from public.public_booking_requests where workspace_id=p_business and state in ('held','confirming')
     and expires_at>clock_timestamp() and fingerprint is distinct from p_fingerprint and start_at<p_end and end_at>p_start)
   or exists(select 1 from public.business_bookings where workspace_id=p_business and origin in ('site','inquiry','agent') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint and start_at<p_end and block_end_at>p_start)
 then raise exception 'booking_slot_taken'; end if;
end $$;

create or replace function public.guard_public_booking_budget() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_admission public.public_booking_requests;
begin
 -- Every native inquiry handoff and agent request starts as an expiring hold.
 -- Only the customer's email confirmation (business_booking_access) places it.
 if new.origin in ('inquiry','agent') and new.recorded_via='native' then
   if tg_op='INSERT' and new.status in ('requested','confirmed') then new.status:='held'; end if;
   if tg_op='UPDATE' and old.status='held' and new.status in ('requested','confirmed')
     and not exists(select 1 from public.business_booking_access where booking_id=new.id and confirmed_at is not null)
   then raise exception 'booking_email_confirmation_required'; end if;
 end if;
 if new.public_reservation_id is not null then
   select r.* into v_admission from public.public_booking_requests r join public.public_website_bookings b
     on b.tenant_stable_id=r.tenant_stable_id and b.calendar_request_id=r.request_id where b.id=new.public_reservation_id;
   if found and v_admission.state='held' then
     new.status:=case when v_admission.expires_at<=clock_timestamp() then 'cancelled' else 'held' end;
     new.created_at:=v_admission.created_at;
   end if;
 end if;
 if new.origin not in ('site','inquiry','agent') or new.recorded_via<>'native' or new.status not in ('held','requested') then return new; end if;
 -- Do not let a replay change an expired row back into a live hold.
 if tg_op='UPDATE' and old.status='cancelled' and new.status='held' then raise exception 'booking_hold_expired'; end if;
 if tg_op='UPDATE' and old.status=new.status and old.start_at=new.start_at and old.end_at=new.end_at then return new; end if;
 perform public.check_public_booking_budget(coalesce(new.workspace_id,new.calendar_key),new.customer_email,new.start_at,new.block_end_at,new.request_fingerprint,new.id);
 return new;
end $$;

create or replace function public.hold_agent_booking(p_tenant_id text, p_booking jsonb, p_access jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_b public.business_bookings; v_result jsonb; v_access jsonb;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  if coalesce(v.tenant_stable_id,v.workspace_id) is null then raise exception 'booking_unknown_tenant'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v.tenant_stable_id,v.workspace_id)::text, 9106));
  select * into v_b from public.business_bookings where calendar_key = coalesce(v.tenant_stable_id,v.workspace_id) and legacy_id = p_booking->>'legacyId';
  if found then
    if v_b.origin <> 'agent' or v_b.request_fingerprint is distinct from p_booking->>'requestFingerprint' then
      raise exception 'booking_request_conflict';
    end if;
    return jsonb_build_object('status', 'unchanged', 'booking', public.booking_json(v_b),
      'access', (select to_jsonb(a) from public.business_booking_access a where a.booking_id = v_b.id));
  end if;
  -- Ten live agent holds at most, so assistants never take the whole public
  -- budget. A hold stops counting once it expires, is cancelled or is confirmed.
  if (select count(*) from public.business_bookings where calendar_key = coalesce(v.tenant_stable_id,v.workspace_id) and origin = 'agent'
    and status = 'held' and created_at > clock_timestamp() - interval '15 minutes') >= 10 then raise exception 'booking_agent_limit'; end if;
  if (public.read_tenant_booking_context(p_tenant_id)->>'paused')::boolean then raise exception 'booking_paused'; end if;
  if p_booking->>'status' <> 'held' or p_booking->>'origin' <> 'agent' then raise exception 'booking_invalid'; end if;
  v_result := public.record_tenant_booking(p_tenant_id, p_booking, 'native');
  if v_result->>'status' = 'conflict' then return v_result; end if;
  v_access := public.issue_booking_access(p_tenant_id, v_result#>>'{booking,id}', p_access);
  return v_result || jsonb_build_object('access', v_access);
end;
$$;

-- Public: every page read_published_business_page would serve, for the
-- platform MCP directory. Same filter; the app applies the release gates.
create function public.list_published_business_pages() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('workspaceId', p.workspace_id, 'handle', p.handle)
    || public.business_confirmed_public_facts(p.workspace_id) order by p.handle), '[]'::jsonb)
  from public.business_pages p join public.workspaces w on w.id = p.workspace_id
  where p.published and w.kind = 'customer' and p.handle ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'
    and not public.workspace_exit_completed(p.workspace_id)
$$;

revoke all on function public.booking_email_identity(text), public.list_published_business_pages() from public, anon, authenticated;
grant execute on function public.list_published_business_pages() to service_role;
commit;
