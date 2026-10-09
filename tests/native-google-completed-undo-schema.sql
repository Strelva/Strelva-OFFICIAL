\set ON_ERROR_STOP on
-- PREPARED, UNRUN: fictional owner/plan/receipts only, transactional rollback.
-- Covers durable native undo writers; no OAuth/provider/credential use.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
create function pg_temp.nu_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'native undo fixture failed: %',label; end if; end $$;
create function pg_temp.nu_expect(statement text,expected text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then if sqlerrm not like expected then raise exception 'native undo expected %, got %',expected,sqlerrm; end if; return; end;
 raise exception 'native undo expected refusal: %',expected;
end $$;
insert into public.users(id,email,verified_at) values
 ('e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test',now()),
 ('e7150000-0000-4000-8000-000000000002','native-undo-member@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('e7150000-0000-4000-8000-000000000010','customer','Native undo fixture','e7150000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','owner','e7150000-0000-4000-8000-000000000001'),
 ('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000002','member','e7150000-0000-4000-8000-000000000001');
insert into public.workspace_account_bindings(id,workspace_id,provider,subject,status,scopes,migrated_from,refresh_token_ciphertext,access_token_ciphertext)
 values('e7150000-0000-4000-8000-000000000020','e7150000-0000-4000-8000-000000000010','google','fictional-native-subject','connected',array['https://www.googleapis.com/auth/business.manage'],'oauth','enc:v1:AAAA:BBBB:CCCC','enc:v1:DDDD:EEEE:FFFF');
select public.upsert_workspace_google_location('e7150000-0000-4000-8000-000000000020','accounts/fictional','fictional-place','Fictional native place');
create temp table nu_ids(name text primary key,id uuid);
insert into nu_ids select 'original',(public.record_google_listing_receipt(jsonb_build_object(
 'workspaceId','e7150000-0000-4000-8000-000000000010','bindingId','e7150000-0000-4000-8000-000000000020','locationId','fictional-place','action','post_create','targetRef','fictional-target',
 'authority',jsonb_build_object('kind','owner_approval','actor','e7150000-0000-4000-8000-000000000001','approvalRef','fictional-approved-event'),
 'before',null,'after',null,'undo',jsonb_build_object('kind','delete_post','postName','accounts/fictional/locations/fictional-place/localPosts/fictional'),
 'undoesReceiptId',null,'idempotencyKey','google-draft:fictional-approved-event','intentDigest',repeat('d',64),'afterOrigin','authored','providerPayloadExpiresAt',null))->>'id')::uuid;
select public.settle_google_listing_receipt((select id from nu_ids where name='original'),'e7150000-0000-4000-8000-000000000010','{"status":"posted","readback":"matched"}');
create temp table nu_state(name text primary key,body jsonb);
do $$ declare request jsonb; ref text; plan jsonb; activation jsonb; at text:='2026-10-09T00:00:00.000Z'; begin
 request:=jsonb_build_object('tenantId','workspace-e7150000-0000-4000-8000-000000000010','locationId','fictional-place','eventId','fictional-approved-event','draftDigest',repeat('a',64),
  'nativeGrant',jsonb_build_object('bindingId','e7150000-0000-4000-8000-000000000020','accountId','accounts/fictional','grantGeneration',public.native_google_owner_lifecycle('e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','e7150000-0000-4000-8000-000000000010','read_grant','{"bindingId":"e7150000-0000-4000-8000-000000000020"}')->>'grantGeneration'));
 ref:='{"businessId":"e7150000-0000-4000-8000-000000000010","request":{"tenantId":"workspace-e7150000-0000-4000-8000-000000000010","locationId":"fictional-place","eventId":"fictional-approved-event","draftDigest":"'||repeat('a',64)||'","nativeGrant":{"bindingId":"e7150000-0000-4000-8000-000000000020","accountId":"accounts/fictional","grantGeneration":"'||(request->'nativeGrant'->>'grantGeneration')||'"}},"receiptId":"'||(select id::text from nu_ids where name='original')||'"}';
 plan:=jsonb_build_object('version',1,'id','e7150000-0000-4000-8000-000000000040','businessId','e7150000-0000-4000-8000-000000000010','status','made_real','revision',1,'candidateRevision',1,
  'title','Fictional Google completed plan','intent','Exercise native undo storage','propagation','new_outputs_only','changes','[]'::jsonb,'introduces','[]'::jsonb,'connections','[]'::jsonb,
  'effects',jsonb_build_array(jsonb_build_object('id','google','kind','publish','channel','google_listing','system',jsonb_build_object('systemId','fictional-system','businessId','e7150000-0000-4000-8000-000000000010'),'description','Fictional effect','request',request,'after','[]'::jsonb)),
  'checks',jsonb_build_array(jsonb_build_object('id','readback','description','Matched fictional provider')),'activationId','fictional-native-activation','createdBy','e7150000-0000-4000-8000-000000000001','createdAt',at,'updatedAt',at);
 activation:=jsonb_build_object('version',1,'id','fictional-native-activation','businessId','e7150000-0000-4000-8000-000000000010','possibilityId','e7150000-0000-4000-8000-000000000040','candidateRevision',1,
  'actorId','e7150000-0000-4000-8000-000000000001','status','made_real','revision',1,'pinned','[]'::jsonb,'introduced','[]'::jsonb,'connections','[]'::jsonb,
  'approvals',jsonb_build_array(jsonb_build_object('effectId','google','approvalId','fictional-plan-approval','approvedBy','e7150000-0000-4000-8000-000000000001','at',at,'consumedAt',at)),
  'checks',jsonb_build_array(jsonb_build_object('id','readback','description','Matched fictional provider','status','passed')),'createdAt',at,'updatedAt',at,
  'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','made_real','actorId','e7150000-0000-4000-8000-000000000001','at',at)),
  'steps',jsonb_build_array(
   jsonb_build_object('id','effect:google','kind','effect','target','google','label','Fictional Google','dependsOn','[]'::jsonb,'scope','site.publish','effectKind','publish','reversibility','compensable','idempotencyKey','fictional-mr-google','status','completed','effect','accepted','attempts',1,'receipt',jsonb_build_object('providerRef',ref,'adapterMode','live','acceptedAt',at,'approvalId','fictional-plan-approval'),'readBack',jsonb_build_object('status','confirmed','detail','Fictional readback','at',at)),
   jsonb_build_object('id','verify','kind','verify','target','e7150000-0000-4000-8000-000000000040','label','Fictional checks','dependsOn',jsonb_build_array('effect:google'),'reversibility','reversible','idempotencyKey','fictional-mr-verify','status','completed','effect','none','attempts',1)));
 insert into public.system_possibilities(id,business_workspace_id,status,revision,candidate_revision,body,activation_id,created_by)
  values('e7150000-0000-4000-8000-000000000040','e7150000-0000-4000-8000-000000000010','made_real',1,1,plan,'fictional-native-activation','e7150000-0000-4000-8000-000000000001');
 insert into public.system_possibility_events(possibility_id,business_workspace_id,revision,kind,actor_id,at,detail)
  values('e7150000-0000-4000-8000-000000000040','e7150000-0000-4000-8000-000000000010',1,'made_real','e7150000-0000-4000-8000-000000000001',at::timestamptz,'fictional-native-activation');
 perform public.make_real_activation_set_writer(true);
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,input,created_by)
  values('e7150000-0000-4000-8000-000000000010','operations','activation','Fictional native activation',activation,'{}','e7150000-0000-4000-8000-000000000001');
 perform public.make_real_activation_set_writer(false);
 insert into nu_state values('base',activation);
