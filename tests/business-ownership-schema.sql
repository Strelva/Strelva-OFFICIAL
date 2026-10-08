\set ON_ERROR_STOP on
-- Who owns and operates a converted business (20261007110000_business_ownership.sql).
-- Fictional tenants, people and businesses only. Runs after the business
-- record, tenant lead and systems migrations in check:workspace-sql.
begin;
create or replace function pg_temp.bo_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'business ownership assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.bo_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.bo_convert(p_tenant text, p_stable text, p_name text, p_command text, p_target text default null)
returns jsonb language sql as $$
  select public.convert_tenant_to_business('bo-operator@strelva.example.test', p_tenant,
    jsonb_strip_nulls(jsonb_build_object('tenantId', p_tenant, 'tenantStableId', p_stable, 'workspaceName', p_name,
      'targetWorkspaceId', p_target)) || '{"billing":null,"account":null,"patch":{},"contacts":[]}'::jsonb,
    p_command::uuid, repeat('a', 64))
$$;
create or replace function pg_temp.bo_lead(lead_id text, hash text) returns jsonb language sql as $$
  select jsonb_build_object('leadId', lead_id, 'submissionHash', hash, 'name', 'Rae Fixture',
    'email', 'rae@example.test', 'message', 'Fictional question', 'capturedAt', '2026-10-06T12:00:00Z')
$$;
create or replace function pg_temp.bo_approval(p_workspace_id uuid, p_recipient text,
  p_approver_id uuid default 'b0000000-0000-4000-8000-000000000004') returns uuid language sql as $$
  select (public.create_operator_action_approval(p_approver_id, p_workspace_id, 'owner_invitation.issue',
    jsonb_build_object('recipientEmail', lower(btrim(p_recipient)), 'sendEmail', false), '{"source":"web"}'::jsonb)->>'approvalId')::uuid
$$;

-- Lockdown: RLS on, no table privilege for any API role, service role calls functions only.
select pg_temp.bo_assert((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.workspace_providers'::regclass, 'public.strelva_agency_workspace'::regclass, 'public.tenant_lead_purges'::regclass,
   'public.operator_action_approvals'::regclass, 'public.workspace_operator_audit_events'::regclass)), 'rls enabled');
select pg_temp.bo_assert(not has_table_privilege('anon', 'public.workspace_providers', 'select')
  and not has_table_privilege('authenticated', 'public.workspace_providers', 'select')
  and not has_table_privilege('service_role', 'public.workspace_providers', 'select')
  and not has_table_privilege('service_role', 'public.workspace_providers', 'insert')
  and not has_table_privilege('service_role', 'public.strelva_agency_workspace', 'insert')
  and not has_table_privilege('service_role', 'public.tenant_lead_purges', 'select')
  and not has_table_privilege('anon', 'public.operator_action_approvals', 'select')
  and not has_table_privilege('authenticated', 'public.operator_action_approvals', 'insert')
  and not has_table_privilege('service_role', 'public.operator_action_approvals', 'select')
  and not has_table_privilege('service_role', 'public.workspace_operator_audit_events', 'select'), 'no direct table access');
