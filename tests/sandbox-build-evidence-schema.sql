\set ON_ERROR_STOP on
create temp table sandbox_shared_function_hashes as select p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('job_economics_execution_command','record_work_provider_receipt_decimal','custom_application_assert_identity');
begin;
create function pg_temp.sb_assert(v boolean,m text) returns void language plpgsql as $$begin if v is not true then raise exception 'sandbox fixture: %',m;end if;end;$$;
create function pg_temp.sb_denied(q text,e text) returns void language plpgsql as $$declare caught text;begin begin execute q;exception when others then caught:=sqlerrm;end;perform pg_temp.sb_assert(caught=e,'expected '||e||', got '||coalesce(caught,'success'));end;$$;
do $$declare u uuid='cc334000-0000-4000-8000-000000000001';other_user uuid='cc334000-0000-4000-8000-000000000002';ws uuid='cc334000-0000-4000-8000-000000000010';work uuid='cc334000-0000-4000-8000-000000000020';job uuid;attempt uuid;name text;digest text;image text='fixture-team/node@sha256:'||repeat('a',64);data jsonb;first uuid;second uuid;bill uuid;receipt jsonb;before_count bigint;files jsonb='{"build.mjs":"Fictional never executed build"}';begin
 -- Explicitly fictional identities, provider IDs, budget and bill in a disposable DB.
 insert into public.users(id,email,verified_at) values(u,'sandbox-owner@example.test',now()),(other_user,'sandbox-stranger@example.test',now());
 insert into public.workspaces(id,kind,name,created_by) values(ws,'personal','Sandbox disposable authority fixture',u);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,u,'owner',u);
 digest:=public.custom_application_source_digest(files);
 name:='strelva-build-'||left(public.custom_application_digest(ws,work,1,digest),48);
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(work,ws,'custom-applications','custom-application','Fixture isolated builder',jsonb_build_object('version',1,'revision',0,'title','Fixture isolated builder','createdBy',u,'createdAt',now(),'history','[]'::jsonb,'product','custom-applications','status','draft','maintenanceOwner',u,'candidate',jsonb_build_object('revision',0,'version',1,'title','Fixture isolated builder','files',files,'sourceDigest',digest,'artifact',null),'currentReleaseVersion',null,'releases','[]'::jsonb,'budget',null,'updatedAt',now()),u);
 perform pg_temp.sb_assert(not has_function_privilege('authenticated','public.prepare_sandbox_build_attempt(uuid,integer,integer,text,text,text,text,text,uuid,text)','EXECUTE'),'no browser admission authority');
 perform pg_temp.sb_assert(not has_function_privilege('anon','public.record_sandbox_build_billing_evidence(uuid,text,text,text,text,text,text)','EXECUTE'),'no anonymous billing authority');
 perform pg_temp.sb_assert(not has_table_privilege('service_role','public.sandbox_build_attempts','INSERT'),'no direct attempt DML');
 perform pg_temp.sb_assert((select bool_and(relrowsecurity) from pg_class where oid in('public.sandbox_build_attempts'::regclass,'public.sandbox_build_observations'::regclass,'public.sandbox_build_billing_evidence'::regclass)),'RLS on all evidence');
 select id into job from public.job_economics_command(jsonb_build_object('action','create','productId','custom-applications','resourceKind','custom-application','workspaceId',ws,'workId',work,'payerId',u,'estimateCents',null,'maxAuthorizedCents',100),u,'sandbox-owner@example.test');
 perform pg_temp.sb_denied(format('select public.prepare_sandbox_build_attempt(%L,1,0,%L,%L,''team_fixture'',''prj_fixture'',%L,%L,''sandbox-owner@example.test'')',work,digest,name,image,u),'sandbox_build_budget_required');
 perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',job),u,'sandbox-owner@example.test');
 perform public.custom_application_set_budget(work,ws,job,100,null,u,'sandbox-owner@example.test');
 perform pg_temp.sb_denied(format('select public.prepare_sandbox_build_attempt(%L,1,0,%L,%L,''team_fixture'',''prj_fixture'',%L,%L,''sandbox-stranger@example.test'')',work,digest,name,image,other_user),'custom_application_access_denied');
 perform pg_temp.sb_denied(format('select public.prepare_sandbox_build_attempt(%L,1,0,%L,%L,''team_fixture'',''prj_fixture'',%L,%L,''sandbox-owner@example.test'')',work,repeat('b',64),name,image,u),'sandbox_build_target_changed');
 select public.prepare_sandbox_build_attempt(work,1,0,digest,name,'team_fixture','prj_fixture',image,u,'sandbox-owner@example.test') into data;attempt:=(data->>'id')::uuid;
 perform pg_temp.sb_assert((select reserved_cents=100 and used_cents=0 from public.job_economics where id=job),'accepted budget held, no fabricated cost');
 perform pg_temp.sb_assert((public.prepare_sandbox_build_attempt(work,1,0,digest,name,'team_fixture','prj_fixture',image,u,'sandbox-owner@example.test')->>'id')::uuid=attempt,'exact prepare replay');
 perform pg_temp.sb_assert((select count(*)=1 from public.job_economics_reservations where job_id=job),'no duplicate cap reservation');
 perform pg_temp.sb_denied(format('select public.prepare_sandbox_build_attempt(%L,1,0,%L,%L,''team_foreign'',''prj_fixture'',%L,%L,''sandbox-owner@example.test'')',work,digest,name,image,u),'sandbox_build_attempt_mismatch');
 perform pg_temp.sb_denied('select public.sandbox_build_rollback_assert_unused()','rollback_sandbox_build_evidence_in_use');
 begin
  delete from public.custom_application_states where work_id=work;
  perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_target_changed');
  raise exception 'restore missing state probe';
 exception when others then if sqlerrm<>'restore missing state probe' then raise;end if;end;
 begin
  update public.custom_application_states set budget_job_id=null,budget_max_authorized_cents=null,budget_estimate_cents=null where work_id=work;
  perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_target_changed');
  raise exception 'restore defunded state probe';
 exception when others then if sqlerrm<>'restore defunded state probe' then raise;end if;end;
 begin
  perform public.custom_application_update_candidate(work,0,'Changed fixture source','{"build.mjs":"Fictional changed source"}',u,'sandbox-owner@example.test');
  perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_target_changed');
  raise exception 'restore changed candidate probe';
 exception when others then if sqlerrm<>'restore changed candidate probe' then raise;end if;end;
 begin
  perform * from public.job_economics_command(jsonb_build_object('action','cancel','jobId',job),u,'sandbox-owner@example.test');
  perform pg_temp.sb_assert((select reserved_cents=0 from public.job_economics where id=job),'unstarted cancellation releases reservation, no provider claim');
  perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_budget_required');
  raise exception 'restore canceled budget probe';
 exception when others then if sqlerrm<>'restore canceled budget probe' then raise;end if;end;
 update public.users set verified_at=null where id=u;
 perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'verified_identity_required');
 update public.users set verified_at=now() where id=u;
 update public.workspace_memberships set role='member' where workspace_id=ws and user_id=u;
 perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'custom_application_access_denied');
 update public.workspace_memberships set role='owner' where workspace_id=ws and user_id=u;
 perform public.begin_sandbox_build_attempt(attempt,u,'sandbox-owner@example.test');
 perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_attempt_unresolved');
 select public.record_sandbox_build_observation(attempt,'team_fixture','prj_fixture',name,'creation_unknown',null,'{}') into first;
 perform pg_temp.sb_assert(first=public.record_sandbox_build_observation(attempt,'team_fixture','prj_fixture',name,'creation_unknown',null,'{}'),'ambiguous create replay is observation only');
 perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_attempt_unresolved');
 perform pg_temp.sb_denied(format('select public.record_sandbox_build_observation(%L,''team_fixture'',''prj_fixture'',%L,''stopped'',''sbx_fixture'',''{"activeCpuDurationMs":142,"ingressBytes":500,"egressBytes":200}''::jsonb)',attempt,name),'sandbox_build_session_mismatch');
 perform public.record_sandbox_build_observation(attempt,'team_fixture','prj_fixture',name,'created','sbx_fixture','{}');
 perform pg_temp.sb_denied(format('select public.record_sandbox_build_billing_evidence(%L,''team_fixture'',''prj_fixture'',''sbx_fixture'',''usd'',''0.023'',''fixture-before-stop'')',attempt),'sandbox_build_scope_mismatch');
 perform pg_temp.sb_denied(format('select public.record_sandbox_build_observation(%L,''team_foreign'',''prj_fixture'',%L,''stopped'',''sbx_fixture'',''{"activeCpuDurationMs":142,"ingressBytes":500,"egressBytes":200}''::jsonb)',attempt,name),'sandbox_build_scope_mismatch');
 perform pg_temp.sb_denied(format('select public.record_sandbox_build_observation(%L,''team_fixture'',''prj_fixture'',%L,''stopped'',''sbx_other'',''{"activeCpuDurationMs":142,"ingressBytes":500,"egressBytes":200}''::jsonb)',attempt,name),'sandbox_build_session_mismatch');
 perform pg_temp.sb_denied(format('select public.record_sandbox_build_observation(%L,''team_fixture'',''prj_fixture'',%L,''stopped'',''sbx_fixture'',''{"activeCpuDurationMs":-1,"ingressBytes":500,"egressBytes":200}''::jsonb)',attempt,name),'sandbox_build_observation_invalid');
 select public.record_sandbox_build_observation(attempt,'team_fixture','prj_fixture',name,'stopped','sbx_fixture','{"activeCpuDurationMs":142.25,"ingressBytes":500,"egressBytes":200}') into first;
 select public.record_sandbox_build_observation(attempt,'team_fixture','prj_fixture',name,'stopped','sbx_fixture','{"activeCpuDurationMs":142.25,"ingressBytes":500,"egressBytes":200}') into second;
 perform pg_temp.sb_assert(first=second,'immutable SDK usage replay');
 perform pg_temp.sb_assert((select reserved_cents=100 and used_cents=0 from public.job_economics where id=job),'CPU/network counts do not settle dollars');
 perform pg_temp.sb_denied(format('select public.record_sandbox_build_observation(%L,''team_fixture'',''prj_fixture'',%L,''stopped'',''sbx_fixture'',''{"activeCpuDurationMs":143,"ingressBytes":500,"egressBytes":200}''::jsonb)',attempt,name),'sandbox_build_observation_conflict');
 perform pg_temp.sb_denied(format('update public.sandbox_build_attempts set source_digest=%L where id=%L',repeat('b',64),attempt),'sandbox_build_immutable');
 perform pg_temp.sb_denied(format('delete from public.sandbox_build_observations where id=%L',first),'sandbox_build_immutable');
 bill:=public.record_sandbox_build_billing_evidence(attempt,'team_fixture','prj_fixture','sbx_fixture','usd','0.023','fixture-trusted-bill-reference');
 perform pg_temp.sb_assert(bill=public.record_sandbox_build_billing_evidence(attempt,'team_fixture','prj_fixture','sbx_fixture','usd','0.023','fixture-trusted-bill-reference'),'exact supplied bill replay');
 perform pg_temp.sb_denied(format('select public.record_sandbox_build_billing_evidence(%L,''team_fixture'',''prj_fixture'',''sbx_fixture'',''usd'',''0.024'',''fixture-trusted-bill-reference'')',attempt),'sandbox_build_billing_conflict');
 -- A real supplied receipt survives authorization loss; reconciliation is blocked.
 update public.users set verified_at=null where id=u;
 perform pg_temp.sb_denied(format('select public.reconcile_sandbox_build_billing(%L)',bill),'job_economics_identity_denied');
 perform pg_temp.sb_assert(exists(select 1 from public.sandbox_build_billing_evidence where id=bill and billable_usd='0.023'),'bill evidence retained separately from financial mutation');
 update public.users set verified_at=now() where id=u;
 receipt:=public.reconcile_sandbox_build_billing(bill);
 perform pg_temp.sb_assert((receipt->>'replayed')::boolean=false,'first factual receipt settles exact execution');
 perform pg_temp.sb_assert((public.reconcile_sandbox_build_billing(bill)->>'replayed')::boolean,'same bill cannot double count');
 perform pg_temp.sb_assert((select billable_usd_text='0.023' from public.work_provider_receipts where id=(receipt->>'receiptId')::uuid),'exact decimal preserved without floating conversion');
 perform pg_temp.sb_assert((select used_cents=2 from public.job_economics where id=job),'shared cent/subcent ledger reused');
 perform pg_temp.sb_assert((public.read_sandbox_build_attempt(attempt,u,'sandbox-owner@example.test')->'execution'->>'status')='finished','authorized evidence review includes financial status');
 perform pg_temp.sb_denied(format('select public.read_sandbox_build_attempt(%L,%L,''sandbox-stranger@example.test'')',attempt,other_user),'custom_application_access_denied');
 perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_attempt_unresolved');
