-- Customer confirmation policy is isolated from owner notices and reminders.
-- Owner consent plus an operator-selected workspace release are both necessary.
do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select array_agg(distinct key order by key) into previous from unnest(previous||array['agent_channel']) key;
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;
create table public.agent_channel_consents(workspace_id uuid primary key references public.workspaces(id) on delete cascade,consented boolean not null default false,changed_by uuid not null references public.users(id),changed_at timestamptz not null default clock_timestamp());
create table public.agent_channel_consent_receipts(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,consented boolean not null,changed_by uuid not null references public.users(id),reason text not null check(char_length(btrim(reason)) between 3 and 500),at timestamptz not null default clock_timestamp());
alter table public.agent_channel_consents enable row level security;
alter table public.agent_channel_consent_receipts enable row level security;
revoke all on public.agent_channel_consents,public.agent_channel_consent_receipts from public,anon,authenticated,service_role;
create function public.agent_channel_consent_receipt_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.workspaces where id=old.workspace_id) then return old; end if;
 raise exception 'agent_channel_consent_receipt_immutable';
end $$;
create trigger agent_channel_consent_receipt_immutable before update or delete on public.agent_channel_consent_receipts for each row execute function public.agent_channel_consent_receipt_guard();
revoke all on function public.agent_channel_consent_receipt_guard() from public,anon,authenticated,service_role;
create function public.set_agent_channel_consent(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_consented boolean,p_reason text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email)<>'owner' then raise exception 'workspace_access_denied'; end if;
 if p_consented is null or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'inquiry_record_invalid'; end if;
 insert into public.agent_channel_consents(workspace_id,consented,changed_by) values(p_workspace_id,p_consented,p_user_id) on conflict(workspace_id) do update set consented=excluded.consented,changed_by=excluded.changed_by,changed_at=clock_timestamp();
 insert into public.agent_channel_consent_receipts(workspace_id,consented,changed_by,reason) values(p_workspace_id,p_consented,p_user_id,p_reason);
 return p_consented;
end $$;
create function public.read_agent_channel_policy(p_scope text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('enabled',coalesce(f.state='on' and c.consented,false),'killed',coalesce(f.state='off',false),'workspaceId',w.id)
 from (select (public.read_tenant_booking_context(p_scope)->>'workspaceId')::uuid id) w
 left join public.workspace_release_flags f on f.workspace_id=w.id and f.flag='agent_channel'
 left join public.agent_channel_consents c on c.workspace_id=w.id where w.id is not null
$$;
-- SQL guard remains independent of HTTP/IP limits. An explicit off immediately
-- stops new holds while status and customer confirmation remain available.
alter function public.hold_agent_booking(text,jsonb,jsonb) rename to hold_agent_booking_before_channel_policy;
create function public.hold_agent_booking(p_tenant_id text,p_booking jsonb,p_access jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record;
begin
 if coalesce((public.read_agent_channel_policy(p_tenant_id)->>'killed')::boolean,false) then raise exception 'booking_agent_disabled'; end if;
 select * into v from public.booking_tenant(p_tenant_id);
 if coalesce(v.tenant_stable_id,v.workspace_id) is null then raise exception 'booking_unknown_tenant'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(v.tenant_stable_id,v.workspace_id)::text,9106));
 -- Replays return the original hold even after the name/mailbox admission cap.
 if not exists(select 1 from public.business_bookings where calendar_key=coalesce(v.tenant_stable_id,v.workspace_id) and legacy_id=p_booking->>'legacyId') then
  if (select count(*) from public.business_bookings b join public.business_booking_access a on a.booking_id=b.id
    where b.calendar_key=coalesce(v.tenant_stable_id,v.workspace_id) and b.origin='agent' and b.created_at>clock_timestamp()-interval '1 hour'
    and lower(regexp_replace(btrim(a.agent_name),'\s+',' ','g'))=lower(regexp_replace(btrim(p_access->>'agentName'),'\s+',' ','g')))>=20
   or (select count(*) from public.business_bookings b where b.calendar_key=coalesce(v.tenant_stable_id,v.workspace_id) and b.origin='agent'
    and b.created_at>clock_timestamp()-interval '1 hour' and public.booking_email_identity(b.customer_email)=public.booking_email_identity(p_booking#>>'{customer,email}'))>=5
  then raise exception 'booking_agent_limit'; end if;
 end if;
 return public.hold_agent_booking_before_channel_policy(p_tenant_id,p_booking,p_access);
end $$;
create function public.read_agent_channel_health(p_user_id uuid,p_verified_email text,p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare held bigint;confirmed bigint;
begin
 if not exists(select 1 from public.super_admins a join public.users u on u.id=a.user_id where u.id=p_user_id and a.revoked_at is null and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null) then raise exception 'workspace_access_denied'; end if;
 select count(*),count(*) filter(where status in ('requested','confirmed','completed','no_show')) into held,confirmed from public.business_bookings where workspace_id=p_workspace_id and origin='agent' and created_at>clock_timestamp()-interval '24 hours';
 return jsonb_build_object('workspaceId',p_workspace_id,'holds',held,'confirmed',confirmed,'holdToConfirmRatio',case when held>0 then confirmed::numeric/held else null end,'alarm',held>=10 and confirmed::numeric/nullif(held,0)<0.2,'windowHours',24);
end $$;
revoke all on function public.set_agent_channel_consent(uuid,uuid,text,boolean,text),public.read_agent_channel_policy(text),public.hold_agent_booking(text,jsonb,jsonb),public.hold_agent_booking_before_channel_policy(text,jsonb,jsonb),public.read_agent_channel_health(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_agent_channel_consent(uuid,uuid,text,boolean,text),public.read_agent_channel_policy(text),public.hold_agent_booking(text,jsonb,jsonb),public.read_agent_channel_health(uuid,text,uuid) to service_role;
alter function public.receive_agent_inquiry(text,jsonb,text,text,text,text) rename to receive_agent_inquiry_before_channel_policy;
create function public.receive_agent_inquiry(p_scope text,p_input jsonb,p_digest text,p_status_hash text,p_status_ciphertext text,p_spam_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin if coalesce((public.read_agent_channel_policy(p_scope)->>'killed')::boolean,false) then raise exception 'inquiry_agent_disabled'; end if;
 return public.receive_agent_inquiry_before_channel_policy(p_scope,p_input,p_digest,p_status_hash,p_status_ciphertext,p_spam_reason);
end $$;
revoke all on function public.receive_agent_inquiry(text,jsonb,text,text,text,text),public.receive_agent_inquiry_before_channel_policy(text,jsonb,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.receive_agent_inquiry(text,jsonb,text,text,text,text) to service_role;
create function public.read_agent_channel_alarms(p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.super_admins a join public.users u on u.id=a.user_id where u.id=p_user_id and a.revoked_at is null and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null) then raise exception 'workspace_access_denied'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('workspaceId',workspace_id,'openedAt',opened_at,'holds',holds,'confirmed',confirmed) order by workspace_id) from (
 select workspace_id,min(created_at) opened_at,count(*) holds,count(*) filter(where status in ('requested','confirmed','completed','no_show')) confirmed
 from public.business_bookings where origin='agent' and workspace_id is not null and created_at>clock_timestamp()-interval '24 hours' group by workspace_id
 having count(*)>=10 and count(*) filter(where status in ('requested','confirmed','completed','no_show'))::numeric/count(*)<0.2) alarms),'[]'::jsonb);
end $$;
revoke all on function public.read_agent_channel_alarms(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_agent_channel_alarms(uuid,text) to service_role;