select pg_temp.bo_assert(not has_function_privilege('anon', 'public.create_operator_owner_invitation(text,uuid,text,text,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_operator_owner_invitation(text,uuid,text,text,timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'public.create_operator_owner_invitation(text,uuid,text,text,timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'public.revoke_operator_owner_invitation(text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.list_provided_clients(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.designate_strelva_agency_workspace(text,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_tenant_owner_recipient(text)', 'execute')
  and not has_function_privilege('anon', 'public.purge_expired_tenant_leads(integer)', 'execute')
  and not has_function_privilege('service_role', 'public.operator_owner_invitation_assert(text,uuid)', 'execute'), 'public keys cannot call ownership functions');
select pg_temp.bo_assert(has_function_privilege('service_role', 'public.create_operator_action_approval(uuid,uuid,text,jsonb,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.create_operator_owner_invitation_approved(uuid,uuid,text,text,timestamptz,uuid,boolean,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.revoke_operator_owner_invitation_audited(uuid,uuid,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.read_operator_owner_invitation_state(text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.list_provided_clients(uuid,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.designate_strelva_agency_workspace_audited(uuid,uuid,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.resolve_tenant_owner_recipient(text)', 'execute')
  and has_function_privilege('service_role', 'public.purge_expired_tenant_leads(integer)', 'execute')
  and has_function_privilege('service_role', 'public.accept_workspace_invitation(text,uuid,text)', 'execute'), 'service role keeps its calls');

insert into public.users(id, email, verified_at) values
  ('b0000000-0000-4000-8000-000000000001', 'bo-operator@strelva.example.test', now()),
  ('b0000000-0000-4000-8000-000000000002', 'pat-owner@example.test', now()),
  ('b0000000-0000-4000-8000-000000000003', 'agency-staff@strelva.example.test', now()),
  ('b0000000-0000-4000-8000-000000000004', 'bo-second-operator@strelva.example.test', now()),
  ('b0000000-0000-4000-8000-000000000005', 'stranger@example.test', now()),
  ('b0000000-0000-4000-8000-000000000006', 'other-agency@example.test', now()),
  ('b0000000-0000-4000-8000-000000000007', 'quinn-owner@example.test', now()),
  ('b0000000-0000-4000-8000-000000000008', 'bo-fading-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email) values
  ('b0000000-0000-4000-8000-000000000001', 'bo-operator@strelva.example.test'),
  ('b0000000-0000-4000-8000-000000000004', 'bo-second-operator@strelva.example.test'),
  ('b0000000-0000-4000-8000-000000000008', 'bo-fading-operator@strelva.example.test');
-- Noah-like operator-list aliases must remain blocked even when no auth account
-- has signed up for the listed Gmail address.
update public.super_admins set email = 'A.B+ops@GoogleMail.com' where user_id = 'b0000000-0000-4000-8000-000000000008';
insert into auth.users(id, email, email_confirmed_at) values
  ('b0000000-0000-4000-8000-000000000001', 'bo-operator@strelva.example.test', now()),
  ('b0000000-0000-4000-8000-000000000004', 'bo-second-operator@strelva.example.test', now());
insert into auth.identities(user_id, identity_data) values
  ('b0000000-0000-4000-8000-000000000001', '{"email":"bo-operator-alias@strelva.example.test"}'::jsonb),
  ('b0000000-0000-4000-8000-000000000004', '{"email":"bo-second-alias@strelva.example.test"}'::jsonb);
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('bo-bakery', 'b0000000-0000-4000-8000-0000000000a1', 'Fixture Bakery', true, 'Pat-Owner@Example.test '),
  ('bo-bakery-east', 'b0000000-0000-4000-8000-0000000000a2', 'Fixture Bakery East', true, null),
  ('bo-unconverted', 'b0000000-0000-4000-8000-0000000000a3', 'Unconverted Fixture', true, 'still-here@example.test'),
  ('bo-later', 'b0000000-0000-4000-8000-0000000000a4', 'Later Fixture', true, 'quinn-owner@example.test'),
  ('bo-blank', 'b0000000-0000-4000-8000-0000000000a5', 'Blank Fixture', true, '  '),
  ('bo-fading', 'b0000000-0000-4000-8000-0000000000a6', 'Fading Fixture', true, 'fading@example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('b0000000-0000-4000-8000-000000000020', 'agency', 'Strelva (fixture)', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000021', 'agency', 'Other Agency', 'b0000000-0000-4000-8000-000000000006'),
  ('b0000000-0000-4000-8000-000000000022', 'customer', 'Never Converted', 'b0000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('b0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000001', 'owner', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000003', 'member', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000006', 'owner', 'b0000000-0000-4000-8000-000000000006'),
  ('b0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000001', 'admin', 'b0000000-0000-4000-8000-000000000001');
-- Pat already had a viewer seat on the bakery site; accepting ownership must raise it.
insert into public.memberships(user_id, tenant_id, role, tenant_stable_id) values
  ('b0000000-0000-4000-8000-000000000002', 'bo-bakery', 'viewer', 'b0000000-0000-4000-8000-0000000000a1');
select public.record_tenant_lead('bo-bakery', pg_temp.bo_lead('lead_bo1', 'bo1'), 'dual_write');
select public.record_tenant_lead('bo-unconverted', pg_temp.bo_lead('lead_bo2', 'bo2'), 'dual_write');

-- ---------------------------------------------------------------- providers
create temporary table bo_ws(label text primary key, id uuid);
create temporary table bo_count(label text primary key, n bigint);
insert into bo_count values ('invitations', (select count(*) from public.workspace_invitations));

-- Converting before Strelva's agency is designated writes no provider row, and
-- conversion never invites anyone.
insert into bo_ws select 'bakery', (pg_temp.bo_convert('bo-bakery', 'b0000000-0000-4000-8000-0000000000a1', 'Fixture Bakery', 'b0000000-0000-4000-8000-0000000000c1')->>'workspaceId')::uuid;
select pg_temp.bo_convert('bo-bakery-east', 'b0000000-0000-4000-8000-0000000000a2', 'Fixture Bakery', 'b0000000-0000-4000-8000-0000000000c2',
  (select id::text from bo_ws where label = 'bakery'));
select pg_temp.bo_assert(not exists (select 1 from public.workspace_providers), 'no provider before designation');
select pg_temp.bo_assert((select count(*) from public.workspace_invitations) = (select n from bo_count where label = 'invitations'), 'conversion sends no invitation');

-- Designation: only an active super admin who runs that agency workspace.
select pg_temp.bo_expect($$select public.designate_strelva_agency_workspace('agency-staff@strelva.example.test','b0000000-0000-4000-8000-000000000020')$$, 'tenant_conversion_operator_required');
select pg_temp.bo_expect($$select public.designate_strelva_agency_workspace('bo-second-operator@strelva.example.test','b0000000-0000-4000-8000-000000000020')$$, 'strelva_agency_workspace_invalid');
select pg_temp.bo_expect($$select public.designate_strelva_agency_workspace('bo-operator@strelva.example.test','b0000000-0000-4000-8000-000000000022')$$, 'strelva_agency_workspace_invalid');
with designation as (select public.designate_strelva_agency_workspace('bo-operator@strelva.example.test',
  'b0000000-0000-4000-8000-000000000020') result)
select pg_temp.bo_assert((result->>'marked')::integer >= 1, 'designation marks the business converted before it')
from designation;
select pg_temp.bo_assert((public.designate_strelva_agency_workspace('bo-operator@strelva.example.test', 'b0000000-0000-4000-8000-000000000020')->>'replayed') = 'true',
  'repeating the designation replays');
select pg_temp.bo_expect($$select public.designate_strelva_agency_workspace('bo-operator@strelva.example.test','b0000000-0000-4000-8000-000000000021')$$, 'strelva_agency_workspace_invalid');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000001', 'admin', 'b0000000-0000-4000-8000-000000000006');
select pg_temp.bo_expect($$select public.designate_strelva_agency_workspace('bo-operator@strelva.example.test','b0000000-0000-4000-8000-000000000021')$$, 'strelva_agency_already_designated');
select pg_temp.bo_assert((select count(*) = 1 and bool_and(provider_workspace_id = 'b0000000-0000-4000-8000-000000000020' and status = 'active' and source = 'tenant_conversion')
  from public.workspace_providers where customer_workspace_id = (select id from bo_ws where label = 'bakery')), 'bakery is marked as operated by Strelva');

-- A conversion after designation marks the new business in its own transaction.
insert into bo_ws select 'later', (pg_temp.bo_convert('bo-later', 'b0000000-0000-4000-8000-0000000000a4', 'Later Fixture', 'b0000000-0000-4000-8000-0000000000c3')->>'workspaceId')::uuid;
insert into public.business_record_facts(workspace_id, fact_key, value, source, verified, updated_by)
values ((select id from bo_ws where label = 'later'), 'owner_recipient',
  '{"email":"quinn-owner@example.test","name":"Quinn"}'::jsonb, 'owner', true, 'b0000000-0000-4000-8000-000000000001');
select pg_temp.bo_assert(exists (select 1 from public.workspace_providers where customer_workspace_id = (select id from bo_ws where label = 'later')
  and provider_workspace_id = 'b0000000-0000-4000-8000-000000000020' and started_by = 'b0000000-0000-4000-8000-000000000001'), 'conversion marks the provider');
select pg_temp.bo_assert((select count(*) = 2 from public.workspace_providers
  where customer_workspace_id in (select id from bo_ws where label in ('bakery', 'later'))),
  'each converted fixture workspace has one provider mark');

-- Agency workspaces have no client tenant to mirror into audit_logs. The
-- workspace-native audit still records the authenticated actor and CLI context.
select public.create_operator_action_approval('b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000020', 'workspace_release_flag.on',
  '{"flag":"systems","state":"on","reason":"Agency workspace approval check"}'::jsonb,
  '{"source":"cli","osUser":"fixture-user","machine":"fixture-machine"}'::jsonb);
select pg_temp.bo_assert((select count(*) = 1 and bool_and(actor_user_id = 'b0000000-0000-4000-8000-000000000001'
  and metadata#>>'{executionContext,osUser}' = 'fixture-user'
  and metadata#>>'{executionContext,machine}' = 'fixture-machine')
  from public.workspace_operator_audit_events where workspace_id = 'b0000000-0000-4000-8000-000000000020'
    and action = 'operator.action-approval.recorded'), 'agency approval audit does not require a linked client site');
select pg_temp.bo_assert(not exists (select 1 from public.audit_logs where action = 'operator.action-approval.recorded'
  and metadata->>'approvalId' in (select id::text from public.operator_action_approvals where workspace_id = 'b0000000-0000-4000-8000-000000000020')),
  'agency approval succeeds with no tenant mirror row');

-- The mark grants nothing. Agency staff who are not members of the business
-- see no client and still cannot read its record.
select pg_temp.bo_assert(jsonb_array_length(public.list_provided_clients('b0000000-0000-4000-8000-000000000003', 'agency-staff@strelva.example.test',
  'b0000000-0000-4000-8000-000000000020')) = 0, 'agency staff without membership list no client');
select pg_temp.bo_expect(format($$select public.read_business_record(%L, 'b0000000-0000-4000-8000-000000000003', 'agency-staff@strelva.example.test')$$,
  (select id from bo_ws where label = 'bakery')), 'business_record_access_denied');
select pg_temp.bo_assert((select jsonb_agg(c->>'name' order by c->>'name') from jsonb_array_elements(public.list_provided_clients('b0000000-0000-4000-8000-000000000001',
  'bo-operator@strelva.example.test', 'b0000000-0000-4000-8000-000000000020')) c) = '["Fixture Bakery", "Later Fixture"]'::jsonb, 'the operator lists both converted clients');
select pg_temp.bo_expect($$select public.list_provided_clients('b0000000-0000-4000-8000-000000000005','stranger@example.test','b0000000-0000-4000-8000-000000000020')$$, 'workspace_provider_access_denied');
select pg_temp.bo_expect($$select public.list_provided_clients('b0000000-0000-4000-8000-000000000001','wrong@strelva.example.test','b0000000-0000-4000-8000-000000000020')$$, 'workspace_provider_access_denied');
select pg_temp.bo_assert(jsonb_array_length(public.list_provided_clients('b0000000-0000-4000-8000-000000000006', 'other-agency@example.test',
  'b0000000-0000-4000-8000-000000000021')) = 0, 'another agency sees none of Strelva''s clients');
select pg_temp.bo_expect($$select public.list_provided_clients('b0000000-0000-4000-8000-000000000006','other-agency@example.test','b0000000-0000-4000-8000-000000000020')$$, 'workspace_provider_access_denied');

-- Marks only end; they never move or vanish while their business exists.
select pg_temp.bo_expect(format($$update public.workspace_providers set provider_workspace_id = 'b0000000-0000-4000-8000-000000000021' where customer_workspace_id = %L$$,
  (select id from bo_ws where label = 'later')), 'workspace_provider_immutable');
select pg_temp.bo_expect(format($$delete from public.workspace_providers where customer_workspace_id = %L$$, (select id from bo_ws where label = 'later')), 'workspace_provider_immutable');
select pg_temp.bo_expect($$insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
  values ('b0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000021', 'operator', 'b0000000-0000-4000-8000-000000000001')$$, 'workspace_provider_invalid');
select pg_temp.bo_expect($$update public.strelva_agency_workspace set designated_at = now()$$, 'strelva_agency_workspace_immutable');

-- Unlink still removes a business the conversion created and nothing else
-- uses; the provider mark is not "use" and goes with it.
insert into bo_ws select 'fading', (pg_temp.bo_convert('bo-fading', 'b0000000-0000-4000-8000-0000000000a6', 'Fading Fixture', 'b0000000-0000-4000-8000-0000000000c4')->>'workspaceId')::uuid;
select pg_temp.bo_assert(exists (select 1 from public.workspace_providers where customer_workspace_id = (select id from bo_ws where label = 'fading')), 'fading business marked');
select pg_temp.bo_assert((select (public.unlink_tenant_from_business('bo-operator@strelva.example.test', 'bo-fading', id,
  'b0000000-0000-4000-8000-0000000000c5', repeat('b', 64))->>'workspaceDeleted')::boolean from bo_ws where label = 'fading'), 'unlink deletes the unused business');
select pg_temp.bo_assert(not exists (select 1 from public.workspace_providers where customer_workspace_id = (select id from bo_ws where label = 'fading')), 'its provider mark went with it');

-- ------------------------------------------------------ operator owner invite
select pg_temp.bo_expect($$select public.create_operator_action_approval('b0000000-0000-4000-8000-000000000003',
  'b0000000-0000-4000-8000-000000000020', 'owner_invitation.issue', '{"recipientEmail":"pat-owner@example.test","sendEmail":false}'::jsonb, '{"source":"web"}'::jsonb)$$,
  'workspace_release_operator_required');
select pg_temp.bo_expect($$select public.create_operator_action_approval('b0000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000020', 'owner_invitation.issue', '{"recipientEmail":"pat-owner@example.test","sendEmail":true}'::jsonb, '{"source":"web"}'::jsonb)$$,
  'operator_action_approval_invalid');
select pg_temp.bo_expect($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000003',
  'b0000000-0000-4000-8000-000000000020', 'pat-owner@example.test', repeat('1', 64), now() + interval '14 days', null, false, '{"source":"web"}'::jsonb)$$,
  'operator_owner_invitation_operator_required');
select pg_temp.bo_expect($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000020', 'pat-owner@example.test', repeat('1', 64), now() + interval '14 days', null, false, '{"source":"web"}'::jsonb)$$,
  'operator_owner_invitation_operator_required');
select pg_temp.bo_expect($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000022', 'pat-owner@example.test', repeat('1', 64), now() + interval '14 days', null, false, '{"source":"web"}'::jsonb)$$,
  'operator_owner_invitation_not_converted');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001',
  %L, 'not an email', repeat('1', 64), now() + interval '14 days', null, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery')),
  'workspace_invitation_command_invalid');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001',
  %L, 'pat-owner@example.test', repeat('1', 64), now() + interval '14 days', null, true, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery')),
  'owner_invitation_email_disabled');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001',
  %L, 'pat-owner@example.test', repeat('1', 64), now() + interval '60 days', null, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery')),
  'workspace_invitation_command_invalid');

