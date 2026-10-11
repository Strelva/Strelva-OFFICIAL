\set ON_ERROR_STOP on
-- #251: actual session-bound repair and atomic immutable audit, fictional local actors.
begin;
create function pg_temp.nb_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'newsletter identity assertion failed: %', message; end if; end; $$;
create function pg_temp.nb_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected error: %', expected;
end; $$;

insert into public.users(id,email,verified_at) values
  ('e9000000-0000-4000-8000-000000000001','backfill-operator@example.test',now()),
  ('e9000000-0000-4000-8000-000000000002','backfill-owner@example.test',now()),
  ('e9000000-0000-4000-8000-000000000003','backfill-unverified@example.test',null);
insert into public.super_admins(user_id,email) values
  ('e9000000-0000-4000-8000-000000000001','stale-operator-email@example.test'),
  ('e9000000-0000-4000-8000-000000000003','backfill-unverified@example.test');
insert into public.tenants(id,stable_id,site_name,active) values
  ('backfill-identity-site','e9000000-0000-4000-8000-000000000004','Backfill Identity Fixture',true);
insert into public.workspaces(id,kind,name,created_by) values
  ('e9000000-0000-4000-8000-000000000010','customer','Backfill audit fixture','e9000000-0000-4000-8000-000000000002');
insert into public.business_records(workspace_id,created_by,updated_by) values
  ('e9000000-0000-4000-8000-000000000010','e9000000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000002');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
  ('e9000000-0000-4000-8000-000000000004','backfill-identity-site','e9000000-0000-4000-8000-000000000010',
   'e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000005',repeat('c',64),'{}');
create temp table nb_workspace as select 'e9000000-0000-4000-8000-000000000010'::uuid as id;
grant select on nb_workspace to authenticated;
insert into public.newsletter_subscribers(tenant_id,email,status) values
  ('backfill-identity-site','active@example.test','active'),
  ('backfill-identity-site','unsubscribed@example.test','unsubscribed');

select pg_temp.nb_assert(to_regprocedure('public.backfill_newsletter_contacts(text,text,uuid,boolean,text,integer)') is null,
  'email-supplied overload removed so it cannot bypass session identity');
select pg_temp.nb_assert(has_function_privilege('authenticated','public.backfill_newsletter_contacts(text,uuid,boolean,text,integer)','EXECUTE')
  and not has_function_privilege('service_role','public.backfill_newsletter_contacts(text,uuid,boolean,text,integer)','EXECUTE')
  and not has_function_privilege('anon','public.backfill_newsletter_contacts(text,uuid,boolean,text,integer)','EXECUTE'),
  'request-session entry only; anon and service-role cannot invoke repair');

-- No session cannot borrow an operator email. Both planning and writes require identity.
set local role authenticated;
select pg_temp.nb_error($$select public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace))$$,
  'newsletter_contact_operator_required');
select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000002',true);
select pg_temp.nb_error($$select public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace))$$,
  'newsletter_contact_operator_required');
select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000003',true);
select pg_temp.nb_error($$select public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace),true)$$,
  'newsletter_contact_operator_required');

-- A real operator succeeds by user_id even if the duplicated super_admin email is stale.
select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000001',true);
select pg_temp.nb_assert((public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace))->>'examined')='2',
  'verified active operator may plan when the release is off');
select pg_temp.nb_error($$select public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace),true)$$,
  'newsletter_contact_release_off');
reset role;
select pg_temp.nb_assert(not exists(select 1 from public.business_contacts where workspace_id=(select id from nb_workspace)),
  'denied and dry-run requests create no contacts');
select public.set_workspace_release_flag('backfill-operator@example.test',(select id from nb_workspace),
  'newsletter_contacts','on','Fictional identity test release',0);
set local role authenticated;
select pg_temp.nb_assert((public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace),true)->>'linked')='2',
  'released operator apply projects both subscribers');
reset role;
select pg_temp.nb_assert((select count(*)=2 from public.newsletter_contact_sync where workspace_id=(select id from nb_workspace) and status='linked')
  and exists(select 1 from public.newsletter_subscribers where tenant_id='backfill-identity-site' and email='unsubscribed@example.test' and status='unsubscribed'),
  'apply has repair receipts and preserves unsubscribe authority');

-- Two successful calls (dry/apply) name the signed-in UUID and business.
select pg_temp.nb_assert((select count(*)=2 and bool_and(actor_user_id='e9000000-0000-4000-8000-000000000001'
  and actor_email='backfill-operator@example.test' and target_type='newsletter_contacts'
  and target_id='backfill-identity-site' and metadata->>'tenantId'='backfill-identity-site'
  and metadata->>'examined'='2') from public.workspace_operator_audit_events
  where workspace_id=(select id from nb_workspace) and action='newsletter.contacts.backfill'),
  'dry/apply audit names exact actor, action, workspace and bounded result');
select pg_temp.nb_assert((select count(*)=2 and bool_and(actor_user_id='e9000000-0000-4000-8000-000000000001')
  from public.audit_logs where tenant_id='backfill-identity-site' and action='newsletter.contacts.backfill'),
  'canonical workspace operator audit also mirrors the linked tenant');
select pg_temp.nb_assert(not exists(select 1 from public.workspace_operator_audit_events
  where action='newsletter.contacts.backfill' and metadata::text like '%@%'),
  'audit aggregates never retain subscriber address data');

-- An audit failure refuses the request and rolls back even completed projections.
insert into public.newsletter_subscribers(tenant_id,email,status) values
  ('backfill-identity-site','audit-failure@example.test','unsubscribed');
create function pg_temp.nb_break_audit() returns trigger language plpgsql as $$
begin if new.action='newsletter.contacts.backfill' then raise exception 'fictional audit unavailable';end if;return new;end $$;
create trigger nb_break_audit before insert on public.workspace_operator_audit_events
  for each row execute function pg_temp.nb_break_audit();
set local role authenticated;
select pg_temp.nb_error($$select public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace),true)$$,
  'fictional audit unavailable');
reset role;
select pg_temp.nb_assert(not exists(select 1 from public.business_contacts where email='audit-failure@example.test')
  and not exists(select 1 from public.newsletter_contact_sync where email='audit-failure@example.test'),
  'audit refusal atomically rolls back contact and sync writes');
drop trigger nb_break_audit on public.workspace_operator_audit_events;

update public.super_admins set revoked_at=clock_timestamp() where user_id='e9000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.nb_error($$select public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace))$$,
  'newsletter_contact_operator_required');
select pg_temp.nb_error($$select public.backfill_newsletter_contacts('backfill-identity-site',(select id from nb_workspace),true)$$,
  'newsletter_contact_operator_required');
reset role;
\if :{?newsletter_audit_retain}
commit;
\else
rollback;
\endif