end $$;
create function pg_temp.nu_save(body jsonb,revision integer,actor uuid default 'e7150000-0000-4000-8000-000000000001',email text default 'native-undo-owner@example.test') returns jsonb language sql as $$
 select public.save_native_google_undo_activation('e7150000-0000-4000-8000-000000000010',actor,email,'fictional-native-activation',revision,body)
$$;
create function pg_temp.nu_next(body jsonb,kind text) returns jsonb language sql as $$
 select body||jsonb_build_object('revision',(body->>'revision')::int+1,'updatedAt','2026-10-09T00:01:00.000Z','history',(body->'history')||jsonb_build_array(jsonb_build_object('revision',(body->>'revision')::int+1,'kind',kind,'actorId','e7150000-0000-4000-8000-000000000001','at','2026-10-09T00:01:00.000Z')))
$$;
-- A received accepted outcome with unsafe metadata is final. The existing
-- writer refuses receipt replacement; the native recovery writer admits only
-- the exact canonical actual receipt lookup/readback without accepting again.
do $$ declare base jsonb:=(select body from nu_state where name='base'); unsafe jsonb; next jsonb; bad jsonb; got jsonb; begin
 begin
  update public.system_possibilities set status='ready',body=jsonb_set(body,'{status}','"ready"') where id='e7150000-0000-4000-8000-000000000040';
  unsafe:=base||jsonb_build_object('status','needs_attention');unsafe:=jsonb_set(unsafe,'{steps,0,status}','"unknown"');
  unsafe:=jsonb_set(unsafe,'{steps,0,receipt}',(base->'steps'->0->'receipt')-'providerRef');unsafe:=jsonb_set(unsafe,'{steps,0}',(unsafe->'steps'->0)-'readBack');
  perform public.make_real_activation_set_writer(true);update public.saved_product_work set payload=unsafe where workspace_id='e7150000-0000-4000-8000-000000000010' and payload->>'id'='fictional-native-activation';perform public.make_real_activation_set_writer(false);
  next:=pg_temp.nu_next(unsafe,'reconcile')||jsonb_build_object('status','made_real');next:=jsonb_set(next,'{steps,0,status}','"completed"');
  next:=jsonb_set(next,'{steps,0,receipt}',(base->'steps'->0->'receipt')||jsonb_build_object('reconciledBy','provider_lookup'));
  next:=jsonb_set(next,'{steps,0,readBack}',jsonb_build_object('status','confirmed','detail','Fictional actual found receipt readback','at','2026-10-09T00:01:00.000Z'));
  next:=jsonb_set(next,'{steps,0,finishedAt}','"2026-10-09T00:01:00.000Z"');
  perform pg_temp.nu_expect(format('select public.save_make_real_activation(%L,%L,%L,%L,1,%L::jsonb)','e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','fictional-native-activation',next),'make_real_activation_invalid');
  bad:=jsonb_set(next,'{steps,0,effect}','"none"');perform pg_temp.nu_expect(format('select public.save_native_google_recovered_activation(%L,%L,%L,%L,1,%L::jsonb)','e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','fictional-native-activation',bad),'make_real_activation_invalid');
  bad:=jsonb_set(next,'{steps,0,receipt,acceptedAt}','"2026-10-09T00:01:00.000Z"');perform pg_temp.nu_expect(format('select public.save_native_google_recovered_activation(%L,%L,%L,%L,1,%L::jsonb)','e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','fictional-native-activation',bad),'make_real_activation_invalid');
  bad:=jsonb_set(next,'{steps,0,receipt,providerRef}','"opaque-ref"');perform pg_temp.nu_expect(format('select public.save_native_google_recovered_activation(%L,%L,%L,%L,1,%L::jsonb)','e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','fictional-native-activation',bad),'native_google_undo_receipt_invalid');
  bad:=jsonb_set(next,'{steps,0,readBack,status}','"failed"');perform pg_temp.nu_expect(format('select public.save_native_google_recovered_activation(%L,%L,%L,%L,1,%L::jsonb)','e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','fictional-native-activation',bad),'make_real_activation_invalid');
  got:=public.save_native_google_recovered_activation('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','fictional-native-activation',1,next);
  perform pg_temp.nu_assert(got->'steps'->0->>'effect'='accepted' and got->'steps'->0->>'status'='completed' and got->'steps'->0->'receipt'->'acceptedAt'=base->'steps'->0->'receipt'->'acceptedAt','actual accepted native recovery preserves finality and fills canonical metadata');
  raise exception 'native_undo_fixture_restore_recovery';
 exception when others then if sqlerrm<>'native_undo_fixture_restore_recovery' then raise; end if; end;
 perform pg_temp.nu_assert((select payload=base from public.saved_product_work where workspace_id='e7150000-0000-4000-8000-000000000010' and payload->>'id'='fictional-native-activation'),'recovery subtransaction restored base');
