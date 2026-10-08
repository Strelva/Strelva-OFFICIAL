\set ON_ERROR_STOP on
-- Expired tenant leads and their inquiry payloads are deleted together. The
-- test uses fictional local rows and rolls the entire fixture back.
begin;
create or replace function pg_temp.ilr_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry lead retention assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ilr_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

insert into public.users(id,email,verified_at) values
  ('f5380000-0000-4000-8000-000000000001','retention@example.test',clock_timestamp());
insert into public.workspaces(id,kind,name,created_by) values
  ('f5380000-0000-4000-8000-000000000002','customer','Retention fixture','f5380000-0000-4000-8000-000000000001');
insert into public.tenants(id,site_name) values ('inquiry-retention-fixture','Fixture site');
insert into public.tenant_leads(id,tenant_stable_id,tenant_slug_at_capture,workspace_id,lead_id,submission_hash,
  name,email,message,source,fields,captured_at,recorded_via,tenant_deleted_at,site_name_at_delete,retain_until)
select 'f5380000-0000-4000-8000-000000000003',stable_id,'inquiry-retention-fixture',null,'lead_expired','x',
  'Visitor','visitor@example.test','Private inquiry body','public-form','{"phone":"716-555-0101"}',clock_timestamp(),
  'dual_write',clock_timestamp()-interval '366 days','Fixture site',clock_timestamp()-interval '1 day'
from public.tenants where id='inquiry-retention-fixture';
insert into public.tenant_leads(id,tenant_stable_id,tenant_slug_at_capture,workspace_id,lead_id,submission_hash,
  name,email,message,source,fields,captured_at,recorded_via)
select 'f5380000-0000-4000-8000-000000000004',stable_id,'inquiry-retention-fixture',null,'lead_current','y',
  'Current visitor','current@example.test','Still retained','public-form','{}',clock_timestamp(),'dual_write'
from public.tenants where id='inquiry-retention-fixture';

insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail)
select stable_id,'lead_expired','captured','visitor','{"email":"visitor@example.test"}'
from public.tenants where id='inquiry-retention-fixture';
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail)
select stable_id,'lead_current','captured','visitor','{"email":"current@example.test"}'
from public.tenants where id='inquiry-retention-fixture';
select pg_temp.ilr_expect($$delete from public.inquiry_events where lead_id='lead_current'$$,'inquiry_events_immutable');

insert into public.inquiry_workspace_messages(id,workspace_id,lead_row_id,requested_by,request_id,digest,recipient,subject,body,status)
values ('f5380000-0000-4000-8000-000000000005','f5380000-0000-4000-8000-000000000002',
  'f5380000-0000-4000-8000-000000000003','f5380000-0000-4000-8000-000000000001',
  'f5380000-0000-4000-8000-000000000006',repeat('a',64),'visitor@example.test','Re: private inquiry','Private reply text','failed');
insert into public.inquiry_workspace_message_events(message_id,workspace_id,actor_id,status)
values ('f5380000-0000-4000-8000-000000000005','f5380000-0000-4000-8000-000000000002',
  'f5380000-0000-4000-8000-000000000001','failed');
insert into public.inquiry_engine_reply_claims(lead_row_id,attempt_id)
values ('f5380000-0000-4000-8000-000000000003','f5380000-0000-4000-8000-000000000007');
insert into public.connected_inquiry_owner_notices(lead_row_id,workspace_id,connected_site_id,recipient,tenant_id,subject,status)
values ('f5380000-0000-4000-8000-000000000003','f5380000-0000-4000-8000-000000000002',
  'f5380000-0000-4000-8000-000000000008','visitor@example.test','inquiry-retention-fixture','Inquiry received','failed');
insert into public.connected_inquiry_owner_notice_repairs(lead_row_id,workspace_id,actor_id,recipient,subject,status)
values ('f5380000-0000-4000-8000-000000000003','f5380000-0000-4000-8000-000000000002',
  'f5380000-0000-4000-8000-000000000001','visitor@example.test','Inquiry received','failed');
