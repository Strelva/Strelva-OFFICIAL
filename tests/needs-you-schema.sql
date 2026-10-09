\set ON_ERROR_STOP on
-- Needs you policy and decisions on fictional rows. Runs inside a transaction
-- that is rolled back, so the cluster is left as it was found.
begin;
create or replace function pg_temp.ny_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'needs you assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ny_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- Only the service role reaches the RPCs; tables have no grants and RLS on.
select pg_temp.ny_assert(
  not has_function_privilege('anon', 'public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.set_decision_policy(uuid,uuid,text,text,uuid,text,text,text,bigint)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.list_owner_decisions(uuid,uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.open_owner_decision(uuid,jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.needs_you_member_role(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.needs_you_operator_id(uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.set_decision_policy(uuid,uuid,text,text,uuid,text,text,text,bigint)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_strelva_handled(uuid,uuid,text,timestamptz)', 'EXECUTE'),
  'only service_role executes the needs-you RPCs');
select pg_temp.ny_assert(
  not has_table_privilege('service_role', 'public.owner_decisions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.decision_policies', 'SELECT')
  and not has_table_privilege('anon', 'public.decision_policy_history', 'SELECT')
  and not has_table_privilege('authenticated', 'public.owner_decision_deliveries', 'INSERT')
  and (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.decision_policies'::regclass, 'public.decision_policy_history'::regclass,
    'public.owner_decisions'::regclass, 'public.owner_decision_deliveries'::regclass)),
  'tables are RLS-on with no direct grants');

-- Every floor and default is on the ladder, and no default is below its floor.
select pg_temp.ny_assert((select bool_and(
    public.needs_you_route_rank(public.needs_you_kind_default(k)) >= public.needs_you_route_rank(public.needs_you_kind_floor(k)))
  from unnest(public.needs_you_change_kinds()) k where k not in ('suggestion','health.owner_action')),
  'every default is at or above its floor');
select pg_temp.ny_assert(public.needs_you_kind_floor('suggestion') is null and public.needs_you_kind_floor('health.owner_action') is null,
  'suggestions and owner actions have no route to set');

insert into public.users(id, email, verified_at) values
  ('ae000000-0000-4000-8000-000000000001', 'ny-owner@example.test', now()),
  ('ae000000-0000-4000-8000-000000000002', 'ny-admin@example.test', now()),
  ('ae000000-0000-4000-8000-000000000003', 'ny-member@example.test', now()),
  ('ae000000-0000-4000-8000-000000000004', 'ny-other-owner@example.test', now()),
  ('ae000000-0000-4000-8000-000000000005', 'ny-operator@strelva.example.test', now()),
  ('ae000000-0000-4000-8000-000000000006', 'ny-stranger@example.test', now());
