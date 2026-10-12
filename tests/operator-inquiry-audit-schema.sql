\set ON_ERROR_STOP on
begin;
create function pg_temp.ia_assert(ok boolean, detail text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'inquiry audit assertion: %',detail;end if;end $$;
create function pg_temp.ia_error(statement text, expected text) returns void language plpgsql as $$
begin begin execute statement;exception when others then if sqlerrm<>expected then raise exception 'expected % got %',expected,sqlerrm;end if;return;end;
raise exception 'expected error: %',expected;end $$;
insert into public.users(id,email,verified_at) values
('ea380000-0000-4000-8000-000000000001','support-audit@example.test',now()),
('ea380000-0000-4000-8000-000000000002','support-owner@example.test',now()),
('ea380000-0000-4000-8000-000000000003','support-unverified@example.test',null);
insert into public.super_admins(user_id,email) values
('ea380000-0000-4000-8000-000000000001','support-audit@example.test'),
('ea380000-0000-4000-8000-000000000003','support-unverified@example.test');
insert into public.workspaces(id,kind,name,created_by) values
('ea380000-0000-4000-8000-000000000010','customer','Support audit fixture','ea380000-0000-4000-8000-000000000002');
insert into public.tenants(id,stable_id,site_name) values
('support-audit-native','ea380000-0000-4000-8000-000000000020','Workspace tenant'),
('support-audit-legacy','ea380000-0000-4000-8000-000000000021','Legacy tenant');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
('ea380000-0000-4000-8000-000000000020','support-audit-native','ea380000-0000-4000-8000-000000000010',
'ea380000-0000-4000-8000-000000000001','ea380000-0000-4000-8000-000000000030',repeat('a',64),'{}');
select public.hold_tenant_lead_as_spam('support-audit-legacy','{"id":"spam_audit_legacy","reason":"spam signal","name":"Private Person","email":"private-reader@example.test","message":"Private customer words","createdAt":"2026-10-08T12:00:00Z"}');
select public.hold_tenant_lead_as_spam('support-audit-native','{"id":"spam_audit_native","reason":"spam signal","name":"Private Person","email":"private-reader@example.test","message":"Private customer words","createdAt":"2026-10-08T12:00:00Z"}');
update public.tenant_leads set workspace_id='ea380000-0000-4000-8000-000000000010' where tenant_stable_id='ea380000-0000-4000-8000-000000000020';
select pg_temp.ia_assert(not exists(select 1 from public.tenants where id='*'),'no fabricated portfolio tenant exists');
select pg_temp.ia_assert(has_function_privilege('service_role','public.read_operator_inquiry_review_audited(uuid,text,text,integer,timestamptz,uuid)','EXECUTE')
and not has_function_privilege('anon','public.read_operator_inquiry_review_audited(uuid,text,text,integer,timestamptz,uuid)','EXECUTE')
and not has_function_privilege('authenticated','public.read_operator_inquiry_review_audited(uuid,text,text,integer,timestamptz,uuid)','EXECUTE'),'audit wrapper is service-only');
set local role service_role;
select pg_temp.ia_assert(jsonb_array_length(public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','support-audit@example.test','held',51,null,null))=2,'real workspace and legacy tenant records return through actual audit inserts');
select pg_temp.ia_error($$select public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000002','support-owner@example.test','held',51,null,null)$$,'inquiry_access_denied');
select pg_temp.ia_error($$select public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','wrong@example.test','held',51,null,null)$$,'inquiry_access_denied');
reset role;
select pg_temp.ia_assert((select count(*)=1 and bool_and(actor_user_id='ea380000-0000-4000-8000-000000000001' and target_id='held' and metadata->>'count'='1') from public.workspace_operator_audit_events
where workspace_id='ea380000-0000-4000-8000-000000000010' and action='inquiries.operator-review.read'),'workspace scope names actual operator and exact exposed count');
select pg_temp.ia_assert((select count(*)=2 and bool_and(actor_user_id='ea380000-0000-4000-8000-000000000001') from public.audit_logs
where tenant_id in('support-audit-native','support-audit-legacy') and action='inquiries.operator-review.read'),'only real tenant FK scopes receive audit rows');
select pg_temp.ia_assert(not exists(select 1 from public.audit_logs where action='inquiries.operator-review.read' and (metadata::text like '%Private%' or metadata::text like '%@%')),'no customer PII copied into audit');
-- Native audit loss must fail the RPC, never return otherwise readable PII.
create function pg_temp.ia_break_audit() returns trigger language plpgsql as $$
begin if new.action='inquiries.operator-review.read' then raise exception 'fictional inquiry audit unavailable';end if;return new;end $$;
create trigger ia_break_audit before insert on public.audit_logs for each row execute function pg_temp.ia_break_audit();
set local role service_role;
select pg_temp.ia_error($$select public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','support-audit@example.test','held',51,null,null)$$,'fictional inquiry audit unavailable');
reset role;
select pg_temp.ia_assert((select count(*)=1 from public.workspace_operator_audit_events where workspace_id='ea380000-0000-4000-8000-000000000010' and action='inquiries.operator-review.read'),'failed tenant audit also rolls back preceding workspace audit');
drop trigger ia_break_audit on public.audit_logs;
-- Empty reads have no disclosed records or business scope; actor checks still apply.
set local role service_role;
select pg_temp.ia_assert(public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','support-audit@example.test','released',51,null,null)='[]'::jsonb,'empty read returns no records');
select pg_temp.ia_error($$select public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000003','support-unverified@example.test','released',51,null,null)$$,'inquiry_access_denied');
reset role;
select pg_temp.ia_assert((select count(*)=1 from public.workspace_operator_audit_events where workspace_id='ea380000-0000-4000-8000-000000000010' and action='inquiries.operator-review.read'),'empty read creates no fabricated business audit');
-- Notice row IDs identify inquiry_events, not tenant_leads, and have no stable ID in JSON.
savepoint notice_probe;
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail)
select tenant_stable_id,lead_id,'delivery','system','{"ownerNotice":true,"status":"failed","reason":"fictional delivery failure"}'::jsonb
from public.tenant_leads where tenant_stable_id='ea380000-0000-4000-8000-000000000021';
set local role service_role;
select pg_temp.ia_assert(jsonb_array_length(public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','support-audit@example.test','notices',51,null,null))=1,'legacy notice uses immutable event scope');
reset role;
select pg_temp.ia_assert(exists(select 1 from public.audit_logs where tenant_stable_id='ea380000-0000-4000-8000-000000000021' and action='inquiries.operator-review.read' and target_id='notices'),'notice audit records real stable tenant');
rollback to notice_probe;
-- Stable rename is allowed, deletion and capture-slug reuse must disclose no PII.
savepoint retained_probe;
-- This legacy tenant has no prior operator audit; deletion is feasible even at
-- a historical FK checkpoint. Rename audit is rolled back before deletion.
insert into public.tenants(id,stable_id,site_name) values('support-audit-retained','ea380000-0000-4000-8000-000000000022','Retained fixture');
select public.hold_tenant_lead_as_spam('support-audit-retained','{"id":"spam_audit_retained","reason":"spam signal","name":"Private Person","email":"private-retained@example.test","message":"Retained private words","createdAt":"2026-10-08T12:00:00Z"}');
savepoint rename_probe;
update public.tenants set id='support-audit-renamed' where stable_id='ea380000-0000-4000-8000-000000000022';
set local role service_role;
select pg_temp.ia_assert(jsonb_array_length(public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','support-audit@example.test','held',51,null,null))=3,'current stable tenant rename remains readable');
reset role;
select pg_temp.ia_assert(exists(select 1 from public.audit_logs where tenant_id='support-audit-renamed' and tenant_stable_id='ea380000-0000-4000-8000-000000000022' and action='inquiries.operator-review.read'),'rename audit names same stable identity');
rollback to rename_probe;
delete from public.tenants where stable_id='ea380000-0000-4000-8000-000000000022';
create temp table ia_before_denial as select (select count(*) from public.workspace_operator_audit_events) workspace_count,(select count(*) from public.audit_logs) tenant_count;
set local role service_role;
select pg_temp.ia_error($$select public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','support-audit@example.test','held',51,null,null)$$,'inquiry_operator_audit_scope_unavailable');
reset role;
insert into public.tenants(id,stable_id,site_name) values('support-audit-retained','ea380000-0000-4000-8000-000000000099','Replacement tenant');
set local role service_role;
select pg_temp.ia_error($$select public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','support-audit@example.test','held',51,null,null)$$,'inquiry_operator_audit_scope_unavailable');
reset role;
select pg_temp.ia_assert(exists(select 1 from public.tenant_leads where tenant_stable_id='ea380000-0000-4000-8000-000000000022'),'original retained inquiry survives tenant deletion');
select pg_temp.ia_assert((select workspace_count=(select count(*) from public.workspace_operator_audit_events) and tenant_count=(select count(*) from public.audit_logs) from ia_before_denial),'orphan/reused slug denial persists no partial audits');
select pg_temp.ia_assert(not exists(select 1 from public.audit_logs where tenant_stable_id='ea380000-0000-4000-8000-000000000099'),'replacement tenant receives no former tenant attribution');
rollback to retained_probe;
update public.super_admins set revoked_at=now() where user_id='ea380000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.ia_error($$select public.read_operator_inquiry_review_audited('ea380000-0000-4000-8000-000000000001','support-audit@example.test','held',51,null,null)$$,'inquiry_access_denied');
reset role;
rollback;
