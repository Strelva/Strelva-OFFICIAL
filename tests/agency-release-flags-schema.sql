\set ON_ERROR_STOP on
begin;
create function pg_temp.flag_assert(ok boolean,note text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'agency flag assertion: %',note;end if;end$$;
create function pg_temp.flag_refuse(statement text,reason text) returns void language plpgsql as $$begin begin execute statement; exception when others then if position(reason in sqlerrm)=0 then raise exception 'expected %, got %',reason,sqlerrm;end if;return;end;raise exception 'expected refusal %, succeeded',reason;end$$;
insert into public.users(id,email,verified_at) values
 ('25600000-0000-4000-8000-000000000001','flags-operator@example.test',now()),
 ('25600000-0000-4000-8000-000000000002','flags-owner@example.test',now()),
 ('25600000-0000-4000-8000-000000000003','flags-agency@example.test',now()),
 ('25600000-0000-4000-8000-000000000004','flags-other@example.test',now());
insert into public.super_admins(user_id,email) values('25600000-0000-4000-8000-000000000001','flags-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('25600000-0000-4000-8000-000000000010','customer','Flag client','25600000-0000-4000-8000-000000000002'),
 ('25600000-0000-4000-8000-000000000020','agency','Flag agency','25600000-0000-4000-8000-000000000003'),
 ('25600000-0000-4000-8000-000000000030','agency','Other agency','25600000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000002','owner','25600000-0000-4000-8000-000000000002'),
 ('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000003','owner','25600000-0000-4000-8000-000000000003'),
 ('25600000-0000-4000-8000-000000000030','25600000-0000-4000-8000-000000000004','owner','25600000-0000-4000-8000-000000000004');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000020','owner','25600000-0000-4000-8000-000000000002'),
 ('25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000030','owner','25600000-0000-4000-8000-000000000002');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','25600000-0000-4000-8000-000000000003'),
 ('25600000-0000-4000-8000-000000000030','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000004','25600000-0000-4000-8000-000000000004');
insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by) values
 ('25600000-0000-4000-8000-000000000040','25600000-0000-4000-8000-000000000010','Client website','website','25600000-0000-4000-8000-000000000041',repeat('a',64),'25600000-0000-4000-8000-000000000002','25600000-0000-4000-8000-000000000002');
create function pg_temp.ag_set(state text,rev bigint,ceiling bigint) returns jsonb language sql as $$select public.set_agency_workspace_release_flag('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','flags-agency@example.test','systems',state,rev,ceiling,'Explicit fixture change')$$;
create function pg_temp.op_ceiling(state text,rev bigint) returns jsonb language sql as $$select public.set_agency_release_flag_ceiling('25600000-0000-4000-8000-000000000001','flags-operator@example.test','25600000-0000-4000-8000-000000000010','systems','25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000040','publish',state,rev,'Explicit fixture permission')$$;
-- Native permission assertions begin.
select pg_temp.flag_assert(not has_table_privilege('service_role','public.agency_release_flag_ceilings','select'),'no service table bypass');
select pg_temp.flag_assert(not has_function_privilege('authenticated','public.set_agency_workspace_release_flag(uuid,uuid,uuid,text,text,text,bigint,bigint,text)','execute'),'no public command');
select pg_temp.flag_assert((public.read_agency_release_flags('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','flags-agency@example.test')->'flags')='[]','no default permission');
select pg_temp.flag_refuse($$select pg_temp.ag_set('on',0,0)$$,'agency_release_flag_not_permitted');
select pg_temp.flag_refuse($$select public.set_agency_release_flag_ceiling('25600000-0000-4000-8000-000000000001','flags-operator@example.test','25600000-0000-4000-8000-000000000010','make_real_live:internal_app','25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000040','publish','on',0,'Wrong System fixture')$$,'agency_release_flag_system_mismatch');
select pg_temp.flag_refuse($$select public.set_agency_release_flag_ceiling('25600000-0000-4000-8000-000000000001','flags-operator@example.test','25600000-0000-4000-8000-000000000010','agent_channel','25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000040','email','on',0,'Consent is not implied')$$,'agency_release_flag_operator_only');
set local role service_role;
select public.set_agency_release_flag_ceiling('25600000-0000-4000-8000-000000000001','flags-operator@example.test','25600000-0000-4000-8000-000000000010','systems','25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000040','publish','operators',0,'Explicit service-role permission');
reset role;
select pg_temp.flag_refuse($$select pg_temp.ag_set('on',0,1)$$,'agency_release_flag_above_ceiling');
select pg_temp.flag_refuse($$select pg_temp.ag_set('operators',0,1)$$,'agency_release_flag_unverified');
select public.record_agency_verification('flags-operator@example.test','25600000-0000-4000-8000-000000000020','publish','verified','{"fixture":true}',null);
select pg_temp.flag_refuse($$select public.set_agency_workspace_release_flag('25600000-0000-4000-8000-000000000030','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000004','flags-other@example.test','systems','operators',0,1,'Wrong agency fixture')$$,'agency_release_flag_not_permitted');
set local role service_role;
select public.set_agency_workspace_release_flag('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','flags-agency@example.test','systems','operators',0,1,'Explicit service-role change');
reset role;
select pg_temp.flag_refuse($$select pg_temp.ag_set('operators',0,1)$$,'workspace_release_revision_conflict');
select pg_temp.op_ceiling('on',1);
select pg_temp.flag_refuse($$select pg_temp.ag_set('on',1,1)$$,'workspace_release_revision_conflict');
select pg_temp.ag_set('on',1,2);
select pg_temp.flag_assert((select state='on' and revision=2 from public.workspace_release_flags where workspace_id='25600000-0000-4000-8000-000000000010' and flag='systems'),'agency native flag updated');
select pg_temp.flag_assert((select count(*)=2 from public.workspace_release_flag_changes where workspace_id='25600000-0000-4000-8000-000000000010'),'native immutable decision history');
select pg_temp.op_ceiling('operators',2);
select pg_temp.flag_assert((select state='operators' and revision=3 from public.workspace_release_flags where workspace_id='25600000-0000-4000-8000-000000000010' and flag='systems'),'ceiling downgrade atomically clamps flag');
select pg_temp.flag_refuse($$update public.agency_release_flag_ceiling_history set reason='Rewritten'$$,'workspace_release_history_immutable');
set local role service_role;
select public.set_workspace_release_flag_approved('25600000-0000-4000-8000-000000000001','25600000-0000-4000-8000-000000000010','systems','off','Operator withdrawal',3,null);
do $$begin
 begin
  perform public.set_workspace_release_flag('flags-operator@example.test','25600000-0000-4000-8000-000000000010','systems','off','Private setter attempt',4);
  raise exception 'bare-email setter unexpectedly admitted service_role';
 exception when insufficient_privilege then null;
 end;
end$$;
reset role;
select pg_temp.flag_assert(not has_function_privilege('service_role','public.set_workspace_release_flag(text,uuid,text,text,text,bigint)','execute'),'bare-email setter stays private');
select pg_temp.flag_assert((select max_state='off' and revision=4 from public.agency_release_flag_ceilings where workspace_id='25600000-0000-4000-8000-000000000010'),'existing operator off revokes agency permission');
select pg_temp.flag_refuse($$select pg_temp.ag_set('on',4,4)$$,'agency_release_flag_above_ceiling');
select pg_temp.op_ceiling('on',4);
select public.record_agency_verification('flags-operator@example.test','25600000-0000-4000-8000-000000000020','publish','unverified','{}','Verification withdrawn');
select pg_temp.flag_refuse($$select pg_temp.ag_set('on',4,5)$$,'agency_release_flag_unverified');
select public.record_agency_verification('flags-operator@example.test','25600000-0000-4000-8000-000000000020','publish','verified','{"fixture":true}',null);
update public.users set verified_at=null where id='25600000-0000-4000-8000-000000000003';
select pg_temp.flag_refuse($$select pg_temp.ag_set('on',4,5)$$,'workspace_access_denied');
update public.users set verified_at=now() where id='25600000-0000-4000-8000-000000000003';
savepoint staff_revocation;
update public.agency_client_staff set status='ended',ended_at=clock_timestamp(),ended_by='25600000-0000-4000-8000-000000000001' where agency_workspace_id='25600000-0000-4000-8000-000000000020' and status='active';
select pg_temp.flag_refuse($$select pg_temp.ag_set('on',4,5)$$,'workspace_access_denied');
rollback to staff_revocation;
release staff_revocation;
savepoint membership_revocation;
delete from public.workspace_memberships where workspace_id='25600000-0000-4000-8000-000000000020' and user_id='25600000-0000-4000-8000-000000000003';
select pg_temp.flag_refuse($$select pg_temp.ag_set('on',4,5)$$,'workspace_access_denied');
rollback to membership_revocation;
release membership_revocation;
select pg_temp.ag_set('on',4,5);
-- The existing provider-seat/System contract admits current staffed agency
-- admins and members alike; neither role alone creates client access.
savepoint agency_role_admission;
update public.workspace_memberships set role='admin' where workspace_id='25600000-0000-4000-8000-000000000020' and user_id='25600000-0000-4000-8000-000000000003';
set local role service_role;
select public.set_agency_workspace_release_flag('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','flags-agency@example.test','systems','operators',5,5,'Current staffed admin');
reset role;
update public.workspace_memberships set role='member' where workspace_id='25600000-0000-4000-8000-000000000020' and user_id='25600000-0000-4000-8000-000000000003';
set local role service_role;
select public.set_agency_workspace_release_flag('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','flags-agency@example.test','systems','on',6,5,'Current staffed member');
reset role;
select pg_temp.flag_assert((select state='on' and revision=7 from public.workspace_release_flags where workspace_id='25600000-0000-4000-8000-000000000010' and flag='systems'),'staffed admin/member service-role writes');
rollback to agency_role_admission;
release agency_role_admission;
savepoint operator_unset_admission;
set local role service_role;
select public.set_workspace_release_flag_approved('25600000-0000-4000-8000-000000000001','25600000-0000-4000-8000-000000000010','systems','unset','Operator unset withdrawal',5,null);
reset role;
select pg_temp.flag_assert((select max_state='off' and revision=6 from public.agency_release_flag_ceilings where workspace_id='25600000-0000-4000-8000-000000000010'),'approved operator unset withdraws ceiling');
rollback to operator_unset_admission;
release operator_unset_admission;
-- Live effects still need the owner's separate mandate; a flag grants none.
select pg_temp.flag_assert(not exists(select 1 from public.client_resource_mandates where customer_workspace_id='25600000-0000-4000-8000-000000000010'),'no mandate created');
select pg_temp.flag_refuse($$select public.assert_acting_provider('25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','flags-agency@example.test','publish','website','25600000-0000-4000-8000-000000000040')$$,'acting_provider_no_mandate');
\if :{?keep_fixture}
commit;
\else
rollback;
\endif
