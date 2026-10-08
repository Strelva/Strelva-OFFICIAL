\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.irl_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry lifecycle retention failed: %',message; end if; end $$;
insert into public.users(id,email,verified_at) values ('f5390000-0000-4000-8000-000000000001','lifecycle@example.test',clock_timestamp());
insert into public.workspaces(id,kind,name,created_by) values
 ('f5390000-0000-4000-8000-000000000002','customer','Retained orphan business','f5390000-0000-4000-8000-000000000001'),
 ('f5390000-0000-4000-8000-000000000003','customer','Deleted orphan business','f5390000-0000-4000-8000-000000000001');
insert into public.tenants(id,site_name) values ('inquiry-lifecycle-active','Active fixture'),('inquiry-lifecycle-deleted','Deleted fixture'),('inquiry-lifecycle-linked','Linked fixture');
-- Current origins and attached business history remain intact even after years.
insert into public.inquiry_events(tenant_stable_id,workspace_id,lead_id,kind,actor,detail,at,retain_until)
values ('f5390000-0000-4000-8000-000000000009','f5390000-0000-4000-8000-000000000002','lead_attached_orphan','captured','visitor','{"body":"Retained business body"}',clock_timestamp()-interval '10 years',clock_timestamp()-interval '1 day');
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail,at,retain_until)
select stable_id,'lead_active_orphan','captured','visitor','{"body":"Retained active body"}',clock_timestamp()-interval '10 years',clock_timestamp()-interval '1 day'
from public.tenants where id='inquiry-lifecycle-active';
-- A tenant's unanchored history joins its still-active converted business
-- rather than starting a deletion clock when that tenant row is removed.
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
select stable_id,id,'f5390000-0000-4000-8000-000000000002','f5390000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'{}'
from public.tenants where id='inquiry-lifecycle-linked';
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail,at)
select stable_id,'lead_linked_orphan','captured','visitor','{"body":"Linked business body"}',clock_timestamp()-interval '10 years'
from public.tenants where id='inquiry-lifecycle-linked';
delete from public.tenants where id='inquiry-lifecycle-linked';
select pg_temp.irl_assert((select workspace_id='f5390000-0000-4000-8000-000000000002' and retain_until is null from public.inquiry_events where lead_id='lead_linked_orphan'),'converted orphan follows business');
insert into public.connected_sites(id,business_workspace_id,public_key,label,site_url,site_host,allowed_origins,verification_token,created_by)
values ('f5390000-0000-4000-8000-000000000020','f5390000-0000-4000-8000-000000000002','sk_pub_'||repeat('z',24),'Retained connected site','https://retention.example.test','retention.example.test',array['https://retention.example.test'],repeat('z',32),'f5390000-0000-4000-8000-000000000001');
insert into public.inquiry_events(connected_site_id,lead_id,kind,actor,detail,at,retain_until)
values ('f5390000-0000-4000-8000-000000000020','lead_connected_orphan','captured','visitor','{"body":"Connected business body"}',clock_timestamp()-interval '10 years',clock_timestamp()-interval '1 day');

