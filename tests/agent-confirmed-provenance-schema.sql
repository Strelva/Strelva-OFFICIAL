\set ON_ERROR_STOP on
begin;
create function pg_temp.ap_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Agent confirmed provenance: %',label;end if;end $$;
insert into public.users(id,email,verified_at) values
 ('af161104-0000-4000-8000-000000000001','ap-owner@example.test',now()),
 ('af161104-0000-4000-8000-000000000002','ap-admin@example.test',now()),
 ('af161104-0000-4000-8000-000000000003','ap-operator@example.test',now());
insert into public.super_admins(user_id,email) values('af161104-0000-4000-8000-000000000003','ap-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values('af161104-0000-4000-8000-000000000010','customer','Fictional confirmed provenance','af161104-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('af161104-0000-4000-8000-000000000010','af161104-0000-4000-8000-000000000001','owner','af161104-0000-4000-8000-000000000001'),
 ('af161104-0000-4000-8000-000000000010','af161104-0000-4000-8000-000000000002','admin','af161104-0000-4000-8000-000000000001'),
 ('af161104-0000-4000-8000-000000000010','af161104-0000-4000-8000-000000000003','admin','af161104-0000-4000-8000-000000000001');
insert into public.business_pages(workspace_id,handle,published,published_at,updated_by) values('af161104-0000-4000-8000-000000000010','confirmed-provenance',true,now(),'af161104-0000-4000-8000-000000000001');
create function pg_temp.ap_profile() returns jsonb language sql as $$select public.read_agent_business_profile('workspace:af161104-0000-4000-8000-000000000010')$$;
create function pg_temp.ap_quote(n integer) returns jsonb language sql as $$select public.receive_agent_inquiry('workspace:af161104-0000-4000-8000-000000000010',jsonb_build_object('origin','agent','type','quote','requestId','confirmed-quote-'||n,'agent',jsonb_build_object('name','Fictional assistant'),'customer',jsonb_build_object('name','Fictional customer','email','ap-customer-'||n||'@example.test'),'message','Please quote this','serviceId',(select id from public.business_services where workspace_id='af161104-0000-4000-8000-000000000010' and name='Consulting'),'fields',jsonb_build_object('scope','Review','area','Buffalo')),md5(n::text)||md5(n::text),md5('status-'||n)||md5('status-'||n),'encrypted-fictional-status',null)$$;
do $$declare
 ws uuid:='af161104-0000-4000-8000-000000000010'; owner_id uuid:='af161104-0000-4000-8000-000000000001'; admin_id uuid:='af161104-0000-4000-8000-000000000002'; operator_id uuid:='af161104-0000-4000-8000-000000000003';
 first_at text; approved_at text; q jsonb; review jsonb; item jsonb;
begin
 -- A real owner-created service is available, but service confirmation alone
 -- cannot manufacture confirmation of a fact or a response deadline.
 perform public.patch_business_record(ws,owner_id,'ap-owner@example.test','owner',0,'{"services":[{"op":"upsert","name":"Consulting","verified":true}]}',gen_random_uuid(),repeat('a',64));
 perform public.patch_business_record(ws,operator_id,'ap-operator@example.test','operator',1,'{"facts":{"response_time":{"value":{"maximumHours":6},"verified":true}}}',gen_random_uuid(),repeat('b',64));
 perform public.patch_business_record(ws,admin_id,'ap-admin@example.test','owner',2,'{"facts":{"email":{"value":"pending-admin@example.test","verified":true}}}',gen_random_uuid(),repeat('c',64));
 perform pg_temp.ap_assert(pg_temp.ap_profile()#>>'{verification,ownerConfirmedFactCount}'='0' and pg_temp.ap_profile()#>'{verification,lastConfirmedAt}'='null'::jsonb,'verified pending operator/admin writes keep evidence unknown');
 perform pg_temp.ap_assert(pg_temp.ap_quote(1)->'replyBy'='null'::jsonb,'unconfirmed response policy creates no public promise');
 -- Owner's actual command creates the confirmed copy, including a private
 -- recipient which never contributes to public evidence.
 perform public.patch_business_record(ws,owner_id,'ap-owner@example.test','owner',3,'{"facts":{"response_time":{"value":{"maximumHours":24},"verified":true},"owner_recipient":{"value":{"email":"ap-owner@example.test"}}}}',gen_random_uuid(),repeat('d',64));
 first_at:=pg_temp.ap_profile()#>>'{verification,lastConfirmedAt}';
 perform pg_temp.ap_assert(pg_temp.ap_profile()#>>'{verification,ownerConfirmedFactCount}'='1' and first_at is not null,'actual owner confirmation counts once and excludes private recipient');
 q:=pg_temp.ap_quote(2);
 perform pg_temp.ap_assert((q->>'replyBy')::timestamptz>clock_timestamp()+interval '23 hours' and (q->>'replyBy')::timestamptz<clock_timestamp()+interval '25 hours','quote pins confirmed24hour policy');
 perform public.patch_business_record(ws,operator_id,'ap-operator@example.test','operator',4,'{"facts":{"response_time":{"value":{"maximumHours":72},"verified":true},"phone":{"value":"716-555-0199","verified":true}}}',gen_random_uuid(),repeat('e',64));
 perform pg_temp.ap_assert(pg_temp.ap_profile()#>>'{verification,ownerConfirmedFactCount}'='1' and pg_temp.ap_profile()#>>'{verification,lastConfirmedAt}'=first_at,'pending overwrite keeps confirmed count and original date');
 q:=pg_temp.ap_quote(3);
 perform pg_temp.ap_assert((q->>'replyBy')::timestamptz>clock_timestamp()+interval '23 hours' and (q->>'replyBy')::timestamptz<clock_timestamp()+interval '25 hours','pending72hour operator edit cannot change public quote promise');
 -- The native exact owner decision confirms provider/admin-origin content.
 review:=public.read_business_fact_review(ws);
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Confirm your business details','approveEffect','These details become public.','notYetEffect','Nothing changes.','sourceLifecycle','business_facts','sourceId',ws::text,'revisionHash',review->>'revisionHash','urgent',false,'adminMayDecide',false));
 perform public.claim_owner_decision(ws,(item->>'id')::uuid,review->>'revisionHash','approve','session',owner_id,'ap-owner@example.test',null);
 perform public.confirm_business_facts(ws,(item->>'id')::uuid,review->>'revisionHash');
 approved_at:=pg_temp.ap_profile()#>>'{verification,lastConfirmedAt}';
 perform pg_temp.ap_assert(pg_temp.ap_profile()#>>'{verification,ownerConfirmedFactCount}'='3' and approved_at is not null,'owner decision counts confirmed provider/admin content regardless original source label');
 perform pg_temp.ap_assert(pg_temp.ap_profile()#>>'{facts,phone}'='716-555-0199' and pg_temp.ap_profile()#>>'{policyFacts,response_time,value,maximumHours}'='72','profile content and response promise use same confirmed policy');
 q:=pg_temp.ap_quote(4);
 perform pg_temp.ap_assert((q->>'replyBy')::timestamptz>clock_timestamp()+interval '71 hours' and (q->>'replyBy')::timestamptz<clock_timestamp()+interval '73 hours','owner decision permits new72hour response promise');
 perform public.patch_business_record(ws,operator_id,'ap-operator@example.test','operator',5,'{"facts":{"phone":null,"response_time":null}}',gen_random_uuid(),repeat('f',64));
 perform pg_temp.ap_assert(pg_temp.ap_profile()#>>'{verification,ownerConfirmedFactCount}'='3' and pg_temp.ap_profile()#>>'{verification,lastConfirmedAt}'=approved_at and pg_temp.ap_profile()#>>'{facts,phone}'='716-555-0199','pending deletion preserves confirmed public evidence');
 -- The owner can remove the facts; stale working rows and a private recipient
 -- never revive a deadline, count or timestamp.
 perform public.patch_business_record(ws,owner_id,'ap-owner@example.test','owner',6,'{"facts":{"email":null}}',gen_random_uuid(),repeat('1',64));
 review:=public.read_business_fact_review(ws);
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Confirm removal of these details','approveEffect','These details are removed.','notYetEffect','Nothing changes.','sourceLifecycle','business_facts','sourceId',ws::text,'revisionHash',review->>'revisionHash','urgent',false,'adminMayDecide',false));
 perform public.claim_owner_decision(ws,(item->>'id')::uuid,review->>'revisionHash','approve','session',owner_id,'ap-owner@example.test',null);
 perform public.confirm_business_facts(ws,(item->>'id')::uuid,review->>'revisionHash');
 perform pg_temp.ap_assert(pg_temp.ap_profile()#>>'{verification,ownerConfirmedFactCount}'='0' and pg_temp.ap_profile()#>'{verification,lastConfirmedAt}'='null'::jsonb,'actual owner deletion restores unknown public evidence');
 perform pg_temp.ap_assert(pg_temp.ap_quote(5)->'replyBy'='null'::jsonb,'owner removes response commitment for new requests');
 q:=pg_temp.ap_quote(2);
 perform pg_temp.ap_assert((q->>'replyBy')::timestamptz>clock_timestamp()+interval '23 hours' and (q->>'replyBy')::timestamptz<clock_timestamp()+interval '25 hours','existing request replay preserves its original approved clock');
end $$;
rollback;
