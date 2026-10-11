begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
create function public.read_workspace_manual_booking_context(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record;
begin
 perform public.read_workspace_tenant_links(p_workspace_id,p_user_id,p_email);
 select * into v from public.booking_tenant(p_tenant_id);
 if p_workspace_id is null or v.workspace_id is distinct from p_workspace_id or not exists(
   select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
   where m.workspace_id=p_workspace_id and m.user_id=p_user_id and u.verified_at is not null
     and lower(btrim(u.email))=lower(btrim(p_email))) then raise exception 'booking_not_found'; end if;
 return public.read_tenant_booking_context(p_tenant_id);
end $$;
create function public.create_workspace_manual_booking(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text,p_booking jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx jsonb; b public.business_bookings; s public.business_services; v_ref text;
begin
 ctx:=public.read_workspace_manual_booking_context(p_workspace_id,p_tenant_id,p_user_id,p_email);
 perform pg_advisory_xact_lock(hashtextextended(ctx->>'tenantStableId',9107));
 -- Recheck membership, pause and record after the lock.
 ctx:=public.read_workspace_manual_booking_context(p_workspace_id,p_tenant_id,p_user_id,p_email);
 v_ref:=p_booking->>'legacyId';
 if v_ref is null or v_ref !~ '^manual-[A-Za-z0-9_-]{8,80}$' then raise exception 'booking_invalid'; end if;
 select * into b from public.business_bookings where calendar_key=(ctx->>'tenantStableId')::uuid and legacy_id=v_ref for update;
 if found then
   if b.origin<>'owner' or b.request_fingerprint is distinct from p_booking->>'requestFingerprint' then raise exception 'booking_request_conflict'; end if;
   return jsonb_build_object('status','unchanged','booking',public.booking_json(b));
 end if;
 if (ctx->>'paused')::boolean then raise exception 'booking_paused'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'booking_paused'; end if;
 select * into s from public.business_services where workspace_id=p_workspace_id and active
   and (id::text=p_booking->>'serviceRef' or external_ref=p_booking->>'serviceRef');
 if not found then raise exception 'booking_invalid'; end if;
 if (p_booking->>'start')::timestamptz<=clock_timestamp() or (p_booking->>'end')::timestamptz<=(p_booking->>'start')::timestamptz then raise exception 'booking_invalid'; end if;
 -- Origin is set here, never trusted from the browser. Staff file a request;
 -- approval remains the owner's existing Needs you decision.
 return public.record_tenant_booking(p_tenant_id,p_booking||jsonb_build_object('origin','owner','status','requested',
   'serviceName',s.name,'bufferMinutes',coalesce((ctx#>>'{settings,bufferMinutes}')::integer,15),
   'timeZone',coalesce(ctx#>>'{hours,timezone}',ctx#>>'{settings,timezone}','America/New_York')),'native');
end $$;
revoke all on function public.read_workspace_manual_booking_context(uuid,text,uuid,text), public.create_workspace_manual_booking(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.read_workspace_manual_booking_context(uuid,text,uuid,text), public.create_workspace_manual_booking(uuid,text,uuid,text,jsonb) to service_role;
commit;
