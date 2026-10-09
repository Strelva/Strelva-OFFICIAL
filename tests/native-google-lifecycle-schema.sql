\set ON_ERROR_STOP on
-- Prepared native lifecycle contract regression. Fictional rows and shaped,
-- undecryptable ciphertext only. Every write rolls back. No OAuth exchange,
-- provider request, real revocation or provider qualification is performed.
-- Apply the reviewed migration first in an owned disposable local SQL stack.
begin;
set local statement_timeout = '10s';
set local lock_timeout = '2s';

create function pg_temp.ng_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'native Google fixture assertion failed: %', message; end if; end $$;
create function pg_temp.ng_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'native Google fixture expected %, got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'native Google fixture expected refusal: %', expected;
end $$;
create function pg_temp.ng_call(action text, input jsonb default '{}'::jsonb,
  workspace uuid default 'e7140000-0000-4000-8000-000000000010',
  actor uuid default 'e7140000-0000-4000-8000-000000000001',
  email text default 'native-google-owner@example.test') returns jsonb language sql as $$
  select public.native_google_owner_lifecycle(actor,email,workspace,action,input)
$$;
create function pg_temp.ng_refuse(action text, input jsonb, expected text) returns void language plpgsql as $$
begin
  begin perform pg_temp.ng_call(action,input);
  exception when others then
    if sqlerrm not like expected then raise exception 'native Google fixture expected %, got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'native Google fixture unexpectedly admitted %', action;
end $$;
create function pg_temp.ng_begin_input(attempt uuid) returns jsonb language sql as $$
  select jsonb_build_object('id',attempt,'accountId','accounts/native-lifecycle',
    'locationId','native-place','nonceHash',repeat('a',64),'stateHash',repeat('b',64))
$$;
create function pg_temp.ng_finish_input(attempt uuid, refresh text default 'enc:v1:AAAA:BBBB:CCCC')
returns jsonb language sql as $$
  select jsonb_build_object('id',attempt,'subject','fixture-native-google-subject',
    'scopes',jsonb_build_array('openid','https://www.googleapis.com/auth/business.manage'),
    'accessTokenCiphertext','enc:v1:DDDD:EEEE:FFFF','refreshTokenCiphertext',refresh,
    'tokenExpiresAt',(clock_timestamp()+interval '1 hour')::text)
$$;
create function pg_temp.ng_consume(attempt uuid) returns void language plpgsql as $$
begin perform pg_temp.ng_call('consume_oauth',jsonb_build_object('id',attempt,
  'nonceHash',repeat('a',64),'stateHash',repeat('b',64))); end $$;
-- Snapshots are asserted inside SQL, never printed. They include every durable
-- row the lifecycle may alter, so a refused finish cannot silently mutate one.
create function pg_temp.ng_state() returns jsonb language sql as $$
  select jsonb_build_object(
    'bindings',coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.workspace_account_bindings b
      where b.workspace_id='e7140000-0000-4000-8000-000000000010'),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.workspace_google_locations l
      where l.workspace_id='e7140000-0000-4000-8000-000000000010'),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from public.native_google_oauth_attempts o
      where o.workspace_id='e7140000-0000-4000-8000-000000000010'),'[]'::jsonb),
    'disconnects',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.native_google_disconnect_receipts r
      where r.workspace_id='e7140000-0000-4000-8000-000000000010'),'[]'::jsonb))
$$;
create function pg_temp.ng_invalid_finishes(attempt uuid) returns void language plpgsql as $$
declare payload jsonb := pg_temp.ng_finish_input(attempt); prior jsonb := pg_temp.ng_state(); field text; bad jsonb;
begin
  foreach field in array array['id','subject','scopes','accessTokenCiphertext','refreshTokenCiphertext','tokenExpiresAt'] loop
    perform pg_temp.ng_refuse('finish_oauth',payload-field,'native_google_input_invalid');
    perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'missing finish field changed durable state: '||field);
    perform pg_temp.ng_refuse('finish_oauth',payload||jsonb_build_object(field,null),'native_google_input_invalid');
    perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'null finish field changed durable state: '||field);
  end loop;
  foreach bad in array array[
    '{"subject":""}'::jsonb,'{"subject":123}'::jsonb,
    '{"accessTokenCiphertext":"plain-token"}'::jsonb,'{"refreshTokenCiphertext":""}'::jsonb,
    '{"scopes":[]}'::jsonb,'{"scopes":["openid"]}'::jsonb,
    '{"scopes":["https://www.googleapis.com/auth/business.manage"]}'::jsonb,
    '{"scopes":["openid","https://www.googleapis.com/auth/business.manage",null]}'::jsonb,
    jsonb_build_object('tokenExpiresAt',(clock_timestamp()-interval '1 minute')::text),
    jsonb_build_object('tokenExpiresAt',(clock_timestamp()+interval '25 hours')::text)
  ] loop
    perform pg_temp.ng_refuse('finish_oauth',payload||bad,'native_google_input_invalid');
    perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'invalid finish changed durable state');
  end loop;
