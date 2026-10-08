\set ON_ERROR_STOP on
-- Aggregate reader, real booking identities/confirmation evidence, no providers.
begin;
create function pg_temp.ar_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'agent ratio assertion: %', message; end if; end $$;
create function pg_temp.ar_error(statement text) returns text language plpgsql as $$
begin execute statement; return 'no error'; exception when others then return sqlerrm; end $$;
insert into public.users(id,email,verified_at) values
 ('03100000-0000-4000-8000-000000000001','ratio-operator@example.test',now()),
 ('03100000-0000-4000-8000-000000000002','ratio-owner@example.test',now()),
 ('03100000-0000-4000-8000-000000000003','ratio-revoked@example.test',now());
insert into public.super_admins(user_id,email,revoked_at) values
 ('03100000-0000-4000-8000-000000000001','ratio-operator@example.test',null),
 ('03100000-0000-4000-8000-000000000003','ratio-revoked@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('03100000-0000-4000-8000-000000000010','customer','Ratio fixture','03100000-0000-4000-8000-000000000002'),
 ('03100000-0000-4000-8000-000000000011','customer','Other business','03100000-0000-4000-8000-000000000002');
insert into public.tenants(id,stable_id,site_name,active) values
 ('ratio-fixture','03100000-0000-4000-8000-000000000020','Ratio fixture',true);
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
 ('03100000-0000-4000-8000-000000000020','ratio-fixture','03100000-0000-4000-8000-000000000010','03100000-0000-4000-8000-000000000002',gen_random_uuid(),repeat('a',64),'{}');

-- Cancelled rows intentionally avoid consuming a live slot. All retain their
-- original capture/confirmation evidence, as expired and cancelled holds do.
create function pg_temp.ar_booking(n integer, age interval default interval '1 hour', origin text default 'agent', via text default 'native', other_business boolean default false) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
 insert into public.business_bookings(calendar_key,tenant_stable_id,workspace_id,status,origin,service_name_at_booking,
   start_at,end_at,block_end_at,time_zone,customer_name,customer_email,legacy_id,recorded_via,created_at)
 values(case when other_business then '03100000-0000-4000-8000-000000000011'::uuid else '03100000-0000-4000-8000-000000000020'::uuid end,
   case when other_business then null else '03100000-0000-4000-8000-000000000020'::uuid end,
   case when other_business then '03100000-0000-4000-8000-000000000011'::uuid else '03100000-0000-4000-8000-000000000010'::uuid end,
   'cancelled',origin,'Fictional consultation',now()+make_interval(days=>n),now()+make_interval(days=>n,mins=>30),
   now()+make_interval(days=>n,mins=>30),'UTC','Private customer','private-'||n||'@example.test','ratio-'||n,via,now()-age)
 returning id into v_id;
 insert into public.business_booking_access(booking_id,manage_hash,manage_ciphertext,confirm_hash,confirm_ciphertext,status_hash,status_ciphertext,confirm_until,agent_name)
 values(v_id,lpad(to_hex(n*3),64,'0'),'private-ciphertext',lpad(to_hex(n*3+1),64,'0'),'private-confirm',
   lpad(to_hex(n*3+2),64,'0'),'private-status',now()-age+interval '15 minutes','Private agent name');
 return v_id;
end $$;
create function pg_temp.ar_read() returns jsonb language sql as $$
 select public.read_agent_hold_ratio('03100000-0000-4000-8000-000000000001','ratio-operator@example.test',now())
$$;
create function pg_temp.ar_business(id uuid default '03100000-0000-4000-8000-000000000010') returns jsonb language sql as $$
 select row from jsonb_array_elements(pg_temp.ar_read()) row where row->>'businessId'=id::text
$$;
select pg_temp.ar_assert(pg_temp.ar_read()='[]'::jsonb,'successful empty cohort');
select pg_temp.ar_booking(n) from generate_series(1,20) n;
update public.business_booking_access a set confirmed_at=now()-interval '50 minutes'
 from public.business_bookings b where b.id=a.booking_id and b.legacy_id in ('ratio-1','ratio-2','ratio-3');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='20' and pg_temp.ar_business()->>'customerConfirmed'='3'
  and pg_temp.ar_business()->>'unconfirmed'='17','unique mature capture cohort and confirmed evidence');
-- Outcomes remain customer-confirmed even when the appointment later changes.
update public.business_bookings set status=case legacy_id when 'ratio-1' then 'completed' when 'ratio-2' then 'no_show' else 'declined' end
 where legacy_id in ('ratio-1','ratio-2','ratio-3');