select pg_temp.bo_assert((select s->'recipient'->>'email' = 'pat-owner@example.test' and (s->>'hasOwner')::boolean = false
  and jsonb_array_length(s->'tenants') = 2 and s#>>'{tenants,0,tenantId}' = 'bo-bakery' and jsonb_array_length(s->'pending') = 0
  from (select public.read_operator_owner_invitation_state('bo-operator@strelva.example.test', id) s from bo_ws where label = 'bakery') x),
  'dry-run state names the default recipient and both sites');

create temporary table bo_approvals(label text primary key, id uuid);
insert into bo_approvals
  select 'self', pg_temp.bo_approval(id, 'bo-operator@strelva.example.test') from bo_ws where label = 'bakery'
  union all select 'alias', pg_temp.bo_approval(id, 'bo-operator-alias@strelva.example.test') from bo_ws where label = 'bakery'
  union all select 'other-operator', pg_temp.bo_approval(id, 'bo-second-alias@strelva.example.test') from bo_ws where label = 'bakery'
  union all select 'google-admin-alias', pg_temp.bo_approval(id, 'ab+invite@gmail.com') from bo_ws where label = 'bakery'
  union all select 'pat', pg_temp.bo_approval(id, 'pat-owner@example.test') from bo_ws where label = 'bakery'
  union all select 'untrusted-self', pg_temp.bo_approval(id, 'someone-else@example.test', 'b0000000-0000-4000-8000-000000000001') from bo_ws where label = 'bakery';
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'bo-operator@strelva.example.test', repeat('a', 64), now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), (select id from bo_approvals where label = 'self')), 'operator_owner_invitation_controlled_recipient');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'bo-operator-alias@strelva.example.test', repeat('b', 64), now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), (select id from bo_approvals where label = 'alias')), 'operator_owner_invitation_controlled_recipient');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'bo-operator+invite@strelva.example.test', repeat('b', 64), now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), (select id from bo_approvals where label = 'alias')), 'operator_owner_invitation_controlled_recipient');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'bo-second-alias@strelva.example.test', repeat('c', 64), now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), (select id from bo_approvals where label = 'other-operator')), 'operator_owner_invitation_controlled_recipient');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'ab+invite@gmail.com', repeat('c', 64), now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), (select id from bo_approvals where label = 'google-admin-alias')), 'operator_owner_invitation_controlled_recipient');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'someone-else@example.test', md5('business-ownership-self-approval') || md5('business-ownership-self-approval:token'), now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), (select id from bo_approvals where label = 'untrusted-self')), 'operator_action_approval_not_distinct');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'someone-else@example.test', md5('business-ownership-wrong-approver') || md5('business-ownership-wrong-approver:token'), now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), (select id from bo_approvals where label = 'pat')), 'operator_action_approval_mismatch');