end $$;

select pg_temp.ng_assert((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.native_google_oauth_attempts'::regclass,'public.native_google_disconnect_receipts'::regclass)),
  'native lifecycle tables require RLS');
select pg_temp.ng_assert(not has_table_privilege('service_role','public.native_google_oauth_attempts','select')
  and not has_table_privilege('authenticated','public.native_google_disconnect_receipts','select')
  and not has_function_privilege('authenticated','public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb)','execute')
  and not has_function_privilege('anon','public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb)','execute')
  and has_function_privilege('service_role','public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb)','execute'),
  'only trusted service RPC exposes actor-qualified lifecycle');

insert into public.users(id,email,verified_at) values
  ('e7140000-0000-4000-8000-000000000001','native-google-owner@example.test',now()),
  ('e7140000-0000-4000-8000-000000000002','native-google-member@example.test',now()),
  ('e7140000-0000-4000-8000-000000000003','native-google-other@example.test',now()),
  ('e7140000-0000-4000-8000-000000000004','native-google-unverified@example.test',null);
insert into public.workspaces(id,kind,name,created_by) values
  ('e7140000-0000-4000-8000-000000000010','customer','Native Google lifecycle fixture','e7140000-0000-4000-8000-000000000001'),
  ('e7140000-0000-4000-8000-000000000011','customer','Other native Google fixture','e7140000-0000-4000-8000-000000000003'),
  ('e7140000-0000-4000-8000-000000000012','agency','Agency Google fixture','e7140000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('e7140000-0000-4000-8000-000000000010','e7140000-0000-4000-8000-000000000001','owner','e7140000-0000-4000-8000-000000000001'),
  ('e7140000-0000-4000-8000-000000000010','e7140000-0000-4000-8000-000000000002','member','e7140000-0000-4000-8000-000000000001'),
  ('e7140000-0000-4000-8000-000000000010','e7140000-0000-4000-8000-000000000004','member','e7140000-0000-4000-8000-000000000001'),
  ('e7140000-0000-4000-8000-000000000011','e7140000-0000-4000-8000-000000000003','owner','e7140000-0000-4000-8000-000000000003'),
  ('e7140000-0000-4000-8000-000000000012','e7140000-0000-4000-8000-000000000001','owner','e7140000-0000-4000-8000-000000000001');

-- Every action checks the supplied current verified owner before its own body.
do $$ declare action text; prior jsonb := pg_temp.ng_state(); begin
  foreach action in array array['proof_identity','read_grant','qualify','read_disconnect','begin_oauth',
    'consume_oauth','finish_oauth','fail_oauth','claim_disconnect','settle_disconnect','purge'] loop
    perform pg_temp.ng_expect(format('select pg_temp.ng_call(%L,%L,%L,%L,%L)',action,'{}',
      'e7140000-0000-4000-8000-000000000010','e7140000-0000-4000-8000-000000000002','native-google-member@example.test'),'native_google_owner_denied');
    perform pg_temp.ng_expect(format('select pg_temp.ng_call(%L,%L,%L,%L,%L)',action,'{}',
      'e7140000-0000-4000-8000-000000000010','e7140000-0000-4000-8000-000000000003','native-google-other@example.test'),'native_google_owner_denied');
    perform pg_temp.ng_expect(format('select pg_temp.ng_call(%L,%L,%L,%L,%L)',action,'{}',
      'e7140000-0000-4000-8000-000000000012','e7140000-0000-4000-8000-000000000001','native-google-owner@example.test'),'native_google_owner_denied');
  end loop;
  perform pg_temp.ng_expect($q$select pg_temp.ng_call('begin_oauth','{}',
    'e7140000-0000-4000-8000-000000000010','e7140000-0000-4000-8000-000000000001','wrong@example.test')$q$,'native_google_owner_denied');
  update public.workspace_memberships set role='owner' where workspace_id='e7140000-0000-4000-8000-000000000010' and user_id='e7140000-0000-4000-8000-000000000004';
  perform pg_temp.ng_expect($q$select pg_temp.ng_call('begin_oauth','{}',
    'e7140000-0000-4000-8000-000000000010','e7140000-0000-4000-8000-000000000004','native-google-unverified@example.test')$q$,'native_google_owner_denied');
  perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'owner refusals changed lifecycle state');
end $$;

create temp table ng_ids(name text primary key,id uuid not null) on commit drop;
-- Abandoned pending and exchanging attempts no longer occupy the open slot.
do $$ declare pending uuid:=gen_random_uuid(); exchanging uuid:=gen_random_uuid(); initial uuid:=gen_random_uuid(); prior jsonb; begin
  perform pg_temp.ng_call('begin_oauth',pg_temp.ng_begin_input(pending));
  update public.native_google_oauth_attempts set expires_at=clock_timestamp()-interval '1 minute' where id=pending;
  perform pg_temp.ng_call('begin_oauth',pg_temp.ng_begin_input(exchanging));
  perform pg_temp.ng_assert((select status='expired' from public.native_google_oauth_attempts where id=pending),'expired pending attempt remained open');
  prior:=pg_temp.ng_state();
  perform pg_temp.ng_refuse('consume_oauth',jsonb_build_object('id',exchanging,'stateHash',repeat('b',64)),'native_google_oauth_unavailable');
  perform pg_temp.ng_refuse('consume_oauth',jsonb_build_object('id',exchanging,'nonceHash',null,'stateHash',repeat('b',64)),'native_google_oauth_unavailable');
  perform pg_temp.ng_refuse('consume_oauth',jsonb_build_object('id',exchanging,'nonceHash',repeat('a',64)),'native_google_oauth_unavailable');
  perform pg_temp.ng_refuse('consume_oauth',jsonb_build_object('id',exchanging,'nonceHash',repeat('a',64),'stateHash',null),'native_google_oauth_unavailable');
  perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'bad signed hashes consumed the attempt');
  perform pg_temp.ng_consume(exchanging);
  update public.native_google_oauth_attempts set expires_at=clock_timestamp()-interval '1 minute' where id=exchanging;
  perform pg_temp.ng_call('begin_oauth',pg_temp.ng_begin_input(initial));
  perform pg_temp.ng_assert((select status='expired' from public.native_google_oauth_attempts where id=exchanging),'expired exchanging attempt remained open');
  perform pg_temp.ng_refuse('finish_oauth',pg_temp.ng_finish_input(exchanging),'native_google_oauth_unavailable');
  perform pg_temp.ng_consume(initial);
  perform pg_temp.ng_invalid_finishes(initial);
  insert into ng_ids values('binding',(pg_temp.ng_call('finish_oauth',pg_temp.ng_finish_input(initial))->>'bindingId')::uuid);
  perform pg_temp.ng_assert((select status='finished' from public.native_google_oauth_attempts where id=initial),'initial attempt did not finish');
  perform pg_temp.ng_assert((select status='connected' and subject='fixture-native-google-subject' and origin_tenant_stable_id is null
    and refresh_token_ciphertext='enc:v1:AAAA:BBBB:CCCC' from public.workspace_account_bindings where id=(select id from ng_ids where name='binding')),'initial native grant differs');
  perform pg_temp.ng_assert((select count(*)=1 and bool_and(account_id='accounts/native-lifecycle' and location_id='native-place')
    from public.workspace_google_locations where binding_id=(select id from ng_ids where name='binding')),'initial selected account/place differs');