insert into public.inquiry_record_overlays(tenant_id,tenant_stable_id,business_id,inquiry_id,capability_id,status)
select id,stable_id,'fixture-business','lead_expired','inquiries','new'
from public.tenants where id='inquiry-retention-fixture';
insert into public.booking_inquiry_offers(tenant_stable_id,inquiry_id,offer_key,token_hash,token_ciphertext,customer,
  service_ref,service_name,timezone,buffer_minutes,slots,expires_at)
select stable_id,'lead_expired','offer-1',repeat('c',64),'enc:v1:fictional',
  '{"name":"Visitor","email":"visitor@example.test"}','consult','Consultation','America/New_York',0,
  '[{"start":"2026-10-20T12:00:00Z"}]',clock_timestamp()+interval '1 hour'
from public.tenants where id='inquiry-retention-fixture';
insert into public.inquiry_booking_offers(lead_row_id,service_id,witness,slots,service_name,time_zone,requested_by)
values ('f5380000-0000-4000-8000-000000000003','f5380000-0000-4000-8000-000000000009',
  '{"lead":"lead_expired"}','[{"start":"2026-10-20T12:00:00Z"}]','Consultation','America/New_York',
  'f5380000-0000-4000-8000-000000000001');
insert into public.tenant_client_records(tenant_stable_id,store,record_id,payload,payload_hash,captured_at,recorded_via)
select stable_id,store,'lead_expired','{"body":"Private reply copy"}',repeat('b',64),clock_timestamp(),'dual_write'
from public.tenants cross join unnest(array['inquiry_reply','inquiry_timeline','spam_held']) store where id='inquiry-retention-fixture';

-- Real mirror formats: timeline IDs have an event digest suffix; delivery
-- targets/checkpoints have hashed IDs and carry the inquiry in nested payload.
insert into public.tenant_client_records(tenant_stable_id,store,record_id,payload,payload_hash,captured_at,recorded_via)
select t.stable_id,r.store,r.record_id,r.payload,repeat('b',64),clock_timestamp(),'dual_write'
from public.tenants t cross join (values
 ('inquiry_timeline','lead_expired:'||repeat('a',32),'{"body":"Private timeline copy"}'::jsonb),
 ('inquiry_delivery','checkpoint:'||repeat('a',64),'{"kind":"checkpoint","value":{"inquiryId":"lead_expired","recipient":"visitor@example.test"}}'::jsonb),
 ('inquiry_delivery','reply_target:'||repeat('b',64),'{"kind":"reply_target","value":{"inquiryId":"lead_expired","replyTo":"visitor@example.test"}}'::jsonb),
 ('inquiry_delivery','checkpoint:'||repeat('c',64),jsonb_build_object('kind','checkpoint','value',jsonb_build_object('inquiryId','lead_expired_notice_repair_'||repeat('a',32),'recipient','visitor@example.test'))),
 ('inquiry_timeline','lead_expired_more:'||repeat('b',32),'{"body":"Unrelated prefix inquiry"}'::jsonb),
 ('inquiry_delivery','provider_event:'||repeat('d',64),'{"kind":"provider_event","value":"completed"}'::jsonb)
) r(store,record_id,payload) where t.id='inquiry-retention-fixture';

-- Old live/version-bound inquiries are evidence, not candidates for an age purge.
update public.tenant_leads set workspace_id='f5380000-0000-4000-8000-000000000002',
  capability_id='retained-version',capability_version=1,captured_at=clock_timestamp()-interval '10 years',
  tenant_deleted_at=clock_timestamp()-interval '366 days',retain_until=clock_timestamp()-interval '1 day'