create temporary table bo_invite(label text primary key, value jsonb);
insert into bo_invite select 'pat', public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', id,
  ' Pat-Owner@Example.test ', repeat('1', 64), now() + interval '14 days', (select id from bo_approvals where label = 'pat'), false, '{"source":"web"}'::jsonb)
  from bo_ws where label = 'bakery';
select pg_temp.bo_assert((select value->>'recipientEmail' = 'pat-owner@example.test' and value->>'role' = 'owner' and value->>'status' = 'pending'
  and value#>>'{tenants,0,tenantId}' = 'bo-bakery' from bo_invite where label = 'pat'), 'invitation created for the normalized address');
select pg_temp.bo_assert((select issued_by_kind = 'operator' and created_by = 'b0000000-0000-4000-8000-000000000001'
  from public.workspace_invitations where id = (select (value->>'invitationId')::uuid from bo_invite where label = 'pat')), 'issued by the operator');
select pg_temp.bo_assert((select consumed_by = 'b0000000-0000-4000-8000-000000000001' and consumed_at is not null
  from public.operator_action_approvals where id = (select id from bo_approvals where label = 'pat')), 'distinct approval was consumed by the issuer');
select pg_temp.bo_assert((select count(*) = 2 from public.audit_logs
  where action = 'workspace.owner-invitation.issued' and target_id = (select value->>'invitationId' from bo_invite where label = 'pat')
    and metadata->>'recipientEmail' = 'pat-owner@example.test' and metadata->>'approvalId' = (select id::text from bo_approvals where label = 'pat')),
  'issuance is audited once for each linked tenant with its approval');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'pat-owner@example.test', %L, now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), repeat('2', 64), (select id from bo_approvals where label = 'pat')), 'operator_action_approval_used');
