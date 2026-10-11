\set ON_ERROR_STOP on
-- Fictional contract on the fully ordered schema; never a hosted qualification.
begin;
create function pg_temp.lk_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'lifetime kind assertion failed: %', message; end if; end $$;
create function pg_temp.lk_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected %, got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected %, but statement succeeded', expected;
end $$;
insert into public.users(id,email,verified_at) values
 ('6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',now()),
 ('6a000000-0000-4000-8000-000000000002','lifetime-member@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('6a000000-0000-4000-8000-000000000010','customer','Fictional consultant','6a000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('6a000000-0000-4000-8000-000000000010','6a000000-0000-4000-8000-000000000001','owner','6a000000-0000-4000-8000-000000000001'),
 ('6a000000-0000-4000-8000-000000000010','6a000000-0000-4000-8000-000000000002','member','6a000000-0000-4000-8000-000000000001');
create temp table lk_system(id uuid);
insert into lk_system select (public.create_business_system('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test','{"name":"Proposal","kind":"proposal"}',
 '6a000000-0000-4000-8000-0000000000c1',repeat('1',64))->>'id')::uuid;
create function pg_temp.lk_update(patch jsonb, expected bigint default 1,
 actor uuid default '6a000000-0000-4000-8000-000000000001', email text default 'lifetime-owner@example.test')
returns jsonb language sql as $$
 select public.update_business_system('6a000000-0000-4000-8000-000000000010',actor,email,(select id from lk_system),expected,patch)
$$;
-- An accepted proposal pins its original revision and terms.
select public.record_system_revision('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system),1,
 '{"implementation":{"kind":"proposal_document","ref":"fictional:terms-1"}}',
 '6a000000-0000-4000-8000-0000000000c2',repeat('2',64),true);
select public.transition_system_lifecycle('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system),2,'live');
create temp table lk_output(id uuid);
insert into lk_output select (public.issue_system_output('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system),
 jsonb_build_object('kind','proposal','title','Agreed terms','snapshotHash',repeat('a',64)),
 '6a000000-0000-4000-8000-0000000000c3',repeat('3',64))->>'id')::uuid;
select public.accept_system_output('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system),(select id from lk_output));
create temp table lk_before as select public.read_business_system('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system)) as detail,
 (select to_jsonb(s) from public.systems s where id=(select id from lk_system)) as row;
-- Baseline accepted this change. Changed kind, including combined patches,
-- now refuses before any row, optimistic token or immutable history changes.
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"kind":"portal"}',3)$q$, 'system_kind_immutable');
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"kind":"portal","name":"Taken"}',3)$q$, 'system_kind_immutable');
select pg_temp.lk_expect($q$update public.systems set kind='portal',change_number=change_number+1 where id=(select id from lk_system)$q$, 'system_kind_immutable');
select pg_temp.lk_expect($q$update public.systems set kind=null where id=(select id from lk_system)$q$, 'system_kind_immutable');
select pg_temp.lk_expect($q$update public.systems set origin_ref='rewritten' where id=(select id from lk_system)$q$, 'system_identity_immutable');

-- Same-kind legacy no-op still requires current authority and exact baseline.
select pg_temp.lk_assert(pg_temp.lk_update('{"kind":"proposal"}',3) = (select detail->'system' from lk_before), 'legacy no-op returns current System');
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"kind":"proposal"}',2)$q$, 'system_change_conflict');
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"kind":"proposal"}',null)$q$, 'system_change_conflict');
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"name":"Taken"}',3,'6a000000-0000-4000-8000-000000000002','lifetime-member@example.test')$q$, 'business_record_access_denied');
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"kind":"proposal"}',3,'6a000000-0000-4000-8000-000000000002','lifetime-member@example.test')$q$, 'business_record_access_denied');
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"name":"Taken"}',3,'6a000000-0000-4000-8000-000000000001','wrong@example.test')$q$, 'business_record_access_denied');
update public.users set verified_at=null where id='6a000000-0000-4000-8000-000000000001';
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"kind":"proposal"}',3)$q$, 'business_record_access_denied');
update public.users set verified_at=now() where id='6a000000-0000-4000-8000-000000000001';
delete from public.workspace_memberships where workspace_id='6a000000-0000-4000-8000-000000000010' and user_id='6a000000-0000-4000-8000-000000000001';
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"name":"Taken"}',3)$q$, 'business_record_access_denied');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('6a000000-0000-4000-8000-000000000010','6a000000-0000-4000-8000-000000000001','owner','6a000000-0000-4000-8000-000000000001');

