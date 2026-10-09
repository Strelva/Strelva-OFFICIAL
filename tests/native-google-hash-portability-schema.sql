\set ON_ERROR_STOP on
-- Prepared hash-portability/authority regression, owned disposable schema only.
-- Fictional rows and undecryptable shaped ciphertext; transaction rolls back.
-- Independent expected hashes are pinned to Node/Python compact JSON vectors.
begin;
set local time zone 'UTC';
set local standard_conforming_strings=on;
set local statement_timeout='10s';
set local lock_timeout='2s';
-- Poison the extension-style name, transactionally. This also creates that
-- name in the focused schema where pgcrypto is absent. Core qualified hashing
-- must never dispatch here; rollback restores any pre-existing extension body.
create or replace function public.digest(bytea,text) returns bytea
language plpgsql immutable strict as $$ begin raise exception 'native_google_hash_extension_shadow_called'; end $$;
insert into public.users(id,email,verified_at) values
 ('e7140100-0000-4000-8000-000000000001','native-hash-owner@example.test',now()),('e7140100-0000-4000-8000-000000000002','native-hash-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('e7140100-0000-4000-8000-000000000010','customer','Fictional native hash portability','e7140100-0000-4000-8000-000000000001'),('e7140100-0000-4000-8000-000000000011','customer','Fictional null native hash','e7140100-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('e7140100-0000-4000-8000-000000000010','e7140100-0000-4000-8000-000000000001','owner','e7140100-0000-4000-8000-000000000001'),('e7140100-0000-4000-8000-000000000011','e7140100-0000-4000-8000-000000000001','owner','e7140100-0000-4000-8000-000000000001');
insert into public.workspace_account_bindings(id,workspace_id,provider,subject,scopes,refresh_token_ciphertext,access_token_ciphertext,status,migrated_from,created_at)
 values('e7140100-0000-4000-8000-000000000020','e7140100-0000-4000-8000-000000000010','google','Fictional "É" \ principal',array['openid','https://www.googleapis.com/auth/business.manage'],'enc:v1:AAAA:BBBB:CCCC','enc:v1:DDDD:EEEE:FFFF','connected','oauth','2026-10-09T00:00:00.123456+00'),
 ('e7140100-0000-4000-8000-000000000021','e7140100-0000-4000-8000-000000000011','google',null,array['openid','https://www.googleapis.com/auth/business.manage'],null,null,'revoked','oauth','2026-10-09T00:00:00.123456+00');
select public.upsert_workspace_google_location('e7140100-0000-4000-8000-000000000020','accounts/hash','hash-place',null);
-- The verifier checks an exact active plan before reading the binding/hash.
-- Seed one complete ready frame for each request, including the intentionally
-- wrong generation, so neither call can pass by returning at the plan gate.
do $$ declare plan_id uuid; generation text; request jsonb; plan jsonb; at text:='2026-10-09T00:00:00.123456+00:00'; activation text; begin
 for plan_id,generation in select * from (values
  ('e7140100-0000-4000-8000-000000000040'::uuid,'cf343f3ac392b8053f98b60cb60f72fba29699d28ca10c0de8d19886ed83defd'),
  ('e7140100-0000-4000-8000-000000000041'::uuid,repeat('f',64))) frames(id,grant_generation) loop
  request:=jsonb_build_object('tenantId','workspace-e7140100-0000-4000-8000-000000000010','locationId','hash-place','eventId','fictional-hash-event','draftDigest',repeat('a',64),
   'nativeGrant',jsonb_build_object('bindingId','e7140100-0000-4000-8000-000000000020','accountId','accounts/hash','grantGeneration',generation));
  activation:='fictional-hash-activation-'||plan_id::text;
  plan:=jsonb_build_object('version',1,'id',plan_id::text,'businessId','e7140100-0000-4000-8000-000000000010','status','ready','revision',1,'candidateRevision',1,
   'title','Fictional native hash plan','intent','Reach the exact native inverse grant hash','propagation','new_outputs_only','changes','[]'::jsonb,'introduces','[]'::jsonb,'connections','[]'::jsonb,
   'effects',jsonb_build_array(jsonb_build_object('id','google','kind','publish','channel','google_listing','system',jsonb_build_object('systemId','fictional-system','businessId','e7140100-0000-4000-8000-000000000010'),'description','Fictional hash effect','request',request,'after','[]'::jsonb)),
   'checks',jsonb_build_array(jsonb_build_object('id','readback','description','Matched fictional provider')),'activationId',activation,
   'createdBy','e7140100-0000-4000-8000-000000000001','createdAt',at,'updatedAt',at);
  insert into public.system_possibilities(id,business_workspace_id,status,revision,candidate_revision,body,activation_id,created_by)
   values(plan_id,'e7140100-0000-4000-8000-000000000010','ready',1,1,plan,activation,'e7140100-0000-4000-8000-000000000001');
 end loop;
end $$;
set local role service_role;
do $$ declare result jsonb; request jsonb; begin
 result:=public.native_google_owner_lifecycle('e7140100-0000-4000-8000-000000000001','native-hash-owner@example.test','e7140100-0000-4000-8000-000000000010','read_grant','{"bindingId":"e7140100-0000-4000-8000-000000000020"}');
 if result->>'grantGeneration'<>'cf343f3ac392b8053f98b60cb60f72fba29699d28ca10c0de8d19886ed83defd' or result->>'subjectDigest'<>'d29a988f71ab8d5180710c1a49c375177df707c4ab22001e7f5aee3a894b0c69' then raise exception 'native_google_hash_vector_mismatch'; end if;
 result:=public.native_google_owner_lifecycle('e7140100-0000-4000-8000-000000000001','native-hash-owner@example.test','e7140100-0000-4000-8000-000000000011','read_grant','{"bindingId":"e7140100-0000-4000-8000-000000000021"}');
 if result->>'grantGeneration'<>'24292c178112ef027f96168f702e37132dbef695019111d7f3d6c2ab3a37f7fb' or result->'subjectDigest' is distinct from 'null'::jsonb then raise exception 'native_google_null_hash_vector_mismatch'; end if;
 -- Correct scope reaches inverse-intent verification with no extension hash;
 -- no fabricated historical receipt can be accepted by the actual verifier.
 request:=jsonb_build_object('tenantId','workspace-e7140100-0000-4000-8000-000000000010','locationId','hash-place','eventId','fictional-hash-event','draftDigest',repeat('a',64),
  'nativeGrant',jsonb_build_object('bindingId','e7140100-0000-4000-8000-000000000020','accountId','accounts/hash','grantGeneration','cf343f3ac392b8053f98b60cb60f72fba29699d28ca10c0de8d19886ed83defd'));
 if public.verify_native_google_inverse_intent('e7140100-0000-4000-8000-000000000010','e7140100-0000-4000-8000-000000000001','native-hash-owner@example.test',request,'e7140100-0000-4000-8000-000000000030','e7140100-0000-4000-8000-000000000031') then raise exception 'native_google_fabricated_inverse_admitted'; end if;
 request:=jsonb_set(request,'{nativeGrant,grantGeneration}',to_jsonb(repeat('f',64)));
 if public.verify_native_google_inverse_intent('e7140100-0000-4000-8000-000000000010','e7140100-0000-4000-8000-000000000001','native-hash-owner@example.test',request,'e7140100-0000-4000-8000-000000000030','e7140100-0000-4000-8000-000000000031') then raise exception 'native_google_changed_grant_admitted'; end if;
 begin
  perform public.native_google_owner_lifecycle('e7140100-0000-4000-8000-000000000002','native-hash-stranger@example.test','e7140100-0000-4000-8000-000000000010','read_grant','{"bindingId":"e7140100-0000-4000-8000-000000000020"}');
  raise exception 'native_google_nonowner_hash_admitted';
 exception when others then if sqlerrm<>'native_google_owner_denied' then raise; end if; end;
 begin
  perform public.native_google_owner_lifecycle('e7140100-0000-4000-8000-000000000001','wrong@example.test','e7140100-0000-4000-8000-000000000010','read_grant','{"bindingId":"e7140100-0000-4000-8000-000000000020"}');
  raise exception 'native_google_wrong_email_hash_admitted';
 exception when others then if sqlerrm<>'native_google_owner_denied' then raise; end if; end;
end $$;
reset role;
select 1 / (not has_function_privilege('anon','public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb)','EXECUTE')
 and not has_function_privilege('authenticated','public.verify_native_google_inverse_intent(uuid,uuid,text,jsonb,uuid,uuid,text)','EXECUTE'))::integer;
rollback;