insert into public.super_admins(user_id, email) values ('ae000000-0000-4000-8000-000000000005', 'ny-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('ae000000-0000-4000-8000-000000000010', 'customer', 'Mooney Fixture Firm', 'ae000000-0000-4000-8000-000000000001'),
  ('ae000000-0000-4000-8000-000000000011', 'customer', 'Other Fixture Business', 'ae000000-0000-4000-8000-000000000004'),
  ('ae000000-0000-4000-8000-000000000012', 'personal', 'Personal', 'ae000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('ae000000-0000-4000-8000-000000000010', 'ae000000-0000-4000-8000-000000000001', 'owner', 'ae000000-0000-4000-8000-000000000001'),
  ('ae000000-0000-4000-8000-000000000010', 'ae000000-0000-4000-8000-000000000002', 'admin', 'ae000000-0000-4000-8000-000000000001'),
  ('ae000000-0000-4000-8000-000000000010', 'ae000000-0000-4000-8000-000000000003', 'member', 'ae000000-0000-4000-8000-000000000001'),
  ('ae000000-0000-4000-8000-000000000011', 'ae000000-0000-4000-8000-000000000004', 'owner', 'ae000000-0000-4000-8000-000000000004'),
  ('ae000000-0000-4000-8000-000000000012', 'ae000000-0000-4000-8000-000000000001', 'owner', 'ae000000-0000-4000-8000-000000000001');
-- After 20261014112000 the provider layer belongs to the business's acting
-- provider, not super_admins: the operator works for this business through an
-- agency's seat and staff row, the way any agency does.
do $$ begin
  if to_regprocedure('public.acting_provider(uuid,uuid,text,text,text)') is null then return; end if;
  insert into public.workspaces(id, kind, name, created_by)
    values ('ae000000-0000-4000-8000-000000000020', 'agency', 'Fixture Provider Agency', 'ae000000-0000-4000-8000-000000000005');
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values ('ae000000-0000-4000-8000-000000000020', 'ae000000-0000-4000-8000-000000000005', 'owner', 'ae000000-0000-4000-8000-000000000005');
  insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
    values ('ae000000-0000-4000-8000-000000000010', 'ae000000-0000-4000-8000-000000000020', 'owner', 'ae000000-0000-4000-8000-000000000001');
  insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by)
    values ('ae000000-0000-4000-8000-000000000020', 'ae000000-0000-4000-8000-000000000010', 'ae000000-0000-4000-8000-000000000005', 'ae000000-0000-4000-8000-000000000005');
end $$;
-- The owner recipient falls back to the linked tenant's owner email.
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('ny-fixture-site', 'ae000000-0000-4000-8000-0000000000a1', 'Mooney Fixture Site', true, 'NY-Owner@example.test');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt)
  values ('ae000000-0000-4000-8000-0000000000a1', 'ny-fixture-site', 'ae000000-0000-4000-8000-000000000010',
    'ae000000-0000-4000-8000-000000000005', 'ae000000-0000-4000-8000-0000000000b1', repeat('a', 64), '{}'::jsonb);
select pg_temp.ny_assert((public.needs_you_linked_tenants('ae000000-0000-4000-8000-000000000010')->0->>'tenantId') = 'ny-fixture-site',
  'linked tenant is listed for the business');
select pg_temp.ny_assert(jsonb_array_length(public.needs_you_linked_tenants('ae000000-0000-4000-8000-000000000011')) = 0,
  'another business lists no tenant');

select pg_temp.ny_assert((public.needs_you_owner_actor('ae000000-0000-4000-8000-000000000010', ' NY-Owner@example.test')->>'userId') = 'ae000000-0000-4000-8000-000000000001',
  'owner recipient maps to the owner member');
select pg_temp.ny_assert(public.needs_you_owner_actor('ae000000-0000-4000-8000-000000000010', 'ny-admin@example.test') is null
  and public.needs_you_owner_actor('ae000000-0000-4000-8000-000000000011', 'ny-owner@example.test') is null,
  'an admin or another business''s owner is not an owner actor');

-- Policy -------------------------------------------------------------------
-- Strelva sets a default; it can never go below the floor.
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test','strelva',null,'copy.marketing','handle','strelva_default',0)$$, 'decision_policy_below_floor');
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test','strelva',null,'fact.inferred','strelva_reviews','strelva_default',0)$$, 'decision_policy_below_floor');
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test','strelva',null,'suggestion','owner_decides','strelva_default',0)$$, 'decision_policy_invalid');
-- Only operators set Strelva's layer; only an owner sets the owner layer.
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','strelva',null,'copy.routine','handle','strelva_default',0)$$, 'decision_policy_access_denied');
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000002','ny-admin@example.test','owner',null,'copy.routine','owner_decides',null,0)$$, 'decision_policy_access_denied');
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000004','ny-other-owner@example.test','owner',null,'copy.routine','owner_decides',null,0)$$, 'decision_policy_access_denied');
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000012','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','owner',null,'copy.routine','owner_decides',null,0)$$, 'decision_policy_access_denied');

