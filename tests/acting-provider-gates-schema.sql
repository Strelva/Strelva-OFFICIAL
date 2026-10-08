\set ON_ERROR_STOP on
-- Client-resource mandates and the acting-provider gates (20261014100000,
-- 20261014112000; agency 1.0 #255, #534). Fictional rows on an isolated
-- cluster, inside a transaction that is rolled back.
--
-- For every effect the same matrix: a stranger, a platform operator who is
-- only a direct admin (the old super_admins path), an agency member not on
-- the client, another agency, an unverified agency, a revoked verification,
-- a missing or ended mandate, a removed staff row, a person who left the
-- agency, and Strelva's own agency, which passes or fails exactly like any
-- other. The owner path of every gate is unchanged.
begin;
create or replace function pg_temp.ap_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'acting provider assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ap_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got % (%)', expected, sqlerrm, statement; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
-- The agency, or the reason, acting_provider gives.
create or replace function pg_temp.ap(p_ws uuid, p_user uuid, p_effect text, p_kind text, p_ref text) returns text language plpgsql as $$
declare r record;
begin
  select * into r from public.acting_provider_check(p_ws, p_user, p_effect, p_kind, p_ref);
  return coalesce(r.agency_workspace_id::text, r.reason);
end; $$;
create or replace function pg_temp.verify(p_agency uuid, p_effect text, p_status text) returns void language sql as $$
  select public.record_agency_verification('ap-operator@strelva.example.test', p_agency, p_effect, p_status,
    case when p_status = 'verified' then '{"fixture": true}'::jsonb else '{}'::jsonb end,
    case when p_status = 'unverified' then 'Fixture revocation.' end);
  select null::void;
$$;

-- ---- privileges ----
select pg_temp.ap_assert((select relrowsecurity from pg_class where oid = 'public.client_resource_mandates'::regclass)
  and not has_table_privilege('service_role', 'public.client_resource_mandates', 'select')
  and not has_table_privilege('authenticated', 'public.client_resource_mandates', 'insert'), 'mandates: rls on, no table access');
select pg_temp.ap_assert(
  not has_function_privilege('service_role', 'public.acting_provider(uuid,uuid,text,text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.acting_provider_check(uuid,uuid,text,text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.acting_provider_assert(uuid,uuid,text,text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.platform_provider_for_resource(uuid,uuid,text,text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.needs_you_provider_id(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.assert_acting_provider(uuid,uuid,text,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.provider_email_send_allowed(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.grant_client_resource_mandate(uuid,text,uuid,uuid,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.record_conversion_resource_mandate(text,uuid,uuid,text,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.end_client_resource_mandate(uuid,text,uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.read_client_resource_mandates(uuid,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.read_agency_google_listing_readback_failures(uuid,text,uuid,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.assert_acting_provider(uuid,uuid,text,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.grant_client_resource_mandate(uuid,text,uuid,uuid,text,text,text)', 'execute'),
  'the predicate is internal; the app gets the assert, the email gate and the commands');
-- No gate that serves a client reads super_admins any more.
select pg_temp.ap_assert(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('website_document_launch_authority', 'authorize_website_domain_change', 'record_website_change_receipt',
      'workspace_make_systems_authority', 'set_decision_policy', 'read_decision_policies', 'claim_owner_decision',
      'escalate_owner_decision', 'list_owner_decisions', 'read_strelva_handled', 'prepare_website_domain_request',
      'claim_native_website_fact_review', 'read_catalog_report_receipts')
    and (p.prosrc ~ 'super_admins' or p.prosrc ~ 'needs_you_operator_id')),
  'no super_admins branch in a client-serving gate');
select pg_temp.ap_assert(
  public.client_resource_ref('domain', ' WWW.Example.TEST ') = 'www.example.test'
  and public.client_resource_ref('domain', 'not a host') is null
  and public.client_resource_ref('payment_account', 'acct_1Abc') = 'acct_1Abc'
  and public.client_resource_ref('payment_account', 'cus_1') is null
  and public.client_resource_ref('google_location', '../x') is null
  and public.client_resource_kinds('google') = array['google_location'],
  'one spelling per resource kind');

-- ---- fixture ----
insert into public.users(id, email, verified_at) values
  ('ac7e0000-0000-4000-8000-000000000001', 'ap-owner@example.test', now()),
  ('ac7e0000-0000-4000-8000-000000000002', 'ap-a-admin@agency-a.example.test', now()),
  ('ac7e0000-0000-4000-8000-000000000003', 'ap-a-staff@agency-a.example.test', now()),
  ('ac7e0000-0000-4000-8000-000000000004', 'ap-a-unstaffed@agency-a.example.test', now()),
  ('ac7e0000-0000-4000-8000-000000000005', 'ap-b-staff@agency-b.example.test', now()),
  ('ac7e0000-0000-4000-8000-000000000006', 'ap-stranger@example.test', now()),
  ('ac7e0000-0000-4000-8000-000000000007', 'ap-operator@strelva.example.test', now()),
  ('ac7e0000-0000-4000-8000-000000000008', 'ap-s-staff@strelva.example.test', now()),
  ('ac7e0000-0000-4000-8000-000000000009', 'ap-other-owner@example.test', now()),
  ('ac7e0000-0000-4000-8000-00000000000a', 'ap-a-leaver@agency-a.example.test', now());
