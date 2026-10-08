-- Tenant content and its accepted receipt commit together. Failure in either
-- aborts both. The release flag selects this RPC; existing writes stay intact.
set lock_timeout = '3s';
create function public.write_operator_content(p_tenant_id text, p_section text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare prior jsonb; receipt jsonb; system_id uuid; stable_id uuid;
begin
  if p_tenant_id is null or p_section is null or btrim(p_section) = ''
    or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'outside_write_receipt_invalid';
  end if;
  select t.stable_id into stable_id from public.tenants t where t.id = p_tenant_id for key share;
  if not found then raise exception 'outside_write_receipt_invalid'; end if;
  -- Serialize only writes to this section, including first insert. The hot
  -- content table is neither rewritten nor locked portfolio-wide.
  perform pg_advisory_xact_lock(hashtextextended('operator-content:' || p_tenant_id || ':' || p_section, 0));
  select c.data into prior from public.content c where c.tenant_id = p_tenant_id and c.section = p_section for update;
  select s.id into system_id from public.systems s
    join public.tenant_workspace_links l on l.workspace_id = s.business_workspace_id
    where l.tenant_stable_id = stable_id and s.origin_kind = 'tenant' and s.origin_ref = stable_id::text;
  insert into public.content(tenant_id, section, data) values (p_tenant_id, p_section, p_data)
    on conflict (tenant_id, section) do update set data = excluded.data;
  receipt := public.record_outside_write_receipt(jsonb_build_object(
    'commandKey', 'content-publish:' || gen_random_uuid()::text,
    'tenantId', p_tenant_id, 'systemId', system_id,
    'provider', 'strelva_content', 'writeKind', 'content_publish', 'subject', p_section,
    'request', jsonb_build_object('section', p_section, 'contentHash', md5(p_data::text), 'bytes', octet_length(p_data::text)),
    'beforeState', case when octet_length(prior::text) > 16000 then jsonb_build_object(
      'contentHash', md5(prior::text), 'bytes', octet_length(prior::text),
      'snapshotOmitted', 'Prior section exceeds the receipt snapshot limit; use its saved content version for restore.') else prior end,
    'acceptance', 'accepted', 'acceptanceDetail', 'Content and receipt committed in one Postgres transaction.',
    'readback', 'pending', 'undo', 'available', 'undoLabel', 'Restore a prior content version',
    'actor', 'content-store'
  ));
  return receipt;
end;
$$;
revoke all on function public.write_operator_content(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.write_operator_content(text,text,jsonb) to service_role;
