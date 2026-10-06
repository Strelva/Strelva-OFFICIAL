\set ON_ERROR_STOP on
-- Operator queue marks, the outside-write receipt ledger, and human minutes
-- resolved through tenant_workspace_links. Fictional rows only; rolled back.
begin;
create or replace function pg_temp.oq_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'operator queue assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.oq_error(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when others then
  return sqlerrm;
end; $$;

-- Exposure: tables closed to every role; only service_role runs the commands.
select pg_temp.oq_assert(
  not has_table_privilege('service_role','public.operator_queue_marks','SELECT')
  and not has_table_privilege('service_role','public.operator_queue_mark_events','INSERT')
  and not has_table_privilege('service_role','public.outside_write_receipts','SELECT')
  and not has_table_privilege('authenticated','public.outside_write_receipts','SELECT')
  and not has_table_privilege('anon','public.operator_queue_marks','SELECT')
  and (select bool_and(relrowsecurity) from pg_class where oid in ('public.operator_queue_marks'::regclass,'public.operator_queue_mark_events'::regclass,'public.outside_write_receipts'::regclass))
  and has_function_privilege('service_role','public.write_operator_queue_mark(uuid,text,uuid,text,text,text,jsonb,text)','EXECUTE')
  and has_function_privilege('service_role','public.read_operator_queue_context(uuid,text)','EXECUTE')
  and has_function_privilege('service_role','public.record_outside_write_receipt(jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.record_outside_write_readback(uuid,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.read_outside_write_receipts(uuid,text,text,uuid,integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.write_operator_queue_mark(uuid,text,uuid,text,text,text,jsonb,text)','EXECUTE')
  and not has_function_privilege('anon','public.read_operator_queue_context(uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.record_outside_write_receipt(jsonb)','EXECUTE')
  and not has_function_privilege('service_role','public.operator_queue_assert_operator(uuid,text)','EXECUTE'),
  'only actor-checked commands are exposed, to service_role, and RLS is on');

insert into public.users(id,email,verified_at) values
 ('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',now()),
 ('0a900000-0000-4000-8000-000000000002','queue-second@example.test',now()),
 ('0a900000-0000-4000-8000-000000000003','queue-owner@example.test',now()),
 ('0a900000-0000-4000-8000-000000000004','queue-revoked@example.test',now());
insert into public.super_admins(user_id,email) values
 ('0a900000-0000-4000-8000-000000000001','queue-operator@example.test'),
 ('0a900000-0000-4000-8000-000000000002','queue-second@example.test');
insert into public.super_admins(user_id,email,revoked_at) values
 ('0a900000-0000-4000-8000-000000000004','queue-revoked@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('0a900000-0000-4000-8000-000000000010','customer','Queue linked business','0a900000-0000-4000-8000-000000000003'),
 ('0a900000-0000-4000-8000-000000000011','customer','Queue other business','0a900000-0000-4000-8000-000000000003'),
 ('0a900000-0000-4000-8000-000000000012','agency','Queue agency','0a900000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('0a900000-0000-4000-8000-000000000010','0a900000-0000-4000-8000-000000000003','owner','0a900000-0000-4000-8000-000000000003');
insert into public.tenants(id,site_name,active,stable_id) values
 ('queue-linked-site','Queue linked site',true,'0a900000-0000-4000-8000-0000000000b1'),
 ('queue-unlinked-site','Queue unlinked site',true,'0a900000-0000-4000-8000-0000000000b2');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
 ('0a900000-0000-4000-8000-0000000000b1','queue-linked-site','0a900000-0000-4000-8000-000000000010','0a900000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('c',64),'{}');

-- Authority: owner, revoked operator, and a mismatched email are all denied.
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.read_operator_queue_context('0a900000-0000-4000-8000-000000000003','queue-owner@example.test')$q$)='operator_queue_access_denied','a business owner cannot read the queue');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.read_operator_queue_context('0a900000-0000-4000-8000-000000000004','queue-revoked@example.test')$q$)='operator_queue_access_denied','a revoked operator cannot read the queue');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.read_operator_queue_context('0a900000-0000-4000-8000-000000000001','someone@example.test')$q$)='operator_queue_access_denied','identity must match');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000003','queue-owner@example.test',gen_random_uuid(),'change_request','event:1','take','{}','P2')$q$)='operator_queue_access_denied','a business owner cannot take an item');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.read_outside_write_receipts('0a900000-0000-4000-8000-000000000003','queue-owner@example.test',null,'0a900000-0000-4000-8000-000000000010',50)$q$)='operator_queue_access_denied','a business owner cannot read receipts through the operator read');

