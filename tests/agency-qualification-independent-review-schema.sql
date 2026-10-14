\set ON_ERROR_STOP on
-- Run after all forwards in disposable Postgres. Leaves no fixture rows.
begin;
create function pg_temp.aqi_assert(ok boolean,note text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'independent review assertion: %',note; end if; end$$;
insert into public.users(id,email,verified_at) values
 ('5f000000-0000-4000-8000-000000000001','aqi-agency@example.test',now()),
 ('5f000000-0000-4000-8000-000000000002','aqi-reviewer@example.test',now());
insert into public.super_admins(user_id,email) values
 ('5f000000-0000-4000-8000-000000000001','aqi-agency@example.test'),
 ('5f000000-0000-4000-8000-000000000002','aqi-reviewer@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('5f000000-0000-4000-8000-000000000010','agency','Independent review fixture','5f000000-0000-4000-8000-000000000001');
-- Every current reviewer belongs to this agency: nobody can independently decide.
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select '5f000000-0000-4000-8000-000000000010',user_id,'owner','5f000000-0000-4000-8000-000000000001' from public.super_admins;
set local role service_role;
select public.submit_agency_qualification('5f000000-0000-4000-8000-000000000001','aqi-agency@example.test','5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000100','publish','https://example.test/evidence','Website release and recovery tested safely');
reset role;
select pg_temp.aqi_assert((public.read_agency_qualification('5f000000-0000-4000-8000-000000000001','aqi-agency@example.test','5f000000-0000-4000-8000-000000000010')->'independentReviewerAvailable')='false'::jsonb,'submission accepted with no independent reviewer');
select pg_temp.aqi_assert(exists(select 1 from jsonb_array_elements(public.read_agency_qualification_desk('aqi-agency@example.test')) r where r->>'id'='5f000000-0000-4000-8000-000000000100' and r->'canReview'='false'::jsonb and r->'decision'='null'::jsonb),'own evidence retained in queue without review controls');
do $$ begin
  begin perform public.decide_agency_qualification('aqi-agency@example.test','5f000000-0000-4000-8000-000000000100','verified','Self review must never be accepted');
  exception when others then if position('agency_qualification_self_verification' in sqlerrm)>0 then return; end if; raise; end;
  raise exception 'self review unexpectedly allowed';
end $$;
delete from public.workspace_memberships where workspace_id='5f000000-0000-4000-8000-000000000010' and user_id='5f000000-0000-4000-8000-000000000002';
select pg_temp.aqi_assert((public.read_agency_qualification('5f000000-0000-4000-8000-000000000001','aqi-agency@example.test','5f000000-0000-4000-8000-000000000010')->'independentReviewerAvailable')='true'::jsonb,'independent confirmed reviewer becomes available');
select pg_temp.aqi_assert(exists(select 1 from jsonb_array_elements(public.read_agency_qualification_desk('aqi-reviewer@example.test')) r where r->>'id'='5f000000-0000-4000-8000-000000000100' and r->'canReview'='true'::jsonb),'independent reviewer can review exact submission');
update public.super_admins set revoked_at=now() where user_id='5f000000-0000-4000-8000-000000000002';
select pg_temp.aqi_assert((public.read_agency_qualification('5f000000-0000-4000-8000-000000000001','aqi-agency@example.test','5f000000-0000-4000-8000-000000000010')->'independentReviewerAvailable')='false'::jsonb,'revoked reviewer does not count');
update public.super_admins set revoked_at=null where user_id='5f000000-0000-4000-8000-000000000002';
update public.users set verified_at=null where id='5f000000-0000-4000-8000-000000000002';
select pg_temp.aqi_assert((public.read_agency_qualification('5f000000-0000-4000-8000-000000000001','aqi-agency@example.test','5f000000-0000-4000-8000-000000000010')->'independentReviewerAvailable')='false'::jsonb,'unconfirmed reviewer does not count');
update public.users set verified_at=now() where id='5f000000-0000-4000-8000-000000000002';
select public.decide_agency_qualification('aqi-reviewer@example.test','5f000000-0000-4000-8000-000000000100','verified','Independent website and recovery evidence checked');
select pg_temp.aqi_assert(public.agency_effect_allowed('5f000000-0000-4000-8000-000000000010','publish'),'independent decision unlocks only its existing effect');
rollback;
