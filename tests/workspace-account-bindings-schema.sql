\set ON_ERROR_STOP on
-- Google account bindings, locations and listing receipts
-- (20261007170000_workspace_account_bindings.sql). Fictional rows only, in a
-- rolled-back transaction. No token here is real; the ciphertexts are shaped
-- like enc:v1 envelopes and decrypt to nothing.
begin;
create or replace function pg_temp.ab_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'account binding assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ab_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.ab_grant(workspace text, tenant text, extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('workspaceId', workspace, 'provider', 'google', 'originTenantStableId', tenant,
    'scopes', jsonb_build_array('https://www.googleapis.com/auth/business.manage'),
    'refreshTokenCiphertext', 'enc:v1:AAAA:BBBB:CCCC', 'accessTokenCiphertext', 'enc:v1:DDDD:EEEE:FFFF',
    'tokenExpiresAt', '2026-10-07T18:00:00Z', 'status', 'connected') || extra
$$;

-- Locked down.
select pg_temp.ab_assert((select bool_and(relrowsecurity) from pg_class where oid in (
    'public.workspace_account_bindings'::regclass, 'public.workspace_google_locations'::regclass,
    'public.google_listing_receipts'::regclass)), 'rls on every table');
select pg_temp.ab_assert(not has_table_privilege('service_role', 'public.workspace_account_bindings', 'select')
  and not has_table_privilege('authenticated', 'public.workspace_account_bindings', 'select')
  and not has_table_privilege('anon', 'public.google_listing_receipts', 'select')
  and not has_table_privilege('service_role', 'public.workspace_google_locations', 'insert'), 'no direct table access');
select pg_temp.ab_assert(not has_function_privilege('anon', 'public.read_google_binding_for_tenant(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_google_binding_for_tenant(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.upsert_workspace_account_binding(jsonb,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_business_publishing(uuid,uuid,text,integer)', 'execute')
  and not has_function_privilege('service_role', 'public.account_binding_json(public.workspace_account_bindings,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.read_google_binding_for_tenant(text)', 'execute')
  and has_function_privilege('service_role', 'public.upsert_workspace_account_binding(jsonb,text)', 'execute')
  and has_function_privilege('service_role', 'public.record_google_listing_receipt(jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.read_business_publishing(uuid,uuid,text,integer)', 'execute'),
  'only service_role executes the binding functions');

-- The two new origins exist; the earlier ones keep their ids.
-- Later migrations may append origins (20261008151000 adds connected_site).
select pg_temp.ab_assert((public.system_origin_kinds())[1:5] = array['saved_work','tenant','inquiry_workspace','google_location','tenant_newsletter'],
  'origin kinds extended in order');
select pg_temp.ab_assert(public.system_origin_id('5e000000-0000-4000-8000-000000000010', 'tenant', '5e000000-0000-4000-8000-0000000000b2')
  = '60111262-7fba-474e-a004-3f5d2eee18f0', 'tenant origin id unchanged');