end;$$;
do $$declare u uuid='cc334000-0000-4000-8000-000000000001';payer uuid='cc334000-0000-4000-8000-000000000002';ws uuid='cc334000-0000-4000-8000-000000000010';w uuid;job uuid;digest text;name text;attempt uuid;bill uuid;n integer;cap integer;begin
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,payer,'member',u);
 for n in 1..2 loop
  w:=case when n=1 then 'cc334000-0000-4000-8000-000000000021'::uuid else 'cc334000-0000-4000-8000-000000000022'::uuid end;cap:=case when n=1 then 100 else 0 end;
  insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) select w,workspace_id,product_id,resource_kind,title,payload,created_by from public.saved_product_work where id='cc334000-0000-4000-8000-000000000020';
  select candidate_source_digest into digest from public.custom_application_states where work_id=w;
  name:='strelva-build-'||left(public.custom_application_digest(ws,w,1,digest),48);
  select id into job from public.job_economics_command(jsonb_build_object('action','create','productId','custom-applications','resourceKind','custom-application','workspaceId',ws,'workId',w,'payerId',payer,'estimateCents',null,'maxAuthorizedCents',cap),u,'sandbox-owner@example.test');
  perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',job),payer,'sandbox-stranger@example.test');
  perform public.custom_application_set_budget(w,ws,job,cap,null,u,'sandbox-owner@example.test');
  if n=2 then
   perform pg_temp.sb_denied(format('select public.prepare_sandbox_build_attempt(%L,1,0,%L,%L,''team_fixture'',''prj_fixture'',%L,%L,''sandbox-owner@example.test'')',w,digest,name,'fixture-team/node@sha256:'||repeat('a',64),u),'sandbox_build_budget_required');
  else
   attempt:=(public.prepare_sandbox_build_attempt(w,1,0,digest,name,'team_fixture','prj_fixture','fixture-team/node@sha256:'||repeat('a',64),u,'sandbox-owner@example.test')->>'id')::uuid;
   update public.workspace_memberships set role='admin' where workspace_id=ws and user_id=u;
   update public.users set verified_at=null where id=payer;
   perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_payer_required');
   update public.users set verified_at=now() where id=payer;
   update public.workspace_memberships set role='owner' where workspace_id=ws and user_id=u;
   delete from public.workspace_memberships where workspace_id=ws and user_id=payer;
   -- Current business owner succeeds after the historical accepting member exits.
   perform public.begin_sandbox_build_attempt(attempt,u,'sandbox-owner@example.test');
   insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,payer,'member',u);
   perform public.record_sandbox_build_observation(attempt,'team_fixture','prj_fixture',name,'created','sbx_overage','{}');
   perform public.record_sandbox_build_observation(attempt,'team_fixture','prj_fixture',name,'stopped','sbx_overage','{"activeCpuDurationMs":900,"ingressBytes":500,"egressBytes":200}');
   -- Fictional independently supplied overage; no rate/cost is calculated here.
   bill:=public.record_sandbox_build_billing_evidence(attempt,'team_fixture','prj_fixture','sbx_overage','usd','1.01','fixture-trusted-overage');
   perform pg_temp.sb_denied(format('select public.reconcile_sandbox_build_billing(%L)',bill),'provider_receipt_invalid');
   perform pg_temp.sb_assert(exists(select 1 from public.sandbox_build_billing_evidence where id=bill and billable_usd='1.01'),'exact overage retained for review');
   perform pg_temp.sb_assert((select reserved_cents=100 and used_cents=0 from public.job_economics where id=job),'overage remains held, no cap expansion');
  end if;
 end loop;