-- An owner invitation can't be issued as a member/admin invitation by an operator.
select pg_temp.bo_expect(format($$insert into public.workspace_invitations(workspace_id, recipient_email, role, token_hash, expires_at, created_by, issued_by_kind)
  values (%L, 'x@example.test', 'member', %L, now() + interval '1 day', 'b0000000-0000-4000-8000-000000000001', 'operator')$$,
  (select id from bo_ws where label = 'bakery'), repeat('3', 64)), 'new row for relation "workspace_invitations" violates check constraint "workspace_invitations_operator_issues_owner_only"');

-- Wrong person: refused, nothing written.
select pg_temp.bo_expect(format($$select * from public.accept_workspace_invitation(%L, 'b0000000-0000-4000-8000-000000000005', 'stranger@example.test')$$, repeat('1', 64)),
  'workspace_invitation_recipient_mismatch');

-- A tenant membership write failure rolls the whole accept back.
create function pg_temp.bo_reject_membership() returns trigger language plpgsql as $$ begin raise exception 'synthetic_tenant_membership_failure'; end; $$;
create trigger bo_reject_membership before insert or update on public.memberships for each row execute function pg_temp.bo_reject_membership();
select pg_temp.bo_expect(format($$select * from public.accept_workspace_invitation(%L, 'b0000000-0000-4000-8000-000000000002', 'pat-owner@example.test')$$, repeat('1', 64)),
  'synthetic_tenant_membership_failure');