-- Take, then retry the same command after a lost response.
create temporary table oq_take(value jsonb);
insert into oq_take select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','Queue-Operator@example.test','0a900000-0000-4000-8000-000000000101','change_request','event:cr-1','take','{}','P2');
select pg_temp.oq_assert((select value->>'assigneeUserId' from oq_take)='0a900000-0000-4000-8000-000000000001' and (select value->>'revision' from oq_take)='2','take assigns the operator');
select pg_temp.oq_assert(public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test','0a900000-0000-4000-8000-000000000101','change_request','event:cr-1','take','{}','P2')->>'revision'='2','an identical retry does not apply twice');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test','0a900000-0000-4000-8000-000000000101','change_request','event:cr-1','release','{}','P2')$q$)='operator_queue_conflict','a different command under the same id is refused');

-- Hand off only to an active, verified super admin.
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','hand_off','{"assigneeUserId":"0a900000-0000-4000-8000-000000000003"}','P2')$q$)='operator_queue_assignee_invalid','cannot hand to a business owner');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','hand_off','{"assigneeUserId":"0a900000-0000-4000-8000-000000000004"}','P2')$q$)='operator_queue_assignee_invalid','cannot hand to a revoked operator');
select pg_temp.oq_assert(public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','hand_off','{"assigneeUserId":"0a900000-0000-4000-8000-000000000002"}','P2')->>'assigneeEmail'='queue-second@example.test','hand off to another operator');

-- Snooze: never P1, at most seven days, always with a reason.
select pg_temp.oq_assert(pg_temp.oq_error(format($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'domain_alert','down:mclears','snooze',%L,'P1')$q$, jsonb_build_object('until', now() + interval '1 day', 'reason', 'Waiting on registrar')))='operator_queue_snooze_refused','P1 cannot be snoozed');
select pg_temp.oq_assert(pg_temp.oq_error(format($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','snooze',%L,'P2')$q$, jsonb_build_object('until', now() + interval '8 days', 'reason', 'Later')))='operator_queue_invalid','snooze is capped at seven days');
select pg_temp.oq_assert(pg_temp.oq_error(format($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','snooze',%L,'P2')$q$, jsonb_build_object('until', now() + interval '1 day')))='operator_queue_invalid','snooze needs a reason');
select pg_temp.oq_assert(public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','snooze',jsonb_build_object('until', now() + interval '2 days', 'reason', 'Owner on vacation'),'P2')->>'snoozeReason'='Owner on vacation','snooze records its reason');

-- Pin is recorded with an end; notes accumulate; close needs a reason or receipt.
create temporary table oq_pin(value jsonb);
insert into oq_pin select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','pin','{}','P2');
select pg_temp.oq_assert((select (value->>'pinnedUntil')::timestamptz from oq_pin) between now() + interval '23 hours' and now() + interval '25 hours','pin lasts a day');
select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','note','{"body":"  Quoted 2 hours  "}','P2');
select pg_temp.oq_assert(jsonb_array_length(public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000002','queue-second@example.test',gen_random_uuid(),'change_request','event:cr-1','note','{"body":"Owner agreed"}','P2')->'notes')=2,'notes accumulate with author');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','close','{"state":"done"}','P2')$q$)='operator_queue_invalid','done needs a receipt or a stated reason');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','close','{"state":"done","receiptId":"0a900000-0000-4000-8000-00000000ffff"}','P2')$q$)='operator_queue_receipt_not_found','a closing receipt must exist');
select pg_temp.oq_assert(public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','close','{"state":"done","reason":"Shipped in gldf repo"}','P2')->>'closedState'='done','close with a reason');
select pg_temp.oq_assert(public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'change_request','event:cr-1','reopen','{}','P2')->'closedState'='null'::jsonb,'reopen clears closure');
select pg_temp.oq_assert(public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'owner_pending','event:own-1','owner_told','{"via":"email"}','P4')->>'ownerToldVia'='email','owner told is recorded');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.write_operator_queue_mark('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',gen_random_uuid(),'owner_pending','event:own-1','owner_told','{"via":"sms"}','P4')$q$)='operator_queue_invalid','no SMS channel exists');
select pg_temp.oq_assert(pg_temp.oq_error($q$update public.operator_queue_mark_events set payload='{}'$q$)='operator_queue_append_only','mark history never changes');
select pg_temp.oq_assert((select count(*) from public.operator_queue_mark_events where source_ref='event:cr-1')=8,'every mark change is recorded once, got '||(select string_agg(action,',' order by created_at) from public.operator_queue_mark_events where source_ref='event:cr-1'));

-- Receipts: accepted write, read back once.
create temporary table oq_receipt(value jsonb);
insert into oq_receipt select public.record_outside_write_receipt(jsonb_build_object(
  'commandKey','review-reply:queue-linked-site:r1','tenantId','queue-linked-site','provider','google_business','writeKind','review_reply',
  'subject','Reply to a 5-star review','request',jsonb_build_object('reviewId','r1','reply','Thank you!'),
  'acceptance','accepted','undo','not_available','undoLabel','Google review replies can''t be undone from Strelva. You can edit or delete the reply in Google.','actor','operator:queue-operator@example.test'));
select pg_temp.oq_assert((select value->>'workspaceId' from oq_receipt)='0a900000-0000-4000-8000-000000000010'
  and (select value->>'tenantStableId' from oq_receipt)='0a900000-0000-4000-8000-0000000000b1'
  and (select value->>'readback' from oq_receipt)='pending','receipt lands on the linked business with a pending read-back');
select pg_temp.oq_assert(public.record_outside_write_receipt(jsonb_build_object(
  'commandKey','review-reply:queue-linked-site:r1','tenantId','queue-linked-site','provider','google_business','writeKind','review_reply',
  'subject','Reply to a 5-star review','request','{}'::jsonb,'acceptance','accepted','undo','not_available','undoLabel','x','actor','x'))->>'id'=(select value->>'id' from oq_receipt),'a retried receipt is not recorded twice');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.record_outside_write_receipt(jsonb_build_object('commandKey','review-reply:queue-linked-site:r1','tenantId','queue-linked-site','provider','google_business','writeKind','review_reply','subject','Reply to a 5-star review','request','{}'::jsonb,'acceptance','rejected','undo','not_available','undoLabel','x','actor','x'))$q$)='outside_write_receipt_conflict','a different outcome under the same key is refused');
select pg_temp.oq_assert(public.record_outside_write_readback((select (value->>'id')::uuid from oq_receipt),'failed','Read-back timed out')->>'readback'='failed','read-back recorded');
select pg_temp.oq_assert(public.record_outside_write_readback((select (value->>'id')::uuid from oq_receipt),'failed','again')->>'readbackDetail'='Read-back timed out','the same read-back result is idempotent');
select pg_temp.oq_assert(pg_temp.oq_error(format($q$select public.record_outside_write_readback(%L,'matched',null)$q$,(select value->>'id' from oq_receipt)))='outside_write_receipt_immutable','a recorded read-back never flips');
select pg_temp.oq_assert(pg_temp.oq_error($q$update public.outside_write_receipts set acceptance='rejected'$q$)='outside_write_receipt_immutable','acceptance never changes');
select pg_temp.oq_assert(pg_temp.oq_error($q$delete from public.outside_write_receipts$q$)='operator_queue_append_only','receipts are not deleted');

-- Shape rules: rejected writes have nothing to read back; a domain add can
-- only be undone by dropping Strelva's claim, never the Vercel domain.
select pg_temp.oq_assert(public.record_outside_write_receipt(jsonb_build_object(
  'commandKey','gbp-hours:queue-unlinked-site:1','tenantId','queue-unlinked-site','provider','google_business','writeKind','gbp_hours',
  'subject','Update hours','request','{}'::jsonb,'beforeState',jsonb_build_object('mon','9-5'),'acceptance','rejected','acceptanceDetail','403 from Google',
  'readback','pending','undo','put_back_draft','undoLabel','Put back drafts a new Google write for approval.','actor','system'))->>'readback'='not_possible','a rejected write has no read-back');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.record_outside_write_receipt(jsonb_build_object('commandKey','domain-add:queue-unlinked-site:example.test','tenantId','queue-unlinked-site','provider','vercel','writeKind','domain_add','subject','example.test','request','{}'::jsonb,'acceptance','accepted','undo','available','undoLabel','Remove','actor','x'))$q$)='outside_write_receipt_invalid','a domain add never offers a Vercel removal');
