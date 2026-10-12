begin;
set local lock_timeout='2s';
-- Missing/inherit is OFF for native businesses. Global gates still apply.
create table public.business_booking_email_settings (
  workspace_id uuid primary key references public.workspaces(id),
  state text not null check(state in ('inherit','on','off')),
  updated_by uuid not null references public.users(id),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.business_booking_email_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  before_state text not null,
  state text not null check(state in ('inherit','on','off')),
  actor_id uuid not null references public.users(id),
  actor_email text not null,
  reason text not null check(char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.business_booking_email_settings enable row level security;
alter table public.business_booking_email_events enable row level security;
revoke all on public.business_booking_email_settings,public.business_booking_email_events from public,anon,authenticated,service_role;
create function public.business_booking_email_event_immutable() returns trigger language plpgsql as $$
begin raise exception 'booking_email_event_immutable'; end; $$;
create trigger business_booking_email_event_immutable before update or delete on public.business_booking_email_events for each row execute function public.business_booking_email_event_immutable();
create function public.read_business_booking_email(p_workspace_id uuid)
returns text language sql security definer set search_path=public,pg_temp as $$
  select coalesce((select state from public.business_booking_email_settings where workspace_id=p_workspace_id),'inherit');
$$;
create function public.set_business_booking_email(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_state text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before text; v_event uuid;
begin
  perform public.operator_queue_assert_operator(p_user_id,p_verified_email);
  perform 1 from public.workspaces where id=p_workspace_id and kind='customer' for key share;
  if not found then raise exception 'booking_email_business_required'; end if;
  if p_state is null or p_state not in ('inherit','on','off') or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'booking_email_setting_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('business-booking-email:'||p_workspace_id,0));
  v_before := public.read_business_booking_email(p_workspace_id);
  insert into public.business_booking_email_events(workspace_id,before_state,state,actor_id,actor_email,reason)
    values(p_workspace_id,v_before,p_state,p_user_id,lower(btrim(p_verified_email)),btrim(p_reason)) returning id into v_event;
  insert into public.business_booking_email_settings(workspace_id,state,updated_by) values(p_workspace_id,p_state,p_user_id)
    on conflict(workspace_id) do update set state=excluded.state,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  return jsonb_build_object('state',p_state,'eventId',v_event,'actorId',p_user_id);
end; $$;
create function public.read_business_booking_email_history(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.operator_queue_assert_operator(p_user_id,p_verified_email);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (select * from public.business_booking_email_events where workspace_id=p_workspace_id order by created_at desc limit 100) r),'[]');
end; $$;
revoke all on function public.business_booking_email_event_immutable(),public.read_business_booking_email(uuid),public.set_business_booking_email(uuid,uuid,text,text,text),public.read_business_booking_email_history(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_business_booking_email(uuid),public.set_business_booking_email(uuid,uuid,text,text,text),public.read_business_booking_email_history(uuid,uuid,text) to service_role;
commit;
