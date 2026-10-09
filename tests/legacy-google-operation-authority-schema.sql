\set ON_ERROR_STOP on
-- Prepared, UNRUN qualification for migration 20261022175100. Fictional users,
-- tenants, and undecryptable shaped envelopes; every mutation rolls back.
-- Run only after all actual forwards in an owned disposable SQL database.
begin;
set local statement_timeout='10s';
set local lock_timeout='2s';
create function pg_temp.lg_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'legacy Google operation assertion: %',message; end if; end $$;
create function pg_temp.lg_expect(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not like expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
  end;
  raise exception 'expected refusal %',expected;
end $$;
create function pg_temp.lg_state() returns jsonb language sql as $$
 select jsonb_build_object(
   'bindings',(select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]') from public.workspace_account_bindings b where b.workspace_id='e7510000-0000-4000-8000-000000000010'),
   'locations',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from public.workspace_google_locations l where l.workspace_id='e7510000-0000-4000-8000-000000000010'),
   'records',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.tenant_client_records r where r.tenant_stable_id in ('e7510000-0000-4000-8000-000000000020','e7510000-0000-4000-8000-000000000021')),
   'watermarks',(select coalesce(jsonb_agg(to_jsonb(w) order by w.tenant_stable_id),'[]') from public.legacy_google_operation_watermarks w where w.tenant_stable_id in ('e7510000-0000-4000-8000-000000000020','e7510000-0000-4000-8000-000000000021')))
$$;
create function pg_temp.lg_pin(tenant text default 'legacy-google-operation-fixture') returns jsonb language sql as $$
 select public.read_legacy_google_operation(tenant)||jsonb_build_object('startedAt',clock_timestamp()::text)
$$;
create function pg_temp.lg_input(pin jsonb,location text default 'first') returns jsonb language sql as $$
 select jsonb_build_object('grant',jsonb_build_object('workspaceId',coalesce(pin->>'workspaceId',''),'originTenantStableId',pin->>'tenantStableId',
   'subject',null,'scopes',jsonb_build_array('https://www.googleapis.com/auth/business.manage'),
   'refreshTokenCiphertext','enc:v1:AAAA:BBBB:CCCC','accessTokenCiphertext','enc:v1:DDDD:EEEE:FFFF',
   'tokenExpiresAt',(clock_timestamp()+interval '1 hour')::text,'status','connected'),
   'location',jsonb_build_object('accountId','accounts/fixture','locationId',location,'title',null))
$$;
create function pg_temp.lg_apply(pin jsonb,input jsonb,kind text default 'oauth',actor uuid default 'e7510000-0000-4000-8000-000000000001',email text default 'legacy-google-editor@example.test') returns jsonb language sql as $$
 select public.apply_legacy_google_operation(actor,email,pin,kind,input)
$$;
-- Fixed Node clientRecordHash vectors, not a self-comparison of SQL output.
-- Include nested metadata, UTF-8, quote/backslash/newline escaping, arrays and null.
select pg_temp.lg_assert(encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(
 $json${"value":{"accountId":"accounts/café","locationId":"quote\"\\line\n"}}$json$::jsonb),'UTF8')),'hex')=
 'aa133cb5bcd98b08f7bf71e7b68cc43138983d0ec87276b61a6264a59c4c109e','UTF-8 metadata matches Node canonical hash');
select pg_temp.lg_assert(encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(
 $json${"provider":"google","tenantId":"fictional","accessToken":"enc:v1:AAAA:BBBB:CCCC","refreshToken":"enc:v1:DDDD:EEEE:FFFF","expiresAt":"2026-10-09T13:00:00.000Z","status":"connected","lastSyncedAt":"2026-10-09T12:00:00.000Z","scopes":["openid","https://www.googleapis.com/auth/business.manage"]}$json$::jsonb),'UTF8')),'hex')=
 '262388dc11fab24c5b870c8d7a1f4f014cc222c47165d01c89a56ceea358a02b','connection array matches Node canonical hash');
select pg_temp.lg_assert(encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json('{"value":null}'::jsonb),'UTF8')),'hex')=
 '1c197daef20de3f47eec5e2f735ec6669869d3180cc29f35be4788511e0af0f8','null matches Node canonical hash');
insert into public.users(id,email,verified_at) values
 ('e7510000-0000-4000-8000-000000000001','legacy-google-editor@example.test',now()),
 ('e7510000-0000-4000-8000-000000000002','legacy-google-viewer@example.test',now()),
 ('e7510000-0000-4000-8000-000000000003','legacy-google-admin@example.test',now());
insert into public.tenants(id,stable_id,site_name,active) values
 ('legacy-google-operation-fixture','e7510000-0000-4000-8000-000000000020','Legacy Google operation fixture',true),
 ('legacy-google-unlinked-fixture','e7510000-0000-4000-8000-000000000021','Legacy Google unlinked fixture',true);
