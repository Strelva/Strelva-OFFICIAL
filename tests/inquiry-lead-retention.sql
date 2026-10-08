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
insert into public.tenant_client_records(tenant_stable_id,store,record_id,payload,payload_hash,captured_at,recorded_via)
select stable_id,'inquiry_reply','lead_expired','{"body":"Private reply copy"}',repeat('b',64),clock_timestamp(),'dual_write'
from public.tenants where id='inquiry-retention-fixture';

select pg_temp.ilr_assert(public.purge_expired_tenant_leads(100)->>'purged' = '1','expired lead purged');
select pg_temp.ilr_assert(not exists(select 1 from public.tenant_leads where lead_id='lead_expired'),'expired lead removed');
select pg_temp.ilr_assert(not exists(select 1 from public.inquiry_events where lead_id='lead_expired'),'visitor event history removed');
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
select pg_temp.ilr_assert(not exists(select 1 from public.tenant_client_records where record_id='lead_expired'),
  'inquiry copy removed');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_leads where lead_id='lead_current'),
  'unexpired lead retained');
select pg_temp.ilr_assert(exists(select 1 from public.inquiry_events where lead_id='lead_current'),
  'unexpired event retained');
select pg_temp.ilr_assert((current_setting('strelva.purging_expired_tenant_leads',true) is distinct from 'on'),
  'purge-only event delete guard restored');
select pg_temp.ilr_assert(exists(select 1 from public.tenant_lead_purges where tenant_slug='inquiry-retention-fixture'
  and purged_count=1),'aggregate purge receipt retained');
rollback;