drop trigger bo_reject_membership on public.memberships;
select pg_temp.bo_assert(not exists (select 1 from public.workspace_memberships where user_id = 'b0000000-0000-4000-8000-000000000002')
  and (select role from public.memberships where user_id = 'b0000000-0000-4000-8000-000000000002' and tenant_id = 'bo-bakery') = 'viewer'
  and (select status from public.workspace_invitations where token_hash = repeat('1', 64)) = 'pending', 'failed accept left both stores and the invitation unchanged');

-- Accept: workspace owner and tenant owner on every linked site, together.
select pg_temp.bo_assert((select applied_role = 'owner' and invitation_status = 'accepted' and not already_accepted
  from public.accept_workspace_invitation(repeat('1', 64), 'b0000000-0000-4000-8000-000000000002', 'pat-owner@example.test')), 'accepted as owner');
select pg_temp.bo_assert((select role from public.workspace_memberships where workspace_id = (select id from bo_ws where label = 'bakery')
  and user_id = 'b0000000-0000-4000-8000-000000000002') = 'owner', 'workspace owner membership written');
select pg_temp.bo_assert((select count(*) = 2 and bool_and(role = 'owner') from public.memberships
  where user_id = 'b0000000-0000-4000-8000-000000000002' and tenant_id in ('bo-bakery', 'bo-bakery-east')), 'tenant owner on both linked sites, viewer raised');
select pg_temp.bo_assert(not exists (select 1 from public.memberships where user_id = 'b0000000-0000-4000-8000-000000000002' and tenant_id not in ('bo-bakery', 'bo-bakery-east')),
  'no tenant outside this business');
select pg_temp.bo_assert((select role from public.workspace_memberships where workspace_id = (select id from bo_ws where label = 'bakery')
  and user_id = 'b0000000-0000-4000-8000-000000000001') = 'admin', 'Strelva stays admin');
select pg_temp.bo_assert((select already_accepted from public.accept_workspace_invitation(repeat('1', 64), 'b0000000-0000-4000-8000-000000000002', 'pat-owner@example.test')),
  'replayed accept writes nothing new');
select pg_temp.bo_expect(format($$select public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', %L,
  'another@example.test', %L, now() + interval '14 days', %L, false, '{"source":"web"}'::jsonb)$$,
  (select id from bo_ws where label = 'bakery'), repeat('4', 64),
  pg_temp.bo_approval((select id from bo_ws where label = 'bakery'), 'another@example.test')), 'operator_owner_invitation_owner_exists');
-- The owner can now invite through the ordinary path.
select pg_temp.bo_assert((select count(*) = 1 from public.create_workspace_invitation((select id from bo_ws where label = 'bakery'),
  'b0000000-0000-4000-8000-000000000002', 'pat-owner@example.test', 'staff@example.test', 'member', repeat('5', 64), now() + interval '7 days')), 'owner invites members');

-- Revoke: the operator withdraws its own invitation; it can't be accepted after.
insert into bo_invite select 'quinn', public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', id,
  'quinn-owner@example.test', repeat('6', 64), now() + interval '14 days', pg_temp.bo_approval(id, 'quinn-owner@example.test', 'b0000000-0000-4000-8000-000000000001'), false, '{"source":"web"}'::jsonb)
  from bo_ws where label = 'later';