end $$;

-- Reconnect omissions must preserve the existing subject, credentials, location
-- and attempt. A generation change also prevents a consumed finish checkpoint.
do $$ declare attempt uuid:=gen_random_uuid(); stale uuid:=gen_random_uuid(); prior jsonb; binding uuid:=(select id from ng_ids where name='binding'); begin
  perform pg_temp.ng_call('begin_oauth',pg_temp.ng_begin_input(attempt)); perform pg_temp.ng_consume(attempt);
  perform pg_temp.ng_invalid_finishes(attempt);
  prior:=pg_temp.ng_state();
  update public.workspace_memberships set role='member' where workspace_id='e7140000-0000-4000-8000-000000000010' and user_id='e7140000-0000-4000-8000-000000000001';
  perform pg_temp.ng_refuse('finish_oauth',pg_temp.ng_finish_input(attempt),'native_google_owner_denied');
  update public.workspace_memberships set role='owner' where workspace_id='e7140000-0000-4000-8000-000000000010' and user_id='e7140000-0000-4000-8000-000000000001';
  perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'owner loss during OAuth changed lifecycle state');
  perform pg_temp.ng_call('fail_oauth',jsonb_build_object('id',attempt));
  perform pg_temp.ng_call('begin_oauth',pg_temp.ng_begin_input(stale)); perform pg_temp.ng_consume(stale);
  perform public.mutate_google_binding_generation(binding,(select updated_at from public.workspace_account_bindings where id=binding),
    '{"accessTokenCiphertext":"enc:v1:GGGG:HHHH:IIII"}');
  prior:=pg_temp.ng_state();
  perform pg_temp.ng_refuse('finish_oauth',pg_temp.ng_finish_input(stale),'native_google_grant_changed');
  perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'stale reconnect changed durable state');
  perform pg_temp.ng_call('fail_oauth',jsonb_build_object('id',stale));
