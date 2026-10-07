-- #529: anonymous requests share a business budget across website grants and
-- inquiry handoffs. Email-only confirmation authorizes placement, never the
-- management/offer token returned to the anonymous submitter.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create table public.public_booking_requests (
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id text not null check (char_length(request_id) between 32 and 96),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  visitor jsonb not null check (jsonb_typeof(visitor)='object' and octet_length(visitor::text)<=20000),
  customer_email text not null check (char_length(customer_email) between 3 and 320),
  start_at timestamptz not null, end_at timestamptz not null check (end_at>start_at),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_ciphertext text not null check (token_ciphertext like 'enc:v1:%'),
  state text not null default 'held' check (state in ('held','confirming','placed','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
  primary key(tenant_stable_id,request_id)
);
create index public_booking_requests_open on public.public_booking_requests(workspace_id,expires_at) where state in ('held','confirming');
alter table public.public_booking_requests enable row level security;
revoke all on public.public_booking_requests from public,anon,authenticated,service_role;

-- Both admission and the one store take this same business-scoped lock before
-- counting. It protects against distributed/concurrent requests and different
-- tenant slugs pointing to the same business. Exclude the request being placed.
create function public.check_public_booking_budget(p_business uuid,p_email text,p_start timestamptz,p_end timestamptz,p_fingerprint text,p_booking_id uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_email text:=lower(btrim(p_email));
begin
 if p_business is null or coalesce(v_email,'')='' then raise exception 'booking_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business::text,529));
 -- Release expired public holds before an exclusion check, without depending
 -- on the cron. Preserve their receipt/history; never reopen an expired hold.
 with expired as (
   update public.business_bookings set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp()
   where workspace_id=p_business and origin in ('site','inquiry') and status='held'
     and created_at<=clock_timestamp()-interval '15 minutes' returning id
 ) insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
   select id,'system','held','cancelled','Public hold expired without email confirmation' from expired;
 select count(*) into v_count from (
   select customer_email,start_at,end_at from public.public_booking_requests
   where workspace_id=p_business and state in ('held','confirming') and expires_at>clock_timestamp()
     and fingerprint is distinct from p_fingerprint
   union all
   select customer_email,start_at,block_end_at from public.business_bookings
   where workspace_id=p_business and origin in ('site','inquiry') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint
 ) pending;
 if v_count>=20 then raise exception 'booking_public_limit_business'; end if;
 if exists(select 1 from public.public_booking_requests where workspace_id=p_business and state in ('held','confirming')
     and expires_at>clock_timestamp() and fingerprint is distinct from p_fingerprint and customer_email=v_email)
   or exists(select 1 from public.business_bookings where workspace_id=p_business and origin in ('site','inquiry') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint and lower(btrim(customer_email))=v_email)
 then raise exception 'booking_public_limit_email'; end if;
 if exists(select 1 from public.public_booking_requests where workspace_id=p_business and state in ('held','confirming')
     and expires_at>clock_timestamp() and fingerprint is distinct from p_fingerprint and start_at<p_end and end_at>p_start)
   or exists(select 1 from public.business_bookings where workspace_id=p_business and origin in ('site','inquiry') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint and start_at<p_end and block_end_at>p_start)
 then raise exception 'booking_slot_taken'; end if;
end $$;

create function public.claim_public_booking_request(p_tenant_id text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_t record; v_r public.public_booking_requests; v_workspace uuid:=(p_request->>'workspaceId')::uuid;
begin
 select * into v_t from public.booking_tenant(p_tenant_id);
 -- Published legacy schedules may predate a tenant-workspace link. The active
 -- grant is the authority in that case; never trust caller-supplied workspace.
 if v_t.tenant_stable_id is null or not exists(select 1 from public.public_website_booking_grants
   where tenant_stable_id=v_t.tenant_stable_id and business_workspace_id=v_workspace and status='published')
 then raise exception 'booking_not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_workspace::text,529));
 select * into v_r from public.public_booking_requests where tenant_stable_id=v_t.tenant_stable_id and request_id=p_request->>'requestId';
 if found then
   if v_r.fingerprint is distinct from p_request->>'fingerprint' then raise exception 'booking_request_conflict'; end if;
   if v_r.state='cancelled' or (v_r.state='held' and v_r.expires_at<=clock_timestamp()) then raise exception 'booking_hold_expired'; end if;
   return to_jsonb(v_r);
 end if;
 if (p_request->>'start')::timestamptz<=clock_timestamp() then raise exception 'booking_hold_expired'; end if;
 perform public.check_public_booking_budget(v_workspace,p_request#>>'{visitor,email}',(p_request->>'start')::timestamptz,(p_request->>'end')::timestamptz,null);
 insert into public.public_booking_requests(tenant_stable_id,workspace_id,request_id,fingerprint,visitor,customer_email,start_at,end_at,token_hash,token_ciphertext)
 values(v_t.tenant_stable_id,v_workspace,p_request->>'requestId',p_request->>'fingerprint',p_request->'visitor',lower(btrim(p_request#>>'{visitor,email}')),
   (p_request->>'start')::timestamptz,(p_request->>'end')::timestamptz,p_request->>'tokenHash',p_request->>'tokenCiphertext') returning * into v_r;
 return to_jsonb(v_r);
end $$;
create function public.read_public_booking_request(p_tenant_id text,p_request_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(r)||jsonb_build_object('tenantId',t.id,'requestId',r.request_id) from public.public_booking_requests r
 join public.tenants t on t.stable_id=r.tenant_stable_id where t.id=p_tenant_id and r.request_id=p_request_id
$$;
create function public.consume_public_booking_request(p_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.public_booking_requests;
begin
 select * into r from public.public_booking_requests where token_hash=p_hash for update;
 if not found or r.state<>'held' or r.expires_at<=clock_timestamp() or r.start_at<=clock_timestamp() then raise exception 'booking_hold_expired'; end if;
 update public.public_booking_requests set state='confirming' where tenant_stable_id=r.tenant_stable_id and request_id=r.request_id;
 return to_jsonb(r)||jsonb_build_object('tenantId',(select id from public.tenants where stable_id=r.tenant_stable_id),'requestId',r.request_id);
end $$;
create function public.finish_public_booking_request(p_tenant_id text,p_request_id text) returns void
language sql security definer set search_path=public,pg_temp as $$
 update public.public_booking_requests set state='placed' where tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id) and request_id=p_request_id and state='confirming'
$$;
create function public.cancel_public_booking_request(p_tenant_id text,p_request_id text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.public_booking_requests set state='cancelled' where tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id) and request_id=p_request_id and state in ('held','cancelled');
 return found;
end $$;

create function public.guard_public_booking_budget() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_admission public.public_booking_requests;
begin
 -- Every native inquiry handoff starts as an expiring hold, including the
 -- separate w6 choose_inquiry_booking_slot path. The old offer token is not
 -- customer email verification. Unsupported callers cannot place a request.
 if new.origin='inquiry' and new.recorded_via='native' then
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
 if new.origin not in ('site','inquiry') or new.recorded_via<>'native' or new.status not in ('held','requested') then return new; end if;
 -- Do not let a replay change an expired row back into a live hold.
 if tg_op='UPDATE' and old.status='cancelled' and new.status='held' then raise exception 'booking_hold_expired'; end if;
 if tg_op='UPDATE' and old.status=new.status and old.start_at=new.start_at and old.end_at=new.end_at then return new; end if;
 perform public.check_public_booking_budget(coalesce(new.workspace_id,new.calendar_key),new.customer_email,new.start_at,new.block_end_at,new.request_fingerprint,new.id);
 return new;
end $$;
create trigger guard_public_booking_budget before insert or update on public.business_bookings for each row execute function public.guard_public_booking_budget();

alter table public.public_website_bookings add column email_confirmation_required boolean not null default false;
alter table public.public_website_bookings add column email_confirmation_expires_at timestamptz;
create function public.guard_public_booking_receipt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.public_booking_requests;
begin
 select * into r from public.public_booking_requests where tenant_stable_id=new.tenant_stable_id and request_id=new.calendar_request_id;
 if found then
   new.email_confirmation_required:=r.state='held';
   new.email_confirmation_expires_at:=r.expires_at;
   if r.state='held' and new.status<>'cancelled' then new.status:='pending'; end if;
 end if;
 return new;
end $$;
create trigger guard_public_booking_receipt before insert or update on public.public_website_bookings for each row execute function public.guard_public_booking_receipt();
revoke all on function public.guard_public_booking_receipt() from public,anon,authenticated,service_role;

alter function public.issue_booking_access(text,text,jsonb) rename to issue_booking_access_before_public_admission;
create function public.issue_booking_access(p_tenant_id text, p_ref text, p_access jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_b public.business_bookings; v_a public.business_booking_access;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  select * into v_b from public.business_bookings where calendar_key = coalesce(v.tenant_stable_id,v.workspace_id) and (id::text = p_ref or legacy_id = p_ref) for update;
  if not found then raise exception 'booking_not_found'; end if;
  insert into public.business_booking_access(booking_id, manage_hash, manage_ciphertext, confirm_hash, confirm_ciphertext,
    status_hash, status_ciphertext, confirm_until, agent_name)
  values (v_b.id, p_access->>'manageHash', p_access->>'manageCiphertext', p_access->>'confirmHash', p_access->>'confirmCiphertext',
    p_access->>'statusHash', p_access->>'statusCiphertext', case when v_b.status='held' and p_access->>'confirmHash' is not null then v_b.created_at + interval '15 minutes' end, p_access->>'agentName')
  on conflict (booking_id) do nothing;
  select * into v_a from public.business_booking_access where booking_id = v_b.id;
  return to_jsonb(v_a);
end;
$$;

revoke all on function public.issue_booking_access_before_public_admission(text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.issue_booking_access(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.issue_booking_access(text,text,jsonb) to service_role;

alter function public.confirm_agent_booking(text,boolean) rename to confirm_agent_booking_before_public_admission;
create function public.confirm_agent_booking(p_hash text, p_force_request boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.business_bookings; v_a public.business_booking_access; v_to text;
begin
  select b.* into v_b from public.business_bookings b join public.business_booking_access a on a.booking_id = b.id
    where a.confirm_hash = p_hash for update of b;
  if not found then raise exception 'booking_not_found'; end if;
  select * into v_a from public.business_booking_access where booking_id = v_b.id;
  if v_a.confirmed_at is not null then return jsonb_build_object('status','unchanged','booking',public.booking_json(v_b)); end if;
  if v_b.status <> 'held' or v_a.confirm_until <= clock_timestamp() or v_b.start_at <= clock_timestamp() then raise exception 'booking_hold_expired'; end if;
  v_to := case when p_force_request or coalesce((select p.mode from public.booking_service_policies p where coalesce(p.calendar_key,p.tenant_stable_id,p.workspace_id)=v_b.calendar_key and p.business_service_id=v_b.business_service_id),(select mode from public.booking_settings where calendar_key=v_b.calendar_key),'request') = 'request'
    then 'requested' else 'confirmed' end;
  update public.business_booking_access set confirmed_at = clock_timestamp() where booking_id = v_b.id;
  update public.business_bookings set status = v_to, updated_at = clock_timestamp() where id = v_b.id returning * into v_b;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values(v_b.id, 'visitor', 'held', v_to, 'Customer confirmed email booking request');
  return jsonb_build_object('status','updated','booking',public.booking_json(v_b));
end;
$$;

revoke all on function public.confirm_agent_booking_before_public_admission(text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.confirm_agent_booking(text,boolean) from public,anon,authenticated;
grant execute on function public.confirm_agent_booking(text,boolean) to service_role;

-- Inquiry handoffs reuse the existing customer-email confirmation path, even
-- when the anonymous caller has the original offer bearer token.
alter function public.choose_inquiry_booking_offer(text,timestamptz,jsonb) rename to choose_inquiry_booking_offer_before_public_admission;
create function public.choose_inquiry_booking_offer(p_hash text,p_start timestamptz,p_access jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_id uuid;
begin
 if p_access->>'confirmHash' is null then raise exception 'booking_invalid'; end if;
 v_result:=public.choose_inquiry_booking_offer_before_public_admission(p_hash,p_start,p_access);
 v_id:=(v_result#>>'{booking,id}')::uuid;
 -- The original function creates requested; convert in the same transaction,
 -- before any provider mirror, owner notice or customer update can observe it.
 if v_result->>'status'='recorded' then
   update public.business_bookings set status='held' where id=v_id;
   select public.booking_json(b) into v_result from public.business_bookings b where id=v_id;
   return jsonb_build_object('status','recorded','booking',v_result);
 end if;
 return v_result;
end $$;
alter function public.claim_booking_updates(uuid,boolean,boolean,integer) rename to claim_booking_updates_before_public_admission;
create function public.claim_booking_updates(p_booking_id uuid, p_owner boolean, p_agent boolean, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_id uuid; v_out jsonb := '[]';
begin
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'booking_invalid'; end if;
  for v in select h.*, a.audience from public.business_booking_history h
    join public.business_bookings b on b.id = h.booking_id
    cross join (values('customer'),('client')) a(audience)
    where h.at >= (select starts_at from public.business_booking_update_epoch)
      and (p_booking_id is null or b.id = p_booking_id)
      and b.origin <> 'import' and h.actor <> 'migration' and b.end_at > clock_timestamp()
      and h.to_status = b.status
      and (h.to_status in ('requested','confirmed','cancelled','declined') or (h.to_status='held' and (b.origin='inquiry' or (p_agent and b.origin='agent'))))
      and coalesce(h.reason,'') not like 'Public hold expired%'
      and coalesce(h.reason,'') not like 'Expired%'
      and coalesce(h.reason,'') not like 'Hold expired%'
      and coalesce(h.reason,'') not like 'Public receipt was not saved%'
      and (a.audience = 'customer' or (p_owner and (h.to_status in ('cancelled','confirmed') or h.reason='Customer rescheduled')
        ))
      and not exists(select 1 from public.business_booking_updates u where u.history_id=h.id and u.audience=a.audience)
    order by h.at, h.id limit p_limit
  loop
    v_id := null;
    insert into public.business_booking_updates(history_id,audience) values(v.id,v.audience)
      on conflict do nothing returning id into v_id;
    if v_id is null then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('messageId',v_id,'audience',v.audience,'reason',v.reason,
      'fromStatus',v.from_status,'booking',(select public.booking_json(b) from public.business_bookings b where b.id=v.booking_id),
      'access',(select to_jsonb(a) from public.business_booking_access a where a.booking_id=v.booking_id)));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.claim_booking_updates_before_public_admission(uuid,boolean,boolean,integer) from public,anon,authenticated,service_role;
revoke all on function public.claim_booking_updates(uuid,boolean,boolean,integer) from public,anon,authenticated;
grant execute on function public.claim_booking_updates(uuid,boolean,boolean,integer) to service_role;
revoke all on function public.choose_inquiry_booking_offer_before_public_admission(text,timestamptz,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.check_public_booking_budget(uuid,text,timestamptz,timestamptz,text,uuid),public.guard_public_booking_budget(),
 public.claim_public_booking_request(text,jsonb),public.read_public_booking_request(text,text),public.consume_public_booking_request(text),
 public.finish_public_booking_request(text,text),public.cancel_public_booking_request(text,text),public.choose_inquiry_booking_offer(text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.claim_public_booking_request(text,jsonb),public.read_public_booking_request(text,text),public.consume_public_booking_request(text),
 public.finish_public_booking_request(text,text),public.cancel_public_booking_request(text,text),public.choose_inquiry_booking_offer(text,timestamptz,jsonb) to service_role;
commit;
