\set ON_ERROR_STOP on
begin;
create function pg_temp.aic_assert(ok boolean,note text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ai controls assertion: %',note;end if;end$$;
create function pg_temp.aic_refuse(statement text,reason text) returns void language plpgsql as $$begin begin execute statement; exception when others then if position(reason in sqlerrm)=0 then raise exception 'expected %, got %',reason,sqlerrm;end if;return;end;raise exception 'expected refusal %, succeeded',reason;end$$;
insert into public.users(id,email,verified_at) values
 ('26100000-0000-4000-8000-000000000001','aic-operator@example.test',now()),
 ('26100000-0000-4000-8000-000000000002','aic-owner@example.test',now()),
 ('26100000-0000-4000-8000-000000000003','aic-agency@example.test',now()),
 ('26100000-0000-4000-8000-000000000004','aic-staff@example.test',now()),
 ('26100000-0000-4000-8000-000000000005','aic-outsider@example.test',now());
insert into public.super_admins(user_id,email) values('26100000-0000-4000-8000-000000000001','aic-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('26100000-0000-4000-8000-000000000010','customer','Controls client','26100000-0000-4000-8000-000000000002'),
 ('26100000-0000-4000-8000-000000000020','agency','Controls agency','26100000-0000-4000-8000-000000000003'),
 ('26100000-0000-4000-8000-000000000030','agency','Other agency','26100000-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('26100000-0000-4000-8000-000000000010','26100000-0000-4000-8000-000000000002','owner','26100000-0000-4000-8000-000000000002'),
 ('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000003','owner','26100000-0000-4000-8000-000000000003'),
 ('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000004','member','26100000-0000-4000-8000-000000000003'),
 ('26100000-0000-4000-8000-000000000030','26100000-0000-4000-8000-000000000005','owner','26100000-0000-4000-8000-000000000005');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('26100000-0000-4000-8000-000000000010','26100000-0000-4000-8000-000000000020','owner','26100000-0000-4000-8000-000000000002');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000010','26100000-0000-4000-8000-000000000004','26100000-0000-4000-8000-000000000003');
create function pg_temp.aic_set(paused boolean,cap integer,auto text,rev bigint) returns jsonb language sql as $$select public.set_agency_ai_controls('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000010','26100000-0000-4000-8000-000000000003','aic-agency@example.test',paused,cap,auto,rev,'Fixture change')$$;
-- Grants: service role only, scope helper never granted.
select pg_temp.aic_assert(not has_table_privilege('service_role','public.business_ai_controls','select'),'no table bypass');
select pg_temp.aic_assert(not has_function_privilege('authenticated','public.set_agency_ai_controls(uuid,uuid,uuid,text,boolean,integer,text,bigint,text)','execute'),'no public command');
select pg_temp.aic_assert(not has_function_privilege('service_role','public.agency_ai_controls_scope(uuid,uuid,uuid,text,boolean)','execute'),'scope helper not granted');
select pg_temp.aic_assert(has_function_privilege('service_role','public.reserve_business_ai_budget_v2(uuid,numeric,numeric,boolean,text)','execute'),'service role admits');
-- No row: neutral state.
select pg_temp.aic_assert((public.business_ai_controls_state('26100000-0000-4000-8000-000000000010')->>'revision')='0','neutral revision');
select pg_temp.aic_assert(public.business_ai_controls_state('26100000-0000-4000-8000-000000000010')->'setBy'='null'::jsonb,'neutral setBy');
-- Scope: staff can read but not write; an outsider can do neither.
select pg_temp.aic_assert((public.read_agency_ai_controls('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000004','aic-staff@example.test')->>'canChange')='false','staff cannot change');
select pg_temp.aic_assert(jsonb_array_length(public.read_agency_ai_controls('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000004','aic-staff@example.test')->'clients')=1,'staff sees assigned client');
select pg_temp.aic_refuse($$select public.set_agency_ai_controls('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000010','26100000-0000-4000-8000-000000000004','aic-staff@example.test',true,null,'client_choice',0,'Staff cannot')$$,'workspace_access_denied');
select pg_temp.aic_refuse($$select public.set_agency_ai_controls('26100000-0000-4000-8000-000000000030','26100000-0000-4000-8000-000000000010','26100000-0000-4000-8000-000000000005','aic-outsider@example.test',true,null,'client_choice',0,'No seat here')$$,'workspace_access_denied');
select pg_temp.aic_refuse($$select public.set_agency_ai_controls('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000010','26100000-0000-4000-8000-000000000003','wrong@example.test',true,null,'client_choice',0,'Wrong email')$$,'workspace_access_denied');
-- Validation.
select pg_temp.aic_refuse($$select public.set_agency_ai_controls('26100000-0000-4000-8000-000000000020','26100000-0000-4000-8000-000000000010','26100000-0000-4000-8000-000000000003','aic-agency@example.test',true,null,'client_choice',0,'x')$$,'ai_controls_reason_required');
select pg_temp.aic_refuse($$select pg_temp.aic_set(false,-1,'client_choice',0)$$,'ai_controls_invalid');
select pg_temp.aic_refuse($$select pg_temp.aic_set(false,null,'auto',0)$$,'ai_controls_invalid');
-- Set, revision check, history.
set local role service_role;
select pg_temp.aic_set(false,100,'held',0);
reset role;
select pg_temp.aic_refuse($$select pg_temp.aic_set(true,100,'held',0)$$,'ai_controls_revision_conflict');
select pg_temp.aic_assert((public.business_ai_controls_state('26100000-0000-4000-8000-000000000010')->'setBy'->>'agencyName')='Controls agency','agency named');
select pg_temp.aic_assert((select count(*) from public.business_ai_control_changes where workspace_id='26100000-0000-4000-8000-000000000010')=1,'one change row');
select pg_temp.aic_assert((select before from public.business_ai_control_changes limit 1) is null,'first change has no before');
-- Admission: the agency limit ($1.00) binds even where the base cap is off.
select pg_temp.aic_assert(public.reserve_business_ai_budget_v2('26100000-0000-4000-8000-000000000010',.6,0,false,'list_price')->>'status'='reserved','first reservation fits the limit');
select pg_temp.aic_assert(public.reserve_business_ai_budget_v2('26100000-0000-4000-8000-000000000010',.6,0,false,'list_price')->>'reason'='agency_cap','second is held at the agency limit');
-- A list-price hold is released once its own estimated cost is logged.
select public.record_model_calls(jsonb_build_array(jsonb_build_object('calledAt',clock_timestamp(),'purpose','ask','workspaceId','26100000-0000-4000-8000-000000000010','budgetReservationId',(select id::text from public.business_ai_budget_reservations limit 1),'actorKind','owner','modelLabel','fixture/text','attempt',1,'step',1,'latencyMs',1,'outcome','ok','costUsd','.1','costSource','estimate','priceTableVersion','fixture')));
select pg_temp.aic_assert((public.business_ai_budget_v2('26100000-0000-4000-8000-000000000010')->>'reservedUsd')::numeric=0,'list-price hold released after cost');
select pg_temp.aic_assert((public.business_ai_budget_v2('26100000-0000-4000-8000-000000000010')->>'spentUsd')::numeric=.1,'spend counted');
select pg_temp.aic_assert(public.reserve_business_ai_budget_v2('26100000-0000-4000-8000-000000000010',.6,0,false,'list_price')->>'status'='reserved','room again after release');
-- A qualified hold keeps its upper bound after cost.
select pg_temp.aic_assert(public.reserve_business_ai_budget_v2('26100000-0000-4000-8000-000000000010',.2,0,false,'qualified')->>'status'='reserved','qualified reservation fits');
-- Pause refuses everything, naming the controls.
set local role service_role;
select pg_temp.aic_set(true,100,'held',1);
reset role;
select pg_temp.aic_assert(public.reserve_business_ai_budget_v2('26100000-0000-4000-8000-000000000010',.01,5,true,'qualified')->>'reason'='controls','pause refuses');
select pg_temp.aic_assert((public.reserve_business_ai_budget_v2('26100000-0000-4000-8000-000000000010',.01,5,true,'qualified')->'budget'->'controls'->>'paused')='true','budget carries controls');
-- Invalid ceiling source.
select pg_temp.aic_refuse($$select public.reserve_business_ai_budget_v2('26100000-0000-4000-8000-000000000010',.01,5,true,'guess')$$,'business_ai_budget_invalid');
-- v1 is unchanged and ignores controls.
select pg_temp.aic_assert(public.business_ai_budget('26100000-0000-4000-8000-000000000010') ? 'spentUsd','v1 still readable');
-- Operator path.
select pg_temp.aic_refuse($$select public.read_operator_ai_controls('aic-agency@example.test','26100000-0000-4000-8000-000000000010')$$,'workspace_release_operator_required');
select pg_temp.aic_refuse($$select public.set_operator_ai_controls('aic-operator@example.test','26100000-0000-4000-8000-000000000020',false,null,'client_choice',0,'Not a customer')$$,'workspace_release_workspace_invalid');
select pg_temp.aic_refuse($$select public.set_operator_ai_controls('aic-operator@example.test','26100000-0000-4000-8000-000000000010',false,null,'client_choice',0,'Stale revision')$$,'ai_controls_revision_conflict');
set local role service_role;
select public.set_operator_ai_controls('aic-operator@example.test','26100000-0000-4000-8000-000000000010',false,null,'client_choice',2,'Operator lifts it');
reset role;
select pg_temp.aic_assert((public.business_ai_controls_state('26100000-0000-4000-8000-000000000010')->'setBy'->>'kind')='operator','operator named');
select pg_temp.aic_assert(jsonb_array_length(public.read_operator_ai_controls('aic-operator@example.test','26100000-0000-4000-8000-000000000010')->'history')=3,'history lists changes');
select pg_temp.aic_assert(public.reserve_business_ai_budget_v2('26100000-0000-4000-8000-000000000010',.01,5,true,'qualified')->>'status'='reserved','lifted control admits against the base cap');
-- A client whose seat ended is outside the agency's reach.
update public.provider_seats set status='ended',ended_by='26100000-0000-4000-8000-000000000002',ended_at=now() where customer_workspace_id='26100000-0000-4000-8000-000000000010';
select pg_temp.aic_refuse($$select pg_temp.aic_set(true,null,'client_choice',3)$$,'workspace_access_denied');
-- An operator can still hold work for a client whose agency seat ended.
set local role service_role;
select public.set_operator_ai_controls('aic-operator@example.test','26100000-0000-4000-8000-000000000010',true,null,'held',3,'Operator pauses after exit');
reset role;
\if :{?keep_fixture}
commit;
\else
rollback;
\endif