select pg_temp.ar_assert(pg_temp.ar_business()->>'customerConfirmed'='3','completion, no-show, decline preserve customer confirmation');
-- Held/requested status alone is not customer confirmation.
update public.business_bookings set status='requested' where legacy_id='ratio-4';
select pg_temp.ar_assert(pg_temp.ar_business()->>'customerConfirmed'='3','status cannot fabricate customer confirmation');
-- Other origins/businesses/import paths never contaminate the business sample.
select pg_temp.ar_booking(n,interval '1 hour','site') from generate_series(21,30) n;
select pg_temp.ar_booking(n,interval '1 hour','inquiry') from generate_series(31,40) n;
select pg_temp.ar_booking(41,interval '1 hour','agent','backfill');
select pg_temp.ar_booking(42,interval '1 hour','agent','native',true);
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='20'
 and pg_temp.ar_business('03100000-0000-4000-8000-000000000011')->>'matureHolds'='1','business/origin/import isolation');
-- Linking a previously unconverted site must not split its recent sample.
-- Ten null-workspace captures plus ten linked captures remain one cohort.
update public.business_bookings set workspace_id=null where legacy_id in
 ('ratio-1','ratio-2','ratio-3','ratio-4','ratio-5','ratio-6','ratio-7','ratio-8','ratio-9','ratio-10');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='20'
 and jsonb_array_length(pg_temp.ar_read())=2,'current unique tenant link joins preconversion and postconversion captures');
-- Inclusive 24-hour capture and minimum-15-minute maturity boundaries.
select pg_temp.ar_booking(43,interval '14 minutes 59.999 seconds');
select pg_temp.ar_booking(44,interval '24 hours 0.001 seconds');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='20','fresh and out-of-window holds excluded');
select pg_temp.ar_booking(45,interval '15 minutes');
select pg_temp.ar_booking(46,interval '24 hours');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='22','exact maturity and lower capture boundaries count');
-- A custom later deadline is honored, even when the hold is older than 15m.
select pg_temp.ar_booking(47);
update public.business_booking_access set confirm_until=now()+interval '1 microsecond'
 where booking_id=(select id from public.business_bookings where legacy_id='ratio-47');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='22','still-valid confirmation opportunity is never failure');
update public.business_booking_access set confirm_until=now()
 where booking_id=(select id from public.business_bookings where legacy_id='ratio-47');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='23'
 and (pg_temp.ar_business()->>'latestUnconfirmedMaturedAt')::timestamptz=now(),'exact actual deadline counted and drives fresh evidence');
-- One persisted identity, regardless of retry/status-read count.
select public.read_native_booking_access(lpad(to_hex(1*3+2),64,'0'),'status') from generate_series(1,5);
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='23','status reads do not count as requests');
select pg_temp.ar_assert(pg_temp.ar_error($q$select pg_temp.ar_booking(1)$q$) like '%business_bookings_legacy_idx%','duplicate request identity refused');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='23','retry cannot inflate denominator');
select pg_temp.ar_assert(not (pg_temp.ar_read()::text ~ 'private-|ciphertext|Hash|agentName|customerEmail|email|token'),'aggregate never leaks customer, self-reported names or credentials');
select pg_temp.ar_assert((select array_agg(k order by k) = array['businessId','customerConfirmed','firstMaturedAt','latestUnconfirmedMaturedAt','matureHolds','tenantId','unconfirmed','workspaceId']
 from jsonb_object_keys(pg_temp.ar_business()) k),'aggregate output allowlist');
-- Exercise the real idempotent hold path, not just its unique index. A fresh
-- hold is excluded; an expired but unswept hold is included without mutation.
create function pg_temp.ar_hold() returns jsonb language sql as $$
 select public.hold_agent_booking('ratio-fixture', jsonb_build_object('legacyId','ratio-live','status','held','origin','agent',
 'serviceName','Consultation','start',now()+interval '2000 days','end',now()+interval '2000 days 30 minutes',
 'bufferMinutes',0,'timeZone','UTC','requestFingerprint',repeat('c',64),
 'customer',jsonb_build_object('name','Private live customer','email','private-live@example.test')),
 jsonb_build_object('manageHash',repeat('d',64),'manageCiphertext','private-manage','confirmHash',repeat('e',64),
 'confirmCiphertext','private-confirm','statusHash',repeat('f',64),'statusCiphertext','private-status','agentName','Private assistant'))
$$;
select pg_temp.ar_assert(pg_temp.ar_hold()->>'status'='recorded','new real hold admitted');
select pg_temp.ar_assert(pg_temp.ar_hold()->>'status'='unchanged','real retry is unchanged');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='23','fresh real hold is not a failure');
update public.business_bookings set created_at=now()-interval '1 hour' where legacy_id='ratio-live';
update public.business_booking_access set confirm_until=now()-interval '45 minutes'
 where booking_id=(select id from public.business_bookings where legacy_id='ratio-live');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='24'
 and (select status='held' from public.business_bookings where legacy_id='ratio-live'),'expired unswept hold counts, and reader never sweeps');