end $$;

-- A durable-only legacy grant has no native binding and no Redis dependency.
-- It still prevents qualify/claim, and a refused claim never purges the owner.
insert into public.tenants(id,stable_id,site_name,active) values
  ('native-google-lifecycle-legacy','e7140000-0000-4000-8000-0000000000b1','Fictional legacy grant',true),
  ('native-google-lifecycle-copy','e7140000-0000-4000-8000-0000000000b2','Fictional legacy copy',true);
do $$ declare binding uuid:=(select id from ng_ids where name='binding'); prior jsonb; request jsonb; begin
  perform public.record_tenant_client_record('native-google-lifecycle-legacy','provider_connections','google',
    '{"provider":"google","accessToken":"enc:v1:LLLL:MMMM:NNNN","refreshToken":"enc:v1:OOOO:PPPP:QQQQ"}',
    repeat('c',64),clock_timestamp(),'dual_write','replace');
  prior:=pg_temp.ng_state();
  perform pg_temp.ng_refuse('qualify',jsonb_build_object('bindingId',binding),'native_google_legacy_durable_grant_requires_review');
  request:=jsonb_build_object('commandId',gen_random_uuid(),'bindingId',binding,'expectedUpdatedAt',
    (select updated_at from public.workspace_account_bindings where id=binding));
  perform pg_temp.ng_refuse('claim_disconnect',request,'native_google_legacy_durable_grant_requires_review');
  perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'durable-only legacy refusal changed owner grant');
  -- Fictional teardown only, through the existing ordering-aware tombstone RPC.
  perform public.record_tenant_client_record('native-google-lifecycle-legacy','provider_connections','google',
    null,null,clock_timestamp()+interval '1 second','dual_write','remove');
  perform pg_temp.ng_assert((pg_temp.ng_call('qualify',jsonb_build_object('bindingId',binding))->>'isolated')::boolean,'tombstoned legacy grant still prevented qualification');
end $$;