end $$;
-- A real durable completed activation can finish its lost current-owner plan
-- checkpoint without any new provider dispatch or mutable plan content.
do $$ declare plan public.system_possibilities%rowtype; candidate jsonb; got jsonb; begin
 begin
  update public.system_possibilities set status='ready',body=jsonb_set(body,'{status}','"ready"') where id='e7150000-0000-4000-8000-000000000040';
  select * into plan from public.system_possibilities where id='e7150000-0000-4000-8000-000000000040';candidate:=public.system_possibility_json(plan,200);
  candidate:=candidate||jsonb_build_object('status','made_real','revision',2,'updatedAt','2026-10-09T00:01:00.000Z','history',(candidate->'history')||jsonb_build_array(jsonb_build_object('revision',2,'kind','made_real','actorId','e7150000-0000-4000-8000-000000000001','at','2026-10-09T00:01:00.000Z','detail','fictional-native-activation')));
  perform pg_temp.nu_expect(format('select public.finalize_native_google_completion(%L,%L,%L,%L,1,%L,%L::jsonb)','e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test',plan.id,'fictional-native-activation',candidate||jsonb_build_object('title','Changed plan')),'system_possibility_invalid');
  got:=public.finalize_native_google_completion('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test',plan.id,1,'fictional-native-activation',candidate);
  perform pg_temp.nu_assert(got->>'status'='made_real' and got->>'activationId'='fictional-native-activation','actual durable completed native plan checkpoint persisted');
  raise exception 'native_undo_fixture_restore_completion';
 exception when others then if sqlerrm<>'native_undo_fixture_restore_completion' then raise; end if; end;