insert into public.workspaces(id,kind,name,created_by) values
 ('e7510000-0000-4000-8000-000000000010','customer','Legacy Google operation fixture','e7510000-0000-4000-8000-000000000001');
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) values
 ('e7510000-0000-4000-8000-000000000001','legacy-google-operation-fixture','e7510000-0000-4000-8000-000000000020','editor'),
 ('e7510000-0000-4000-8000-000000000002','legacy-google-operation-fixture','e7510000-0000-4000-8000-000000000020','viewer'),
 ('e7510000-0000-4000-8000-000000000001','legacy-google-unlinked-fixture','e7510000-0000-4000-8000-000000000021','editor');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
 ('e7510000-0000-4000-8000-000000000020','legacy-google-operation-fixture','e7510000-0000-4000-8000-000000000010',
  'e7510000-0000-4000-8000-000000000001','e7510000-0000-4000-8000-000000000030',repeat('a',64),'{}');
select pg_temp.lg_assert((select relrowsecurity from pg_class where oid='public.legacy_google_operation_watermarks'::regclass)
 and not has_table_privilege('service_role','public.legacy_google_operation_watermarks','select')
 and not has_function_privilege('service_role','public.legacy_google_commit(uuid,text,text,jsonb,jsonb)','execute')
 and not has_function_privilege('authenticated','public.apply_legacy_google_operation(uuid,text,jsonb,text,jsonb)','execute')
 and has_function_privilege('service_role','public.commit_legacy_google_binding_operation(jsonb,jsonb)','execute'),'private state and service-only RPCs');

-- Refusal is atomic before both initial credential persistence and binding creation.
do $$ declare pin jsonb:=pg_temp.lg_pin(); before_state jsonb:=pg_temp.lg_state(); begin
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb,''oauth'',''e7510000-0000-4000-8000-000000000002'',''legacy-google-viewer@example.test'')',pin,pg_temp.lg_input(pin)),'google_settings_permission_denied');
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb,''oauth'',null,null)',pin,pg_temp.lg_input(pin)),'google_settings_permission_denied');
 perform pg_temp.lg_assert(pg_temp.lg_state()=before_state,'viewer/null actor leaves all durable rows unchanged');
end $$;

-- Two operations saw no binding. The later one completes; earlier one must
-- leave credentials, selection, generation and admission history unchanged.
do $$ declare a jsonb:=pg_temp.lg_pin(); b jsonb:=pg_temp.lg_pin(); state jsonb; result jsonb; begin
 result:=pg_temp.lg_apply(b,pg_temp.lg_input(b,'second'));
 perform pg_temp.lg_assert(result->>'status'='applied' and result->>'bindingId' is not null,'actual initial OAuth commit');
 state:=pg_temp.lg_state();
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb)',a,pg_temp.lg_input(a,'first')),'legacy_google_operation_superseded');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'absent-binding stale operation cannot overwrite later grant/selection');
 perform pg_temp.lg_assert((select count(*)=2 from public.tenant_client_records where tenant_stable_id='e7510000-0000-4000-8000-000000000020' and removed_at is null),'connection and metadata actually recorded');
 perform pg_temp.lg_assert((select payload_hash=encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(payload),'UTF8')),'hex') from public.tenant_client_records where tenant_stable_id='e7510000-0000-4000-8000-000000000020' and store='provider_connections'),'connection hash covers exact persisted ciphertext');
end $$;

-- Direct service role admission really executes the public RPC. Retain the
-- result only in a temp fixture table; role sessions never read private tables.
create temporary table lg_service_pin(pin jsonb,input jsonb);
insert into lg_service_pin select pin,pg_temp.lg_input(pin,'service-role') from (select pg_temp.lg_pin() pin) s;
grant select on lg_service_pin to service_role;
set local role service_role;
select public.apply_legacy_google_operation('e7510000-0000-4000-8000-000000000001','legacy-google-editor@example.test',pin,'oauth',input) from lg_service_pin;
reset role;
set local role anon;
select pg_temp.lg_expect($q$select public.read_legacy_google_operation('legacy-google-operation-fixture')$q$,'%permission denied%');
select pg_temp.lg_expect($q$select public.apply_legacy_google_operation(null,null,'{}','oauth','{}')$q$,'%permission denied%');
reset role;
set local role authenticated;
select pg_temp.lg_expect($q$select public.commit_legacy_google_binding_operation('{}','{}')$q$,'%permission denied%');
reset role;