-- Failed remote outcome is simulated SQL metadata, not actual Google proof.
-- Roll back this entire scenario subtransaction before testing confirmed revoke;
-- never rewrite a failed receipt into an invented successful remote outcome.
do $$ declare binding uuid:=(select id from ng_ids where name='binding'); command uuid:=gen_random_uuid();
  prior jsonb:=pg_temp.ng_state(); claim jsonb; result jsonb; health text; attempt uuid:=gen_random_uuid(); payload jsonb; begin
  begin
    claim:=pg_temp.ng_call('claim_disconnect',jsonb_build_object('commandId',command,'bindingId',binding,
      'expectedUpdatedAt',(select updated_at from public.workspace_account_bindings where id=binding)));
    perform pg_temp.ng_assert(claim->>'id'=command::text,'disconnect claim changed command identity');
    perform pg_temp.ng_assert((pg_temp.ng_call('read_grant',jsonb_build_object('bindingId',binding))->>'credentialsPurged')::boolean,'claim did not purge retained credentials');
    perform pg_temp.ng_refuse('settle_disconnect',jsonb_build_object('commandId',command,'outcome','failed','errorCode',jsonb_build_object('providerContent','fictional private body')),'native_google_input_invalid');
    perform pg_temp.ng_refuse('settle_disconnect',jsonb_build_object('commandId',command,'outcome','failed','errorCode','fictional private response body'),'native_google_input_invalid');
    result:=pg_temp.ng_call('settle_disconnect',jsonb_build_object('commandId',command,'outcome','failed','errorCode','http_400'));
    perform pg_temp.ng_assert(result->>'remoteOutcome'='failed' and result->>'remoteRevoked'='false' and result->>'credentialsPurged'='true','failed remote outcome misreported');
    perform pg_temp.ng_assert(pg_temp.ng_call('read_disconnect',jsonb_build_object('commandId',command))->>'remoteErrorCode'='http_400','real machine response code was not retained');
    perform pg_temp.ng_expect(format('select public.update_workspace_account_binding_tokens(%L,%L,null,null)',binding,'enc:v1:XXXX:YYYY:ZZZZ'),'native_google_revoked_credentials_refused');
    foreach health in array array['revoked','needs_reauth','error','connected'] loop
      perform pg_temp.ng_expect(format('update public.workspace_account_bindings set status=%L,access_token_ciphertext=%L where id=%L',
        health,'enc:v1:XXXX:YYYY:ZZZZ',binding),case when health='revoked' then 'native_google_revoked_credentials_refused' else 'native_google_disconnect_pending' end);
      payload:=jsonb_build_object('workspaceId','e7140000-0000-4000-8000-000000000011','provider','google','originTenantStableId',null,
        'subject','fixture-native-google-subject','scopes',jsonb_build_array('openid','https://www.googleapis.com/auth/business.manage'),
        'accessTokenCiphertext','enc:v1:XXXX:YYYY:ZZZZ','status',health);
      perform pg_temp.ng_expect(format('select public.upsert_workspace_account_binding(%L::jsonb,%L)',payload,'oauth'),
        'native_google_disconnect_pending');
    end loop;
    perform pg_temp.ng_expect($q$select public.record_tenant_client_record('native-google-lifecycle-copy','provider_connections','google',
      '{"accessToken":"enc:v1:XXXX:YYYY:ZZZZ"}',repeat('d',64),clock_timestamp(),'dual_write','replace')$q$,'native_google_disconnect_pending');
    perform pg_temp.ng_call('begin_oauth',pg_temp.ng_begin_input(attempt)); perform pg_temp.ng_consume(attempt);
    perform pg_temp.ng_refuse('finish_oauth',pg_temp.ng_finish_input(attempt),'native_google_disconnect_pending');
    perform pg_temp.ng_assert((pg_temp.ng_call('read_grant',jsonb_build_object('bindingId',binding))->>'credentialsPurged')::boolean,'failed revocation allowed credential restoration');
    raise exception 'native_google_fixture_rollback_failed_scenario';
  exception when others then if sqlerrm<>'native_google_fixture_rollback_failed_scenario' then raise; end if; end;
  perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'failed scenario rollback did not restore fixture baseline');
end $$;

