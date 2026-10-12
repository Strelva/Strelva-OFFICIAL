\set ON_ERROR_STOP on
-- Run after all ordered migrations in disposable Postgres. Fictional rows only.
begin;
create function pg_temp.aq_assert(ok boolean,note text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'qualification assertion: %',note; end if; end$$;
create function pg_temp.aq_refuse(statement text,reason text) returns void language plpgsql as $$begin begin execute statement; exception when others then if position(reason in sqlerrm)=0 then raise exception 'expected %, got %',reason,sqlerrm; end if; return; end; raise exception 'expected refusal %, succeeded',reason; end$$;
insert into public.users(id,email,verified_at) values
 ('5e000000-0000-4000-8000-000000000001','aq-operator@example.test',now()),
 ('5e000000-0000-4000-8000-000000000002','aq-agency@example.test',now()),
 ('5e000000-0000-4000-8000-000000000003','aq-member@example.test',now()),
 ('5e000000-0000-4000-8000-000000000004','aq-other@example.test',now());
insert into public.super_admins(user_id,email) values ('5e000000-0000-4000-8000-000000000001','aq-operator@example.test'),('5e000000-0000-4000-8000-000000000002','aq-agency@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('5e000000-0000-4000-8000-000000000010','agency','Strelva Agency','5e000000-0000-4000-8000-000000000002'),
 ('5e000000-0000-4000-8000-000000000020','agency','Outside Agency','5e000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select w,u,r,'5e000000-0000-4000-8000-000000000002'::uuid from (values
 ('5e000000-0000-4000-8000-000000000010'::uuid,'5e000000-0000-4000-8000-000000000002'::uuid,'owner'),
 ('5e000000-0000-4000-8000-000000000020'::uuid,'5e000000-0000-4000-8000-000000000002'::uuid,'owner'),
 ('5e000000-0000-4000-8000-000000000010'::uuid,'5e000000-0000-4000-8000-000000000003'::uuid,'member')) x(w,u,r);
select pg_temp.aq_assert(not public.agency_effect_allowed('5e000000-0000-4000-8000-000000000010','publish'),'no default verification');
-- Inspect actual installed function definitions: KEY SHARE would permit current
-- role/email/verification/revocation updates while a mutation is in flight.
select pg_temp.aq_assert(position('for share of m,u' in pg_get_functiondef('public.submit_agency_qualification(uuid,text,uuid,uuid,text,text,text)'::regprocedure))>0,'submission locks current role and identity');
select pg_temp.aq_assert(position('for share of u,sa' in pg_get_functiondef('public.decide_agency_qualification(text,uuid,text,text)'::regprocedure))>0,'decision locks confirmed operator and revocation');

select pg_temp.aq_assert(not has_table_privilege('service_role','public.agency_qualification_submissions','insert') and not has_function_privilege('authenticated','public.submit_agency_qualification(uuid,text,uuid,uuid,text,text,text)','execute'),'no direct bypass');
select pg_temp.aq_refuse($$select public.read_agency_qualification('5e000000-0000-4000-8000-000000000004','aq-other@example.test','5e000000-0000-4000-8000-000000000010')$$,'agency_qualification_access_denied');
select pg_temp.aq_refuse($$select public.submit_agency_qualification('5e000000-0000-4000-8000-000000000003','aq-member@example.test','5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000099','publish','https://example.test/proof','Rehearsed website release and recovery')$$,'agency_qualification_access_denied');
set local role service_role;
select public.submit_agency_qualification('5e000000-0000-4000-8000-000000000002','aq-agency@example.test','5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000100','publish','https://example.test/proof','Rehearsed website release and recovery');
-- Retrying the same request is idempotent.
select public.submit_agency_qualification('5e000000-0000-4000-8000-000000000002','aq-agency@example.test','5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000100','publish','https://example.test/proof','Rehearsed website release and recovery');
reset role;
select pg_temp.aq_assert((select count(*)=1 from public.agency_qualification_submissions),'duplicate request appends nothing');
select pg_temp.aq_refuse($$select public.submit_agency_qualification('5e000000-0000-4000-8000-000000000002','aq-agency@example.test','5e000000-0000-4000-8000-000000000020','5e000000-0000-4000-8000-000000000100','publish','https://example.test/proof','Rehearsed website release and recovery')$$,'agency_qualification_request_conflict');
select pg_temp.aq_refuse($$select public.submit_agency_qualification('5e000000-0000-4000-8000-000000000002','aq-agency@example.test','5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000101','publish','https://example.test/proof','Rehearsed website release and recovery')$$,'agency_qualification_pending');
select pg_temp.aq_refuse($$select public.decide_agency_qualification('aq-agency@example.test','5e000000-0000-4000-8000-000000000100','verified','Independent review is required')$$,'agency_qualification_self_verification');
select pg_temp.aq_refuse($$select public.record_agency_verification('aq-operator@example.test','5e000000-0000-4000-8000-000000000010','publish','verified','{"fixture":true}',null)$$,'agency_qualification_submission_required');
select public.decide_agency_qualification('aq-operator@example.test','5e000000-0000-4000-8000-000000000100','changes_requested','Supply domain authority and rollback evidence');
select public.submit_agency_qualification('5e000000-0000-4000-8000-000000000002','aq-agency@example.test','5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000101','publish','https://example.test/proof','Domain authority and rollback rehearsed');
select pg_temp.aq_refuse($$select public.decide_agency_qualification('aq-operator@example.test','5e000000-0000-4000-8000-000000000100','verified','Old evidence cannot be qualified now')$$,'agency_qualification_stale');
update public.super_admins set revoked_at=now() where user_id='5e000000-0000-4000-8000-000000000001';
select pg_temp.aq_refuse($$select public.decide_agency_qualification('aq-operator@example.test','5e000000-0000-4000-8000-000000000101','verified','Revoked operator cannot qualify evidence')$$,'tenant_conversion_operator_required');
update public.super_admins set revoked_at=null where user_id='5e000000-0000-4000-8000-000000000001';
select public.decide_agency_qualification('aq-operator@example.test','5e000000-0000-4000-8000-000000000101','verified','Domain authority and rollback evidence checked');
select pg_temp.aq_assert(public.agency_effect_allowed('5e000000-0000-4000-8000-000000000010','publish') and not public.agency_effect_allowed('5e000000-0000-4000-8000-000000000010','google'),'availability applies to one effect only');
select public.decide_agency_qualification('aq-operator@example.test','5e000000-0000-4000-8000-000000000101','unavailable','Domain authority proof is no longer current');
select pg_temp.aq_assert(not public.agency_effect_allowed('5e000000-0000-4000-8000-000000000010','publish'),'operator revocation fails closed');
select pg_temp.aq_assert((select count(*)=3 from public.agency_qualification_decisions),'review/approval/revocation retained');
select pg_temp.aq_refuse($$update public.agency_qualification_submissions set evidence='rewritten private evidence'$$,'agency_qualification_immutable');
select pg_temp.aq_refuse($$delete from public.agency_qualification_decisions$$,'agency_qualification_immutable');
-- Agency and operator reads remain usable in explicit READ ONLY transactions.
commit;
begin read only;
select pg_temp.aq_assert((public.read_agency_qualification('5e000000-0000-4000-8000-000000000002','aq-agency@example.test','5e000000-0000-4000-8000-000000000010')->'canSubmit')='true'::jsonb,'member READ ONLY read');
commit;
select pg_temp.aq_assert(jsonb_array_length(public.read_agency_qualification_desk('aq-operator@example.test'))=2,'operator reads actual submission history');
