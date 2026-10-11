-- #251: eleven platform-wide support readers composed with an atomic access log.
-- The underlying snapshot/READ ONLY APIs and their ACLs remain unchanged.
-- Local source preparation only; no production authority or retention policy.
begin;
set local lock_timeout = '3s';

-- Reapply accepts only the captured installed or disabled contract. An alien
-- same-name table/function is drift, not permission to reuse or overwrite it.
do $$
declare contract record;
begin
  if to_regclass('public.platform_operator_read_audit') is not null then
    if to_regclass('release_rollback_baseline.platform_operator_read_audit') is null then
      raise exception 'platform_operator_read_audit_preexisting_object';
    end if;
    perform public.platform_operator_read_audit_check_roles();
    select * into contract from release_rollback_baseline.platform_operator_read_audit where singleton;
    if not found or contract.helper_hash is distinct from md5(pg_get_functiondef('public.platform_operator_read_audit_fingerprint()'::regprocedure))
      or public.platform_operator_read_audit_fingerprint() not in (contract.active_contract,contract.disabled_contract) then
      raise exception 'platform_operator_read_audit_contract_drift';
    end if;
  elsif to_regclass('release_rollback_baseline.platform_operator_read_audit') is not null
    or to_regprocedure('public.read_audited_platform_operator_source(uuid,text,text)') is not null
    or to_regprocedure('public.platform_operator_read_audit_immutable()') is not null
    or to_regprocedure('public.platform_operator_read_audit_fingerprint()') is not null
    or to_regprocedure('public.platform_operator_read_audit_check_roles()') is not null
    or to_regprocedure('public.platform_operator_read_actor(uuid,text,text)') is not null
    or to_regprocedure('public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer)') is not null
    or to_regprocedure('public.authorize_platform_operator_read(uuid,text,text)') is not null then
    raise exception 'platform_operator_read_audit_preexisting_object';
  end if;
end;
$$;