-- Confirmed simulated revocation permits a fresh signed attempt for exactly the
-- same binding/account/place. No real remote revocation is inferred from this.
do $$ declare binding uuid:=(select id from ng_ids where name='binding'); command uuid:=gen_random_uuid(); attempt uuid:=gen_random_uuid();
  result jsonb; prior jsonb; request jsonb; begin
  request:=jsonb_build_object('commandId',command,'bindingId',binding,'expectedUpdatedAt',
    (select updated_at from public.workspace_account_bindings where id=binding));
  prior:=pg_temp.ng_state();
  perform pg_temp.ng_refuse('claim_disconnect',request-'expectedUpdatedAt','native_google_grant_changed');
  perform pg_temp.ng_refuse('claim_disconnect',request||'{"expectedUpdatedAt":null}'::jsonb,'native_google_grant_changed');
  perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'missing disconnect generation purged credentials');
  perform pg_temp.ng_call('claim_disconnect',request);
  perform pg_temp.ng_expect(format('select public.update_workspace_account_binding_tokens(%L,%L,null,null)',binding,'enc:v1:XXXX:YYYY:ZZZZ'),'native_google_revoked_credentials_refused');
  result:=pg_temp.ng_call('settle_disconnect',jsonb_build_object('commandId',command,'outcome','revoked','errorCode',null));
  perform pg_temp.ng_assert(result->>'remoteRevoked'='true' and result->>'credentialsPurged'='true','confirmed simulated disconnect differs');
  perform pg_temp.ng_expect(format('select public.update_workspace_account_binding_tokens(%L,%L,null,null)',binding,'enc:v1:XXXX:YYYY:ZZZZ'),'native_google_revoked_credentials_refused');
  perform pg_temp.ng_refuse('settle_disconnect',jsonb_build_object('commandId',command,'outcome','revoked'),'native_google_receipt_not_claimed');
  prior:=pg_temp.ng_state();
  perform pg_temp.ng_refuse('begin_oauth',pg_temp.ng_begin_input(attempt)||'{"accountId":"accounts/other-account"}'::jsonb,'native_google_oauth_target_changed');
  perform pg_temp.ng_refuse('begin_oauth',pg_temp.ng_begin_input(attempt)||'{"locationId":"other-place"}'::jsonb,'native_google_oauth_target_changed');
  perform pg_temp.ng_assert(pg_temp.ng_state()=prior,'different reconnect target changed lifecycle state');
  perform pg_temp.ng_call('begin_oauth',pg_temp.ng_begin_input(attempt)); perform pg_temp.ng_consume(attempt);
  result:=pg_temp.ng_call('finish_oauth',pg_temp.ng_finish_input(attempt,'enc:v1:RRRR:SSSS:TTTT'));
  perform pg_temp.ng_assert(result->>'bindingId'=binding::text and result->>'accountId'='accounts/native-lifecycle'
    and result->>'locationId'='native-place' and result->>'status'='connected','matched reconnect changed target identity');
  perform pg_temp.ng_assert((select subject='fixture-native-google-subject' and refresh_token_ciphertext='enc:v1:RRRR:SSSS:TTTT'
    and status='connected' from public.workspace_account_bindings where id=binding),'matched reconnect did not rotate the exact grant');
  perform pg_temp.ng_assert((select count(*)=1 from public.workspace_account_bindings where workspace_id='e7140000-0000-4000-8000-000000000010'),'reconnect created a second native binding');
  perform pg_temp.ng_refuse('finish_oauth',pg_temp.ng_finish_input(attempt),'native_google_oauth_unavailable');
end $$;

-- Synthetic expired cache rows exercise only physical scope/retention. Purge
-- deletes this owner's expired content, preserves active content and another
-- business's expired content, and never erases immutable receipt history.
insert into public.google_listing_receipts(id,workspace_id,location_id,action,status,authority,idempotency_key,
  intent_digest,before_origin,after_origin,undo_origin,provider_payload_expires_at)
select id,workspace,'native-place','hours_patch','posted','{"kind":"owner_approval","actor":"fixture-owner"}'::jsonb,
  'native-lifecycle-retention:'||id::text,repeat('e',64),'provider','provider','provider',deadline
from (values
  ('e7140000-0000-4000-8000-000000000071'::uuid,'e7140000-0000-4000-8000-000000000010'::uuid,clock_timestamp()-interval '1 minute'),
  ('e7140000-0000-4000-8000-000000000072'::uuid,'e7140000-0000-4000-8000-000000000010'::uuid,clock_timestamp()+interval '1 hour'),
  ('e7140000-0000-4000-8000-000000000073'::uuid,'e7140000-0000-4000-8000-000000000011'::uuid,clock_timestamp()-interval '1 minute')
) fixture(id,workspace,deadline);
insert into public.google_listing_receipt_payloads(receipt_id,workspace_id,payload,expires_at)
select id,workspace_id,'{"before":{"hours":"fictional-provider-cache"}}'::jsonb,provider_payload_expires_at
from public.google_listing_receipts where id in ('e7140000-0000-4000-8000-000000000071','e7140000-0000-4000-8000-000000000072','e7140000-0000-4000-8000-000000000073');
do $$ declare result jsonb; begin
  result:=pg_temp.ng_call('purge');
  perform pg_temp.ng_assert(result->>'purged'='1' and result->>'expiredRemaining'='0','owner purge count differs');
  perform pg_temp.ng_assert(not exists(select 1 from public.google_listing_receipt_payloads where receipt_id='e7140000-0000-4000-8000-000000000071')
    and exists(select 1 from public.google_listing_receipt_payloads where receipt_id='e7140000-0000-4000-8000-000000000072')
    and exists(select 1 from public.google_listing_receipt_payloads where receipt_id='e7140000-0000-4000-8000-000000000073'),'purge crossed workspace or expiry boundary');
  perform pg_temp.ng_assert((select count(*)=3 from public.google_listing_receipts where id in
    ('e7140000-0000-4000-8000-000000000071','e7140000-0000-4000-8000-000000000072','e7140000-0000-4000-8000-000000000073')),'purge erased receipt history');
end $$;

rollback;
