\set ON_ERROR_STOP on
begin;
create function pg_temp.sr_assert(v boolean,m text) returns void language plpgsql as $$begin if v is not true then raise exception 'sandbox runtime fixture: %',m;end if;end;$$;
create function pg_temp.sr_denied(q text,e text) returns void language plpgsql as $$declare caught text;begin begin execute q;exception when others then caught:=sqlerrm;end;perform pg_temp.sr_assert(caught=e,'expected '||e||', got '||coalesce(caught,'success'));end;$$;
do $$declare
 u uuid='cc335000-0000-4000-8000-000000000001';reviewer uuid='cc335000-0000-4000-8000-000000000002';
 ws uuid='cc335000-0000-4000-8000-000000000010';work uuid='cc335000-0000-4000-8000-000000000020';job uuid;attempt uuid;receipt uuid;
 files jsonb='{"build.mjs":"Reviewed fictional source never executed"}';digest text;name text;image text='fixture-team/node@sha256:'||repeat('a',64);
 checks jsonb='{"sourceReviewed":true,"denyAllNetwork":true,"noGuestCredentials":true,"noPortsOrPersistence":true,"imageHelpersQualified":true,"resource2048MbAccepted":true,"cleanupQualified":true,"commercialProjectApproved":true}';
begin
 insert into public.users(id,email,verified_at) values(u,'runtime-owner@example.test',now()),(reviewer,'runtime-reviewer@example.test',now());
 insert into public.super_admins(user_id,email) values(reviewer,'runtime-reviewer@example.test');
 insert into public.workspaces(id,kind,name,created_by) values(ws,'personal','Fictional runtime qualification',u);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,u,'owner',u);
 digest:=public.custom_application_source_digest(files);name:='strelva-build-'||left(public.custom_application_digest(ws,work,1,digest),48);
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(work,ws,'custom-applications','custom-application','Fictional runtime',jsonb_build_object('version',1,'revision',0,'title','Fictional runtime','createdBy',u,'createdAt',now(),'history','[]'::jsonb,'product','custom-applications','status','draft','maintenanceOwner',u,'candidate',jsonb_build_object('revision',0,'version',1,'title','Fictional runtime','files',files,'sourceDigest',digest,'artifact',null),'currentReleaseVersion',null,'releases','[]'::jsonb,'budget',null,'updatedAt',now()),u);
 perform pg_temp.sr_assert((select candidate_source_digest=digest and candidate_files=files from public.custom_application_states where work_id=work),'real saved-work initializer retains exact source');
 perform pg_temp.sr_assert(not has_function_privilege('authenticated','public.qualify_custom_sandbox_runtime(uuid,integer,text,text,text,text,text,jsonb,uuid,text)','EXECUTE'),'browser cannot qualify runtime');
 perform pg_temp.sr_assert(not has_table_privilege('service_role','public.custom_sandbox_runtime_qualifications','INSERT'),'no direct qualification DML');
 perform pg_temp.sr_denied(format('select public.qualify_custom_sandbox_runtime(%L,0,%L,''team_fixture'',''prj_fixture'',%L,''fixture-v1'',%L,%L,''runtime-owner@example.test'')',work,digest,image,checks,u),'sandbox_runtime_reviewer_denied');
 perform pg_temp.sr_denied(format('select public.qualify_custom_sandbox_runtime(%L,0,%L,''team_fixture'',''prj_fixture'',%L,''fixture-v1'',''{}'',%L,''runtime-reviewer@example.test'')',work,digest,image,reviewer),'sandbox_runtime_qualification_required');
 receipt:=public.qualify_custom_sandbox_runtime(work,0,digest,'team_fixture','prj_fixture',image,'fixture-v1',checks,reviewer,'runtime-reviewer@example.test');
 perform pg_temp.sr_assert(public.assert_custom_sandbox_runtime(work,1,0,digest,'team_fixture','prj_fixture',image,'fixture-v1',u,'runtime-owner@example.test'),'exact reviewed source qualifies');
 perform pg_temp.sr_denied(format('select public.assert_custom_sandbox_runtime(%L,1,0,%L,''team_other'',''prj_fixture'',%L,''fixture-v1'',%L,''runtime-owner@example.test'')',work,digest,image,u),'sandbox_runtime_qualification_required');
 select id into job from public.job_economics_command(jsonb_build_object('action','create','productId','custom-applications','resourceKind','custom-application','workspaceId',ws,'workId',work,'payerId',u,'estimateCents',null,'maxAuthorizedCents',100),u,'runtime-owner@example.test');
 perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',job),u,'runtime-owner@example.test');
 perform public.custom_application_set_budget(work,ws,job,100,null,u,'runtime-owner@example.test');
 attempt:=(public.prepare_qualified_sandbox_build_attempt(work,1,0,digest,name,'team_fixture','prj_fixture',image,u,'runtime-owner@example.test','fixture-v1')->>'id')::uuid;
 update public.super_admins set revoked_at=now() where user_id=reviewer;
 perform pg_temp.sr_denied(format('select public.begin_qualified_sandbox_build_attempt(%L,%L,''runtime-owner@example.test'')',attempt,u),'sandbox_runtime_reviewer_denied');
 update public.super_admins set revoked_at=null where user_id=reviewer;
 perform public.begin_qualified_sandbox_build_attempt(attempt,u,'runtime-owner@example.test');
 perform pg_temp.sr_assert((select reserved_cents=100 and used_cents=0 from public.job_economics where id=job),'provider hold is not zero-cost tool completion');
 perform pg_temp.sr_denied(format('delete from public.custom_sandbox_runtime_qualifications where id=%L',receipt),'sandbox_build_immutable');
end;$$;
rollback;