create table if not exists public.platform_operator_read_audit (
  id uuid primary key default gen_random_uuid(),
  -- Retain the actor identity after account deletion without blocking deletion.
  actor_user_id uuid not null,
  reader_name text not null check (reader_name in (
    'read_catalog_tool_notice_failures', 'read_catalog_tool_contact_conflicts',
    'read_catalog_report_failures', 'read_operator_google_uncertainty',
    'read_operator_queue_context_v2', 'read_effort_businesses',
    'read_business_effort', 'read_outside_write_receipts',
    'read_google_listing_readback_failures', 'read_google_listing_readback_failures_v2',
    'read_operator_queue_context',
    'admin.clients.read','admin.accounts.read','admin.analytics.read','admin.audit.read','admin.actions.read','admin.drafts.read','admin.digests.read','admin.leads.read','admin.uptime.read','admin.ops.read','admin.pay-links.read','admin.client-leads.read','admin.tenant-controls.read','admin.component-registry.read','admin.make-real.read','admin.booking-email.read','admin.owner-decisions.read'
  )),
  scope text not null default 'platform' check (scope = 'platform'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.platform_operator_read_audit enable row level security;
revoke all on public.platform_operator_read_audit from public, anon, authenticated, service_role;

create or replace function public.platform_operator_read_audit_immutable() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'platform_operator_read_audit_immutable';
end;
$$;
revoke all on function public.platform_operator_read_audit_immutable() from public, anon, authenticated, service_role;
do $$
begin
  if not exists(select 1 from pg_trigger where tgrelid='public.platform_operator_read_audit'::regclass and tgname='platform_operator_read_audit_rows_immutable') then
    create trigger platform_operator_read_audit_rows_immutable before update or delete on public.platform_operator_read_audit
      for each row execute function public.platform_operator_read_audit_immutable();
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.platform_operator_read_audit'::regclass and tgname='platform_operator_read_audit_truncate_immutable') then
    create trigger platform_operator_read_audit_truncate_immutable before truncate on public.platform_operator_read_audit
      for each statement execute function public.platform_operator_read_audit_immutable();
  end if;
end;
$$;

create or replace function public.platform_operator_read_actor(p_user_id uuid,p_verified_email text,p_reader_name text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
  if not found then raise exception 'platform_operator_read_access_denied'; end if;
  perform 1 from public.super_admins where user_id=p_user_id and revoked_at is null for share;
  if not found then raise exception 'platform_operator_read_access_denied'; end if;
  if p_reader_name is null or p_reader_name not in (
    'read_catalog_tool_notice_failures','read_catalog_tool_contact_conflicts','read_catalog_report_failures',
    'read_operator_google_uncertainty','read_operator_queue_context_v2','read_effort_businesses',
    'read_business_effort','read_outside_write_receipts','read_google_listing_readback_failures',
    'read_google_listing_readback_failures_v2','read_operator_queue_context',
    'admin.clients.read','admin.accounts.read','admin.analytics.read','admin.audit.read','admin.actions.read','admin.drafts.read','admin.digests.read','admin.leads.read','admin.uptime.read','admin.ops.read','admin.pay-links.read','admin.client-leads.read','admin.tenant-controls.read','admin.component-registry.read','admin.make-real.read','admin.booking-email.read','admin.owner-decisions.read'
  ) then raise exception 'platform_operator_read_invalid'; end if;
  insert into public.platform_operator_read_audit(actor_user_id,reader_name) values(p_user_id,p_reader_name);
end;
$$;
revoke all on function public.platform_operator_read_actor(uuid,text,text) from public,anon,authenticated,service_role;

create or replace function public.read_audited_platform_operator_source(
  p_user_id uuid, p_verified_email text, p_reader_name text
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_reader_name is null or p_reader_name not in (
    'read_catalog_tool_notice_failures', 'read_catalog_tool_contact_conflicts',
    'read_catalog_report_failures', 'read_operator_google_uncertainty',
    'read_operator_queue_context_v2', 'read_effort_businesses'
  ) then raise exception 'platform_operator_read_invalid'; end if;

  perform public.platform_operator_read_actor(p_user_id,p_verified_email,p_reader_name);
  -- No dynamic SQL, caller-selected arguments, tenant wildcard or PII payload.
  -- A read/audit failure rolls back the log and releases no result to the app.
  case p_reader_name
    when 'read_catalog_tool_notice_failures' then return public.read_catalog_tool_notice_failures(p_user_id,p_verified_email);
    when 'read_catalog_tool_contact_conflicts' then return public.read_catalog_tool_contact_conflicts(p_user_id,p_verified_email);
    when 'read_catalog_report_failures' then return public.read_catalog_report_failures(p_user_id,p_verified_email);
    when 'read_operator_google_uncertainty' then return public.read_operator_google_uncertainty(p_user_id,p_verified_email);
    when 'read_operator_queue_context_v2' then return public.read_operator_queue_context_v2(p_user_id,p_verified_email);
    when 'read_effort_businesses' then return public.read_effort_businesses(p_user_id,p_verified_email);
  end case;
end;
$$;
revoke all on function public.read_audited_platform_operator_source(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.read_audited_platform_operator_source(uuid,text,text) to service_role;

-- Filtered companions use typed parameters and their unchanged underlying
-- validation, clamping and defaults. Filter values never enter the audit event.
create or replace function public.read_audited_platform_operator_detail(
  p_user_id uuid,p_verified_email text,p_reader_name text,
  p_from date default null,p_business_id uuid default null,p_tenant_id text default null,
  p_workspace_id uuid default null,p_limit integer default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_reader_name is null or p_reader_name not in (
    'read_business_effort','read_outside_write_receipts','read_google_listing_readback_failures',
    'read_google_listing_readback_failures_v2','read_operator_queue_context'
  ) then raise exception 'platform_operator_read_invalid'; end if;
  perform public.platform_operator_read_actor(p_user_id,p_verified_email,p_reader_name);
  case p_reader_name
    when 'read_business_effort' then return public.read_business_effort(p_user_id,p_verified_email,p_from,p_business_id);
    when 'read_outside_write_receipts' then return public.read_outside_write_receipts(p_user_id,p_verified_email,p_tenant_id,p_workspace_id,p_limit);
    when 'read_google_listing_readback_failures' then return public.read_google_listing_readback_failures(p_user_id,p_verified_email,p_limit);
    when 'read_google_listing_readback_failures_v2' then return public.read_google_listing_readback_failures_v2(p_user_id,p_verified_email);
    when 'read_operator_queue_context' then return public.read_operator_queue_context(p_user_id,p_verified_email);
  end case;
end;
$$;
revoke all on function public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer) to service_role;

-- App-edge admission precedes a separate downstream read transaction. This
-- records an admitted support read attempt, not atomic read-result disclosure.
create or replace function public.authorize_platform_operator_read(p_user_id uuid,p_verified_email text,p_reader_name text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_reader_name is null or p_reader_name not in ('admin.clients.read','admin.accounts.read','admin.analytics.read','admin.audit.read','admin.actions.read','admin.drafts.read','admin.digests.read','admin.leads.read','admin.uptime.read','admin.ops.read','admin.pay-links.read','admin.client-leads.read','admin.tenant-controls.read','admin.component-registry.read','admin.make-real.read','admin.booking-email.read','admin.owner-decisions.read') then
    raise exception 'platform_operator_read_invalid';
  end if;
  perform public.platform_operator_read_actor(p_user_id,p_verified_email,p_reader_name);
end;
$$;
revoke all on function public.authorize_platform_operator_read(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.authorize_platform_operator_read(uuid,text,text) to service_role;

-- No hidden service/browser role path may alter or expose this private log.
-- All membership edges are considered, including NOINHERIT, SET and ADMIN;
-- conservatively refuse an escalation path instead of rewriting any role.
create or replace function public.platform_operator_read_audit_check_roles() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare reachable record; target regclass;
begin
  for reachable in
    with recursive role_paths(root_name,role_id) as (
      select rolname,oid from pg_roles where rolname in ('anon','authenticated','service_role')
      union
      select p.root_name,m.roleid from role_paths p join pg_auth_members m on m.member=p.role_id
    ) select p.root_name,r.* from role_paths p join pg_roles r on r.oid=p.role_id
  loop
    if reachable.rolsuper or reachable.rolcreaterole then
      raise exception 'platform_operator_read_audit_role_path' using errcode='42501';
    end if;
    foreach target in array array['public.platform_operator_read_audit'::regclass,'release_rollback_baseline.platform_operator_read_audit'::regclass] loop
      if reachable.oid=(select relowner from pg_class where oid=target)
        or has_table_privilege(reachable.oid,target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(reachable.oid,target,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'platform_operator_read_audit_role_path' using errcode='42501';
      end if;
    end loop;
    if reachable.oid in (select proowner from pg_proc where pronamespace='public'::regnamespace and ((proname in ('read_audited_platform_operator_source','authorize_platform_operator_read','platform_operator_read_actor') and oidvectortypes(proargtypes)='uuid, text, text')
      or (proname='read_audited_platform_operator_detail' and oidvectortypes(proargtypes)='uuid, text, text, date, uuid, text, uuid, integer')
      or (proname in ('platform_operator_read_audit_immutable','platform_operator_read_audit_fingerprint','platform_operator_read_audit_check_roles') and pronargs=0)))
      or has_function_privilege(reachable.oid,(select oid from pg_proc where pronamespace='public'::regnamespace and proname='platform_operator_read_actor' and oidvectortypes(proargtypes)='uuid, text, text'),'EXECUTE')
      or has_function_privilege(reachable.oid,'public.platform_operator_read_audit_immutable()','EXECUTE')
      or has_function_privilege(reachable.oid,'public.platform_operator_read_audit_fingerprint()','EXECUTE')
      or has_function_privilege(reachable.oid,'public.platform_operator_read_audit_check_roles()','EXECUTE')
      or (reachable.root_name<>'service_role' and has_function_privilege(reachable.oid,(select oid from pg_proc where pronamespace='public'::regnamespace and proname='read_audited_platform_operator_source' and oidvectortypes(proargtypes)='uuid, text, text'),'EXECUTE'))
      or (reachable.root_name<>'service_role' and has_function_privilege(reachable.oid,(select oid from pg_proc where pronamespace='public'::regnamespace and proname='authorize_platform_operator_read' and oidvectortypes(proargtypes)='uuid, text, text'),'EXECUTE'))
      or (reachable.root_name<>'service_role' and has_function_privilege(reachable.oid,(select oid from pg_proc where pronamespace='public'::regnamespace and proname='read_audited_platform_operator_detail' and oidvectortypes(proargtypes)='uuid, text, text, date, uuid, text, uuid, integer'),'EXECUTE')) then
      raise exception 'platform_operator_read_audit_role_path' using errcode='42501';
    end if;
  end loop;
end;
$$;
revoke all on function public.platform_operator_read_audit_check_roles() from public,anon,authenticated,service_role;
-- Private source contract, independent of data rows, for retaining reversal.
create or replace function public.platform_operator_read_audit_fingerprint() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'table', (select jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity) from pg_class where oid='public.platform_operator_read_audit'::regclass),
    'columns', (select jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid='public.platform_operator_read_audit'::regclass and a.attnum>0 and not a.attisdropped),
    'constraints', (select jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) order by conname) from pg_constraint where conrelid='public.platform_operator_read_audit'::regclass),
    'indexes', (select jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text) from pg_index where indrelid='public.platform_operator_read_audit'::regclass),
    'triggers', (select jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) order by tgname) from pg_trigger where tgrelid='public.platform_operator_read_audit'::regclass and not tgisinternal),
    'functions', (select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proowner,p.proacl,pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p
      where p.pronamespace='public'::regnamespace and ((p.proname in ('read_audited_platform_operator_source','authorize_platform_operator_read','platform_operator_read_actor') and oidvectortypes(p.proargtypes)='uuid, text, text') or (p.proname='read_audited_platform_operator_detail' and oidvectortypes(p.proargtypes)='uuid, text, text, date, uuid, text, uuid, integer') or (p.proname in ('platform_operator_read_audit_immutable','platform_operator_read_audit_fingerprint','platform_operator_read_audit_check_roles') and p.pronargs=0)))
  )
$$;
revoke all on function public.platform_operator_read_audit_fingerprint() from public,anon,authenticated,service_role;
create table if not exists release_rollback_baseline.platform_operator_read_audit (
  singleton boolean primary key check(singleton), helper_hash text not null,
  active_contract jsonb not null, disabled_contract jsonb not null
);
revoke all on release_rollback_baseline.platform_operator_read_audit from public,anon,authenticated,service_role;
select public.platform_operator_read_audit_check_roles();
do $$
declare active jsonb; disabled jsonb; contract record;
begin
  active := public.platform_operator_read_audit_fingerprint();
  revoke all on function public.read_audited_platform_operator_source(uuid,text,text) from service_role;
  revoke all on function public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer) from service_role;
  revoke all on function public.authorize_platform_operator_read(uuid,text,text) from service_role;
  disabled := public.platform_operator_read_audit_fingerprint();
  grant execute on function public.read_audited_platform_operator_source(uuid,text,text) to service_role;
  grant execute on function public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer) to service_role;
  grant execute on function public.authorize_platform_operator_read(uuid,text,text) to service_role;
  select * into contract from release_rollback_baseline.platform_operator_read_audit where singleton;
  if found then
    if contract.active_contract is distinct from active or contract.disabled_contract is distinct from disabled then
      raise exception 'platform_operator_read_audit_contract_drift';
    end if;
  else
    insert into release_rollback_baseline.platform_operator_read_audit values(true,
      md5(pg_get_functiondef('public.platform_operator_read_audit_fingerprint()'::regprocedure)),active,disabled);
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
