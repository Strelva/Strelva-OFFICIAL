-- Inquiries at 1.0.0, section 6: reads from Postgres (inquiry delta spec,
-- docs/capabilities/inquiries/inquiry-1.0-delta-2026-10-06.md).
--
-- Two service-role reads over `tenant_leads` for the read-source switch inside
-- src/lib/leads.ts:
--
--   read_tenant_lead(tenant, lead_id)      one lead by its `lead_…` id, in the
--                                          item shape read_tenant_leads uses.
--   read_tenant_lead_digests(tenant, since) every lead id and submission hash
--                                          captured since a time, for the daily
--                                          Redis-versus-Postgres parity check.
--
-- Parity results reuse `tenant_client_record_parity` under the store name
-- `tenant_leads` (its store column is free text), so the 7-day streak rule is
-- the same one the other client stores follow (client_record_parity_streak).
--
-- Additive only. No table, column, trigger or existing function changes.
-- Reads of a deleted tenant's leads go through read_tenant_leads (operator
-- view); these two need the tenant row, because live readers are always
-- reached through a live tenant slug.

create function public.read_tenant_lead(p_tenant_id text, p_lead_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_item jsonb;
begin
  if p_tenant_id is null or p_lead_id is null or p_lead_id !~ '^lead_[A-Za-z0-9_-]{1,100}$' then
    return null;
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return null; end if;
  select jsonb_build_object(
      'id', l.id,
      'tenantId', p_tenant_id,
      'tenantStableId', l.tenant_stable_id,
      'tenantSlugAtCapture', l.tenant_slug_at_capture,
      'workspaceId', l.workspace_id,
      'leadId', l.lead_id,
      'submissionHash', l.submission_hash,
      'name', l.name,
      'email', l.email,
      'message', l.message,
      'source', l.source,
      'fields', l.fields,
      'capabilityId', l.capability_id,
      'capabilityVersion', l.capability_version,
      'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'recordedVia', l.recorded_via)
    into v_item
    from public.tenant_leads l
    where l.tenant_stable_id = v_stable and l.lead_id = p_lead_id;
  return v_item;
end;
$$;

create function public.read_tenant_lead_digests(p_tenant_id text, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_stable uuid;
begin
  if p_tenant_id is null then return '{}'::jsonb; end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return '{}'::jsonb; end if;
  return coalesce((
    select jsonb_object_agg(l.lead_id, l.submission_hash)
    from public.tenant_leads l
    where l.tenant_stable_id = v_stable
      and (p_since is null or l.captured_at >= p_since)
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.read_tenant_lead(text, text) from public, anon, authenticated;
revoke all on function public.read_tenant_lead_digests(text, timestamptz) from public, anon, authenticated;
grant execute on function public.read_tenant_lead(text, text) to service_role;
grant execute on function public.read_tenant_lead_digests(text, timestamptz) to service_role;