end $$;
-- RED historical gate: generic save still refuses completed activations/plans.
select pg_temp.nu_expect($s$select public.save_make_real_activation('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','fictional-native-activation',1,(select pg_temp.nu_next(body,'rollback_started') from nu_state where name='base'))$s$,'make_real_activation_invalid');
select pg_temp.nu_expect($s$select public.save_system_possibility('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test','e7150000-0000-4000-8000-000000000040',1,(select public.system_possibility_json(p,200) from public.system_possibilities p where p.id='e7150000-0000-4000-8000-000000000040'))$s$,'system_possibility_closed');
do $$ declare base jsonb:=(select body from nu_state where name='base'); started jsonb; bad jsonb; got jsonb; begin
 started:=pg_temp.nu_next(base,'rollback_started')||jsonb_build_object('status','needs_attention','rollbackStartedAt','2026-10-09T00:01:00.000Z');
 perform pg_temp.nu_expect(format('select pg_temp.nu_save(%L::jsonb,1,%L::uuid,%L)',started,'e7150000-0000-4000-8000-000000000002','native-undo-member@example.test'),'native_google_owner_denied');
 perform pg_temp.nu_expect(format('select pg_temp.nu_save(%L::jsonb,0)',started),'make_real_activation_revision_conflict');
 bad:=jsonb_set(started,'{candidateRevision}','2'); perform pg_temp.nu_expect(format('select pg_temp.nu_save(%L::jsonb,1)',bad),'make_real_activation_invalid');
 bad:=jsonb_set(started,'{steps,0,receipt,providerRef}',to_jsonb('opaque-uuid'::text)); perform pg_temp.nu_expect(format('select pg_temp.nu_save(%L::jsonb,1)',bad),'make_real_activation_invalid');
 bad:=jsonb_set(started,'{steps,0,receipt,providerRef}','null'); perform pg_temp.nu_expect(format('select pg_temp.nu_save(%L::jsonb,1)',bad),'make_real_activation_invalid');
 got:=pg_temp.nu_save(started,1); perform pg_temp.nu_assert(got->>'status'='needs_attention','native rollback start persisted'); insert into nu_state values('started',got);
end $$;
-- Claim before any compensation outcome, then refuse a fake success lacking
-- the exact durable linked matched inverse receipt.
do $$ declare prior jsonb:=(select body from nu_state where name='started'); claimed jsonb; compensated jsonb; got jsonb; begin
 claimed:=pg_temp.nu_next(prior,'rollback_compensation_claim');
 claimed:=jsonb_set(claimed,'{steps,0,compensation}',jsonb_build_object('status','running','detail','Fictional compensation claim','at','2026-10-09T00:01:00.000Z','claimId','fictional-compensation-claim'));
 got:=pg_temp.nu_save(claimed,2);insert into nu_state values('claimed',got);
 compensated:=pg_temp.nu_next(got,'rollback_step');compensated:=jsonb_set(compensated,'{steps,0,status}','"compensated"');
 compensated:=jsonb_set(compensated,'{steps,0,compensation}',jsonb_build_object('status','compensated','detail','Fictional matched inverse','at','2026-10-09T00:01:00.000Z','claimId','fictional-compensation-claim'));
 perform pg_temp.nu_expect(format('select pg_temp.nu_save(%L::jsonb,3)',compensated),'native_google_undo_inverse_unconfirmed');
 perform pg_temp.nu_assert((select payload->>'revision'='3' from public.saved_product_work where workspace_id='e7150000-0000-4000-8000-000000000010' and payload->>'id'='fictional-native-activation'),'refused fake inverse changed activation');
 insert into nu_state values('compensated_candidate',compensated);
