-- Booking-only health.owner_action audit. No decision, grant, email, or provider write.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
create table public.booking_calendar_health_actions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 connection_id uuid not null references public.workspace_calendar_connections(id) on delete cascade,
 kind text not null default 'health.owner_action' check(kind='health.owner_action'),
 revision_hash text not null,
 state text not null default 'open' check(state in ('open','resolved')),
 delivery_status text not null default 'not_sent' check(delivery_status in ('not_sent','claimed','sent','suppressed','failed')),
 last_attempt_day date, provider_message_id text, delivery_reason text,
 opened_at timestamptz not null default now(), resolved_at timestamptz, finished_at timestamptz
);
create unique index booking_calendar_health_open_idx on public.booking_calendar_health_actions(connection_id) where state='open';
alter table public.booking_calendar_health_actions enable row level security;
revoke all on table public.booking_calendar_health_actions from public,anon,authenticated;
grant select,insert,update on table public.booking_calendar_health_actions to service_role;

-- The trusted Needs You cron scopes each read to an already linked business.
-- Full successful current reads alone resolve actions; a failed read changes nothing.
create function public.sync_booking_calendar_health(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_connection public.workspace_calendar_connections; v_revision text; v_out jsonb;
begin
 if not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id) then
  raise exception 'booking_health_workspace_unlinked';
 end if;
 -- Serialize both cron processes for this business, before reading connection state.
 perform 1 from public.workspaces where id=p_workspace_id for update;
 update public.booking_calendar_health_actions a set state='resolved',resolved_at=now()
 where a.workspace_id=p_workspace_id and a.state='open' and not exists(
  select 1 from public.workspace_calendar_connections c where c.id=a.connection_id and c.workspace_id=p_workspace_id
   and c.status in ('error','revoked') and a.revision_hash=md5(c.id::text||':'||c.provider||':'||c.calendar_id||':'||c.status));
 for v_connection in select * from public.workspace_calendar_connections where workspace_id=p_workspace_id and status in ('error','revoked') order by id limit 2 loop
  v_revision:=md5(v_connection.id::text||':'||v_connection.provider||':'||v_connection.calendar_id||':'||v_connection.status);
  insert into public.booking_calendar_health_actions(workspace_id,connection_id,revision_hash)
   values(p_workspace_id,v_connection.id,v_revision) on conflict(connection_id) where state='open' do nothing;
 end loop;
 select jsonb_build_object('businessName',w.name,'timezone',coalesce((select f.value->>'timezone'
  from public.business_record_facts f where f.workspace_id=p_workspace_id and f.fact_key='hours'),'America/New_York'),
  'actions',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'revision',a.revision_hash,'provider',c.provider,'status',c.status,'delivery',a.delivery_status) order by a.id)
   from public.booking_calendar_health_actions a join public.workspace_calendar_connections c on c.id=a.connection_id
   where a.workspace_id=p_workspace_id and a.state='open'),'[]'::jsonb)) into v_out from public.workspaces w where w.id=p_workspace_id;
 return v_out;
end $$;

-- Fresh status+calendar identity and daily dedupe are checked under the row lock.
create function public.claim_booking_calendar_health(p_workspace_id uuid,p_id uuid,p_revision text,p_day date) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.booking_calendar_health_actions; c public.workspace_calendar_connections;
begin
 if p_day is null or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id) then return false; end if;
 select * into a from public.booking_calendar_health_actions where id=p_id and workspace_id=p_workspace_id for update;
 if a.id is null or a.state<>'open' or a.revision_hash<>p_revision or a.delivery_status in ('sent','claimed') or a.last_attempt_day=p_day then return false; end if;
 select * into c from public.workspace_calendar_connections where id=a.connection_id and workspace_id=p_workspace_id for share;
 if c.id is null or c.status not in ('error','revoked') or a.revision_hash<>md5(c.id::text||':'||c.provider||':'||c.calendar_id||':'||c.status) then return false; end if;
 update public.booking_calendar_health_actions set delivery_status='claimed',last_attempt_day=p_day,delivery_reason=null where id=a.id;
 return true;
end $$;
create function public.finish_booking_calendar_health(p_workspace_id uuid,p_id uuid,p_status text,p_provider text,p_reason text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_status not in ('sent','suppressed','failed') or (p_status='sent' and nullif(btrim(p_provider),'') is null) then raise exception 'booking_health_invalid'; end if;
 update public.booking_calendar_health_actions set delivery_status=p_status,provider_message_id=p_provider,delivery_reason=left(p_reason,200),finished_at=now()
  where id=p_id and workspace_id=p_workspace_id and delivery_status='claimed';
 return found;
end $$;
revoke all on function public.sync_booking_calendar_health(uuid),public.claim_booking_calendar_health(uuid,uuid,text,date),public.finish_booking_calendar_health(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.sync_booking_calendar_health(uuid),public.claim_booking_calendar_health(uuid,uuid,text,date),public.finish_booking_calendar_health(uuid,uuid,text,text,text) to service_role;
commit;