-- Strelva offers "handle" for routine copy on this business.
select pg_temp.ny_assert((public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test','strelva',null,'copy.routine','handle','strelva_default',0)->>'route') = 'handle',
  'Strelva loosens routine copy to handle');
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test','strelva',null,'copy.routine','handle_after_notice','strelva_default',0)$$, 'decision_policy_version_conflict');
-- The owner makes it stricter, then loosens it back to Strelva's default by clearing.
select pg_temp.ny_assert((public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','owner',null,'copy.routine','owner_decides',null,0)->>'route') = 'owner_decides',
  'owner tightens routine copy');
select pg_temp.ny_assert((public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','owner',null,'copy.routine','handle_after_notice',null,1)->>'route') = 'handle_after_notice',
  'owner loosens partway, still at or above the default');
select pg_temp.ny_assert((public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','owner',null,'copy.routine',null,null,2)->>'route') = 'handle',
  'owner clears back to Strelva''s default');
-- The owner can't loosen past Strelva's default.
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','owner',null,'google.post','handle_after_notice',null,0)$$, 'decision_policy_looser_than_default');
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','owner',null,'review.reply','handle',null,0)$$, 'decision_policy_below_floor');
-- An owner's stricter setting holds when Strelva later loosens.
select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','owner',null,'google.post','owner_decides',null,0);
select pg_temp.ny_assert((public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test','strelva',null,'google.post','handle_after_notice','strelva_default',0)->>'route') = 'owner_decides',
  'owner''s stricter route survives Strelva loosening');
-- A System id from another business is refused.
select pg_temp.ny_expect($$select public.set_decision_policy('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test','owner','ae000000-0000-4000-8000-0000000000ff','google.post','owner_decides',null,0)$$, 'decision_policy_access_denied');
-- A direct insert below the floor is refused by the table itself.
select pg_temp.ny_expect($$insert into public.decision_policies(workspace_id, change_kind, layer, route, set_by, set_reason, version) values ('ae000000-0000-4000-8000-000000000010','structure','strelva','handle','ae000000-0000-4000-8000-000000000005','strelva_default',1)$$,
  'new row for relation "decision_policies" violates check constraint "decision_policies_check"');

-- Every change left a receipt with old and new route, and history is immutable.
select pg_temp.ny_assert((select count(*) from public.decision_policy_history where workspace_id = 'ae000000-0000-4000-8000-000000000010') = 6,
  'six policy receipts');
select pg_temp.ny_assert(exists (select 1 from public.decision_policy_history where change_kind = 'copy.routine' and layer = 'owner'
  and old_route = 'handle_after_notice' and new_route is null and set_reason = 'owner_reset'), 'owner reset receipt');
select pg_temp.ny_expect($$update public.decision_policy_history set new_route = 'handle'$$, 'needs_you_history_immutable');
select pg_temp.ny_expect($$delete from public.decision_policy_history$$, 'needs_you_history_immutable');
-- Members read policy; strangers and other businesses don't.
select pg_temp.ny_assert(jsonb_array_length(public.read_decision_policies('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000003','ny-member@example.test')->'settings') = 3,
  'member reads the stored settings');
select pg_temp.ny_expect($$select public.read_decision_policies('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000004','ny-other-owner@example.test')$$, 'decision_policy_access_denied');
select pg_temp.ny_expect($$select public.read_decision_policies('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000006','ny-stranger@example.test')$$, 'decision_policy_access_denied');

-- Items --------------------------------------------------------------------
create temporary table ny_items(name text primary key, id uuid);
insert into ny_items select 'reply', (public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','customer.commitment','route','owner_decides','title','Reply to a new inquiry quoting a consult price',
  'approveEffect','The reply sends','notYetEffect','Nothing sends','sourceLifecycle','tenant_event','sourceId','ny-fixture-site:evt-1',
  'revisionHash', repeat('1',64),'urgent',true))->>'id')::uuid;
-- Opening the same revision again returns the same item.
select pg_temp.ny_assert((public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','customer.commitment','route','owner_decides','title','Reply to a new inquiry quoting a consult price',
  'approveEffect','The reply sends','notYetEffect','Nothing sends','sourceLifecycle','tenant_event','sourceId','ny-fixture-site:evt-1',
  'revisionHash', repeat('1',64)))->>'id')::uuid = (select id from ny_items where name = 'reply'), 'open is idempotent per revision');
-- Kinds that need sign-in carry it whatever the caller says; suggestions never open.
insert into ny_items select 'grant', (public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','access.grant','route','owner_decides','title','Let the agency draft your website','approveEffect','Access is granted',
  'notYetEffect','No access','sourceLifecycle','agency_draft_grant','sourceId','grant-1','revisionHash', repeat('2',64),'signInRequired',false))->>'id')::uuid;
