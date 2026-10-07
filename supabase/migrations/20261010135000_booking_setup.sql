-- Booking-only controls and explicit owner standing approval for instant mode.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
alter table public.booking_settings add column cancellation_cutoff_hours integer not null default 24 check(cancellation_cutoff_hours between 0 and 168);
create table public.booking_instant_policies (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 tenant_stable_id uuid not null references public.tenants(stable_id), revision integer not null default 1,
 settings_revision integer not null, status text not null default 'proposed' check(status in ('proposed','active','declined')),
 created_at timestamptz not null default clock_timestamp(), decided_at timestamptz
);
alter table public.booking_instant_policies enable row level security;
revoke all on public.booking_instant_policies from public,anon,authenticated,service_role;
create function public.booking_setup_authorize(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record;
begin
 select * into v from public.booking_tenant(p_tenant_id);
 if v.workspace_id is distinct from p_workspace_id or p_workspace_id is null then raise exception 'booking_not_found'; end if;
 if not exists(select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
   where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role in ('owner','admin')
     and u.verified_at is not null and lower(btrim(u.email))=lower(btrim(p_email))) then raise exception 'booking_settings_denied'; end if;
 return v.tenant_stable_id;
end $$;
create function public.read_booking_setup(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.booking_setup_authorize(p_workspace_id,p_tenant_id,p_user_id,p_email);
 return public.read_tenant_booking_context(p_tenant_id);
end $$;
create function public.configure_booking_setup(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key uuid; v_s public.booking_settings; v_mode text; v_policy uuid;
begin
 v_key:=public.booking_setup_authorize(p_workspace_id,p_tenant_id,p_user_id,p_email);
 perform pg_advisory_xact_lock(hashtextextended(v_key::text,9107));
 select * into v_s from public.booking_settings where calendar_key=v_key for update;
 if coalesce(v_s.revision,0) is distinct from (p_settings->>'expectedRevision')::integer then raise exception 'booking_settings_stale'; end if;
 v_mode:=p_settings->>'mode';
 if v_mode is null or v_mode not in ('instant','request') or (p_settings->>'bufferMinutes')::int not between 0 and 120
   or (p_settings->>'minNoticeMinutes')::int not between 0 and 43200 or (p_settings->>'maxAdvanceDays')::int not between 1 and 60
   or (p_settings->>'cancellationCutoffHours')::int not between 0 and 168
   or ((p_settings->>'maxPerDay') is not null and (p_settings->>'maxPerDay')::int not between 1 and 1000) then raise exception 'booking_invalid'; end if;
 -- Editing an instant rule changes its promise: it returns to request mode
 -- until the owner approves the exact new settings revision.
 insert into public.booking_settings as s(calendar_key,tenant_stable_id,workspace_id,mode,buffer_minutes,min_notice_minutes,max_advance_days,max_per_day,cancellation_cutoff_hours,recorded_via)
 values(v_key,v_key,p_workspace_id,'request',(p_settings->>'bufferMinutes')::int,(p_settings->>'minNoticeMinutes')::int,
   (p_settings->>'maxAdvanceDays')::int,(p_settings->>'maxPerDay')::int,(p_settings->>'cancellationCutoffHours')::int,'native')
 on conflict(calendar_key) do update set mode='request',buffer_minutes=excluded.buffer_minutes,min_notice_minutes=excluded.min_notice_minutes,
   max_advance_days=excluded.max_advance_days,max_per_day=excluded.max_per_day,cancellation_cutoff_hours=excluded.cancellation_cutoff_hours,
   recorded_via='native',revision=s.revision+1,updated_at=clock_timestamp() returning * into v_s;
 update public.booking_instant_policies set status='declined',decided_at=clock_timestamp() where tenant_stable_id=v_key and status in ('proposed','active');
 if v_mode='instant' then
   insert into public.booking_instant_policies(workspace_id,tenant_stable_id,settings_revision) values(p_workspace_id,v_key,v_s.revision) returning id into v_policy;
 end if;
 return jsonb_build_object('revision',v_s.revision,'mode','request','approvalRequired',v_policy is not null,'policyId',v_policy);
end $$;
create function public.read_booking_instant_policies(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'workspaceId',p.workspace_id,'tenantId',t.id,'revision',p.revision,
   'settingsRevision',p.settings_revision,'siteName',t.site_name,'status',p.status)),'[]')
 from public.booking_instant_policies p join public.tenants t on t.stable_id=p.tenant_stable_id where p.workspace_id=p_workspace_id
$$;
create function public.decide_booking_instant_policy(p_workspace_id uuid,p_policy_id uuid,p_revision integer,p_decision text,p_user_id uuid,p_email text,p_owner_link boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.booking_instant_policies; v_s public.booking_settings; v_tenant text;
begin
 select * into v from public.booking_instant_policies where id=p_policy_id and workspace_id=p_workspace_id;
 if v.id is null then raise exception 'booking_not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text,9107));
 select * into v from public.booking_instant_policies where id=p_policy_id and workspace_id=p_workspace_id for update;
 select id into v_tenant from public.tenants where stable_id=v.tenant_stable_id;
 -- The service-role caller verifies signed owner links through Needs you.
 -- A signed-in caller still must be this workspace's verified owner.
 if p_owner_link is distinct from true then
   perform public.booking_setup_authorize(p_workspace_id,v_tenant,p_user_id,p_email);
   if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then raise exception 'booking_settings_denied'; end if;
 end if;
 if v.revision is distinct from p_revision or p_decision is null or p_decision not in ('approve','not_yet') then raise exception 'booking_settings_stale'; end if;
 if v.status<>'proposed' then return jsonb_build_object('status','unchanged'); end if;
 select * into v_s from public.booking_settings where calendar_key=v.tenant_stable_id for update;
 if v_s.revision is distinct from v.settings_revision then raise exception 'booking_settings_stale'; end if;
 update public.booking_instant_policies set status=case when p_decision='approve' then 'active' else 'declined' end,decided_at=clock_timestamp() where id=v.id;
 if p_decision='approve' then update public.booking_settings set mode='instant',revision=revision+1,updated_at=clock_timestamp() where calendar_key=v.tenant_stable_id; end if;
 return jsonb_build_object('status','updated');
end $$;
revoke all on function public.booking_setup_authorize(uuid,text,uuid,text),public.read_booking_setup(uuid,text,uuid,text),public.configure_booking_setup(uuid,text,uuid,text,jsonb),public.read_booking_instant_policies(uuid),public.decide_booking_instant_policy(uuid,uuid,integer,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.read_booking_setup(uuid,text,uuid,text),public.configure_booking_setup(uuid,text,uuid,text,jsonb),public.read_booking_instant_policies(uuid),public.decide_booking_instant_policy(uuid,uuid,integer,text,uuid,text,boolean) to service_role;
commit;