select pg_temp.oq_assert(public.record_outside_write_receipt(jsonb_build_object('commandKey','domain-add:queue-unlinked-site:example.test','tenantId','queue-unlinked-site','provider','vercel','writeKind','domain_add','subject','example.test','request','{}'::jsonb,'acceptance','accepted','readback','matched','undo','claim_only','undoLabel','Removes Strelva''s claim only. The domain stays in Vercel.','actor','x'))->>'workspaceId' is null,'an unconverted tenant receipt has no business yet');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.record_outside_write_receipt(jsonb_build_object('commandKey','bad:1','provider','vercel','writeKind','domain_add','subject','x','request','{}'::jsonb,'acceptance','accepted','undo','claim_only','undoLabel','x','actor','x'))$q$)='outside_write_receipt_invalid','a receipt names a tenant or a business');
select pg_temp.oq_assert(pg_temp.oq_error($q$select public.record_outside_write_receipt(jsonb_build_object('commandKey','domain-remove:queue-removal-site:old.example.test','tenantId','queue-removal-site','provider','vercel','writeKind','domain_claim_removal','subject','old.example.test','request','{}'::jsonb,'acceptance','accepted','readback','matched','undo','not_available','undoLabel','No undo.','actor','x'))$q$)='outside_write_receipt_invalid','a claim removal is Strelva routing, never a Vercel write');
select pg_temp.oq_assert(public.record_outside_write_receipt(jsonb_build_object('commandKey','domain-remove:queue-removal-site:old.example.test','tenantId','queue-removal-site','provider','strelva_routing','writeKind','domain_claim_removal','subject','old.example.test','request','{}'::jsonb,'acceptance','accepted','readback','matched','undo','not_available','undoLabel','No undo. Add the domain again to reconnect it.','actor','x'))->>'undo'='not_available','a claim removal has no undo');