-- The operator is a platform operator AND a direct admin of the client, the
-- shape conversion left behind. Strelva's staff member is an operator too.
insert into public.super_admins(user_id, email) values
  ('ac7e0000-0000-4000-8000-000000000007', 'ap-operator@strelva.example.test'),
  ('ac7e0000-0000-4000-8000-000000000008', 'ap-s-staff@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('ac7e0000-0000-4000-8000-000000000010', 'customer', 'Acting Client', 'ac7e0000-0000-4000-8000-000000000001'),
  ('ac7e0000-0000-4000-8000-000000000011', 'customer', 'Other Client', 'ac7e0000-0000-4000-8000-000000000009'),
  ('ac7e0000-0000-4000-8000-000000000012', 'customer', 'Converted Client', 'ac7e0000-0000-4000-8000-000000000007'),
  ('ac7e0000-0000-4000-8000-000000000020', 'agency', 'Agency A', 'ac7e0000-0000-4000-8000-000000000002'),
  ('ac7e0000-0000-4000-8000-000000000030', 'agency', 'Agency B', 'ac7e0000-0000-4000-8000-000000000005'),
  ('ac7e0000-0000-4000-8000-000000000040', 'agency', 'Strelva Agency', 'ac7e0000-0000-4000-8000-000000000008');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('ac7e0000-0000-4000-8000-000000000010', 'ac7e0000-0000-4000-8000-000000000001', 'owner', 'ac7e0000-0000-4000-8000-000000000001'),
  ('ac7e0000-0000-4000-8000-000000000010', 'ac7e0000-0000-4000-8000-000000000007', 'admin', 'ac7e0000-0000-4000-8000-000000000001'),
  ('ac7e0000-0000-4000-8000-000000000011', 'ac7e0000-0000-4000-8000-000000000009', 'owner', 'ac7e0000-0000-4000-8000-000000000009'),
  ('ac7e0000-0000-4000-8000-000000000012', 'ac7e0000-0000-4000-8000-000000000007', 'admin', 'ac7e0000-0000-4000-8000-000000000007'),
  ('ac7e0000-0000-4000-8000-000000000020', 'ac7e0000-0000-4000-8000-000000000002', 'owner', 'ac7e0000-0000-4000-8000-000000000002'),
  ('ac7e0000-0000-4000-8000-000000000020', 'ac7e0000-0000-4000-8000-000000000003', 'member', 'ac7e0000-0000-4000-8000-000000000002'),
  ('ac7e0000-0000-4000-8000-000000000020', 'ac7e0000-0000-4000-8000-000000000004', 'member', 'ac7e0000-0000-4000-8000-000000000002'),
  ('ac7e0000-0000-4000-8000-000000000020', 'ac7e0000-0000-4000-8000-00000000000a', 'member', 'ac7e0000-0000-4000-8000-000000000002'),
  ('ac7e0000-0000-4000-8000-000000000030', 'ac7e0000-0000-4000-8000-000000000005', 'owner', 'ac7e0000-0000-4000-8000-000000000005'),
  ('ac7e0000-0000-4000-8000-000000000040', 'ac7e0000-0000-4000-8000-000000000008', 'owner', 'ac7e0000-0000-4000-8000-000000000008');
insert into public.strelva_agency_workspace(workspace_id, designated_by)
  select 'ac7e0000-0000-4000-8000-000000000040', 'ac7e0000-0000-4000-8000-000000000007'
  where not exists (select 1 from public.strelva_agency_workspace);

do $$
declare
  owner_id uuid := 'ac7e0000-0000-4000-8000-000000000001';
  a_admin uuid := 'ac7e0000-0000-4000-8000-000000000002';
  a_staff uuid := 'ac7e0000-0000-4000-8000-000000000003';
  a_unstaffed uuid := 'ac7e0000-0000-4000-8000-000000000004';
  b_staff uuid := 'ac7e0000-0000-4000-8000-000000000005';
  stranger uuid := 'ac7e0000-0000-4000-8000-000000000006';
  operator_id uuid := 'ac7e0000-0000-4000-8000-000000000007';
  s_staff uuid := 'ac7e0000-0000-4000-8000-000000000008';
  other_owner uuid := 'ac7e0000-0000-4000-8000-000000000009';
  leaver uuid := 'ac7e0000-0000-4000-8000-00000000000a';
  ws uuid := 'ac7e0000-0000-4000-8000-000000000010';
  other_ws uuid := 'ac7e0000-0000-4000-8000-000000000011';
  converted uuid := 'ac7e0000-0000-4000-8000-000000000012';
  agency_a uuid := 'ac7e0000-0000-4000-8000-000000000020';
  agency_b uuid := 'ac7e0000-0000-4000-8000-000000000030';
  agency_s uuid := 'ac7e0000-0000-4000-8000-000000000040';
  work public.saved_product_work;
  site text;
  effect record;
  m jsonb;
  mandate_id uuid;
  result jsonb;
begin
  -- The owner chooses Agency A; Strelva's agency and Agency B hold their own seats.
  perform public.choose_business_provider(owner_id, 'ap-owner@example.test', ws, agency_a);
  insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
    values (ws, agency_s, 'owner', owner_id);
  perform public.choose_business_provider(other_owner, 'ap-other-owner@example.test', other_ws, agency_b);
  perform public.set_agency_client_staff(a_admin, 'ap-a-admin@agency-a.example.test', agency_a, ws, a_staff, true);
  perform public.set_agency_client_staff(a_admin, 'ap-a-admin@agency-a.example.test', agency_a, ws, leaver, true);
  perform public.set_agency_client_staff(s_staff, 'ap-s-staff@strelva.example.test', agency_s, ws, s_staff, true);
  perform public.set_agency_client_staff(b_staff, 'ap-b-staff@agency-b.example.test', agency_b, other_ws, b_staff, true);

  -- A website System of the business.
  select * into work from public.claim_website_rebuild(ws, owner_id, 'ap-owner@example.test', 'ap-request-one', 'acting-client.example.test',
    '{"url":"https://acting-client.example.test"}', jsonb_build_object('version', 2, 'revision', 0, 'title', 'Acting Client',
      'status', 'building', 'createdBy', owner_id, 'createdAt', '2026-10-07T10:00:00Z', 'history', '[]'::jsonb));
  site := public.system_origin_id(ws, 'saved_work', work.id::text)::text;

  -- ---- the predicate, every effect, the same matrix ----
  for effect in select * from (values
      ('publish', 'website', site),
      ('publish', 'domain', 'www.acting-client.example.test'),
      ('google', 'google_location', 'loc123'),
      ('email', 'sender', 'mail.agency-a.example.test'),
      ('payments', 'payment_account', 'acct_1ActingClient')) e(name, kind, ref)
  loop
    -- Publishing comes twice (website, domain): each row starts unverified.
    perform pg_temp.verify(agency_a, effect.name, 'unverified');
    perform pg_temp.verify(agency_s, effect.name, 'unverified');
    perform pg_temp.ap_assert(pg_temp.ap(ws, stranger, effect.name, effect.kind, effect.ref) = 'not_staffed', effect.name || ': a stranger');
    perform pg_temp.ap_assert(pg_temp.ap(ws, operator_id, effect.name, effect.kind, effect.ref) = 'not_staffed', effect.name || ': a platform operator who is only a direct admin');
    perform pg_temp.ap_assert(pg_temp.ap(ws, owner_id, effect.name, effect.kind, effect.ref) = 'not_staffed', effect.name || ': the owner is not a provider');
    perform pg_temp.ap_assert(pg_temp.ap(ws, a_unstaffed, effect.name, effect.kind, effect.ref) = 'not_staffed', effect.name || ': an agency member not on this client');
    perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, effect.name, effect.kind, effect.ref) = 'unverified', effect.name || ': staffed, agency unverified');
    perform pg_temp.verify(agency_a, effect.name, 'verified');
    perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, effect.name, effect.kind, effect.ref) = 'no_mandate', effect.name || ': verified, no mandate');
    m := public.grant_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, agency_a, effect.name, effect.kind, effect.ref);
    perform pg_temp.ap_assert(m->>'status' = 'active' and m->>'grantedByKind' = 'owner' and (m->>'replayed')::boolean = false
      and (m->>'granterIsAgencyMember')::boolean = false, effect.name || ': the owner grants');
    perform pg_temp.ap_assert((public.grant_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, agency_a, effect.name, effect.kind, effect.ref)->>'replayed')::boolean,
      effect.name || ': granting again replays');
    perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, effect.name, effect.kind, effect.ref) = agency_a::text, effect.name || ': seat, staff, verified, mandate');
    -- The mandate names one resource of one effect.
    perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, 'publish', 'domain', 'elsewhere.example.test') in ('no_mandate', 'unverified'), effect.name || ': another resource is not granted');
    -- Another agency, verified with its own mandate elsewhere, never acts here.
    perform pg_temp.verify(agency_b, effect.name, 'verified');
    perform public.grant_client_resource_mandate(other_owner, 'ap-other-owner@example.test', other_ws, agency_b, effect.name, effect.kind,
      case when effect.kind = 'website' then null else effect.ref end)
      from (select 1) x where effect.kind <> 'website';
    perform pg_temp.ap_assert(pg_temp.ap(ws, b_staff, effect.name, effect.kind, effect.ref) = 'not_staffed', effect.name || ': another agency');
    if effect.kind <> 'website' then
      perform pg_temp.ap_assert(pg_temp.ap(other_ws, b_staff, effect.name, effect.kind, effect.ref) = agency_b::text, effect.name || ': that agency on its own client');
      perform pg_temp.ap_assert(pg_temp.ap(other_ws, a_staff, effect.name, effect.kind, effect.ref) = 'not_staffed', effect.name || ': agency A on agency B''s client');
    end if;
    -- Revoking the verification stops the effect; verifying again restores it.
    perform pg_temp.verify(agency_a, effect.name, 'unverified');
    perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, effect.name, effect.kind, effect.ref) = 'unverified', effect.name || ': verification revoked');
    perform pg_temp.verify(agency_a, effect.name, 'verified');
    -- The owner ends the mandate; the history stays.
    mandate_id := (m->>'id')::uuid;
    result := public.end_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, mandate_id, null);
    perform pg_temp.ap_assert((result->>'ended')::boolean and result->>'endedByKind' = 'owner', effect.name || ': the owner ends it');
    perform pg_temp.ap_assert(not (public.end_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, mandate_id, null)->>'ended')::boolean,
      effect.name || ': ending again is a no-op');
    perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, effect.name, effect.kind, effect.ref) = 'no_mandate', effect.name || ': mandate ended');
    m := public.grant_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, agency_a, effect.name, effect.kind, effect.ref);
    perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, effect.name, effect.kind, effect.ref) = agency_a::text, effect.name || ': granted again');
    -- Strelva's agency: staffed and on a seat, but nothing more until it is
    -- verified and granted the same way. Being a platform operator adds nothing.
    perform pg_temp.ap_assert(pg_temp.ap(ws, s_staff, effect.name, effect.kind, effect.ref) = 'unverified', effect.name || ': Strelva''s agency unverified');
    perform pg_temp.verify(agency_s, effect.name, 'verified');
    perform pg_temp.ap_assert(pg_temp.ap(ws, s_staff, effect.name, effect.kind, effect.ref) = 'no_mandate', effect.name || ': Strelva''s agency has no mandate');
    perform public.grant_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, agency_s, effect.name, effect.kind, effect.ref);
    perform pg_temp.ap_assert(pg_temp.ap(ws, s_staff, effect.name, effect.kind, effect.ref) = agency_s::text, effect.name || ': Strelva''s agency, same path');
  end loop;
  perform pg_temp.ap_assert((select count(*) from public.client_resource_mandates where customer_workspace_id = ws and status = 'ended') = 5,
    'ended mandates stay as history');

  -- Removed staff and a person who leaves the agency.
  perform public.set_agency_client_staff(a_admin, 'ap-a-admin@agency-a.example.test', agency_a, ws, a_staff, false);
  perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, 'publish', 'website', site) = 'not_staffed', 'removed staff');
  perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, null, null, null) = 'not_staffed', 'removed staff: no seat-level access either');
  perform public.set_agency_client_staff(a_admin, 'ap-a-admin@agency-a.example.test', agency_a, ws, a_staff, true);
  perform pg_temp.ap_assert(pg_temp.ap(ws, a_staff, 'publish', 'website', site) = agency_a::text, 'staffed again');
  perform pg_temp.ap_assert(pg_temp.ap(ws, leaver, 'email', 'sender', 'mail.agency-a.example.test') = agency_a::text, 'the leaver, before leaving');
  delete from public.workspace_memberships where workspace_id = agency_a and user_id = leaver;
  perform pg_temp.ap_assert(pg_temp.ap(ws, leaver, 'email', 'sender', 'mail.agency-a.example.test') = 'not_staffed', 'left the agency');
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values (agency_a, leaver, 'member', a_admin);
  perform pg_temp.ap_assert(pg_temp.ap(ws, leaver, 'email', 'sender', 'mail.agency-a.example.test') = 'not_staffed', 'rejoining does not restore client access');

  -- Errors the app maps.
  perform pg_temp.ap_expect(format('select public.acting_provider_assert(%L, %L, %L, %L, %L)', ws, stranger, 'publish', 'website', site), 'acting_provider_not_staffed');
  perform pg_temp.ap_expect(format('select public.assert_acting_provider(%L, %L, %L, %L, %L, %L)', ws, a_staff, 'wrong@example.test', 'google', 'google_location', 'loc123'), 'acting_provider_not_staffed');
  perform pg_temp.ap_assert(public.assert_acting_provider(ws, a_staff, 'AP-A-Staff@agency-a.example.test', 'google', 'google_location', 'loc123') = agency_a, 'the app''s assert');
  perform pg_temp.ap_expect(format('select public.acting_provider_check(%L, %L, %L, %L, %L)', ws, a_staff, 'publish', 'google_location', 'loc123'), 'client_resource_mandate_invalid');
  perform pg_temp.ap_expect(format('select public.acting_provider_check(%L, %L, %L, %L, %L)', ws, a_staff, 'teleport', 'website', site), 'agency_effect_unknown');

  -- ---- mandate commands ----
  perform pg_temp.ap_expect(format('select public.grant_client_resource_mandate(%L, %L, %L, %L, %L, %L, %L)', a_admin, 'ap-a-admin@agency-a.example.test', ws, agency_a, 'email', 'sender', 'x.example.test'), 'provider_seat_owner_required');
  perform pg_temp.ap_expect(format('select public.grant_client_resource_mandate(%L, %L, %L, %L, %L, %L, %L)', owner_id, 'ap-owner@example.test', ws, agency_b, 'email', 'sender', 'x.example.test'), 'provider_seat_required');
  perform pg_temp.ap_expect(format('select public.grant_client_resource_mandate(%L, %L, %L, %L, %L, %L, %L)', owner_id, 'ap-owner@example.test', ws, agency_a, 'email', 'domain', 'x.example.test'), 'client_resource_mandate_invalid');
  perform pg_temp.ap_expect(format('select public.grant_client_resource_mandate(%L, %L, %L, %L, %L, %L, %L)', owner_id, 'ap-owner@example.test', ws, agency_a, 'publish', 'website', gen_random_uuid()), 'client_resource_mandate_invalid');
  m := public.grant_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, agency_a, 'email', 'sender', 'step-back.example.test');
  perform pg_temp.ap_expect(format('select public.end_client_resource_mandate(%L, %L, %L, %L, null)', stranger, 'ap-stranger@example.test', ws, m->>'id'), 'client_resource_mandate_access_denied');
  perform pg_temp.ap_expect(format('select public.end_client_resource_mandate(%L, %L, %L, %L, null)', a_staff, 'ap-a-staff@agency-a.example.test', ws, m->>'id'), 'client_resource_mandate_access_denied');
  perform pg_temp.ap_expect(format('select public.end_client_resource_mandate(%L, %L, %L, %L, null)', b_staff, 'ap-b-staff@agency-b.example.test', ws, m->>'id'), 'client_resource_mandate_access_denied');
  result := public.end_client_resource_mandate(a_admin, 'ap-a-admin@agency-a.example.test', ws, (m->>'id')::uuid, 'We no longer send for them.');
  perform pg_temp.ap_assert(result->>'endedByKind' = 'agency' and result->>'endReason' = 'We no longer send for them.', 'the agency steps back');
  perform pg_temp.ap_expect(format('update public.client_resource_mandates set resource_ref = %L where id = %L', 'other.example.test', m->>'id'), 'client_resource_mandate_immutable');
  perform pg_temp.ap_expect(format('delete from public.client_resource_mandates where id = %L', m->>'id'), 'client_resource_mandate_immutable');
  perform pg_temp.ap_expect(format($q$insert into public.client_resource_mandates(customer_workspace_id, agency_workspace_id, effect, resource_kind, resource_ref, granted_by_kind, granted_by, granter_is_agency_member) values (%L, %L, 'email', 'sender', 'x.example.test', 'owner', %L, false)$q$, other_ws, agency_a, other_owner), 'client_resource_mandate_invalid');
  -- Reads: the owner sees every agency's; an agency member sees its own; a stranger nothing.
  perform pg_temp.ap_assert(jsonb_array_length(public.read_client_resource_mandates(owner_id, 'ap-owner@example.test', ws))
    = (select count(*) from public.client_resource_mandates where customer_workspace_id = ws), 'the owner reads all, history included');
  perform pg_temp.ap_assert(not exists (select 1 from jsonb_array_elements(public.read_client_resource_mandates(a_unstaffed, 'ap-a-unstaffed@agency-a.example.test', ws)) x
    where x->>'agencyWorkspaceId' <> agency_a::text), 'an agency reads only its own');
  perform pg_temp.ap_expect(format('select public.read_client_resource_mandates(%L, %L, %L)', stranger, 'ap-stranger@example.test', ws), 'client_resource_mandate_access_denied');
  perform pg_temp.ap_expect(format('select public.read_client_resource_mandates(%L, %L, %L)', b_staff, 'ap-b-staff@agency-b.example.test', ws), 'client_resource_mandate_access_denied');

  -- ---- conversion: an operator records the client's existing mandate, on a
  -- conversion seat, only while the business has no owner ----
  insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
    values (converted, agency_s, 'conversion', operator_id), (converted, agency_a, 'owner', operator_id);
  perform pg_temp.ap_expect(format('select public.record_conversion_resource_mandate(%L, %L, %L, %L, %L, %L, %L)', 'ap-a-admin@agency-a.example.test', converted, agency_s, 'publish', 'domain', 'converted.example.test', 'Agreed in the 2025 service contract.'), 'tenant_conversion_operator_required');
  perform pg_temp.ap_expect(format('select public.record_conversion_resource_mandate(%L, %L, %L, %L, %L, %L, %L)', 'ap-operator@strelva.example.test', converted, agency_s, 'publish', 'domain', 'converted.example.test', ''), 'client_resource_mandate_invalid');
  perform pg_temp.ap_expect(format('select public.record_conversion_resource_mandate(%L, %L, %L, %L, %L, %L, %L)', 'ap-operator@strelva.example.test', converted, agency_a, 'publish', 'domain', 'converted.example.test', 'Contract.'), 'provider_seat_required');
  m := public.record_conversion_resource_mandate('ap-operator@strelva.example.test', converted, agency_s, 'publish', 'domain', 'converted.example.test', 'Agreed in the 2025 service contract.');
  perform pg_temp.ap_assert(m->>'grantedByKind' = 'conversion' and m->>'grantedBy' = operator_id::text and (m->>'granterIsAgencyMember')::boolean = false
    and m->>'grantNote' = 'Agreed in the 2025 service contract.', 'a conversion mandate names who recorded it and why');
  m := public.record_conversion_resource_mandate('ap-s-staff@strelva.example.test', converted, agency_s, 'email', 'sender', 'updates.strelva.com', 'Owner notices, per contract.');
  perform pg_temp.ap_assert((m->>'granterIsAgencyMember')::boolean, 'self-recording by the agency''s own operator is visible');
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values (converted, other_owner, 'owner', operator_id);
  perform pg_temp.ap_expect(format('select public.record_conversion_resource_mandate(%L, %L, %L, %L, %L, %L, %L)', 'ap-operator@strelva.example.test', converted, agency_s, 'google', 'google_location', 'loc9', 'Contract.'), 'client_resource_mandate_owner_decides');

  -- ---- ending the seat ends its mandates; a new seat starts with none ----
  perform pg_temp.ap_assert(pg_temp.ap(ws, s_staff, 'google', 'google_location', 'loc123') = agency_s::text, 'Strelva acts before its seat ends');
  perform public.end_provider_seat(owner_id, 'ap-owner@example.test', ws, agency_s, null);
  perform pg_temp.ap_assert(not exists (select 1 from public.client_resource_mandates where customer_workspace_id = ws and agency_workspace_id = agency_s and status = 'active')
    and exists (select 1 from public.client_resource_mandates where customer_workspace_id = ws and agency_workspace_id = agency_s and ended_by_kind = 'seat_ended'),
    'the seat''s mandates ended with it');
  insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by) values (ws, agency_s, 'owner', owner_id);
  perform public.set_agency_client_staff(s_staff, 'ap-s-staff@strelva.example.test', agency_s, ws, s_staff, true);
  perform pg_temp.ap_assert(pg_temp.ap(ws, s_staff, 'google', 'google_location', 'loc123') = 'no_mandate', 'a new seat starts with no mandate');