select pg_temp.bo_assert(exists (select 1 from public.operator_action_approvals
  where workspace_id = (select id from bo_ws where label = 'later') and action_kind = 'owner_invitation.issue'
    and target->>'recipientEmail' = 'quinn-owner@example.test'
    and approved_by = 'b0000000-0000-4000-8000-000000000001'
    and consumed_by = 'b0000000-0000-4000-8000-000000000001'), 'trusted verified owner recipient supports one-operator issuance');
select pg_temp.bo_expect(format($$select public.revoke_operator_owner_invitation_audited('b0000000-0000-4000-8000-000000000004', %L, '{"source":"web"}'::jsonb)$$,
  (select value->>'invitationId' from bo_invite where label = 'quinn')), 'operator_owner_invitation_operator_required');
select pg_temp.bo_assert(public.revoke_operator_owner_invitation_audited('b0000000-0000-4000-8000-000000000001', (select (value->>'invitationId')::uuid from bo_invite where label = 'quinn'), '{"source":"web"}'::jsonb) = 'revoked', 'revoked');
select pg_temp.bo_assert((select count(*) = 1 from public.audit_logs where action = 'workspace.owner-invitation.revoked'
  and target_id = (select value->>'invitationId' from bo_invite where label = 'quinn')), 'revocation is audited');
select pg_temp.bo_assert((select invitation_status = 'revoked' from public.accept_workspace_invitation(repeat('6', 64), 'b0000000-0000-4000-8000-000000000007', 'quinn-owner@example.test')),
  'revoked invitation reports revoked');
select pg_temp.bo_assert(not exists (select 1 from public.workspace_memberships where user_id = 'b0000000-0000-4000-8000-000000000007')
  and not exists (select 1 from public.memberships where user_id = 'b0000000-0000-4000-8000-000000000007'), 'revoked invitation grants nothing');
select pg_temp.bo_expect(format($$select public.revoke_operator_owner_invitation_audited('b0000000-0000-4000-8000-000000000001', (select id from public.workspace_invitations where token_hash = %L), '{"source":"web"}'::jsonb)$$,
  repeat('5', 64)), 'workspace_invitation_not_found');

-- A sponsor who lost operator standing can't grant ownership.
insert into bo_invite select 'quinn-again', public.create_operator_owner_invitation_approved('b0000000-0000-4000-8000-000000000001', id,
  'quinn-owner@example.test', repeat('7', 64), now() + interval '14 days', pg_temp.bo_approval(id, 'quinn-owner@example.test'), false, '{"source":"web"}'::jsonb)
  from bo_ws where label = 'later';
update public.super_admins set revoked_at = now() where user_id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.bo_expect(format($$select * from public.accept_workspace_invitation(%L, 'b0000000-0000-4000-8000-000000000007', 'quinn-owner@example.test')$$, repeat('7', 64)),
  'workspace_invitation_sponsor_invalid');
update public.super_admins set revoked_at = null where user_id = 'b0000000-0000-4000-8000-000000000001';
-- And an owner who appeared meanwhile blocks a second one.
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  select id, 'b0000000-0000-4000-8000-000000000005', 'owner', 'b0000000-0000-4000-8000-000000000001' from bo_ws where label = 'later';
select pg_temp.bo_expect(format($$select * from public.accept_workspace_invitation(%L, 'b0000000-0000-4000-8000-000000000007', 'quinn-owner@example.test')$$, repeat('7', 64)),
  'operator_owner_invitation_owner_exists');
delete from public.workspace_memberships where user_id = 'b0000000-0000-4000-8000-000000000005';
select pg_temp.bo_assert((select applied_role = 'owner' from public.accept_workspace_invitation(repeat('7', 64), 'b0000000-0000-4000-8000-000000000007', 'quinn-owner@example.test')),
  'restored sponsor: accepted');
select pg_temp.bo_assert(exists (select 1 from public.memberships where user_id = 'b0000000-0000-4000-8000-000000000007' and tenant_id = 'bo-later' and role = 'owner'), 'restored sponsor: accept works');

-- ------------------------------------------------------ owner recipient rule
select pg_temp.bo_assert(public.resolve_tenant_owner_recipient('bo-unconverted') = jsonb_build_object('email', 'still-here@example.test', 'name', null,
  'from', 'tenant', 'workspaceId', null, 'tenantId', 'bo-unconverted'), 'unconverted tenant: its own owner_email, unchanged');
