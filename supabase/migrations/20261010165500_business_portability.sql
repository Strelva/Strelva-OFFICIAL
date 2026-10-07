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