-- Historical location change-back does not update binding.updated_at; the
-- monotonic location generation in the digest still detects it.
do $$ declare pin jsonb:=pg_temp.lg_pin(); state jsonb; binding uuid:=(pin->>'bindingId')::uuid; begin
 perform public.upsert_workspace_google_location(binding,'accounts/fixture','temporary',null);
 perform public.upsert_workspace_google_location(binding,'accounts/fixture','second',null);
 state:=pg_temp.lg_state();
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)),'legacy_google_operation_superseded');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'location change-back refuses without durable mutation');
end $$;

-- Permission is checked at commit, not only at callback admission.
do $$ declare pin jsonb:=pg_temp.lg_pin(); state jsonb; begin
 update public.memberships set role='viewer' where user_id='e7510000-0000-4000-8000-000000000001';
 state:=pg_temp.lg_state();
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)),'google_settings_permission_denied');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'role demotion refuses before persistence');
 update public.memberships set role='editor' where user_id='e7510000-0000-4000-8000-000000000001';
 update public.users set email='legacy-google-changed@example.test' where id='e7510000-0000-4000-8000-000000000001';
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)),'google_settings_permission_denied');
 update public.users set email='legacy-google-editor@example.test',verified_at=null where id='e7510000-0000-4000-8000-000000000001';
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)),'google_settings_permission_denied');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'email and verification loss leave durable state unchanged');
 update public.users set verified_at=now() where id='e7510000-0000-4000-8000-000000000001';
end $$;

-- An actual active super-admin requires no tenant membership, and revocation
-- after its begin immediately removes the bypass.
insert into public.super_admins(user_id,email) values('e7510000-0000-4000-8000-000000000003','legacy-google-admin@example.test');
do $$ declare pin jsonb:=pg_temp.lg_pin(); state jsonb; begin
 perform pg_temp.lg_apply(pin,pg_temp.lg_input(pin,'admin'),'oauth','e7510000-0000-4000-8000-000000000003','legacy-google-admin@example.test');
 pin:=pg_temp.lg_pin(); update public.super_admins set revoked_at=clock_timestamp() where user_id='e7510000-0000-4000-8000-000000000003';
 state:=pg_temp.lg_state();
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb,''oauth'',''e7510000-0000-4000-8000-000000000003'',''legacy-google-admin@example.test'')',pin,pg_temp.lg_input(pin)),'google_settings_permission_denied');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'revoked super-admin refuses atomically');
end $$;

