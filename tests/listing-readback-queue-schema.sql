\set ON_ERROR_STOP on
-- /admin/queue's read-back failures from google_listing_receipts
-- (20261008123000_listing_readback_queue.sql). Fictional rows only; rolled back.
begin;
create or replace function pg_temp.lq_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'listing readback queue assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.lq_error(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when others then
  return sqlerrm;
end; $$;

-- Exposure: service_role only.
select pg_temp.lq_assert(
  has_function_privilege('service_role','public.read_google_listing_readback_failures(uuid,text,integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.read_google_listing_readback_failures(uuid,text,integer)','EXECUTE')
  and not has_function_privilege('anon','public.read_google_listing_readback_failures(uuid,text,integer)','EXECUTE'),
  'only service_role runs the listing read-back read');

insert into public.users(id,email,verified_at) values
 ('1c900000-0000-4000-8000-000000000001','lq-operator@example.test',now()),
 ('1c900000-0000-4000-8000-000000000003','lq-owner@example.test',now()),
 ('1c900000-0000-4000-8000-000000000004','lq-revoked@example.test',now());
insert into public.super_admins(user_id,email) values ('1c900000-0000-4000-8000-000000000001','lq-operator@example.test');
insert into public.super_admins(user_id,email,revoked_at) values ('1c900000-0000-4000-8000-000000000004','lq-revoked@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('1c900000-0000-4000-8000-000000000010','customer','Listing business A','1c900000-0000-4000-8000-000000000003'),
 ('1c900000-0000-4000-8000-000000000011','customer','Listing business B','1c900000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('1c900000-0000-4000-8000-000000000010','1c900000-0000-4000-8000-000000000003','owner','1c900000-0000-4000-8000-000000000003');
insert into public.tenants(id,site_name,active,stable_id) values
 ('lq-site-a','LQ site A',true,'1c900000-0000-4000-8000-0000000000b1'),
 ('lq-site-b1','LQ site B1',true,'1c900000-0000-4000-8000-0000000000b2'),
 ('lq-site-b2','LQ site B2',true,'1c900000-0000-4000-8000-0000000000b3');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
 ('1c900000-0000-4000-8000-0000000000b1','lq-site-a','1c900000-0000-4000-8000-000000000010','1c900000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('d',64),'{}'),
 ('1c900000-0000-4000-8000-0000000000b2','lq-site-b1','1c900000-0000-4000-8000-000000000011','1c900000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('e',64),'{}'),
 ('1c900000-0000-4000-8000-0000000000b3','lq-site-b2','1c900000-0000-4000-8000-000000000011','1c900000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('f',64),'{}');

-- Business B's first site has a binding; A's writes carry none.
create temporary table lq_binding(id uuid);
insert into lq_binding select (public.upsert_workspace_account_binding(jsonb_build_object(
  'workspaceId','1c900000-0000-4000-8000-000000000011','provider','google','originTenantStableId','1c900000-0000-4000-8000-0000000000b2',
  'scopes',jsonb_build_array('https://www.googleapis.com/auth/business.manage'),
  'refreshTokenCiphertext','enc:v1:AAAA:BBBB:CCCC','accessTokenCiphertext','enc:v1:DDDD:EEEE:FFFF',
  'tokenExpiresAt','2026-10-08T18:00:00Z','status','connected'), 'copy')->>'id')::uuid;

create or replace function pg_temp.lq_receipt(workspace text, binding uuid, key text, settle jsonb) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  v_id := (public.record_google_listing_receipt(jsonb_build_object('workspaceId', workspace, 'bindingId', binding, 'locationId', '333',
    'action', 'reply_post', 'targetRef', 'rev-' || key, 'authority', jsonb_build_object('kind','owner_approval','actor','owner'),
    'before', jsonb_build_object('reply', null), 'after', jsonb_build_object('reply', 'Thanks'), 'undo', null, 'undoesReceiptId', null,
    'idempotencyKey', 'review-reply:' || key))->>'id')::uuid;
  if settle is not null then perform public.settle_google_listing_receipt(v_id, workspace::uuid, settle); end if;
  return v_id;
end; $$;

create temporary table lq_ids(name text, id uuid);
insert into lq_ids values
 ('a_unverified', pg_temp.lq_receipt('1c900000-0000-4000-8000-000000000010', null, 'evt-a1:att', '{"status":"posted_unverified","readback":"failed"}')),
 ('a_posted', pg_temp.lq_receipt('1c900000-0000-4000-8000-000000000010', null, 'evt-a2:att', '{"status":"posted","readback":"matched"}')),
 ('a_failed', pg_temp.lq_receipt('1c900000-0000-4000-8000-000000000010', null, 'evt-a3:att', '{"status":"failed","error":"Google said 400"}')),
 ('a_posting', pg_temp.lq_receipt('1c900000-0000-4000-8000-000000000010', null, 'evt-a4:att', null)),
 ('b_differs', pg_temp.lq_receipt('1c900000-0000-4000-8000-000000000011', (select id from lq_binding), 'evt-b1:att', '{"status":"posted_unverified","readback":"differs"}')),
 ('b_unbound', pg_temp.lq_receipt('1c900000-0000-4000-8000-000000000011', null, 'evt-b2:att', '{"status":"posted_unverified","readback":"failed"}'));

-- Authority: only an active, verified operator. A business owner can't read
-- even their own business's receipts through this operator-wide read.
select pg_temp.lq_assert(pg_temp.lq_error($q$select public.read_google_listing_readback_failures('1c900000-0000-4000-8000-000000000003','lq-owner@example.test',50)$q$)='operator_queue_access_denied','a business owner cannot read the operator read');
select pg_temp.lq_assert(pg_temp.lq_error($q$select public.read_google_listing_readback_failures('1c900000-0000-4000-8000-000000000004','lq-revoked@example.test',50)$q$)='operator_queue_access_denied','a revoked operator cannot read');
select pg_temp.lq_assert(pg_temp.lq_error($q$select public.read_google_listing_readback_failures('1c900000-0000-4000-8000-000000000001','someone@example.test',50)$q$)='operator_queue_access_denied','identity must match');

create temporary table lq_read(value jsonb);
insert into lq_read select public.read_google_listing_readback_failures('1c900000-0000-4000-8000-000000000001','LQ-Operator@example.test',50);
select pg_temp.lq_assert((select jsonb_array_length(value) from lq_read)=3,'only accepted writes whose read-back failed or differed, got '||(select value::text from lq_read));
select pg_temp.lq_assert(not exists (select 1 from lq_read, jsonb_array_elements(value) e
  where (e->>'id')::uuid in (select id from lq_ids where name in ('a_posted','a_failed','a_posting'))),'posted, failed and in-flight writes are not read-back failures');
select pg_temp.lq_assert((select e->>'tenantId' from lq_read, jsonb_array_elements(value) e where (e->>'id')::uuid=(select id from lq_ids where name='a_unverified'))='lq-site-a','no binding: the business''s only linked tenant');
select pg_temp.lq_assert((select e->>'tenantId' from lq_read, jsonb_array_elements(value) e where (e->>'id')::uuid=(select id from lq_ids where name='b_differs'))='lq-site-b1','the binding''s tenant');
select pg_temp.lq_assert((select e->'tenantId' from lq_read, jsonb_array_elements(value) e where (e->>'id')::uuid=(select id from lq_ids where name='b_unbound'))='null'::jsonb,'two linked tenants and no binding: no guess');
select pg_temp.lq_assert((select e->>'workspaceName' from lq_read, jsonb_array_elements(value) e where (e->>'id')::uuid=(select id from lq_ids where name='b_differs'))='Listing business B','names the business');
select pg_temp.lq_assert(jsonb_array_length(public.read_google_listing_readback_failures('1c900000-0000-4000-8000-000000000001','lq-operator@example.test',1))=1,'the limit holds');
-- Reading changes nothing.
select pg_temp.lq_assert((select status from public.google_listing_receipts where id=(select id from lq_ids where name='a_unverified'))='posted_unverified','the read never settles a receipt');

rollback;
\echo 'Listing read-back queue checks passed.'