select pg_temp.bo_assert(public.resolve_tenant_owner_recipient('bo-nope') is null, 'unknown tenant: nobody');
select pg_temp.bo_assert(public.resolve_tenant_owner_recipient('bo-blank') is null, 'blank owner_email: nobody');
select pg_temp.bo_assert((select r->>'email' = 'pat-owner@example.test' and r->>'from' = 'tenant' and (r->>'workspaceId')::uuid = (select id from bo_ws where label = 'bakery')
  from (select public.resolve_tenant_owner_recipient('bo-bakery') r) x), 'converted, no record fact yet: tenant owner_email');
select pg_temp.bo_assert((select r->>'email' = 'pat-owner@example.test' and r->>'from' = 'linked_tenant' and r->>'tenantId' = 'bo-bakery'
  from (select public.resolve_tenant_owner_recipient('bo-bakery-east') r) x), 'second site without its own email: the business''s first site');
select public.patch_business_record(id, 'b0000000-0000-4000-8000-000000000002', 'pat-owner@example.test', 'owner', 0,
  '{"facts":{"owner_recipient":{"value":{"email":"pat@fixturebakery.example.test","name":"Pat"}}}}', 'b0000000-0000-4000-8000-0000000000c6', repeat('c', 64))
  from bo_ws where label = 'bakery';
select pg_temp.bo_assert((select r->>'email' = 'pat@fixturebakery.example.test' and r->>'name' = 'Pat' and r->>'from' = 'record'
  from (select public.resolve_tenant_owner_recipient('bo-bakery') r) x)
  and (select public.resolve_tenant_owner_recipient('bo-bakery-east')->>'email') = 'pat@fixturebakery.example.test', 'the record''s owner contact wins for every linked site');
select pg_temp.bo_assert(public.resolve_tenant_owner_recipient('bo-unconverted')->>'email' = 'still-here@example.test', 'other tenants untouched');

-- ------------------------------------------------------- lead copies retained
select pg_temp.bo_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a1' and workspace_id is not null) = 1
  and (select count(*) from public.tenant_leads where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a3' and workspace_id is null) = 1, 'fixture leads recorded');
delete from public.memberships where tenant_id in ('bo-unconverted', 'bo-bakery');
delete from public.tenants where id in ('bo-unconverted', 'bo-bakery');
select pg_temp.bo_assert((select tenant_deleted_at is not null and site_name_at_delete = 'Unconverted Fixture'
  and retain_until between now() + interval '364 days' and now() + interval '366 days'
  from public.tenant_leads where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a3'), 'unattached lead kept 365 days after deprovision');
select pg_temp.bo_assert((select tenant_deleted_at is not null and retain_until is null and workspace_id = (select id from bo_ws where label = 'bakery')
  from public.tenant_leads where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a1'), 'a lead attached to a business stays with the business');
select pg_temp.bo_assert((select count(*) from jsonb_array_elements(public.read_tenant_leads(null, 500, null)) e
  where e->>'tenantId' = 'bo-unconverted' and e->>'siteName' = 'Unconverted Fixture' and e->>'retainUntil' is not null and e->>'tenantDeletedAt' is not null) = 1,
  'operator read still shows a deprovisioned client''s lead with its deadline');
select pg_temp.bo_assert(public.read_tenant_leads('bo-unconverted', 50, null) = '[]'::jsonb, 'a deleted slug selects nothing');
select pg_temp.bo_assert((public.purge_expired_tenant_leads(100)->>'purged') = '0'
  and exists (select 1 from public.tenant_leads where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a3'), 'nothing purged before its deadline');
update public.tenant_leads set retain_until = now() - interval '1 second' where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a3';
select pg_temp.bo_assert(public.purge_expired_tenant_leads(100) = '{"purged": 1, "tenants": 1}'::jsonb, 'expired lead purged');
select pg_temp.bo_assert(not exists (select 1 from public.tenant_leads where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a3')
  and exists (select 1 from public.tenant_leads where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a1'), 'only the expired lead went');
select pg_temp.bo_assert((select purged_count = 1 and tenant_slug = 'bo-unconverted' and site_name = 'Unconverted Fixture'
  from public.tenant_lead_purges where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a3'), 'purge receipt written');
select pg_temp.bo_expect($$delete from public.tenant_lead_purges$$, 'tenant_lead_purge_immutable');
-- A deleted tenant's lead that loses its business starts the clock then.
update public.tenant_leads set workspace_id = null where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a1';
select pg_temp.bo_assert((select retain_until > now() + interval '364 days' from public.tenant_leads where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a1'),
  'detached lead of a deleted tenant gets the retention deadline');
select public.record_tenant_lead('bo-later', pg_temp.bo_lead('lead_bo3', 'bo3'), 'dual_write');
select pg_temp.bo_expect($$update public.tenant_leads set retain_until = now() where tenant_stable_id = 'b0000000-0000-4000-8000-0000000000a4'$$,
  'new row for relation "tenant_leads" violates check constraint "tenant_leads_retention_needs_deletion"');
rollback;