-- New timestamp admission also fences an old reconnect which reads a fresh
-- snapshot after a later OAuth completes. Equal watermark is refused.
do $$ declare old_start text:=clock_timestamp()::text; pin jsonb; state jsonb; begin
 pin:=pg_temp.lg_pin(); perform pg_temp.lg_apply(pin,pg_temp.lg_input(pin,'later'));
 state:=pg_temp.lg_state(); pin:=public.read_legacy_google_operation('legacy-google-operation-fixture')||jsonb_build_object('startedAt',old_start);
 perform pg_temp.lg_expect(format('select public.commit_legacy_google_binding_operation(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)),'legacy_google_operation_superseded');
 pin:=pin||jsonb_build_object('startedAt',(select latest_started_at::text from public.legacy_google_operation_watermarks where tenant_stable_id='e7510000-0000-4000-8000-000000000020'));
 perform pg_temp.lg_expect(format('select public.commit_legacy_google_binding_operation(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)),'legacy_google_operation_superseded');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'start admission rejects old/equal reconnect');
end $$;

-- Pure service CAS preserves the governed reconnect port's existing authority.
-- All service records join admission now; they are never saved before refusal.
-- Interactive selection updates the binding timestamp and metadata together.
do $$ declare pin jsonb:=pg_temp.lg_pin(); result jsonb; prior_updated timestamptz:=(pin->>'bindingUpdatedAt')::timestamptz; begin
 result:=public.commit_legacy_google_binding_operation(pin,pg_temp.lg_input(pin,'service'));
 perform pg_temp.lg_assert(result->>'status'='applied','governed service CAS remains available');
 perform pg_temp.lg_assert((select payload->'value'->>'locationId'='service' from public.tenant_client_records where tenant_stable_id='e7510000-0000-4000-8000-000000000020' and store='provider_metadata'),'trusted service writes authoritative metadata in same transaction');
 pin:=pg_temp.lg_pin(); perform pg_temp.lg_apply(pin,pg_temp.lg_input(pin,'chosen')-'grant','location');
 perform pg_temp.lg_assert((select updated_at>prior_updated from public.workspace_account_bindings where id=(pin->>'bindingId')::uuid),'selection advances binding timestamp');
 perform pg_temp.lg_assert((select payload->'value'->>'locationId'='chosen' from public.tenant_client_records where tenant_stable_id='e7510000-0000-4000-8000-000000000020' and store='provider_metadata'),'selection durable metadata matches canonical location');
end $$;

-- A trusted reconnect with a newer actual legacy record/tombstone is refused
-- with canonical, credentials, metadata and watermark all preserved.
do $$ declare pin jsonb:=pg_temp.lg_pin(); state jsonb; begin
 perform public.record_tenant_client_record('legacy-google-operation-fixture','provider_connections','google',null,null,clock_timestamp(),'dual_write','remove');
 state:=pg_temp.lg_state();
 perform pg_temp.lg_expect(format('select public.commit_legacy_google_binding_operation(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin,'refused-trusted')),'legacy_google_operation_superseded');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'trusted tombstone refusal preserves every authoritative record');
 pin:=pg_temp.lg_pin(); perform public.commit_legacy_google_binding_operation(pin,pg_temp.lg_input(pin,'restored'));
 pin:=pg_temp.lg_pin();
 perform public.commit_legacy_google_binding_operation(pin,jsonb_set(pg_temp.lg_input(pin,'refresh-kept'),'{grant,refreshTokenCiphertext}','null'));
 perform pg_temp.lg_assert((select payload->>'refreshToken'='enc:v1:AAAA:BBBB:CCCC' from public.tenant_client_records where tenant_stable_id='e7510000-0000-4000-8000-000000000020' and store='provider_connections'),'omitted trusted refresh preserves durable envelope');
 perform pg_temp.lg_assert((select refresh_token_ciphertext='enc:v1:AAAA:BBBB:CCCC' from public.workspace_account_bindings where id=(pin->>'bindingId')::uuid),'omitted trusted refresh preserves canonical envelope');
end $$;

-- Existing real tenants without a workspace still receive atomic OAuth records.
do $$ declare pin jsonb:=pg_temp.lg_pin('legacy-google-unlinked-fixture'); result jsonb; state jsonb; begin
 result:=pg_temp.lg_apply(pin,pg_temp.lg_input(pin));
 perform pg_temp.lg_assert(result->>'status'='applied' and result->>'bindingId' is null,'unlinked OAuth persists records without inventing native binding');
 perform pg_temp.lg_assert((select count(*)=2 from public.tenant_client_records where tenant_stable_id='e7510000-0000-4000-8000-000000000021' and removed_at is null),'unlinked records persisted');
 pin:=pg_temp.lg_pin('legacy-google-unlinked-fixture')||jsonb_build_object('startedAt',(select latest_started_at::text from public.legacy_google_operation_watermarks where tenant_stable_id='e7510000-0000-4000-8000-000000000021'));
 state:=pg_temp.lg_state();
 perform pg_temp.lg_expect(format('select public.commit_legacy_google_binding_operation(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)),'legacy_google_operation_superseded');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'unlinked same-start admission reaches watermark and refuses');
 pin:=pg_temp.lg_pin('legacy-google-unlinked-fixture'); state:=pg_temp.lg_state();
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)||jsonb_build_object('grant',(pg_temp.lg_input(pin)->'grant')||jsonb_build_object('originTenantStableId','e7510000-0000-4000-8000-000000000020'))),'legacy_google_operation_invalid');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'tampered stable authority refuses before all persistence');
end $$;

-- A newer actual legacy remove writer fences an otherwise matching snapshot.
do $$ declare pin jsonb:=pg_temp.lg_pin(); state jsonb; begin
 perform public.record_tenant_client_record('legacy-google-operation-fixture','provider_connections','google',null,null,clock_timestamp(),'dual_write','remove');
 state:=pg_temp.lg_state();
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin)),'legacy_google_operation_superseded');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'newer credential tombstone refuses all interactive mutations');
end $$;

-- Inject failure after actual record writers have run, at the later binding
-- writer. The caught subtransaction must roll back records and watermark too.
create function pg_temp.lg_fail_binding() returns trigger language plpgsql as $$
begin raise exception 'fixture_late_binding_refusal'; end $$;
create trigger lg_fixture_late_refusal before insert or update on public.workspace_account_bindings for each row
  when (new.workspace_id='e7510000-0000-4000-8000-000000000010') execute function pg_temp.lg_fail_binding();
do $$ declare pin jsonb:=pg_temp.lg_pin(); state jsonb:=pg_temp.lg_state(); begin
 perform pg_temp.lg_expect(format('select pg_temp.lg_apply(%L::jsonb,%L::jsonb)',pin,pg_temp.lg_input(pin,'late-fail')),'fixture_late_binding_refusal');
 perform pg_temp.lg_assert(pg_temp.lg_state()=state,'late canonical failure rolls back already-written credentials and metadata');
end $$;
drop trigger lg_fixture_late_refusal on public.workspace_account_bindings;
select pg_temp.lg_expect($q$select public.read_legacy_google_operation('workspace-e7510000-0000-4000-8000-000000000010')$q$,'legacy_google_operation_invalid');
rollback;
