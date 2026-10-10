-- #304. Read-only attribution; no new notification, booking or approval writer.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

alter function public.booking_json(public.business_bookings) rename to booking_json_before_agent_visibility;
revoke all on function public.booking_json_before_agent_visibility(public.business_bookings) from public,anon,authenticated,service_role;
create function public.booking_json(b public.business_bookings) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select public.booking_json_before_agent_visibility(b) || jsonb_build_object('agentName',
   case when b.origin='agent' then (select a.agent_name from public.business_booking_access a where a.booking_id=b.id) else null end)
$$;
revoke all on function public.booking_json(public.business_bookings) from public,anon,authenticated,service_role;

-- Uses the same active work scope as the agency's System catalog. A provider
-- marker or a grant to an unrelated System never authorizes customer bookings.
create function public.read_provider_booking_evidence(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_date date,p_view text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_scope record; v_systems uuid[]; v_today date; v_from date; v_to date; v_zone text;
begin
 v_scope := public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,false);
 select array_agg(s.id) into v_systems from public.systems s where s.business_workspace_id=p_workspace_id and s.kind='booking'
   and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,v_scope.work_ids);
 if coalesce(cardinality(v_systems),0)=0 then raise exception 'workspace_access_denied'; end if;
 if p_view not in ('day','week') or p_view is null then raise exception 'booking_invalid'; end if;
 select b.time_zone into v_zone from public.business_bookings b where b.workspace_id=p_workspace_id and b.system_id=any(v_systems) order by b.start_at,b.id limit 1;
 v_today := (clock_timestamp() at time zone coalesce(v_zone,'UTC'))::date;
 v_from := coalesce(p_date,v_today);
 if p_view='week' then v_from := v_from-((extract(isodow from v_from)::integer)-1); end if;
 v_to := v_from+case when p_view='week' then 6 else 0 end;
 return (with selected as (
   select b.* from public.business_bookings b where b.workspace_id=p_workspace_id and b.system_id=any(v_systems)
     and (b.start_at at time zone b.time_zone)::date between v_from and v_to order by b.start_at,b.id limit 501
 ), visible as (select * from selected order by start_at,id limit 500)
 select jsonb_build_object('today',v_today,'truncated',(select count(*)>500 from selected),
   'bookings',coalesce(jsonb_agg(public.booking_json(b) order by b.start_at,b.id),'[]'::jsonb)) from visible b);
end $$;
revoke all on function public.read_provider_booking_evidence(uuid,uuid,text,date,text) from public,anon,authenticated;
grant execute on function public.read_provider_booking_evidence(uuid,uuid,text,date,text) to service_role;

-- Captured requests in the reporting period, not confirmed bookings. Never
-- includes customer data and never emits a message. Existing weekly brief only.
create function public.read_agent_booking_proof(p_tenant_id text,p_from timestamptz,p_to timestamptz) returns bigint
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_key uuid;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>interval '8 days' then raise exception 'booking_invalid'; end if;
 select coalesce(tenant_stable_id,workspace_id) into v_key from public.booking_tenant(p_tenant_id);
 if v_key is null then raise exception 'booking_unknown_tenant'; end if;
 return (select count(*) from public.business_bookings where calendar_key=v_key and origin='agent' and created_at>=p_from and created_at<=p_to);
end $$;
revoke all on function public.read_agent_booking_proof(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.read_agent_booking_proof(text,timestamptz,timestamptz) to service_role;
commit;