select pg_temp.ar_assert(pg_temp.ar_hold()->>'status'='unchanged' and pg_temp.ar_business()->>'matureHolds'='24','expired retry never reopens or inflates count');
-- Missing access still means no evidence of customer confirmation, not success.
delete from public.business_booking_access where booking_id=(select id from public.business_bookings where legacy_id='ratio-5');
select pg_temp.ar_assert(pg_temp.ar_business()->>'matureHolds'='24' and pg_temp.ar_business()->>'unconfirmed'='21','missing access does not become healthy or disappear');
-- Read-only operator authority; nonoperators, mismatched identity and revoked
-- operators receive no cross-business evidence, even using the service RPC.
select pg_temp.ar_assert(pg_temp.ar_error($q$select public.read_agent_hold_ratio('03100000-0000-4000-8000-000000000002','ratio-owner@example.test',now())$q$)='operator_queue_access_denied','owner denied');
select pg_temp.ar_assert(pg_temp.ar_error($q$select public.read_agent_hold_ratio('03100000-0000-4000-8000-000000000001','wrong@example.test',now())$q$)='operator_queue_access_denied','mismatched email denied');
select pg_temp.ar_assert(pg_temp.ar_error($q$select public.read_agent_hold_ratio('03100000-0000-4000-8000-000000000003','ratio-revoked@example.test',now())$q$)='operator_queue_access_denied','revoked operator denied');
select pg_temp.ar_assert(pg_temp.ar_error($q$select public.read_agent_hold_ratio('03100000-0000-4000-8000-000000000001','ratio-operator@example.test','infinity')$q$)='booking_invalid','unbounded date denied');
select pg_temp.ar_assert(not has_function_privilege('anon','public.read_agent_hold_ratio(uuid,text,timestamptz)','EXECUTE')
 and not has_function_privilege('authenticated','public.read_agent_hold_ratio(uuid,text,timestamptz)','EXECUTE')
 and has_function_privilege('service_role','public.read_agent_hold_ratio(uuid,text,timestamptz)','EXECUTE'),'service-role-only ACL');
set local role service_role;
select pg_temp.ar_assert(jsonb_array_length(pg_temp.ar_read())=2,'actual service role can read only through operator RPC');
reset role;
-- Exercise the existing business control explicitly: Live -> Paused closes
-- new agent admission, while already captured aggregate evidence remains.
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('03100000-0000-4000-8000-000000000050','03100000-0000-4000-8000-000000000011','scheduling','schedule','Bookings','{}','03100000-0000-4000-8000-000000000002');
insert into public.systems(id,business_workspace_id,name,kind,origin_kind,origin_ref,command_id,command_digest,created_by,updated_by) values
 (public.system_origin_id('03100000-0000-4000-8000-000000000011','saved_work','03100000-0000-4000-8000-000000000050'),
 '03100000-0000-4000-8000-000000000011','Bookings','booking','saved_work','03100000-0000-4000-8000-000000000050',gen_random_uuid(),repeat('a',64),
 '03100000-0000-4000-8000-000000000002','03100000-0000-4000-8000-000000000002');
insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by) values
 ('03100000-0000-4000-8000-000000000051',public.system_origin_id('03100000-0000-4000-8000-000000000011','saved_work','03100000-0000-4000-8000-000000000050'),
 '03100000-0000-4000-8000-000000000011',1,'{"kind":"booking","ref":"ratio-bookings"}',gen_random_uuid(),repeat('b',64),'03100000-0000-4000-8000-000000000002');
update public.systems set lifecycle='live',current_revision_id='03100000-0000-4000-8000-000000000051',current_revision_number=1
 where origin_ref='03100000-0000-4000-8000-000000000050';
select pg_temp.ar_assert(not (public.read_tenant_booking_context('workspace:03100000-0000-4000-8000-000000000011')->>'paused')::boolean,'live native business is not paused');
update public.systems set lifecycle='paused' where origin_ref='03100000-0000-4000-8000-000000000050';
select pg_temp.ar_assert((public.read_tenant_booking_context('workspace:03100000-0000-4000-8000-000000000011')->>'paused')::boolean,'explicit business pause reflected');

select pg_temp.ar_assert(pg_temp.ar_error($q$select public.hold_agent_booking('workspace:03100000-0000-4000-8000-000000000011',
 '{"legacyId":"paused-new","status":"held","origin":"agent"}','{}')$q$)='booking_paused','business pause denies new agent admission');
-- Every remaining sample ages out and no write/sweep is needed for recovery.
select pg_temp.ar_assert(public.read_agent_hold_ratio('03100000-0000-4000-8000-000000000001','ratio-operator@example.test',now()+interval '25 hours')='[]'::jsonb,'cohort recovery is read-only');
rollback;