select pg_temp.ny_assert((select sign_in_required from public.owner_decisions where id = (select id from ny_items where name = 'grant')), 'access.grant needs sign-in');
select pg_temp.ny_expect($$select public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object('kind','suggestion','route','owner_decides','title','An idea','approveEffect','x','notYetEffect','y','sourceLifecycle','tenant_event','sourceId','s-1','revisionHash',repeat('3',64)))$$, 'owner_decision_invalid');
select pg_temp.ny_expect($$select public.open_owner_decision('ae000000-0000-4000-8000-000000000012', jsonb_build_object('kind','structure','route','owner_decides','title','x','approveEffect','x','notYetEffect','y','sourceLifecycle','tenant_event','sourceId','p-1','revisionHash',repeat('3',64)))$$, 'owner_decision_access_denied');

-- Cross-workspace denial: a decision id from one business never resolves in another.
select pg_temp.ny_expect(format($$select public.claim_owner_decision('ae000000-0000-4000-8000-000000000011',%L,%L,'approve','session','ae000000-0000-4000-8000-000000000004','ny-other-owner@example.test',null)$$,
  (select id from ny_items where name = 'reply'), repeat('1',64)), 'owner_decision_not_found');
select pg_temp.ny_expect($$select public.list_owner_decisions('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000004','ny-other-owner@example.test',false)$$, 'owner_decision_access_denied');
select pg_temp.ny_expect($$select public.read_strelva_handled('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000006','ny-stranger@example.test',null)$$, 'owner_decision_access_denied');
select pg_temp.ny_assert(jsonb_array_length(public.list_owner_decisions('ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000004','ny-other-owner@example.test',true)) = 0,
  'another business sees none of these items');

-- An operator never decides an owner item; a member and an admin (without the lifecycle's leave) can't either.
select pg_temp.ny_expect(format($$select public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',%L,%L,'approve','operator','ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test',null)$$,
  (select id from ny_items where name = 'reply'), repeat('1',64)), 'owner_decision_owner_only');
select pg_temp.ny_expect(format($$select public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',%L,%L,'approve','session','ae000000-0000-4000-8000-000000000003','ny-member@example.test',null)$$,
  (select id from ny_items where name = 'reply'), repeat('1',64)), 'owner_decision_permission_denied');
select pg_temp.ny_expect(format($$select public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',%L,%L,'approve','session','ae000000-0000-4000-8000-000000000002','ny-admin@example.test',null)$$,
  (select id from ny_items where name = 'reply'), repeat('1',64)), 'owner_decision_permission_denied');
-- A link is refused for access, money and exit, and for anyone not the owner recipient.
select pg_temp.ny_expect(format($$select public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',%L,%L,'approve','owner_link',null,null,'ny-owner@example.test')$$,
  (select id from ny_items where name = 'grant'), repeat('2',64)), 'owner_decision_sign_in_required');
select pg_temp.ny_expect(format($$select public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',%L,%L,'approve','owner_link',null,null,'former-owner@example.test')$$,
  (select id from ny_items where name = 'reply'), repeat('1',64)), 'owner_decision_recipient_not_owner');
-- A stale revision is reported, not acted on.
select pg_temp.ny_assert((public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'reply'),repeat('9',64),'approve','owner_link',null,null,'ny-owner@example.test')->>'status') = 'changed',
  'stale revision refuses');