end $$;
insert into nu_ids select 'inverse',(public.record_google_listing_receipt(jsonb_build_object(
 'workspaceId','e7150000-0000-4000-8000-000000000010','bindingId','e7150000-0000-4000-8000-000000000020','locationId','fictional-place','action','post_delete','targetRef','fictional-target',
 'authority',jsonb_build_object('kind','owner_undo','actor','e7150000-0000-4000-8000-000000000001'),'before',null,'after',null,'undo',null,
 'undoesReceiptId',(select id from nu_ids where name='original'),'idempotencyKey','undo:'||(select id::text from nu_ids where name='original'),
 'intentDigest',repeat('e',64),'afterOrigin','authored','providerPayloadExpiresAt',null))->>'id')::uuid;
-- The actual historical writer owns digest encoding and link settlement.
select public.settle_google_listing_receipt((select id from nu_ids where name='inverse'),'e7150000-0000-4000-8000-000000000010','{"status":"posted","readback":"matched"}');
select pg_temp.nu_assert(public.native_google_inverse_intent_matches('e7150000-0000-4000-8000-000000000010',(select id from nu_ids where name='original'),(select id from nu_ids where name='inverse')),'actual stored PostgreSQL inverse digest confirms');
do $$ declare request jsonb:=(select body->'effects'->0->'request' from public.system_possibilities where id='e7150000-0000-4000-8000-000000000040'); field text; bad jsonb; begin
 perform pg_temp.nu_assert(public.verify_native_google_inverse_intent('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test',request,(select id from nu_ids where name='original'),(select id from nu_ids where name='inverse')),'owner boolean actual historical digest succeeds');
 foreach field in array array['tenantId','locationId','eventId','draftDigest','nativeGrant'] loop
  bad:=request-field;
  perform pg_temp.nu_assert(public.verify_native_google_inverse_intent('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test',bad,(select id from nu_ids where name='original'),(select id from nu_ids where name='inverse')) is false,'missing canonical request field refused');
 end loop;
 bad:=request||jsonb_build_object('unexpected','payload');
 perform pg_temp.nu_assert(public.verify_native_google_inverse_intent('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test',bad,(select id from nu_ids where name='original'),(select id from nu_ids where name='inverse')) is false,'unknown canonical request field refused');
 update public.workspace_account_bindings set scopes=null where id='e7150000-0000-4000-8000-000000000020';
 perform pg_temp.nu_assert(public.verify_native_google_inverse_intent('e7150000-0000-4000-8000-000000000010','e7150000-0000-4000-8000-000000000001','native-undo-owner@example.test',request,(select id from nu_ids where name='original'),(select id from nu_ids where name='inverse')) is false,'NULL manage scope refused');
 update public.workspace_account_bindings set scopes=array['https://www.googleapis.com/auth/business.manage'] where id='e7150000-0000-4000-8000-000000000020';
end $$;
insert into nu_state select 'compensated',pg_temp.nu_save(body,3) from nu_state where name='compensated_candidate';
-- Finalizer must refuse until rollback is durably finished, then accept only
-- deterministic detach/revision/epoch/consumed union and one retained event.
create function pg_temp.nu_finalize(body jsonb,revision integer default 1,actor uuid default 'e7150000-0000-4000-8000-000000000001',email text default 'native-undo-owner@example.test') returns jsonb language sql as $$
 select public.finalize_native_google_undo('e7150000-0000-4000-8000-000000000010',actor,email,'e7150000-0000-4000-8000-000000000040',revision,'fictional-native-activation',body)