-- Reads: per-business filter keeps other businesses out; the context names
-- links, marks, operators and failed read-backs.
select pg_temp.oq_assert(jsonb_array_length(public.read_outside_write_receipts('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',null,'0a900000-0000-4000-8000-000000000011',50))=0,'another business sees none of these receipts');
select pg_temp.oq_assert(jsonb_array_length(public.read_outside_write_receipts('0a900000-0000-4000-8000-000000000001','queue-operator@example.test',null,'0a900000-0000-4000-8000-000000000010',50))=1,'the linked business sees its receipt');
select pg_temp.oq_assert(jsonb_array_length(public.read_outside_write_receipts('0a900000-0000-4000-8000-000000000001','queue-operator@example.test','queue-unlinked-site',null,50))=2,'an unconverted tenant reads by tenant');
create temporary table oq_context(value jsonb);
insert into oq_context select public.read_operator_queue_context('0a900000-0000-4000-8000-000000000001','queue-operator@example.test');
select pg_temp.oq_assert((select count(*) from oq_context, jsonb_array_elements(value->'links') l where l->>'tenantId' like 'queue-%')=1
  and (select l->>'workspaceId' from oq_context, jsonb_array_elements(value->'links') l where l->>'tenantId'='queue-linked-site')='0a900000-0000-4000-8000-000000000010','links resolve tenant to business');
select pg_temp.oq_assert((select count(*) from oq_context, jsonb_array_elements(value->'readbackFailures') r where r->>'tenantId' like 'queue-%')=1
  and (select r->>'readback' from oq_context, jsonb_array_elements(value->'readbackFailures') r where r->>'tenantId' like 'queue-%')='failed','failed read-backs are listed for the queue');
select pg_temp.oq_assert((select count(*) from oq_context, jsonb_array_elements(value->'operators') o where o->>'email' like 'queue-%')=2
  and not exists (select 1 from oq_context, jsonb_array_elements(value->'operators') o where o->>'email' in ('queue-revoked@example.test','queue-owner@example.test')),'only active verified operators are listed');
select pg_temp.oq_assert((select count(*) from oq_context, jsonb_array_elements(value->'marks') m where m->>'sourceRef' in ('event:cr-1','event:own-1'))=2,'every mark is returned');

-- Deleting a business keeps its receipts and clears only the reference.
create temporary table oq_orphan(value jsonb);
insert into oq_orphan select public.record_outside_write_receipt(jsonb_build_object('commandKey','content-publish:other:1','workspaceId','0a900000-0000-4000-8000-000000000011','provider','strelva_content','writeKind','content_publish','subject','Hours section','request','{}'::jsonb,'acceptance','accepted','readback','matched','undo','available','undoLabel','Restore the prior version.','actor','x'));
delete from public.workspaces where id='0a900000-0000-4000-8000-000000000011';
select pg_temp.oq_assert((select workspace_id is null and readback='matched' from public.outside_write_receipts where id=(select (value->>'id')::uuid from oq_orphan)),'the receipt outlives its deleted business');

-- Human minutes resolve converted tenants through tenant_workspace_links.
select pg_temp.oq_assert((select item->'tenantIds' from jsonb_array_elements(public.read_effort_businesses('0a900000-0000-4000-8000-000000000001','queue-operator@example.test')) item
  where item->>'id'='0a900000-0000-4000-8000-000000000010')='["queue-linked-site"]'::jsonb,'a converted client is attached to its business for minutes');
rollback;