-- The owner recipient approves by link; a replay is "already handled". From
-- 20261013120000 a link decides only once it was sent to the trusted owner.
select pg_temp.ny_assert((public.record_owner_decision_delivery('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'reply'),'digest','sent','ny-owner@example.test','ny-reply-message',null)->>'deliveryState') = 'sent',
  'the reply link is sent to the owner');
select pg_temp.ny_assert((public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'reply'),repeat('1',64),'approve','owner_link',null,null,' NY-Owner@example.test ')->>'status') = 'claimed',
  'owner recipient approves by link');
select pg_temp.ny_assert((public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'reply'),repeat('1',64),'approve','owner_link',null,null,'ny-owner@example.test')->>'status') = 'already_handled',
  'replay is already handled');
select pg_temp.ny_assert((select state = 'approved' and decided_by_kind = 'owner_link' and decided_by = 'ny-owner@example.test' from public.owner_decisions where id = (select id from ny_items where name = 'reply')),
  'decision recorded with its link actor');
select pg_temp.ny_assert((public.finish_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'reply'),'done',null,'tenant_event:evt-1')->>'outcome') = 'done', 'outcome recorded');
select pg_temp.ny_expect(format($$select public.finish_owner_decision('ae000000-0000-4000-8000-000000000010',%L,'failed',null,null)$$, (select id from ny_items where name = 'reply')), 'owner_decision_not_claimed');
select pg_temp.ny_expect(format($$update public.owner_decisions set state = 'open', decided_at = null where id = %L$$, (select id from ny_items where name = 'reply')), 'owner_decision_closed');
select pg_temp.ny_expect(format($$update public.owner_decisions set title = 'Something else' where id = %L$$, (select id from ny_items where name = 'reply')), 'owner_decision_identity_immutable');
-- The owner decides access in a signed-in session.
select pg_temp.ny_assert((public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'grant'),repeat('2',64),'not_yet','session','ae000000-0000-4000-8000-000000000001','ny-owner@example.test',null)->>'status') = 'claimed',
  'owner declines access in session');

-- A newer revision supersedes the open item; its old link reports "changed".
insert into ny_items select 'page', (public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','system.go_live','route','owner_decides','title','Put the consult booking page live','approveEffect','The page goes live',
  'notYetEffect','Nothing goes live','sourceLifecycle','website_document','sourceId','booking-page','revisionHash', repeat('4',64),
  'adminMayDecide', true, 'openedAt', (now() - interval '15 days')::text))->>'id')::uuid;
insert into ny_items select 'page-v2', (public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','system.go_live','route','owner_decides','title','Put the consult booking page live','approveEffect','The page goes live',
  'notYetEffect','Nothing goes live','sourceLifecycle','website_document','sourceId','booking-page','revisionHash', repeat('5',64),
  'adminMayDecide', true, 'openedAt', (now() - interval '15 days')::text))->>'id')::uuid;
select pg_temp.ny_assert((select state from public.owner_decisions where id = (select id from ny_items where name = 'page')) = 'superseded', 'older revision superseded');
select pg_temp.ny_assert((public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'page'),repeat('4',64),'approve','owner_link',null,null,'ny-owner@example.test')->>'status') = 'changed',
  'superseded link reports changed');
-- Past its expiry the item can't be approved; it lapses and its outcome is recorded.
select pg_temp.ny_assert((public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'page-v2'),repeat('5',64),'approve','session','ae000000-0000-4000-8000-000000000002','ny-admin@example.test',null)->>'status') = 'expired',
  'expired item refuses a decision');
select pg_temp.ny_assert((public.expire_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'page-v2'))->>'state') = 'expired', 'item lapses');
select pg_temp.ny_assert((public.finish_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'page-v2'),'done','Expired, nothing changed',null)->>'outcome') = 'done', 'lapse outcome recorded');
select pg_temp.ny_expect(format($$select public.expire_owner_decision('ae000000-0000-4000-8000-000000000010',%L)$$, (select id from ny_items where name = 'grant')), 'owner_decision_not_open');

-- Delivery: suppressed means "owner not told"; reminders stamp their time; the log is immutable.
insert into ny_items select 'post', (public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','google.post','route','strelva_reviews','title','Post this week''s special on Google','approveEffect','The post goes up',
  'notYetEffect','Nothing posts','sourceLifecycle','tenant_event','sourceId','ny-fixture-site:evt-2','revisionHash', repeat('6',64)))->>'id')::uuid;