end;$$;
do $$declare u uuid='cc334000-0000-4000-8000-000000000001';signer uuid='cc334000-0000-4000-8000-000000000003';successor uuid='cc334000-0000-4000-8000-000000000004';ws uuid='cc334000-0000-4000-8000-000000000011';agency uuid='cc334000-0000-4000-8000-000000000012';w uuid='cc334000-0000-4000-8000-000000000023';t public.workspace_payer_transitions;j public.job_economics;digest text;name text;image text='fixture-team/node@sha256:'||repeat('a',64);attempt uuid;begin
 insert into public.users(id,email,verified_at) values(signer,'sandbox-agency@example.test',now()),(successor,'sandbox-successor@example.test',now());
 insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Sandbox agency payer fixture',u),(agency,'agency','Sandbox fictional paying agency',signer);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,u,'owner',u),(agency,signer,'owner',signer),(agency,successor,'admin',signer);
 insert into public.accounts(name,workspace_id,billing_type) values('Sandbox agency fixture',ws,'subscription');
 select * into t from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId',ws,'successorAgencyWorkspaceId',agency),u,'sandbox-owner@example.test');
 perform * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',t.id),signer,'sandbox-agency@example.test');
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) select w,ws,product_id,resource_kind,title,payload,created_by from public.saved_product_work where id='cc334000-0000-4000-8000-000000000020';
 select * into j from public.job_economics_create_with_payer_transition(jsonb_build_object('action','create','productId','custom-applications','resourceKind','custom-application','workspaceId',ws,'workId',w,'payerId',u,'estimateCents',null,'maxAuthorizedCents',100),u,'sandbox-owner@example.test');
 select * into j from public.job_economics_command_with_payer_authority(jsonb_build_object('action','accept','jobId',j.id),signer,'sandbox-agency@example.test');
 perform pg_temp.sb_assert(j.payer_kind='agency' and j.payer_workspace_id=agency and j.accepted_by=signer,'native accepted agency budget, no business membership granted');
 perform public.custom_application_set_budget(w,ws,j.id,100,null,u,'sandbox-owner@example.test');
 select candidate_source_digest into digest from public.custom_application_states where work_id=w;name:='strelva-build-'||left(public.custom_application_digest(ws,w,1,digest),48);
 delete from public.workspace_memberships where workspace_id=agency and user_id=signer;
 update public.users set verified_at=null where id=signer;
 attempt:=(public.prepare_sandbox_build_attempt(w,1,0,digest,name,'team_fixture','prj_fixture',image,u,'sandbox-owner@example.test')->>'id')::uuid;
 perform pg_temp.sb_assert((select accepted_by=signer and payer_id=signer from public.job_economics where id=j.id),'historical signer remains history after successor representative');
 update public.workspace_memberships set role='member' where workspace_id=agency and user_id=successor;
 perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_payer_required');
 perform pg_temp.sb_denied(format('select public.prepare_sandbox_build_attempt(%L,1,0,%L,%L,''team_fixture'',''prj_fixture'',%L,%L,''sandbox-owner@example.test'')',w,digest,name,image,u),'sandbox_build_payer_required');
 update public.workspace_memberships set role='admin' where workspace_id=agency and user_id=successor;
 update public.users set verified_at=null where id=successor;
 perform pg_temp.sb_denied(format('select public.begin_sandbox_build_attempt(%L,%L,''sandbox-owner@example.test'')',attempt,u),'sandbox_build_payer_required');
 update public.users set verified_at=now() where id=successor;
 perform public.begin_sandbox_build_attempt(attempt,u,'sandbox-owner@example.test');
 perform pg_temp.sb_assert((select reserved_cents=100 and used_cents=0 from public.job_economics where id=j.id),'genuine current agency representative enables one held attempt');
end;$$;
rollback;
-- Actual empty-schema rollback and reapply; the guard above refused retained attempts.
\i supabase/migrations/rollback-20261020090015_sandbox_build_evidence.sql
do $$begin if to_regclass('public.sandbox_build_attempts') is not null then raise exception 'Sandbox rollback left tables';end if;if exists(select 1 from sandbox_shared_function_hashes b where to_regprocedure(b.signature) is null or md5(pg_get_functiondef(to_regprocedure(b.signature)))<>b.hash) then raise exception 'Sandbox rollback changed shared economics';end if;end;$$;
\i supabase/migrations/20261020090015_sandbox_build_evidence.sql
select has_function_privilege('service_role','public.prepare_sandbox_build_attempt(uuid,integer,integer,text,text,text,text,text,uuid,text)','EXECUTE') as reapplied_internal_admission;
