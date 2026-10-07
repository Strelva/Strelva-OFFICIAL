-- Rollback for 20261009113000_inquiry_records.sql
-- Forward SHA-256: 18a6a41549fef1fb377f824711725698b5a470ee5bc6f1b4c9d43d02f3a45157
-- Batch 6: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.inquiry_events_immutable()')))) is distinct from 'dacd5e6ffeb2199d65dc8b6c620c400e' then raise exception 'rollback_wrong_order_or_function_drift: inquiry_events_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_lead(text,text)')))) is distinct from '97133b0bb513e7d7bcb4bba9fb27ab9b' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_lead'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.inquiry_lead_json(tenant_leads)')))) is distinct from '397f3b0474e586166054acce8ceec437' then raise exception 'rollback_wrong_order_or_function_drift: inquiry_lead_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.after_tenant_lead_capture(text,text)')))) is distinct from '1a3a41535d5cfbfed7c3a4a95df3661c' then raise exception 'rollback_wrong_order_or_function_drift: after_tenant_lead_capture'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.hold_tenant_lead_as_spam(text,jsonb)')))) is distinct from 'da0921240c36d38c2465710ea5e86b79' then raise exception 'rollback_wrong_order_or_function_drift: hold_tenant_lead_as_spam'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.inquiry_assert_member(uuid,uuid,text)')))) is distinct from 'a62ba25a3bbefa511b4b9779217028cb' then raise exception 'rollback_wrong_order_or_function_drift: inquiry_assert_member'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_inquiry_events(uuid,uuid,text,uuid)')))) is distinct from '8979b05618f83a7d6782a3b5be81df6d' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_inquiry_events'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.decide_held_workspace_lead(uuid,uuid,text,uuid,text)')))) is distinct from 'c471610bf4d911547617dd2bffe09dd6' then raise exception 'rollback_wrong_order_or_function_drift: decide_held_workspace_lead'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_lead_digests(text,timestamp with time zone)')))) is distinct from '46225f630b13f5786732a520c4ffcb0a' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_lead_digests'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_leads(text,integer,timestamp with time zone)')))) is distinct from 'a296a367fa037f251204ca88dca71ea8' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_leads'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_inquiry_event(text,text,text,text,text,jsonb,text)')))) is distinct from '39c42074be9e7b4d9e85cdb277adb827' then raise exception 'rollback_wrong_order_or_function_drift: record_inquiry_event'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.inquiry_event_write(uuid,uuid,text,text,text,text,jsonb,text)')))) is distinct from '5218abc4eaad72a8d660a51f7f31b56b' then raise exception 'rollback_wrong_order_or_function_drift: inquiry_event_write'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_leads(uuid,uuid,text,text[],integer,timestamp with time zone)')))) is distinct from 'd65acc5b452bd28f3d0a85c93bcc2e6a' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_leads'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.inquiry_events') and attnum>0 and not attisdropped) <> 10 then raise exception 'rollback_wrong_order_or_table_drift: inquiry_events'; end if;
end;
$rollback_guard$;
lock table public."inquiry_events", public."tenant_leads" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009113000_inquiry_events" as table public."inquiry_events";
revoke all on release_rollback_archive."m20261009113000_inquiry_events" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009113000_tenant_leads" as table public."tenant_leads";
revoke all on release_rollback_archive."m20261009113000_tenant_leads" from public, anon, authenticated, service_role;
-- Preserve 1.0-only rows before restoring the earlier constraints.
delete from public.tenant_leads where recorded_via = 'spam_hold';
drop trigger "inquiry_events_immutable" on public."inquiry_events";
alter table public."tenant_leads" drop constraint "tenant_leads_spam_hold_held";
alter table public."tenant_leads" drop constraint "tenant_leads_contact_id_fkey";
alter table public."tenant_leads" drop constraint "tenant_leads_held_reason_check";
alter table public."tenant_leads" drop constraint "tenant_leads_intake_state_check";
alter table public."tenant_leads" drop constraint "tenant_leads_recorded_via_check";
drop index public."tenant_leads_workspace_state_idx";
alter table public."tenant_leads" drop column "contact_id";
alter table public."tenant_leads" drop column "held_reason";
alter table public."tenant_leads" drop column "intake_state";
alter table public."tenant_leads" drop column "intake_state_at";
alter table public."inquiry_events" drop constraint "inquiry_events_kind_check";
alter table public."inquiry_events" drop constraint "inquiry_events_actor_check";
alter table public."inquiry_events" drop constraint "inquiry_events_detail_check";
alter table public."inquiry_events" drop constraint "inquiry_events_lead_id_check";
alter table public."inquiry_events" drop constraint "inquiry_events_actor_id_check";
alter table public."inquiry_events" drop constraint "inquiry_events_dedupe_key_check";
drop function public.inquiry_events_immutable();
drop function public.inquiry_lead_json(tenant_leads);
drop function public.after_tenant_lead_capture(text,text);
drop function public.hold_tenant_lead_as_spam(text,jsonb);
drop function public.inquiry_assert_member(uuid,uuid,text);
drop function public.read_workspace_inquiry_events(uuid,uuid,text,uuid);
drop function public.decide_held_workspace_lead(uuid,uuid,text,uuid,text);
drop function public.record_inquiry_event(text,text,text,text,text,jsonb,text);
drop function public.inquiry_event_write(uuid,uuid,text,text,text,text,jsonb,text);
drop function public.read_workspace_leads(uuid,uuid,text,text[],integer,timestamp with time zone);
drop table public."inquiry_events";
CREATE OR REPLACE FUNCTION public.read_tenant_lead(p_tenant_id text, p_lead_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
revoke all on function public.read_tenant_lead(text,text) from public, anon, authenticated, service_role;
grant execute on function public.read_tenant_lead(text,text) to "service_role";
CREATE OR REPLACE FUNCTION public.read_tenant_lead_digests(p_tenant_id text, p_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
revoke all on function public.read_tenant_lead_digests(text,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.read_tenant_lead_digests(text,timestamp with time zone) to "service_role";
CREATE OR REPLACE FUNCTION public.read_tenant_leads(p_tenant_id text, p_limit integer, p_before timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stable uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  if p_tenant_id is not null then
    select stable_id into v_stable from public.tenants where id = p_tenant_id;
    if v_stable is null then return '[]'::jsonb; end if;
  end if;
  return coalesce((
    select jsonb_agg(item order by item->>'capturedAt' desc, item->>'id' desc)
    from (
      select jsonb_build_object(
        'id', l.id,
        'tenantId', coalesce(t.id, l.tenant_slug_at_capture),
        'tenantStableId', l.tenant_stable_id,
        'siteName', coalesce(t.site_name, l.site_name_at_delete),
        'tenantSlugAtCapture', l.tenant_slug_at_capture,
        'workspaceId', l.workspace_id,
        'leadId', l.lead_id,
        'name', l.name,
        'email', l.email,
        'message', l.message,
        'source', l.source,
        'fields', l.fields,
        'capabilityId', l.capability_id,
        'capabilityVersion', l.capability_version,
        'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedAt', to_char(l.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedVia', l.recorded_via,
        'tenantDeletedAt', case when l.tenant_deleted_at is null then null
          else to_char(l.tenant_deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'retainUntil', case when l.retain_until is null then null
          else to_char(l.retain_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) as item
      from public.tenant_leads l
      left join public.tenants t on t.stable_id = l.tenant_stable_id
      where (v_stable is null or l.tenant_stable_id = v_stable)
        and (p_before is null or l.captured_at < p_before)
      order by l.captured_at desc, l.id desc
      limit v_limit
    ) page
  ), '[]'::jsonb);
end;
$function$
;
revoke all on function public.read_tenant_leads(text,integer,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.read_tenant_leads(text,integer,timestamp with time zone) to "service_role";
alter table public."tenant_leads" add constraint "tenant_leads_recorded_via_check" CHECK ((recorded_via = ANY (ARRAY['dual_write'::text, 'repair'::text, 'backfill'::text, 'connected_site'::text])));
commit;