where lead_id='lead_current';
insert into public.inquiry_workspaces(tenant_id,tenant_stable_id,business_id,state)
select id,stable_id,'retained-version','{"inquiries":[],"capabilities":[{"id":"retained-version","live":{"version":2},"versions":[{"version":1},{"version":2}]}]}'
from public.tenants where id='inquiry-retention-fixture';
insert into public.inquiry_workspace_messages(id,workspace_id,lead_row_id,requested_by,request_id,digest,recipient,subject,body,status)
values ('f5380000-0000-4000-8000-000000000015','f5380000-0000-4000-8000-000000000002',
  'f5380000-0000-4000-8000-000000000004','f5380000-0000-4000-8000-000000000001',
  'f5380000-0000-4000-8000-000000000016',repeat('d',64),'current@example.test','Current reply','Retained version reply','accepted');
-- Future-expiring detached lead, same public id belonging to another tenant,
-- and an unanchored historical event must all stay untouched.
insert into public.tenants(id,site_name) values ('inquiry-retention-other','Other fixture');
insert into public.tenant_leads(tenant_stable_id,tenant_slug_at_capture,lead_id,submission_hash,name,message,captured_at,recorded_via,tenant_deleted_at,retain_until)
select stable_id,id,'lead_expired','other','Other visitor','Other business body',clock_timestamp(),'dual_write',
 clock_timestamp(),clock_timestamp()+interval '365 days'
from public.tenants where id='inquiry-retention-other';
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail)
select stable_id,'lead_expired','captured','visitor','{"email":"other@example.test"}'
from public.tenants where id='inquiry-retention-other';
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail)
select stable_id,'lead_orphan','timeline','system','{"body":"Historical unanchored evidence"}'
from public.tenants where id='inquiry-retention-fixture';
insert into public.tenant_client_records(tenant_stable_id,store,record_id,payload,payload_hash,captured_at,recorded_via)
select stable_id,'orders','lead_expired','{"body":"Unrelated review"}',repeat('e',64),clock_timestamp(),'dual_write'
from public.tenants where id='inquiry-retention-fixture';

-- Receipt failure rolls the whole deletion back, including append-only events.
create function pg_temp.ilr_fail_receipt() returns trigger language plpgsql as $$
begin raise exception 'fixture_receipt_failure'; end; $$;
create trigger ilr_fail_receipt before insert on public.tenant_lead_purges for each row execute function pg_temp.ilr_fail_receipt();
select pg_temp.ilr_expect($$select public.purge_expired_tenant_leads(100)$$,'fixture_receipt_failure');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_leads where id='f5380000-0000-4000-8000-000000000003'), 'failed receipt retains lead');
select pg_temp.ilr_assert(exists(select 1 from public.inquiry_workspace_message_events where message_id='f5380000-0000-4000-8000-000000000005'), 'failed receipt retains event');
select pg_temp.ilr_assert(exists(select 1 from public.inquiry_workspace_messages where id='f5380000-0000-4000-8000-000000000005'), 'failed receipt retains reply body');
select pg_temp.ilr_assert(current_setting('strelva.purging_expired_tenant_leads',true) is distinct from 'on','failed purge restores guard');
drop trigger ilr_fail_receipt on public.tenant_lead_purges;

select pg_temp.ilr_assert(public.purge_expired_tenant_leads(100)->>'purged' = '1','expired lead purged');
select pg_temp.ilr_assert(not exists(select 1 from public.tenant_leads where id='f5380000-0000-4000-8000-000000000003'),'expired lead removed');
select pg_temp.ilr_assert(not exists(select 1 from public.inquiry_events e join public.tenants t on t.stable_id=e.tenant_stable_id where e.lead_id='lead_expired' and t.id='inquiry-retention-fixture'),'visitor event history removed');
select pg_temp.ilr_assert(not exists(select 1 from public.inquiry_workspace_messages where id='f5380000-0000-4000-8000-000000000005'),
  'reply content removed');
select pg_temp.ilr_assert(not exists(select 1 from public.inquiry_workspace_message_events where message_id='f5380000-0000-4000-8000-000000000005'),
  'reply event history removed');