insert into public.users(id, email, verified_at) values
  ('ab000000-0000-4000-8000-000000000001', 'ab-owner@example.test', now()),
  ('ab000000-0000-4000-8000-000000000002', 'ab-member@example.test', now()),
  ('ab000000-0000-4000-8000-000000000003', 'ab-other-owner@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('ab000000-0000-4000-8000-000000000010', 'customer', 'Juniper Law', 'ab000000-0000-4000-8000-000000000001'),
  ('ab000000-0000-4000-8000-000000000011', 'customer', 'Other Firm', 'ab000000-0000-4000-8000-000000000003'),
  ('ab000000-0000-4000-8000-000000000012', 'personal', 'Personal', 'ab000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('ab000000-0000-4000-8000-000000000010', 'ab000000-0000-4000-8000-000000000001', 'owner', 'ab000000-0000-4000-8000-000000000001'),
  ('ab000000-0000-4000-8000-000000000010', 'ab000000-0000-4000-8000-000000000002', 'member', 'ab000000-0000-4000-8000-000000000001'),
  ('ab000000-0000-4000-8000-000000000011', 'ab000000-0000-4000-8000-000000000003', 'owner', 'ab000000-0000-4000-8000-000000000003');
insert into public.tenants(id, stable_id, site_name, active) values
  ('ab-law', 'ab000000-0000-4000-8000-0000000000b1', 'Juniper Law', true),
  ('ab-law-two', 'ab000000-0000-4000-8000-0000000000b2', 'Juniper Law Uptown', true),
  ('ab-other', 'ab000000-0000-4000-8000-0000000000b3', 'Other Firm', true),
  ('ab-unlinked', 'ab000000-0000-4000-8000-0000000000b4', 'Unlinked Site', true);
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('ab000000-0000-4000-8000-0000000000b1', 'ab-law', 'ab000000-0000-4000-8000-000000000010', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-0000000000c1', repeat('a', 64), '{}'),
  ('ab000000-0000-4000-8000-0000000000b2', 'ab-law-two', 'ab000000-0000-4000-8000-000000000010', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-0000000000c2', repeat('b', 64), '{}'),
  ('ab000000-0000-4000-8000-0000000000b3', 'ab-other', 'ab000000-0000-4000-8000-000000000011', 'ab000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-0000000000c3', repeat('c', 64), '{}');

-- Plaintext never lands, even through a direct insert.
select pg_temp.ab_expect($$select public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010','ab000000-0000-4000-8000-0000000000b1','{"refreshTokenCiphertext":"1//plain-refresh"}'), 'copy')$$, 'account_binding_plaintext_refused');
select pg_temp.ab_expect($$select public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010','ab000000-0000-4000-8000-0000000000b1','{"accessTokenCiphertext":"ya29.plain"}'), 'oauth')$$, 'account_binding_plaintext_refused');
select pg_temp.ab_expect($$insert into public.workspace_account_bindings(workspace_id, provider, origin_tenant_stable_id, refresh_token_ciphertext, migrated_from) values ('ab000000-0000-4000-8000-000000000010','google','ab000000-0000-4000-8000-0000000000b1','1//plain','redis')$$, '%workspace_account_bindings_refresh_token_ciphertext_check%');

-- A grant is filed only under the business its tenant is linked to.
select pg_temp.ab_expect($$select public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010','ab000000-0000-4000-8000-0000000000b3'), 'copy')$$, 'account_binding_tenant_not_linked');
select pg_temp.ab_expect($$select public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010','ab000000-0000-4000-8000-0000000000b4'), 'copy')$$, 'account_binding_tenant_not_linked');
select pg_temp.ab_expect($$select public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000012',null), 'oauth')$$, 'account_binding_workspace_unknown');
select pg_temp.ab_expect($$select public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010','ab000000-0000-4000-8000-0000000000b1','{"provider":"outlook"}'), 'copy')$$, 'account_binding_invalid');
select pg_temp.ab_expect($$select public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010','ab000000-0000-4000-8000-0000000000b1'), 'merge')$$, 'account_binding_invalid');

-- Copy is idempotent and never overwrites; a scope-less legacy grant keeps null scopes.
create temp table ab_ids(name text primary key, id uuid) on commit drop;
insert into ab_ids select 'law', (public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010',
  'ab000000-0000-4000-8000-0000000000b1', '{"scopes":null}'), 'copy')->>'id')::uuid;
select pg_temp.ab_assert((select scopes is null and migrated_from = 'redis' from public.workspace_account_bindings
  where id = (select id from ab_ids where name = 'law')), 'legacy grant keeps null scopes, marked redis');
select pg_temp.ab_assert(public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010',
  'ab000000-0000-4000-8000-0000000000b1', '{"refreshTokenCiphertext":"enc:v1:ZZZZ:ZZZZ:ZZZZ"}'), 'copy')
  = jsonb_build_object('status', 'exists', 'id', (select id from ab_ids where name = 'law')), 'second copy is a no-op');
select pg_temp.ab_assert((select refresh_token_ciphertext = 'enc:v1:AAAA:BBBB:CCCC' from public.workspace_account_bindings
  where id = (select id from ab_ids where name = 'law')), 'copy did not overwrite tokens');
-- A reconnect replaces tokens and scopes but keeps identity and origin.
select pg_temp.ab_assert(public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010',
  'ab000000-0000-4000-8000-0000000000b1', '{"refreshTokenCiphertext":"enc:v1:NEW1:NEW2:NEW3"}'), 'oauth')->>'status' = 'updated', 'reconnect updates');
select pg_temp.ab_assert((select refresh_token_ciphertext = 'enc:v1:NEW1:NEW2:NEW3' and migrated_from = 'redis'
  and scopes = array['https://www.googleapis.com/auth/business.manage'] from public.workspace_account_bindings
  where id = (select id from ab_ids where name = 'law')), 'reconnect wrote fresh tokens and scopes');
-- A second linked tenant gets its own grant in the same business.
insert into ab_ids select 'law-two', (public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000010',
  'ab000000-0000-4000-8000-0000000000b2'), 'oauth')->>'id')::uuid;
select pg_temp.ab_assert((select count(*) from public.workspace_account_bindings where workspace_id = 'ab000000-0000-4000-8000-000000000010') = 2,
  'two grants in one business');
insert into ab_ids select 'other', (public.upsert_workspace_account_binding(pg_temp.ab_grant('ab000000-0000-4000-8000-000000000011',
  'ab000000-0000-4000-8000-0000000000b3'), 'copy')->>'id')::uuid;

-- Tokens: a rotated refresh token is stored, a missing one never clears it, plaintext refused.
select public.update_workspace_account_binding_tokens((select id from ab_ids where name = 'law'), 'enc:v1:ACC1:ACC2:ACC3', '2026-10-07T19:00:00Z', null);
select pg_temp.ab_assert((select refresh_token_ciphertext = 'enc:v1:NEW1:NEW2:NEW3' and access_token_ciphertext = 'enc:v1:ACC1:ACC2:ACC3'
  from public.workspace_account_bindings where id = (select id from ab_ids where name = 'law')), 'refresh token kept');
select public.update_workspace_account_binding_tokens((select id from ab_ids where name = 'law'), 'enc:v1:ACC1:ACC2:ACC3', '2026-10-07T19:00:00Z', 'enc:v1:ROT1:ROT2:ROT3');
select pg_temp.ab_assert((select refresh_token_ciphertext = 'enc:v1:ROT1:ROT2:ROT3' from public.workspace_account_bindings
  where id = (select id from ab_ids where name = 'law')), 'rotated refresh token stored');
select pg_temp.ab_expect(format('select public.update_workspace_account_binding_tokens(%L, %L, null, null)', (select id from ab_ids where name = 'law'), 'ya29.plain'), 'account_binding_plaintext_refused');
select pg_temp.ab_expect($$select public.set_workspace_account_binding_status('ab000000-0000-4000-8000-0000000000ff', 'connected', null, null)$$, 'account_binding_not_found');

-- Locations: newest selection is primary.
select public.upsert_workspace_google_location((select id from ab_ids where name = 'law'), 'accounts/111', '222', 'Juniper Law');
select public.upsert_workspace_google_location((select id from ab_ids where name = 'law'), 'accounts/111', '333', 'Juniper Law Downtown');
select pg_temp.ab_assert((select count(*) filter (where is_primary) = 1 and bool_or(is_primary and location_id = '333')
  from public.workspace_google_locations where binding_id = (select id from ab_ids where name = 'law')), 'one primary, the newest');
select pg_temp.ab_expect(format('select public.upsert_workspace_google_location(%L, %L, %L, null)', (select id from ab_ids where name = 'law'), 'accounts/../x', '1'), 'account_binding_invalid');

-- Tenant read: by current slug, with ciphertexts and the primary location first.
select pg_temp.ab_assert((select b->>'id' = (select id::text from ab_ids where name = 'law')
  and b->>'refreshTokenCiphertext' = 'enc:v1:ROT1:ROT2:ROT3' and b->'locations'->0->>'locationId' = '333'
  and b->>'originTenantId' = 'ab-law'
  from (select public.read_google_binding_for_tenant('ab-law') as b) x), 'tenant read returns the binding');
select pg_temp.ab_assert(public.read_google_binding_for_tenant('ab-unlinked') is null and public.read_google_binding_for_tenant('nope') is null,
  'unlinked or unknown tenant reads nothing');
select pg_temp.ab_assert((public.read_tenant_binding_target('ab-law')->>'workspaceId') = 'ab000000-0000-4000-8000-000000000010'
  and public.read_tenant_binding_target('ab-unlinked') is null, 'binding target follows the link');

-- Receipts: idempotent by key; auto policy only for 3+ star reply posts.
create or replace function pg_temp.ab_receipt(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('workspaceId', 'ab000000-0000-4000-8000-000000000010',
    'bindingId', (select id from ab_ids where name = 'law'), 'locationId', '333', 'action', 'reply_post',
    'targetRef', 'review-1', 'authority', '{"kind":"owner_approval","actor":"owner"}'::jsonb,
    'before', '{"reply":null}'::jsonb, 'after', '{"reply":"Thank you, Dana."}'::jsonb,
    'idempotencyKey', 'reply-post:review-1:a') || extra
$$;
insert into ab_ids select 'r1', (public.record_google_listing_receipt(pg_temp.ab_receipt('{}'))->>'id')::uuid;
select pg_temp.ab_assert((public.record_google_listing_receipt(pg_temp.ab_receipt('{}'))->>'replayed')::boolean
  and (public.record_google_listing_receipt(pg_temp.ab_receipt('{}'))->>'id')::uuid = (select id from ab_ids where name = 'r1'), 'receipt replay');
select pg_temp.ab_expect($$select public.record_google_listing_receipt(pg_temp.ab_receipt('{"idempotencyKey":"auto-1-star","authority":{"kind":"auto_reply_policy","rating":2}}'))$$, '%google_listing_receipts_check%');
select pg_temp.ab_expect($$select public.record_google_listing_receipt(pg_temp.ab_receipt('{"idempotencyKey":"auto-hours","action":"hours_patch","authority":{"kind":"auto_reply_policy","rating":5}}'))$$, '%google_listing_receipts_check%');
select pg_temp.ab_assert((public.record_google_listing_receipt(pg_temp.ab_receipt('{"idempotencyKey":"auto-5-star","targetRef":"review-5","authority":{"kind":"auto_reply_policy","rating":5}}'))->>'status') = 'posting', 'auto 5-star reply allowed');
select pg_temp.ab_expect($$select public.record_google_listing_receipt(pg_temp.ab_receipt('{"idempotencyKey":"no-authority","authority":{"kind":"connection"}}'))$$, '%google_listing_receipts_authority_check%');
-- Cross-business: another business's binding or receipt is refused.
select pg_temp.ab_expect(format('select public.record_google_listing_receipt(pg_temp.ab_receipt(%L))',
  jsonb_build_object('idempotencyKey', 'cross-binding', 'bindingId', (select id from ab_ids where name = 'other'))), 'account_binding_not_found');
select pg_temp.ab_expect(format('select public.settle_google_listing_receipt(%L, %L, %L)', (select id from ab_ids where name = 'r1'),
  'ab000000-0000-4000-8000-000000000011', '{"status":"posted","readback":"matched"}'), 'google_receipt_not_found');

-- Accepted stays accepted: no way back to posting or failed.
select public.settle_google_listing_receipt((select id from ab_ids where name = 'r1'), 'ab000000-0000-4000-8000-000000000010',
  '{"status":"posted_unverified","readback":"differs","undo":{"kind":"delete_reply"}}');
select pg_temp.ab_expect(format('select public.settle_google_listing_receipt(%L, %L, %L)', (select id from ab_ids where name = 'r1'),
  'ab000000-0000-4000-8000-000000000010', '{"status":"failed","error":"retry"}'), 'google_receipt_transition_invalid');
select pg_temp.ab_expect(format('update public.google_listing_receipts set status = %L where id = %L', 'posting', (select id from ab_ids where name = 'r1')), 'google_receipt_transition_invalid');
select pg_temp.ab_expect(format('update public.google_listing_receipts set authority = %L where id = %L', '{"kind":"owner_approval","actor":"x"}', (select id from ab_ids where name = 'r1')), 'google_receipt_immutable');
select public.confirm_google_listing_receipt((select id from ab_ids where name = 'r1'), 'ab000000-0000-4000-8000-000000000010', 'posted', 'matched');
select pg_temp.ab_assert((select status = 'posted' and readback = 'matched' from public.google_listing_receipts where id = (select id from ab_ids where name = 'r1')),
  'a later read-back confirms');

-- Undo: settling the undo marks the original undone, in one transaction.
insert into ab_ids select 'u1', (public.record_google_listing_receipt(pg_temp.ab_receipt(jsonb_build_object('idempotencyKey', 'undo:receipt-1',
  'action', 'reply_delete', 'authority', '{"kind":"owner_undo","actor":"owner"}'::jsonb, 'undoesReceiptId', (select id from ab_ids where name = 'r1'))))->>'id')::uuid;
select public.settle_google_listing_receipt((select id from ab_ids where name = 'u1'), 'ab000000-0000-4000-8000-000000000010', '{"status":"posted","readback":"matched"}');
select pg_temp.ab_assert((select status = 'undone' and undone_by_receipt_id = (select id from ab_ids where name = 'u1')
  from public.google_listing_receipts where id = (select id from ab_ids where name = 'r1')), 'original marked undone');
-- A failed undo leaves the original as it was.
insert into ab_ids select 'r2', (public.record_google_listing_receipt(pg_temp.ab_receipt('{"idempotencyKey":"post:create-2","action":"post_create","targetRef":null}'))->>'id')::uuid;
select public.settle_google_listing_receipt((select id from ab_ids where name = 'r2'), 'ab000000-0000-4000-8000-000000000010', '{"status":"posted","readback":"matched","providerRef":"accounts/111/locations/333/localPosts/9"}');
insert into ab_ids select 'u2', (public.record_google_listing_receipt(pg_temp.ab_receipt(jsonb_build_object('idempotencyKey', 'undo:receipt-2',
  'action', 'post_delete', 'authority', '{"kind":"owner_undo","actor":"owner"}'::jsonb, 'undoesReceiptId', (select id from ab_ids where name = 'r2'))))->>'id')::uuid;
select public.settle_google_listing_receipt((select id from ab_ids where name = 'u2'), 'ab000000-0000-4000-8000-000000000010', '{"status":"failed","error":"Google said no"}');
select pg_temp.ab_assert((select status = 'posted' from public.google_listing_receipts where id = (select id from ab_ids where name = 'r2')), 'failed undo leaves original posted');
select pg_temp.ab_expect(format('select public.record_google_listing_receipt(%L)', jsonb_build_object('workspaceId', 'ab000000-0000-4000-8000-000000000011',
  'bindingId', null, 'locationId', '1', 'action', 'post_delete', 'authority', '{"kind":"owner_undo"}'::jsonb, 'idempotencyKey', 'cross-undo-1',
  'undoesReceiptId', (select id from ab_ids where name = 'r2'))), 'google_receipt_not_found');

-- Actor read: members of the business see bindings without tokens; strangers and other owners are refused.
select pg_temp.ab_assert((select jsonb_array_length(p->'bindings') = 2 and not (p->'bindings'->0 ? 'refreshTokenCiphertext')
  and not (p->'bindings'->0 ? 'accessTokenCiphertext') and p::text not like '%enc:v1%' and jsonb_array_length(p->'receipts') >= 4
  from (select public.read_business_publishing('ab000000-0000-4000-8000-000000000010', 'ab000000-0000-4000-8000-000000000002',
    'ab-member@example.test', 20) as p) x), 'member reads publishing without secrets');
select pg_temp.ab_expect($$select public.read_business_publishing('ab000000-0000-4000-8000-000000000010','ab000000-0000-4000-8000-000000000003','ab-other-owner@example.test',20)$$, 'business_record_access_denied');
select pg_temp.ab_assert((select jsonb_array_length(public.read_business_publishing('ab000000-0000-4000-8000-000000000011',
  'ab000000-0000-4000-8000-000000000003', 'ab-other-owner@example.test', 20)->'receipts') = 0), 'other business sees none of these receipts');

-- Deprovisioning a tenant removes its grant; receipts outlive the binding.
delete from public.tenants where id = 'ab-law';
select pg_temp.ab_assert(not exists (select 1 from public.workspace_account_bindings where id = (select id from ab_ids where name = 'law')), 'grant removed with tenant');
select pg_temp.ab_assert((select count(*) from public.google_listing_receipts where workspace_id = 'ab000000-0000-4000-8000-000000000010' and binding_id is null) >= 4,
  'receipts kept with binding cleared');

rollback;