-- Strict SQL validation matches application shapes, apart from compatible kind.
do $$ declare patch jsonb; begin
 for patch in select value from jsonb_array_elements('[{},null,[],{"unexpected":true},{"purpose":3},{"purpose":{}},{"purpose":[]},{"name":null},{"name":" padded"},{"name":""},{"kind":null},{"kind":3},{"kind":"Invalid"}]') loop
  perform pg_temp.lk_expect(format('select pg_temp.lk_update(%L,3)',patch),'system_input_invalid');
 end loop;
 perform pg_temp.lk_expect(format('select pg_temp.lk_update(%L,3)',jsonb_build_object('purpose',repeat('a',1001))),'system_input_invalid');
 perform pg_temp.lk_expect(format('select pg_temp.lk_update(%L,3)',jsonb_build_object('name',repeat('a',161))),'system_input_invalid');
end $$;
select pg_temp.lk_assert((select to_jsonb(s) from public.systems s where id=(select id from lk_system)) = (select row from lk_before), 'refusals and no-op leave the full row unchanged');
select pg_temp.lk_assert(public.read_business_system('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system)) = (select detail from lk_before), 'refusals leave revisions and accepted outputs unchanged');
select pg_temp.lk_assert(pg_temp.lk_update('{"name":"Packages and onboarding","purpose":"New clients","kind":"proposal"}',3)->>'kind'='proposal', 'same-kind legacy payload permits ordinary edits');
select pg_temp.lk_assert(pg_temp.lk_update('{"purpose":null}',4)->'purpose'='null'::jsonb, 'permitted update clears purpose');

-- Native revision, activation, pause/resume and restore still work. Issued terms
-- stay on revision 1 when behavior grows through revision 2.
select public.record_system_revision('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system),5,
 '{"implementation":{"kind":"proposal_onboarding","ref":"fictional:onboarding-2"}}',
 '6a000000-0000-4000-8000-0000000000c4',repeat('4',64),true);
select public.transition_system_lifecycle('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system),6,'paused');
select public.transition_system_lifecycle('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',(select id from lk_system),7,'live');
do $$ declare s public.systems; r public.system_revisions; begin
 select * into s from public.systems where id=(select id from lk_system);
 select * into r from public.system_revisions where system_id=s.id and number=1;
 perform public.set_system_current_revision(s.business_workspace_id,'6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',s.id,r.id,s.current_revision_id);
 perform pg_temp.lk_assert((select kind='proposal' and name='Packages and onboarding' from public.systems where id=s.id),'native lifecycle and revisions preserve lifetime kind');
 perform pg_temp.lk_assert((select number=1 from public.system_revisions where id=(select revision_id from public.system_outputs where id=(select id from lk_output))), 'accepted terms stay on revision 1');
end $$;
-- Exit blocks both no-op and real changes; neither can bypass the stop gate.
insert into public.workspace_exit_requests(workspace_id, requested_by, idempotency_key, command_digest, future_work, provider_participation,
 maintained_resource_action, state, completed_at)
 values ('6a000000-0000-4000-8000-000000000010','6a000000-0000-4000-8000-000000000001','lifetime-exit',repeat('9',64),'pause','keep','stop','{"status":"completed"}',now());
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"kind":"proposal"}',9)$q$, 'workspace_exit_future_work_blocked');
select pg_temp.lk_expect($q$select pg_temp.lk_update('{"name":"After exit"}',9)$q$, 'workspace_exit_future_work_blocked');
select pg_temp.lk_assert(has_function_privilege('service_role','public.update_business_system(uuid,uuid,text,uuid,bigint,jsonb)','execute')
 and not has_function_privilege('authenticated','public.update_business_system(uuid,uuid,text,uuid,bigint,jsonb)','execute')
 and not has_function_privilege('anon','public.system_kind_guard()','execute')
 and not has_function_privilege('service_role','public.system_kind_guard()','execute'), 'command and invariant ACLs stay private');
rollback;