select pg_temp.ilr_assert(not exists(select 1 from public.inquiry_engine_reply_claims where lead_row_id='f5380000-0000-4000-8000-000000000003'),
  'reply claim removed');
select pg_temp.ilr_assert(not exists(select 1 from public.connected_inquiry_owner_notices where lead_row_id='f5380000-0000-4000-8000-000000000003'),
  'owner notice removed');
select pg_temp.ilr_assert(not exists(select 1 from public.connected_inquiry_owner_notice_repairs where lead_row_id='f5380000-0000-4000-8000-000000000003'),
  'owner notice repair removed');
select pg_temp.ilr_assert(not exists(select 1 from public.inquiry_record_overlays where inquiry_id='lead_expired'),
  'inquiry overlay removed');
select pg_temp.ilr_assert(not exists(select 1 from public.booking_inquiry_offers where inquiry_id='lead_expired'),
  'public booking offer removed');
select pg_temp.ilr_assert(not exists(select 1 from public.inquiry_booking_offers where lead_row_id='f5380000-0000-4000-8000-000000000003'),
  'workspace booking offer removed');
select pg_temp.ilr_assert(not exists(select 1 from public.tenant_client_records where record_id='lead_expired' and store in ('inquiry_reply','inquiry_timeline','spam_held')),
  'inquiry copy removed');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_leads where lead_id='lead_current'),
  'unexpired lead retained');
select pg_temp.ilr_assert(exists(select 1 from public.inquiry_events where lead_id='lead_current'),
  'unexpired event retained');
select pg_temp.ilr_assert((current_setting('strelva.purging_expired_tenant_leads',true) is distinct from 'on'),
  'purge-only event delete guard restored');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_lead_purges where tenant_slug='inquiry-retention-fixture'
  and purged_count=1),'aggregate purge receipt retained');
select pg_temp.ilr_assert(exists(select 1 from public.inquiry_workspace_messages where id='f5380000-0000-4000-8000-000000000015'),'old version reply kept');
select pg_temp.ilr_assert(exists(select 1 from public.inquiry_workspaces where state->'capabilities'->0->'versions'='[{"version":1},{"version":2}]'::jsonb),'version configuration kept');
select pg_temp.ilr_assert(exists(select 1 from public.inquiry_events where lead_id='lead_orphan'),'unanchored event kept until explicit policy');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_leads where lead_id='lead_expired'),'other tenant fresh lead kept');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_client_records where record_id='lead_expired' and store='orders'),'unrelated record kept');
select pg_temp.ilr_assert(public.purge_expired_tenant_leads(100)->>'purged'='0','repeated purge is a no-op');
select pg_temp.ilr_assert(not exists(select 1 from public.tenant_lead_purges where to_jsonb(tenant_lead_purges)::text like '%visitor@example.test%' or to_jsonb(tenant_lead_purges)::text like '%Private%'),'purge receipts contain no visitor/body data');
select pg_temp.ilr_assert(not has_function_privilege('authenticated','public.purge_expired_tenant_leads(integer)','execute') and not has_function_privilege('anon','public.purge_expired_tenant_leads(integer)','execute'),'public cannot purge');
select pg_temp.ilr_expect($$delete from public.inquiry_events where lead_id='lead_current'$$,'inquiry_events_immutable');
select pg_temp.ilr_assert(not exists(select 1 from public.tenant_client_records where record_id='lead_expired:'||repeat('a',32)),'composite timeline copy removed');
select pg_temp.ilr_assert(not exists(select 1 from public.tenant_client_records where store='inquiry_delivery' and payload->'value'->>'inquiryId' like 'lead_expired%'),'hashed delivery copies and repair targets removed');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_client_records where record_id='lead_expired_more:'||repeat('b',32)),'prefix collision inquiry retained');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_client_records where record_id='provider_event:'||repeat('d',64)),'non-PII acceptance dedupe marker retained');
rollback;
