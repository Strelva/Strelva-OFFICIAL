-- Booking rules reference the shared service; they never copy record facts.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
create table public.booking_service_policies (
 tenant_stable_id uuid not null references public.tenants(stable_id),
 workspace_id uuid not null references public.workspaces(id),
 business_service_id uuid not null references public.business_services(id),
 mode text not null default 'request' check(mode in ('request','instant')),
 buffer_minutes integer not null check(buffer_minutes between 0 and 120),
 bookable boolean not null default true, intake jsonb not null default '[]' check(jsonb_typeof(intake)='array' and jsonb_array_length(intake)<=8),
 revision integer not null default 1, primary key(tenant_stable_id,business_service_id)
);
alter table public.booking_service_policies enable row level security;
revoke all on public.booking_service_policies from public,anon,authenticated,service_role;
alter table public.booking_instant_policies add column business_service_id uuid references public.business_services(id),
 add column service_policy_revision integer;
create function public.booking_service_policy_json(p_tenant uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('businessServiceId',business_service_id,'mode',mode,'bufferMinutes',buffer_minutes,'bookable',bookable,'intake',intake)),'[]')
 from public.booking_service_policies where tenant_stable_id=p_tenant
$$;
alter function public.read_tenant_booking_context(text) rename to read_tenant_booking_context_before_service_policy;
create function public.read_tenant_booking_context(p_tenant_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select value || jsonb_build_object('servicePolicies',public.booking_service_policy_json((value->>'tenantStableId')::uuid))
 from (select public.read_tenant_booking_context_before_service_policy(p_tenant_id) as value) c
$$;
alter function public.read_tenant_booking_policy(text) rename to read_tenant_booking_policy_before_service_policy;
create function public.read_tenant_booking_policy(p_tenant_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select value || jsonb_build_object('servicePolicies',public.booking_service_policy_json((value->>'tenantStableId')::uuid))
 from (select public.read_tenant_booking_policy_before_service_policy(p_tenant_id) as value) c
$$;
alter function public.configure_booking_setup(uuid,text,uuid,text,jsonb) rename to configure_booking_setup_before_service_policy;
create function public.configure_booking_setup(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key uuid; v_services jsonb; v_service jsonb; v_record public.business_services; v_policy public.booking_service_policies; v_result jsonb; v_ids uuid[]; v_first boolean;
begin
 v_key:=public.booking_setup_authorize(p_workspace_id,p_tenant_id,p_user_id,p_email);
 perform pg_advisory_xact_lock(hashtextextended(v_key::text,9107));
 v_first:=not exists(select 1 from public.booking_settings where calendar_key=v_key);
 v_services:=p_settings->'services';
 if v_services is not null and (jsonb_typeof(v_services)<>'array' or jsonb_array_length(v_services)>100) then raise exception 'booking_invalid'; end if;
 -- Same settings revision serializes both schedule settings and service rules.
 v_result:=public.configure_booking_setup_before_service_policy(p_workspace_id,p_tenant_id,p_user_id,p_email,
   case when v_services is null then p_settings else (p_settings-'services') || '{"mode":"request"}'::jsonb end);
 if v_first then update public.booking_settings set default_length_minutes=30 where calendar_key=v_key; end if;
 if v_services is null then
   -- A global edit changes the approved promise for every service too.
   update public.booking_service_policies set mode='request',revision=revision+1 where tenant_stable_id=v_key;
   return v_result;
 end if;
 v_ids:='{}';
 for v_service in select value from jsonb_array_elements(v_services) loop
   select * into v_record from public.business_services where id=(v_service->>'businessServiceId')::uuid and workspace_id=p_workspace_id;
   if v_record.id is null or v_record.id=any(v_ids) then raise exception 'booking_invalid'; end if;
   v_ids:=array_append(v_ids,v_record.id);
   if v_service->>'mode' is null or v_service->>'mode' not in ('request','instant')
     or (v_service->>'bufferMinutes')::integer is null or (v_service->>'bufferMinutes')::integer not between 0 and 120
     or jsonb_typeof(v_service->'bookable') is distinct from 'boolean'
     or jsonb_typeof(v_service->'intake') is distinct from 'array' or jsonb_array_length(v_service->'intake')>8
     or exists(select 1 from jsonb_array_elements(v_service->'intake') q where q->>'id' is null or q->>'id' !~ '^[A-Za-z0-9_-]{1,80}$'
       or length(btrim(q->>'label')) not between 1 and 200 or q->>'label' is null or q->>'type' not in ('text','textarea') or q->>'type' is null
       or jsonb_typeof(q->'required') is distinct from 'boolean')
     or (select count(*)<>count(distinct q->>'id') from jsonb_array_elements(v_service->'intake') q)
     then raise exception 'booking_invalid'; end if;
   insert into public.booking_service_policies as p(tenant_stable_id,workspace_id,business_service_id,mode,buffer_minutes,bookable,intake)
   values(v_key,p_workspace_id,v_record.id,'request',(v_service->>'bufferMinutes')::int,(v_service->>'bookable')::boolean,v_service->'intake')
   on conflict(tenant_stable_id,business_service_id) do update set mode='request',buffer_minutes=excluded.buffer_minutes,
     bookable=excluded.bookable,intake=excluded.intake,revision=p.revision+1 returning * into v_policy;
   if v_service->>'mode'='instant' and v_policy.bookable then
     insert into public.booking_instant_policies(workspace_id,tenant_stable_id,settings_revision,business_service_id,service_policy_revision)
       values(p_workspace_id,v_key,(v_result->>'revision')::int,v_record.id,v_policy.revision);
   end if;
 end loop;
 -- An omitted configured service is no longer offered. Existing commitments survive.
 update public.booking_service_policies set mode='request',bookable=false,revision=revision+1
   where tenant_stable_id=v_key and not(business_service_id=any(v_ids));
 return v_result || jsonb_build_object('approvalRequired',exists(select 1 from public.booking_instant_policies where tenant_stable_id=v_key and status='proposed'));
end $$;
alter function public.read_booking_instant_policies(uuid) rename to read_booking_instant_policies_before_service_policy;
create function public.read_booking_instant_policies(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(value || case when p.business_service_id is null then '{}'::jsonb else jsonb_build_object('serviceName',s.name) end),'[]')
 from jsonb_array_elements(public.read_booking_instant_policies_before_service_policy(p_workspace_id)) value
 join public.booking_instant_policies p on p.id=(value->>'id')::uuid
 left join public.business_services s on s.id=p.business_service_id
$$;
alter function public.decide_booking_instant_policy(uuid,uuid,integer,text,uuid,text,boolean) rename to decide_booking_instant_policy_before_service_policy;
create function public.decide_booking_instant_policy(p_workspace_id uuid,p_policy_id uuid,p_revision integer,p_decision text,p_user_id uuid,p_email text,p_owner_link boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.booking_instant_policies; v_s public.booking_service_policies; v_tenant text;
begin
 select * into v from public.booking_instant_policies where id=p_policy_id and workspace_id=p_workspace_id;
 if v.id is null then raise exception 'booking_not_found'; end if;
 if v.business_service_id is null then return public.decide_booking_instant_policy_before_service_policy(p_workspace_id,p_policy_id,p_revision,p_decision,p_user_id,p_email,p_owner_link); end if;
 perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text,9107));
 select * into v from public.booking_instant_policies where id=p_policy_id and workspace_id=p_workspace_id for update;
 select id into v_tenant from public.tenants where stable_id=v.tenant_stable_id;
 if p_owner_link is distinct from true then
   perform public.booking_setup_authorize(p_workspace_id,v_tenant,p_user_id,p_email);
   if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then raise exception 'booking_settings_denied'; end if;
 end if;
 if v.revision is distinct from p_revision or p_decision is null or p_decision not in ('approve','not_yet') then raise exception 'booking_settings_stale'; end if;
 if v.status<>'proposed' then return '{"status":"unchanged"}'::jsonb; end if;
 select * into v_s from public.booking_service_policies where tenant_stable_id=v.tenant_stable_id and business_service_id=v.business_service_id for update;
 if v_s.revision is distinct from v.service_policy_revision or (select revision from public.booking_settings where calendar_key=v.tenant_stable_id) is distinct from v.settings_revision then raise exception 'booking_settings_stale'; end if;
 update public.booking_instant_policies set status=case when p_decision='approve' then 'active' else 'declined' end,decided_at=clock_timestamp() where id=v.id;
 if p_decision='approve' then update public.booking_service_policies set mode='instant' where tenant_stable_id=v.tenant_stable_id and business_service_id=v.business_service_id; end if;
 return '{"status":"updated"}'::jsonb;
end $$;
alter function public.confirm_agent_booking(text,boolean) rename to confirm_agent_booking_before_service_policy;
alter function public.change_native_booking_before_w6(text,jsonb) rename to change_native_booking_before_service_policy;
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
  v_to := case when p_force_request or coalesce((select p.mode from public.booking_service_policies p where p.tenant_stable_id=v_b.tenant_stable_id and p.business_service_id=v_b.business_service_id),(select mode from public.booking_settings where calendar_key=v_b.calendar_key),'request') = 'request'
    then 'requested' else 'confirmed' end;
  update public.business_bookings set status = v_to, updated_at = clock_timestamp() where id = v_b.id returning * into v_b;
  update public.business_booking_access set confirmed_at = clock_timestamp() where booking_id = v_b.id;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values(v_b.id, 'visitor', 'held', v_to, 'Customer confirmed agent request');
  return jsonb_build_object('status','updated','booking',public.booking_json(v_b));
end;
$$;

create function public.change_native_booking_before_w6(p_hash text, p_change jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.business_bookings; v_before public.business_bookings; v_ctx jsonb; v_status text;
begin
  select b.* into v_b from public.business_bookings b join public.business_booking_access a on a.booking_id = b.id
    where a.manage_hash = p_hash for update of b;
  if not found or v_b.end_at <= clock_timestamp() then raise exception 'booking_not_found'; end if;
  v_before := v_b;
  if p_change->>'action' = 'cancel' then
    if v_b.status = 'cancelled' then return public.booking_json(v_b); end if;
    update public.business_bookings set status='cancelled', cancelled_at=clock_timestamp(), updated_at=clock_timestamp()
      where id=v_b.id returning * into v_b;
  elsif p_change->>'action' = 'reschedule' then
    if v_b.status not in ('requested','confirmed') then raise exception 'booking_not_found'; end if;
    v_ctx := public.read_tenant_booking_context((select id from public.tenants where stable_id=v_b.tenant_stable_id));
    if (v_ctx->>'paused')::boolean then raise exception 'booking_paused'; end if;
    v_status := case when coalesce((select p.mode from public.booking_service_policies p where p.tenant_stable_id=v_b.tenant_stable_id and p.business_service_id=v_b.business_service_id),v_ctx#>>'{settings,mode}','request')='request' or (p_change->>'forceRequest')::boolean
      then 'requested' else 'confirmed' end;
    begin
      update public.business_bookings set start_at=(p_change->>'start')::timestamptz, end_at=(p_change->>'end')::timestamptz,
        buffer_minutes=coalesce((select p.buffer_minutes from public.booking_service_policies p where p.tenant_stable_id=v_b.tenant_stable_id and p.business_service_id=v_b.business_service_id),(v_ctx#>>'{settings,bufferMinutes}')::integer,buffer_minutes),
        block_end_at=(p_change->>'end')::timestamptz + make_interval(mins=>coalesce((select p.buffer_minutes from public.booking_service_policies p where p.tenant_stable_id=v_b.tenant_stable_id and p.business_service_id=v_b.business_service_id),(v_ctx#>>'{settings,bufferMinutes}')::integer,buffer_minutes)),
        status=v_status, updated_at=clock_timestamp()
        where id=v_b.id returning * into v_b;
    exception when exclusion_violation then raise exception 'booking_slot_taken'; end;
  else raise exception 'booking_invalid'; end if;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values(v_b.id,'visitor',v_before.status,v_b.status,case when p_change->>'action'='cancel' then
      case when v_before.start_at < clock_timestamp()+make_interval(hours=>coalesce((select (to_jsonb(s)->>'cancellation_cutoff_hours')::integer from public.booking_settings s where calendar_key=v_b.calendar_key),24))
        then 'Customer cancelled after the cancellation cutoff' else 'Customer cancelled' end
      else 'Customer rescheduled' end);
  return public.booking_json(v_b);
end;
$$;
revoke all on function public.confirm_agent_booking_before_service_policy(text,boolean),public.change_native_booking_before_service_policy(text,jsonb),public.change_native_booking_before_w6(text,jsonb),public.confirm_agent_booking(text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.confirm_agent_booking(text,boolean) to service_role;

-- Recheck policy in the serialized store write, including customer confirmation.
-- Owner confirmations of requested bookings and cancellations retain their terms.
create function public.enforce_booking_service_policy() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.booking_service_policies; v_record public.business_services; v_q jsonb; v_new_time boolean;
begin
 if new.recorded_via<>'native' or new.origin in ('legacy','import') or new.service_ref is null then return new; end if;
 v_new_time:=tg_op='INSERT';
 if tg_op='UPDATE' then v_new_time:=new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at; end if;
 if not v_new_time and not(tg_op='UPDATE' and old.status='held' and new.status in ('requested','confirmed')) then return new; end if;
 select * into v_record from public.business_services where workspace_id=new.workspace_id and (id::text=new.service_ref or external_ref=new.service_ref) limit 1;
 select * into v from public.booking_service_policies where tenant_stable_id=new.tenant_stable_id and business_service_id=v_record.id;
 if v.business_service_id is null then return new; end if;
 if not v.bookable or not v_record.active then raise exception 'booking_service_unavailable'; end if;
 for v_q in select value from jsonb_array_elements(v.intake) loop
   if (v_q->>'required')::boolean and coalesce(btrim(new.intake_answers->>(v_q->>'id')),'')='' then raise exception 'booking_intake_required'; end if;
 end loop;
 if exists(select 1 from jsonb_each_text(new.intake_answers) a where length(a.value)>2000 or
   (a.key not in ('notes','message') and not exists(select 1 from jsonb_array_elements(v.intake) q where q->>'id'=a.key))) then raise exception 'booking_invalid'; end if;
 new.business_service_id:=v_record.id;
 new.buffer_minutes:=v.buffer_minutes;
 new.block_end_at:=new.end_at+make_interval(mins=>v.buffer_minutes);
 if new.status='confirmed' and v.mode='request' and new.origin<>'owner' then new.status:='requested'; end if;
 return new;
end $$;
create trigger booking_service_policy_guard before insert or update on public.business_bookings for each row execute function public.enforce_booking_service_policy();
revoke all on function public.booking_service_policy_json(uuid),public.enforce_booking_service_policy(),
 public.read_tenant_booking_context_before_service_policy(text),public.read_tenant_booking_policy_before_service_policy(text),
 public.configure_booking_setup_before_service_policy(uuid,text,uuid,text,jsonb),public.read_booking_instant_policies_before_service_policy(uuid),
 public.decide_booking_instant_policy_before_service_policy(uuid,uuid,integer,text,uuid,text,boolean),
 public.read_tenant_booking_context(text),public.read_tenant_booking_policy(text),public.configure_booking_setup(uuid,text,uuid,text,jsonb),
 public.read_booking_instant_policies(uuid),public.decide_booking_instant_policy(uuid,uuid,integer,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.read_tenant_booking_context(text),public.read_tenant_booking_policy(text),public.configure_booking_setup(uuid,text,uuid,text,jsonb),
 public.read_booking_instant_policies(uuid),public.decide_booking_instant_policy(uuid,uuid,integer,text,uuid,text,boolean) to service_role;
commit;