$$;
do $$ declare plan public.system_possibilities%rowtype; candidate jsonb; done jsonb; got jsonb; bad jsonb; begin
 select * into plan from public.system_possibilities where id='e7150000-0000-4000-8000-000000000040';
 candidate:=public.system_possibility_json(plan,200)-'activationId';
 candidate:=candidate||jsonb_build_object('status','withdrawn','revision',2,'updatedAt','2026-10-09T00:01:00.000Z',
  'keyEpochs',jsonb_build_object('effect:google',1),'consumedApprovalIds',jsonb_build_array('fictional-plan-approval'),
  'history',(candidate->'history')||jsonb_build_array(jsonb_build_object('revision',2,'kind','make_real_rolled_back','actorId','e7150000-0000-4000-8000-000000000001','at','2026-10-09T00:01:00.000Z','detail','fictional-native-activation')));
 perform pg_temp.nu_expect(format('select pg_temp.nu_finalize(%L::jsonb)',candidate),'native_google_undo_finalization_unconfirmed');
 done:=pg_temp.nu_next((select body from nu_state where name='compensated'),'rollback')||jsonb_build_object('status','rolled_back');
 got:=pg_temp.nu_save(done,4);perform pg_temp.nu_assert(got->>'status'='rolled_back','actual terminal activation persisted');
 perform pg_temp.nu_expect(format('select pg_temp.nu_finalize(%L::jsonb,1,%L::uuid,%L)',candidate,'e7150000-0000-4000-8000-000000000002','native-undo-member@example.test'),'native_google_owner_denied');
 perform pg_temp.nu_expect(format('select pg_temp.nu_finalize(%L::jsonb,0)',candidate),'system_possibility_revision_conflict');
 bad:=candidate||jsonb_build_object('title','Unapproved changed whole plan');perform pg_temp.nu_expect(format('select pg_temp.nu_finalize(%L::jsonb)',bad),'system_possibility_invalid');
 bad:=candidate||jsonb_build_object('keyEpochs',jsonb_build_object('effect:google',2));perform pg_temp.nu_expect(format('select pg_temp.nu_finalize(%L::jsonb)',bad),'system_possibility_invalid');
 bad:=candidate||jsonb_build_object('consumedApprovalIds','[]'::jsonb);perform pg_temp.nu_expect(format('select pg_temp.nu_finalize(%L::jsonb)',bad),'system_possibility_invalid');
 bad:=jsonb_set(candidate,'{history,1,detail}','"foreign-activation"');perform pg_temp.nu_expect(format('select pg_temp.nu_finalize(%L::jsonb)',bad),'system_possibility_invalid');
 got:=pg_temp.nu_finalize(candidate);perform pg_temp.nu_assert(got->>'status'='withdrawn' and not (got ? 'activationId') and got->'keyEpochs'->>'effect:google'='1','native finalizer deterministic detach persisted');
 perform pg_temp.nu_assert((select count(*)=2 from public.system_possibility_events where possibility_id=plan.id),'one additional history event');
 -- Direct RPC is deliberately closed on replay; runner reloads withdrawn plan
 -- and rolled_back activation and returns without invoking either writer.
 perform pg_temp.nu_expect(format('select pg_temp.nu_finalize(%L::jsonb)',candidate),'native_google_undo_plan_invalid');
 perform pg_temp.nu_expect(format('select pg_temp.nu_save(%L::jsonb,5)',pg_temp.nu_next(done,'rollback')),'make_real_activation_invalid');
end $$;
select pg_temp.nu_assert(
 has_function_privilege('service_role','public.save_native_google_undo_activation(uuid,uuid,text,text,integer,jsonb)','EXECUTE')
 and has_function_privilege('service_role','public.finalize_native_google_undo(uuid,uuid,text,uuid,integer,text,jsonb)','EXECUTE')
 and not has_function_privilege('authenticated','public.finalize_native_google_undo(uuid,uuid,text,uuid,integer,text,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.save_native_google_undo_activation(uuid,uuid,text,text,integer,jsonb)','EXECUTE')
 and not has_function_privilege('service_role','public.native_google_undo_frame(uuid,jsonb)','EXECUTE')
 and not has_function_privilege('service_role','public.native_google_undo_owner(uuid,uuid,text)','EXECUTE'), 'only scoped service RPCs executable');
rollback;