-- Old event payload does not make a newly deprovisioned origin expire early.
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail,at)
select stable_id,'lead_recently_detached','captured','visitor','{"body":"Newly detached body"}',clock_timestamp()-interval '10 years'
from public.tenants where id='inquiry-lifecycle-deleted';
delete from public.tenants where id='inquiry-lifecycle-deleted';
select pg_temp.irl_assert((select retain_until between clock_timestamp()+interval '364 days' and clock_timestamp()+interval '366 days' from public.inquiry_events where lead_id='lead_recently_detached'),'tenant delete stamps future deadline');
insert into public.inquiry_events(tenant_stable_id,workspace_id,lead_id,kind,actor,detail,at)
values ('f5390000-0000-4000-8000-000000000010','f5390000-0000-4000-8000-000000000003','lead_workspace_deleted','captured','visitor','{"body":"Detached workspace body"}',clock_timestamp()-interval '10 years');
delete from public.workspaces where id='f5390000-0000-4000-8000-000000000003';
select pg_temp.irl_assert((select workspace_id is null and retain_until between clock_timestamp()+interval '364 days' and clock_timestamp()+interval '366 days' from public.inquiry_events where lead_id='lead_workspace_deleted'),'workspace delete stamps deadline');
-- Expired detached orphans retain the fact/time/status of accepted work, while
-- raw nested contact/body/arbitrary fields, emails in actor/dedupe, are removed.
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,actor_id,detail,dedupe_key,at,retain_until)
values ('f5390000-0000-4000-8000-000000000011','lead_expired_orphan','delivery','system','visitor@example.test',
 '{"status":"accepted","action":"reply","recipient":"visitor@example.test","body":"Private expired body","nested":{"email":"visitor@example.test"},"providerMessageId":"opaque-id"}',
 'visitor@example.test',clock_timestamp()-interval '366 days',clock_timestamp()-interval '1 day');
create function pg_temp.irl_fail_receipt() returns trigger language plpgsql as $$ begin raise exception 'orphan_receipt_failed'; end $$;
create trigger irl_fail_receipt before insert on public.inquiry_retention_receipts for each row execute function pg_temp.irl_fail_receipt();
do $$ begin
 begin perform public.purge_expired_tenant_leads(100); raise exception 'orphan receipt failure ignored';
 exception when others then if sqlerrm<>'orphan_receipt_failed' then raise; end if; end;
end $$;
select pg_temp.irl_assert((select detail->>'body'='Private expired body' and retention_minimized_at is null from public.inquiry_events where lead_id='lead_expired_orphan'),'failed receipt preserves original orphan');
drop trigger irl_fail_receipt on public.inquiry_retention_receipts;
select pg_temp.irl_assert(public.purge_expired_tenant_leads(100)->>'minimized'='1','expired orphan minimized');
select pg_temp.irl_assert((select detail='{"retention":"minimized","status":"accepted","action":"reply"}'::jsonb and actor_id is null and dedupe_key is null and retention_minimized_at is not null from public.inquiry_events where lead_id='lead_expired_orphan'),'PII stripped while acceptance evidence kept');
select pg_temp.irl_assert((select detail->>'body'='Retained active body' from public.inquiry_events where lead_id='lead_active_orphan'),'active origin retained');
select pg_temp.irl_assert((select detail->>'body'='Retained business body' from public.inquiry_events where lead_id='lead_attached_orphan'),'attached business retained');
select pg_temp.irl_assert((select detail->>'body'='Newly detached body' from public.inquiry_events where lead_id='lead_recently_detached'),'fresh detached retained');
select pg_temp.irl_assert((select detail->>'body'='Detached workspace body' from public.inquiry_events where lead_id='lead_workspace_deleted'),'fresh detached workspace retained');
select pg_temp.irl_assert((select detail->>'body'='Linked business body' from public.inquiry_events where lead_id='lead_linked_orphan'),'converted business body retained');
select pg_temp.irl_assert((select detail->>'body'='Connected business body' from public.inquiry_events where lead_id='lead_connected_orphan'),'connected origin orphan retained');
select pg_temp.irl_assert(public.purge_expired_tenant_leads(100)->>'minimized'='0' ,'minimization is idempotent');
select pg_temp.irl_assert(exists(select 1 from public.inquiry_retention_receipts where tenant_stable_id='f5390000-0000-4000-8000-000000000011' and minimized_count=1),'aggregate minimization receipt');
select pg_temp.irl_assert(not exists(select 1 from public.inquiry_retention_receipts where to_jsonb(inquiry_retention_receipts)::text like '%visitor@example.test%' or to_jsonb(inquiry_retention_receipts)::text like '%Private expired%'),'no visitor payload in minimization receipts');
select pg_temp.irl_assert(not has_table_privilege('service_role','public.inquiry_retention_receipts','select') and not has_table_privilege('authenticated','public.inquiry_retention_receipts','select'),'receipt table inaccessible directly');
rollback;