insert into ny_items select 'newsletter', (public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','customer.broadcast','route','owner_decides','title','Send the October newsletter','approveEffect','The newsletter sends',
  'notYetEffect','Nothing sends','sourceLifecycle','tenant_event','sourceId','ny-fixture-site:evt-3','revisionHash', repeat('7',64)))->>'id')::uuid;
select pg_temp.ny_assert((public.record_owner_decision_delivery('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'newsletter'),'digest','suppressed','ny-owner@example.test',null,'email_suppressed_or_unconfigured')->>'deliveryState') = 'suppressed',
  'suppressed delivery recorded');
select pg_temp.ny_assert((public.record_owner_decision_delivery('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'newsletter'),'reminder_1','suppressed','ny-owner@example.test',null,null)->>'reminded1At') is not null,
  'reminder attempt stamped');
select pg_temp.ny_expect(format($$select public.record_owner_decision_delivery('ae000000-0000-4000-8000-000000000011',%L,'digest','sent',null,null,null)$$, (select id from ny_items where name = 'newsletter')), 'owner_decision_not_found');
select pg_temp.ny_expect($$update public.owner_decision_deliveries set status = 'sent'$$, 'needs_you_history_immutable');
-- The owner's list holds owner items only; the operator also sees strelva_reviews.
select pg_temp.ny_assert(jsonb_array_length(public.list_owner_decisions('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000001','ny-owner@example.test',false)) = 1,
  'owner sees the one open owner item');
select pg_temp.ny_assert(jsonb_array_length(public.list_owner_decisions('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test',false)) = 2,
  'operator sees both open items');
-- The owner can't decide a strelva_reviews item until an operator escalates it with a note.
select pg_temp.ny_expect(format($$select public.claim_owner_decision('ae000000-0000-4000-8000-000000000010',%L,%L,'approve','session','ae000000-0000-4000-8000-000000000001','ny-owner@example.test',null)$$,
  (select id from ny_items where name = 'post'), repeat('6',64)), 'owner_decision_permission_denied');
select pg_temp.ny_expect(format($$select public.escalate_owner_decision('ae000000-0000-4000-8000-000000000010',%L,'ae000000-0000-4000-8000-000000000001','ny-owner@example.test','please')$$,
  (select id from ny_items where name = 'post')), 'owner_decision_permission_denied');
select pg_temp.ny_assert((public.escalate_owner_decision('ae000000-0000-4000-8000-000000000010',(select id from ny_items where name = 'post'),'ae000000-0000-4000-8000-000000000005','ny-operator@strelva.example.test','Unsure about the price in this post')->>'route') = 'owner_decides',
  'operator escalates to the owner');
select pg_temp.ny_assert(jsonb_array_length(public.list_owner_decisions('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000003','ny-member@example.test',false)) = 2,
  'escalated item now in Needs you');
select pg_temp.ny_assert(jsonb_array_length(public.list_open_owner_decisions_for_delivery(100)) >= 2
  and (select bool_and((x->'recipient'->>'email') = 'ny-owner@example.test') from jsonb_array_elements(public.list_open_owner_decisions_for_delivery(100)) x
       where x->>'workspaceId' = 'ae000000-0000-4000-8000-000000000010'),
  'delivery list carries the owner recipient');

-- What changed reads policy receipts and expired items for members only.
select pg_temp.ny_assert(jsonb_array_length(public.read_strelva_handled('ae000000-0000-4000-8000-000000000010','ae000000-0000-4000-8000-000000000003','ny-member@example.test',now() - interval '1 day')) >= 7,
  'handled read model lists the receipts');
select pg_temp.ny_assert(jsonb_array_length(public.read_strelva_handled('ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000004','ny-other-owner@example.test',now() - interval '1 day')) = 0,
  'another business reads none of them');

rollback;
\echo 'Needs you SQL checks passed.'