end $$;

-- ---- the gates ----
do $$
declare
  owner_id uuid := 'ac7e0000-0000-4000-8000-000000000001';
  a_admin uuid := 'ac7e0000-0000-4000-8000-000000000002';
  a_staff uuid := 'ac7e0000-0000-4000-8000-000000000003';
  a_unstaffed uuid := 'ac7e0000-0000-4000-8000-000000000004';
  stranger uuid := 'ac7e0000-0000-4000-8000-000000000006';
  operator_id uuid := 'ac7e0000-0000-4000-8000-000000000007';
  s_staff uuid := 'ac7e0000-0000-4000-8000-000000000008';
  ws uuid := 'ac7e0000-0000-4000-8000-000000000010';
  agency_a uuid := 'ac7e0000-0000-4000-8000-000000000020';
  agency_s uuid := 'ac7e0000-0000-4000-8000-000000000040';
  work public.saved_product_work;
  site text;
  doc jsonb := '{"version":2,"siteName":"Acting Client","nodes":{},"pages":[],"facts":{}}';
  h text := repeat('a', 64);
  rec jsonb;
  reserved text;
  mandate jsonb;
  item jsonb;
begin
  select * into work from public.saved_product_work where workspace_id = ws and product_id = 'websites' limit 1;
  site := public.system_origin_id(ws, 'saved_work', work.id::text)::text;

  -- Website launch. The agency drafts through its seat; the owner approves.
  perform public.append_website_document(ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 0, h, doc);
  perform public.approve_website_document(ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 1, h);
  perform pg_temp.ap_expect(format('select public.website_document_launch_authority(%L, %L, %L)', ws, work.id, a_staff), 'website_customer_approval_required');
  perform public.approve_website_document(ws, work.id, owner_id, 'ap-owner@example.test', 1, h);
  perform pg_temp.ap_expect(format('select public.reserve_website_hosted_tenant(%L, %L, %L, %L, 1, %L, %L)', ws, work.id, operator_id, 'ap-operator@strelva.example.test', h, 'acting-client'), 'workspace_access_denied');
  perform pg_temp.ap_expect(format('select public.reserve_website_hosted_tenant(%L, %L, %L, %L, 1, %L, %L)', ws, work.id, stranger, 'ap-stranger@example.test', h, 'acting-client'), 'workspace_access_denied');
  perform pg_temp.ap_expect(format('select public.reserve_website_hosted_tenant(%L, %L, %L, %L, 1, %L, %L)', ws, work.id, a_unstaffed, 'ap-a-unstaffed@agency-a.example.test', h, 'acting-client'), 'workspace_access_denied');
  -- Strelva's agency: on a seat and staffed, but no website mandate since its new seat.
  perform pg_temp.ap_expect(format('select public.reserve_website_hosted_tenant(%L, %L, %L, %L, 1, %L, %L)', ws, work.id, s_staff, 'ap-s-staff@strelva.example.test', h, 'acting-client'), 'acting_provider_no_mandate');
  perform pg_temp.verify(agency_a, 'publish', 'unverified');
  perform pg_temp.ap_expect(format('select public.reserve_website_hosted_tenant(%L, %L, %L, %L, 1, %L, %L)', ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', h, 'acting-client'), 'acting_provider_unverified');
  perform pg_temp.verify(agency_a, 'publish', 'verified');
  select r.tenant_id into reserved from public.reserve_website_hosted_tenant(ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 1, h, 'acting-client') r;
  perform pg_temp.ap_assert(reserved = 'acting-client', 'the acting provider reserves on the owner''s approval');
  perform pg_temp.ap_assert(not exists (select 1 from public.memberships where tenant_id = 'acting-client' and user_id in (a_staff, operator_id)),
    'the provider gains no tenant membership');
  rec := jsonb_build_object('status', 'published', 'provider', 'strelva-hosted', 'artifactHash', h, 'candidateRevision', 1,
    'receiptId', 'acting-client-receipt', 'providerUrl', 'https://acting-client.strelva.com', 'evidence', 'Fictional local publication',
    'publishedAt', '2026-10-07T10:00:00Z');
  -- The owner ends the website mandate mid-launch: publishing stops.
  mandate := (select public.client_resource_mandate_json(m) from public.client_resource_mandates m where m.customer_workspace_id = ws
    and m.agency_workspace_id = agency_a and m.resource_kind = 'website' and m.status = 'active');
  perform public.end_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, (mandate->>'id')::uuid, null);
  perform pg_temp.ap_expect(format('select public.publish_website_document(%L, %L, %L, %L, 1, %L, %L, %L)', ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', h, 'acting-client', rec), 'acting_provider_no_mandate');
  perform public.grant_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, agency_a, 'publish', 'website', site);
  perform public.publish_website_document(ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 1, h, 'acting-client', rec);
  perform pg_temp.ap_assert((select count(*) from public.read_published_website_documents('acting-client')) = 1, 'the acting provider publishes');
  -- The owner path is unchanged.
  perform pg_temp.ap_assert(public.website_document_launch_authority(ws, work.id, owner_id) = 'owner', 'owner launch authority');

  -- Domains: the owner approves the hostname; the provider needs the domain mandate too.
  perform public.approve_website_domain_change(ws, work.id, owner_id, 'ap-owner@example.test', 'acting-client', 'www.acting-client.example.test');
  perform pg_temp.ap_assert(public.authorize_website_domain_change(ws, work.id, owner_id, 'ap-owner@example.test', 'acting-client', 'anything.example.test', 'attach') = 'owner', 'owner domain path');
  perform pg_temp.ap_assert(public.authorize_website_domain_change(ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 'acting-client', 'www.acting-client.example.test', 'attach') = 'provider', 'provider on approval and mandate');
  perform public.approve_website_domain_change(ws, work.id, owner_id, 'ap-owner@example.test', 'acting-client', 'shop.acting-client.example.test');
  perform pg_temp.ap_expect(format('select public.authorize_website_domain_change(%L, %L, %L, %L, %L, %L, %L)', ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 'acting-client', 'shop.acting-client.example.test', 'attach'), 'acting_provider_no_mandate');
  perform pg_temp.ap_expect(format('select public.authorize_website_domain_change(%L, %L, %L, %L, %L, %L, %L)', ws, work.id, operator_id, 'ap-operator@strelva.example.test', 'acting-client', 'www.acting-client.example.test', 'attach'), 'website_tenant_access_denied');
  perform pg_temp.ap_expect(format('select public.authorize_website_domain_change(%L, %L, %L, %L, %L, %L, %L)', ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 'acting-client', 'not a host', 'attach'), 'website_domain_invalid');
  perform public.grant_client_resource_mandate(owner_id, 'ap-owner@example.test', ws, agency_a, 'publish', 'domain', 'other.acting-client.example.test');
  perform pg_temp.ap_expect(format('select public.authorize_website_domain_change(%L, %L, %L, %L, %L, %L, %L)', ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 'acting-client', 'other.acting-client.example.test', 'attach'), 'website_domain_owner_approval_required');
  perform pg_temp.verify(agency_a, 'publish', 'unverified');
  perform pg_temp.ap_expect(format('select public.authorize_website_domain_change(%L, %L, %L, %L, %L, %L, %L)', ws, work.id, a_staff, 'ap-a-staff@agency-a.example.test', 'acting-client', 'www.acting-client.example.test', 'attach'), 'acting_provider_unverified');
  perform pg_temp.verify(agency_a, 'publish', 'verified');

  -- Repo-change receipts: a preview needs the seat, a deploy the publish mandate.
  insert into public.service_requests(id, business_workspace_id, status, request_text, outcome, context, scope, provider_kind, created_by) values
    ('ac7e0000-0000-4000-8000-0000000000c1', ws, 'requested', 'Add a menu page', 'A menu page',
      jsonb_build_object('source', 'website_change', 'systemId', site, 'implementation', 'custom_repo'), array['website.repo_change'], 'strelva', owner_id);
  perform pg_temp.ap_expect(format($q$select public.record_website_change_receipt(%L, %L, %L, 'ac7e0000-0000-4000-8000-0000000000c1', 'preview', '{"previewUrl":"https://preview.example.test"}')$q$, ws, operator_id, 'ap-operator@strelva.example.test'), 'website_change_operator_required');
  perform pg_temp.ap_expect(format($q$select public.record_website_change_receipt(%L, %L, %L, 'ac7e0000-0000-4000-8000-0000000000c1', 'preview', '{"previewUrl":"https://preview.example.test"}')$q$, ws, stranger, 'ap-stranger@example.test'), 'website_change_access_denied');
  perform public.record_website_change_receipt(ws, a_staff, 'ap-a-staff@agency-a.example.test', 'ac7e0000-0000-4000-8000-0000000000c1', 'preview', '{"previewUrl":"https://preview.example.test"}');
  perform pg_temp.ap_expect(format($q$select public.record_website_change_receipt(%L, %L, %L, 'ac7e0000-0000-4000-8000-0000000000c1', 'approved', '{}')$q$, ws, a_staff, 'ap-a-staff@agency-a.example.test'), 'website_change_owner_required');
  perform public.record_website_change_receipt(ws, owner_id, 'ap-owner@example.test', 'ac7e0000-0000-4000-8000-0000000000c1', 'approved', '{}');
  perform pg_temp.verify(agency_a, 'publish', 'unverified');
  perform pg_temp.ap_expect(format($q$select public.record_website_change_receipt(%L, %L, %L, 'ac7e0000-0000-4000-8000-0000000000c1', 'deployed', '{"commitSha":"abc1234","deploymentUrl":"https://x.vercel.app","readBack":"confirmed"}')$q$, ws, a_staff, 'ap-a-staff@agency-a.example.test'), 'acting_provider_unverified');
  perform pg_temp.verify(agency_a, 'publish', 'verified');
  perform public.record_website_change_receipt(ws, a_staff, 'ap-a-staff@agency-a.example.test', 'ac7e0000-0000-4000-8000-0000000000c1', 'deployed', '{"commitSha":"abc1234","deploymentUrl":"https://x.vercel.app","readBack":"confirmed"}');
  perform pg_temp.ap_assert(jsonb_array_length(public.list_website_change_requests(ws, a_staff, 'ap-a-staff@agency-a.example.test', site::uuid)) = 1,
    'the provider reads the request through its seat');

  -- Making Systems: the seat, never super_admins.
  perform pg_temp.ap_assert(public.workspace_make_systems_authority(ws, a_staff) = 'provider', 'acting provider makes Systems');
  perform pg_temp.ap_assert(public.workspace_make_systems_authority(ws, s_staff) = 'provider', 'Strelva''s agency makes Systems through its seat');
  perform pg_temp.ap_assert(public.workspace_make_systems_authority(ws, operator_id) = 'member', 'a platform operator who is a direct admin only uses tools');
  perform pg_temp.ap_assert(public.workspace_make_systems_authority(ws, owner_id) = 'member', 'the owner files a Request');
  perform pg_temp.ap_assert(public.workspace_make_systems_authority(ws, a_unstaffed) is null, 'an unstaffed agency member has no relationship');
  perform pg_temp.ap_assert(public.workspace_require_make_systems(ws, a_staff) = 'provider', 'require passes the provider');
  perform pg_temp.ap_expect(format('select public.workspace_require_make_systems(%L, %L)', ws, operator_id), 'workspace_make_systems_required');

  -- Needs you: the provider layer, provider claims and escalation.
  perform public.set_decision_policy(ws, a_staff, 'ap-a-staff@agency-a.example.test', 'strelva', null, 'copy.routine', 'strelva_reviews', 'strelva_default', 0);
  perform pg_temp.ap_expect(format($q$select public.set_decision_policy(%L, %L, %L, 'strelva', null, 'copy.routine', 'owner_decides', 'strelva_default', 1)$q$, ws, operator_id, 'ap-operator@strelva.example.test'), 'decision_policy_access_denied');
  perform pg_temp.ap_expect(format($q$select public.set_decision_policy(%L, %L, %L, 'strelva', null, 'copy.routine', 'owner_decides', 'strelva_default', 1)$q$, ws, a_unstaffed, 'ap-a-unstaffed@agency-a.example.test'), 'decision_policy_access_denied');
  perform public.read_decision_policies(ws, a_staff, 'ap-a-staff@agency-a.example.test');
  perform pg_temp.ap_expect(format('select public.read_decision_policies(%L, %L, %L)', ws, a_unstaffed, 'ap-a-unstaffed@agency-a.example.test'), 'decision_policy_access_denied');
  item := public.open_owner_decision(ws, jsonb_build_object('kind', 'copy.routine', 'route', 'strelva_reviews', 'title', 'Refresh the hours line',
    'approveEffect', 'The new line goes live.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', 'fixture', 'sourceId', 'ap-1',
    'revisionHash', repeat('b', 64)));
  perform pg_temp.ap_assert(public.claim_owner_decision(ws, (public.open_owner_decision(ws, jsonb_build_object('kind', 'copy.routine',
    'route', 'strelva_reviews', 'title', 'Fix a typo', 'approveEffect', 'The fix goes live.', 'notYetEffect', 'Nothing changes.',
    'sourceLifecycle', 'fixture', 'sourceId', 'ap-2', 'revisionHash', repeat('c', 64)))->>'id')::uuid, repeat('c', 64), 'approve', 'operator',
    a_staff, 'ap-a-staff@agency-a.example.test', null)->>'status' = 'claimed', 'the acting provider decides a review item');
  perform pg_temp.ap_assert(jsonb_array_length(public.list_owner_decisions(ws, a_staff, 'ap-a-staff@agency-a.example.test', false)) >= 1, 'the provider sees its review items');
  perform pg_temp.ap_expect(format('select public.list_owner_decisions(%L, %L, %L, false)', ws, a_unstaffed, 'ap-a-unstaffed@agency-a.example.test'), 'owner_decision_access_denied');
  perform pg_temp.ap_expect(format($q$select public.claim_owner_decision(%L, %L, %L, 'approve', 'operator', %L, %L, null)$q$, ws, item->>'id', item->>'revisionHash', operator_id, 'ap-operator@strelva.example.test'), 'owner_decision_permission_denied');
  perform public.escalate_owner_decision(ws, (item->>'id')::uuid, a_staff, 'ap-a-staff@agency-a.example.test', 'The owner should see this one.');
  perform public.read_strelva_handled(ws, a_staff, 'ap-a-staff@agency-a.example.test', null);
  perform pg_temp.ap_expect(format('select public.read_strelva_handled(%L, %L, %L, null)', ws, a_unstaffed, 'ap-a-unstaffed@agency-a.example.test'), 'owner_decision_access_denied');
  perform public.read_catalog_report_receipts(ws, a_staff, 'ap-a-staff@agency-a.example.test', null);

  -- Email for a business by its agency: provider of record, seat, verified for email, sender mandate.
  perform pg_temp.ap_assert(public.provider_email_send_allowed(ws, null, 'mail.agency-a.example.test'), 'the provider of record sends from its granted sender');
  perform pg_temp.ap_assert(not public.provider_email_send_allowed(ws, null, 'updates.strelva.com'), 'not from a sender the business did not grant');
  perform pg_temp.ap_assert(not public.provider_email_send_allowed(ws, null, 'not a domain'), 'an invalid sender is refused');
  perform pg_temp.ap_assert(not public.provider_email_send_allowed(ws, agency_s, 'mail.agency-a.example.test'), 'Strelva''s agency, without its own mandate since its new seat');
  perform pg_temp.verify(agency_a, 'email', 'unverified');
  perform pg_temp.ap_assert(not public.provider_email_send_allowed(ws, null, 'mail.agency-a.example.test'), 'email verification revoked');
  perform pg_temp.verify(agency_a, 'email', 'verified');
  perform pg_temp.ap_assert(not public.provider_email_send_allowed('ac7e0000-0000-4000-8000-000000000011', agency_a, 'mail.agency-a.example.test'), 'never for another agency''s client');

  -- #534: the owner-link shim keeps meaning email; the website launch and
  -- preview checks need publish (owner-decision-links and
  -- owner-decision-website-preview schema tests prove those paths).
  perform pg_temp.verify(agency_a, 'publish', 'unverified');
  perform pg_temp.ap_assert(public.strelva_runs_business(ws) = public.platform_serves_business(ws, 'email')
    and public.strelva_runs_business(ws) and not public.platform_serves_business(ws, 'publish'), 'the shim means email');
  perform pg_temp.verify(agency_a, 'publish', 'verified');
  perform pg_temp.ap_assert(public.platform_provider_for_resource(ws, null, 'publish', 'website', site) = agency_a,
    'the platform serves the provider of record for its granted website');
  perform pg_temp.ap_assert(public.platform_provider_for_resource(ws, null, 'publish', 'domain', 'never-granted.example.test') is null,
    'not for a resource the business never granted');

  -- The agency's Google read-back list covers only clients it is staffed on.
  perform pg_temp.ap_assert(jsonb_typeof(public.read_agency_google_listing_readback_failures(a_staff, 'ap-a-staff@agency-a.example.test', agency_a, 10)) = 'array', 'agency read-back list');
  perform pg_temp.ap_expect(format('select public.read_agency_google_listing_readback_failures(%L, %L, %L, 10)', stranger, 'ap-stranger@example.test', agency_a), 'workspace_access_denied');
end $$;
rollback;
\echo 'Acting-provider gates and client-resource mandates passed.'
