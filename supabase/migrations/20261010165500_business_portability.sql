-- Wave 6: complete business portability, site handoffs and business MRR.
-- Additive RPCs only. Old exit RPC and schema-2 export stay unchanged.
begin;
set local lock_timeout = '3s';

create function public.read_business_portfolio_billing(p_tenant_ids text[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('workspaceId', a.workspace_id,
    'monthlyCents', coalesce(a.monthly_cents, 0), 'tenantIds', x.tenant_ids) order by a.workspace_id), '[]'::jsonb)
  from public.accounts a join (
    select l.workspace_id, jsonb_agg(t.id order by t.id) as tenant_ids
    from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
    where t.id = any(p_tenant_ids) group by l.workspace_id
  ) x on x.workspace_id = a.workspace_id
$$;
revoke all on function public.read_business_portfolio_billing(text[]) from public, anon, authenticated;
grant execute on function public.read_business_portfolio_billing(text[]) to service_role;

-- Add one-store bookings that are not mirrors of already-counted public/legacy
-- rows, including Calendly imports. The original function retains its actor
-- boundary and counts; this wrapper adds only explicit retained record joins.
alter function public.business_outcome_month(uuid,uuid,text,date) rename to business_outcome_month_before_w6;
revoke all on function public.business_outcome_month_before_w6(uuid,uuid,text,date) from public,anon,authenticated,service_role;
create function public.business_outcome_month(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_month date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_count integer; v_imports integer; v_linked integer; v_total integer;
  v_from timestamptz; v_to timestamptz;
begin
  v_result:=public.business_outcome_month_before_w6(p_workspace_id,p_user_id,p_verified_email,p_month);
  v_from:=date_trunc('month',p_month::timestamp) at time zone 'UTC';
  v_to:=(date_trunc('month',p_month::timestamp)+interval '1 month') at time zone 'UTC';
  select count(*),count(*) filter(where b.origin='import'),count(*) filter(where exists(
    select 1 from public.tenant_leads l join public.tenant_workspace_links links on links.tenant_stable_id=l.tenant_stable_id
    left join public.business_contacts c on c.id=b.contact_id and c.workspace_id=p_workspace_id
    where links.workspace_id=p_workspace_id and l.captured_at<=b.created_at and (
      (b.inquiry_id=l.lead_id and b.tenant_stable_id=l.tenant_stable_id)
      or lower(nullif(l.email,''))=lower(coalesce(nullif(b.customer_email,''),c.email))
      or public.business_contact_phone_key(l.fields->>'phone')=coalesce(public.business_contact_phone_key(b.customer_phone),c.phone_key)
    ))) into v_count,v_imports,v_linked from public.business_bookings b
    where (b.workspace_id=p_workspace_id or exists(select 1 from public.tenant_workspace_links links
      where links.workspace_id=p_workspace_id and links.tenant_stable_id=b.tenant_stable_id))
      and b.status in ('confirmed','completed','no_show') and b.start_at>=v_from and b.start_at<v_to
      and b.public_reservation_id is null and b.legacy_id is null;
  v_total:=(v_result#>>'{bookings,value}')::integer+v_count;
  v_result:=jsonb_set(v_result,'{bookings,value}',to_jsonb(v_total));
  v_result:=jsonb_set(v_result,'{bookings,native}',to_jsonb((v_result#>>'{bookings,native}')::integer+v_count-v_imports));
  if v_imports>0 then v_result:=jsonb_set(v_result,'{bookings,legacy}',to_jsonb(coalesce((v_result#>>'{bookings,legacy}')::integer,0)+v_imports)); end if;
  if v_total>0 then
    v_result:=jsonb_set(v_result,'{bookingsFromInquiry,value}',to_jsonb(coalesce((v_result#>>'{bookingsFromInquiry,value}')::integer,0)+v_linked));
    v_result:=jsonb_set(v_result,'{bookingsFromInquiry,reason}','null'::jsonb);
  end if;
  return jsonb_set(v_result,'{bookingsFromInquiry,joins}',(v_result#>'{bookingsFromInquiry,joins}')||
    '["business_bookings.inquiry_id = earlier lead id","business_bookings contact/email/phone = earlier business lead"]'::jsonb);
end $$;
revoke all on function public.business_outcome_month(uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.business_outcome_month(uuid,uuid,text,date) to service_role;

-- Trusted monthly cron read; current verified membership supplies the
-- existing boundary, including the operator for an owner with no login.
create function public.list_business_outcome_reports(p_tenant_ids text[], p_month date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v record; v_actor record; v_rows jsonb := '[]'::jsonb; v_tenants jsonb;
begin
  if p_month is null then raise exception 'business_outcome_invalid'; end if;
  for v in select l.workspace_id,min(t.id) as primary_tenant_id from public.tenant_workspace_links l
    join public.tenants t on t.stable_id=l.tenant_stable_id where t.id=any(p_tenant_ids)
    group by l.workspace_id order by l.workspace_id loop
    select u.id,u.email into v_actor from public.workspace_memberships m join public.users u on u.id=m.user_id
      where m.workspace_id=v.workspace_id and u.verified_at is not null order by m.created_at,u.id limit 1;
    if not found then raise exception 'business_outcome_authority_unavailable'; end if;
    select coalesce(jsonb_agg(t.id order by t.id),'[]'::jsonb) into v_tenants from public.tenant_workspace_links l
      join public.tenants t on t.stable_id=l.tenant_stable_id where l.workspace_id=v.workspace_id;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('workspaceId',v.workspace_id,
      'primaryTenantId',v.primary_tenant_id,'tenantIds',v_tenants,
      'outcome',public.business_outcome_month(v.workspace_id,v_actor.id,v_actor.email,p_month)));
  end loop;
  return v_rows;
end $$;
revoke all on function public.list_business_outcome_reports(text[],date) from public,anon,authenticated;
grant execute on function public.list_business_outcome_reports(text[],date) to service_role;

create table if not exists public.business_outcome_report_deliveries (
  workspace_id uuid not null references public.workspaces(id), month date not null,
  token uuid not null, status text not null check(status in ('dispatching','accepted','suppressed','unknown')),
  reserved_at timestamptz not null default clock_timestamp(), settled_at timestamptz,
  primary key(workspace_id,month)
);
alter table public.business_outcome_report_deliveries enable row level security;
revoke all on public.business_outcome_report_deliveries from public,anon,authenticated,service_role;
create function public.reserve_business_outcome_report_delivery(p_workspace_id uuid,p_month date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_token uuid := gen_random_uuid(); v_inserted uuid;
begin
  if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'business_outcome_invalid'; end if;
  insert into public.business_outcome_report_deliveries(workspace_id,month,token,status)
    values(p_workspace_id,p_month,v_token,'dispatching') on conflict(workspace_id,month) do update
    set token=excluded.token,status='dispatching',reserved_at=clock_timestamp(),settled_at=null
    where business_outcome_report_deliveries.status='suppressed' returning token into v_inserted;
  return case when v_inserted is null then null else jsonb_build_object('token',v_inserted) end;
end $$;
create function public.record_business_outcome_report_delivery(p_workspace_id uuid,p_month date,p_token uuid,p_status text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_status is null or p_status not in ('accepted','suppressed','unknown') then raise exception 'business_outcome_invalid'; end if;
  update public.business_outcome_report_deliveries set status=p_status,settled_at=clock_timestamp()
    where workspace_id=p_workspace_id and month=p_month and token=p_token and status='dispatching';
  if not found then raise exception 'business_outcome_delivery_conflict'; end if;
  return jsonb_build_object('status',p_status);
end $$;
revoke all on function public.reserve_business_outcome_report_delivery(uuid,date) from public,anon,authenticated;
revoke all on function public.record_business_outcome_report_delivery(uuid,date,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_business_outcome_report_delivery(uuid,date) to service_role;
grant execute on function public.record_business_outcome_report_delivery(uuid,date,uuid,text) to service_role;

-- The source RPC stays private and is called for unchanged categories.
alter function public.export_workspace_v3_category(uuid, uuid, text, text, integer, integer)
  rename to export_workspace_v3_category_before_w6;
revoke all on function public.export_workspace_v3_category_before_w6(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.workspace_export_v3_categories() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['business_record','systems','linked_sites','leads','spam_held','inquiry_timelines','inquiry_first_replies',
    'booking_config','bookings','reviews','content','billing','orders','reward_members','reward_transactions',
    'threads','tenant_settings','provider_metadata','system_history','system_connections','system_outputs','versions',
    'saved_system_work','native_records','website_documents','business_bookings','booking_settings','inquiry_events','inquiry_delivery']::text[]
$$;

-- Fixed table/column allowlist; no caller-selected identifier reaches EXECUTE.
create function public.export_workspace_v3_category(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_category text, p_offset integer, p_limit integer
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb; v_table text; v_column text;
  v_remove text[] := array['command_id','command_digest','idempotency_key','dedupe_key','manage_token_hash','request_fingerprint'];
begin
  perform public.workspace_export_v3_role(p_workspace_id, p_user_id, p_verified_email);
  if p_category in ('orders','reward_members','reward_transactions','threads','tenant_settings','provider_metadata','inquiry_delivery') then
    select coalesce(jsonb_agg(jsonb_build_object('tenantId', t.id, 'recordId', x.record_id,
      'payload', case when p_category = 'provider_metadata' then jsonb_build_object(
        'provider', x.record_id, 'accountId', x.payload#>'{value,accountId}', 'locationId', x.payload#>'{value,locationId}',
        'locationName', x.payload#>'{value,locationName}', 'userUri', x.payload#>'{value,userUri}')
        when p_category='inquiry_delivery' then jsonb_build_object('kind',x.payload->'kind','value',
          case when jsonb_typeof(x.payload->'value')='object' then (x.payload->'value')-array['replyTo','attemptId','messageDigest'] else x.payload->'value' end)
        else x.payload end,
      'capturedAt', x.captured_at) order by x.captured_at, x.id), '[]'::jsonb) into v_items
    from (select r.* from public.tenant_client_records r
      join public.tenant_workspace_links l on l.tenant_stable_id = r.tenant_stable_id
      where l.workspace_id = p_workspace_id and r.store = p_category and r.removed_at is null
        and (p_category<>'inquiry_delivery' or r.payload->>'kind' in ('checkpoint','reply_state','provider_event'))
      order by r.captured_at, r.id offset v_offset limit v_limit) x
    join public.tenants t on t.stable_id = x.tenant_stable_id;
  elsif p_category in ('systems','system_history','system_connections','system_outputs','versions','saved_system_work',
    'native_records','website_documents','business_bookings','booking_settings','inquiry_events') then
    v_table := case p_category when 'systems' then 'systems' when 'system_history' then 'system_revisions'
      when 'system_connections' then 'system_connections' when 'system_outputs' then 'system_outputs'
      when 'versions' then 'system_versions' when 'saved_system_work' then 'saved_product_work'
      when 'native_records' then 'application_records' when 'website_documents' then 'website_documents'
      else p_category end;
    v_column := case when p_category in ('systems','system_history','system_connections','system_outputs','versions')
      then 'business_workspace_id' else 'workspace_id' end;
    -- Never export per-Version account bindings or shared secrets. Connections
    -- describe the contract; target refs are deliberately omitted.
    if p_category = 'system_connections' then v_remove := v_remove || array['target_ref','target_key']; end if;
    if p_category = 'versions' then v_remove := v_remove || array['local_data']; end if;
    execute format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select to_jsonb(x) - $4 as r from public.%I x where x.%I = $1 order by to_jsonb(x)->>''id'', to_jsonb(x)->>''created_at'', to_jsonb(x)->>''revision'' offset $2 limit $3) page', v_table, v_column)
      into v_items using p_workspace_id, v_offset, v_limit, v_remove;
  else
    return public.export_workspace_v3_category_before_w6(p_workspace_id, p_user_id, p_verified_email, p_category, p_offset, p_limit);
  end if;
  return jsonb_build_object('category', p_category, 'items', v_items,
    'next', case when jsonb_array_length(v_items) = v_limit then v_offset + v_limit end);
end;
$$;
revoke all on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) to service_role;

-- Planning is read-only: records every linked site, every System and the
-- business record. Billing/domain/repo moves remain explicit human actions.
create function public.read_workspace_exit_handoff_plan(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sites jsonb; v_systems jsonb;
begin
  perform public.workspace_export_v3_role(p_workspace_id, p_user_id, p_verified_email);
  select coalesce(jsonb_agg(jsonb_build_object('tenantId', t.id, 'tenantStableId', t.stable_id, 'siteName', t.site_name,
    'steps', jsonb_build_array(
      jsonb_build_object('kind','export','status','pending','detail','Export the business record and every linked System.'),
      jsonb_build_object('kind','files','status','pending','detail','Hand over the repository or downloadable website files and assets.'),
      jsonb_build_object('kind','billing','status','pending','detail','Review cancellation with the owner; no Stripe change has been made.'),
      jsonb_build_object('kind','domain','status','pending','detail','Arrange the domain move with the owner; no DNS or provider change has been made.')
    )) order by t.id), '[]'::jsonb) into v_sites
  from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
  where l.workspace_id = p_workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'lifecycle', s.lifecycle) order by s.id), '[]'::jsonb)
    into v_systems from public.systems s where s.business_workspace_id = p_workspace_id;
  return jsonb_build_object('businessRecordRetained', true, 'dataDeleted', false, 'sites', v_sites, 'systems', v_systems);
end;
$$;
revoke all on function public.read_workspace_exit_handoff_plan(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_workspace_exit_handoff_plan(uuid,uuid,text) to service_role;

create function public.complete_workspace_exit_with_handoff(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_future_work text, p_provider_participation text,
  p_maintained_resources jsonb, p_idempotency_key text, p_command_digest text, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_handoff jsonb; v_state jsonb;
begin
  -- Serialize with conversion and exit; capture before those actions retire
  -- resources. The original RPC independently checks the owner and command.
  perform 1 from public.workspaces where id = p_workspace_id for update;
  v_handoff := public.read_workspace_exit_handoff_plan(p_workspace_id, p_user_id, p_verified_email);
  v_result := public.complete_workspace_exit(p_workspace_id, p_user_id, p_verified_email, p_future_work,
    p_provider_participation, p_maintained_resources, p_idempotency_key, p_command_digest, p_notes);
  v_state := v_result->'state';
  if not (v_state ? 'handoff') then
    v_state := v_state || jsonb_build_object('handoff', v_handoff);
    update public.workspace_exit_requests set state = v_state where workspace_id = p_workspace_id;
  end if;
  return jsonb_set(v_result, '{state}', v_state);
end;
$$;
revoke all on function public.complete_workspace_exit_with_handoff(uuid,uuid,text,text,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_workspace_exit_with_handoff(uuid,uuid,text,text,text,jsonb,text,text,text) to service_role;
commit;
