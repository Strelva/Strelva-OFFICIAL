-- Keep your site (lane 13): the connected-site change machine against a real Postgres.
-- Fictional fixtures only. Run on a disposable local cluster after every earlier
-- migration and 20261027160000/160100/160200; the whole script rolls back.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.ok(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'keep-your-site: %',msg; end if; end $$;
create or replace function pg_temp.denied(statement text,expected text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise exception 'keep-your-site expected % but got %',expected,sqlerrm; end;
  raise exception 'keep-your-site expected denial: %',expected;
end $$;

insert into public.users(id,email,verified_at) values
 ('27400000-0000-4000-8000-000000000001','owner@kys.example.test',now()),
 ('27400000-0000-4000-8000-000000000002','staff@kys.example.test',now()),
 ('27400000-0000-4000-8000-000000000003','stranger@kys.example.test',now()),
 ('27400000-0000-4000-8000-000000000004','admin@kys.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('27400000-0000-4000-8000-000000000010','customer','Bakery','27400000-0000-4000-8000-000000000001'),
 ('27400000-0000-4000-8000-000000000011','customer','Cafe','27400000-0000-4000-8000-000000000001'),
 ('27400000-0000-4000-8000-000000000020','agency','Agency','27400000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('27400000-0000-4000-8000-000000000010','27400000-0000-4000-8000-000000000001','owner','27400000-0000-4000-8000-000000000001'),
 ('27400000-0000-4000-8000-000000000010','27400000-0000-4000-8000-000000000004','admin','27400000-0000-4000-8000-000000000001'),
 ('27400000-0000-4000-8000-000000000011','27400000-0000-4000-8000-000000000001','owner','27400000-0000-4000-8000-000000000001'),
 ('27400000-0000-4000-8000-000000000020','27400000-0000-4000-8000-000000000002','owner','27400000-0000-4000-8000-000000000002');
select public.choose_business_provider('27400000-0000-4000-8000-000000000001','owner@kys.example.test','27400000-0000-4000-8000-000000000010','27400000-0000-4000-8000-000000000020');
select public.choose_business_provider('27400000-0000-4000-8000-000000000001','owner@kys.example.test','27400000-0000-4000-8000-000000000011','27400000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('27400000-0000-4000-8000-000000000002','staff@kys.example.test','27400000-0000-4000-8000-000000000020','27400000-0000-4000-8000-000000000010','27400000-0000-4000-8000-000000000002',true);
select public.set_agency_client_staff('27400000-0000-4000-8000-000000000002','staff@kys.example.test','27400000-0000-4000-8000-000000000020','27400000-0000-4000-8000-000000000011','27400000-0000-4000-8000-000000000002',true);

insert into public.connected_sites(id,business_workspace_id,public_key,label,site_url,site_host,allowed_origins,platform,verification_token,verified_at,created_by) values
 ('27400000-0000-4000-8000-0000000000c1','27400000-0000-4000-8000-000000000010','sk_pub_kyskyskyskyskyskyskykysk','bakery','https://bakery.example/','bakery.example',array['https://bakery.example'],'wix',repeat('a',32),now(),'27400000-0000-4000-8000-000000000001'),
 ('27400000-0000-4000-8000-0000000000c2','27400000-0000-4000-8000-000000000011','sk_pub_kyskyskyskyskyskyskykysj','cafe','https://cafe.example/','cafe.example',array['https://cafe.example'],'godaddy',repeat('b',32),null,'27400000-0000-4000-8000-000000000001');

create temp table ctx as select
 '27400000-0000-4000-8000-000000000010'::uuid ws, '27400000-0000-4000-8000-000000000001'::uuid owner, '27400000-0000-4000-8000-000000000002'::uuid staff,
 '27400000-0000-4000-8000-000000000003'::uuid stranger, '27400000-0000-4000-8000-000000000004'::uuid admin,
 '27400000-0000-4000-8000-0000000000c1'::uuid site,
 public.system_origin_id('27400000-0000-4000-8000-000000000010','connected_site','27400000-0000-4000-8000-0000000000c1') sys;
select public.reconcile_website_system_releases(ws,owner,'owner@kys.example.test',sys,'connected_site',site::text) from ctx;

-- A Request an owner filed to the agency, accepted by the agency.
insert into public.service_requests(id,business_workspace_id,status,request_text,outcome,context,scope,provider_kind,provider_agency_workspace_id,provider_acceptance,accepted_by,accepted_at,created_by)
select '27400000-0000-4000-8000-0000000000a1',ws,'requested','Update the Saturday hours','Update the Saturday hours to 9-2',
  jsonb_build_object('source','connected_site_change','connectedSiteId',site,'systemId',sys,'page','/hours'),array['website.connected_site_change'],'agency','27400000-0000-4000-8000-000000000020','pending',null,null,owner from ctx;
insert into public.service_requests(id,business_workspace_id,status,request_text,outcome,context,scope,provider_kind,provider_agency_workspace_id,created_by)
select '27400000-0000-4000-8000-0000000000a2',ws,'requested','Fix a typo','Fix the typo on the about page',
  jsonb_build_object('source','connected_site_change','connectedSiteId',site,'systemId',sys),array['website.connected_site_change'],'agency','27400000-0000-4000-8000-000000000020',owner from ctx;
update public.service_requests set provider_acceptance='accepted',accepted_by='27400000-0000-4000-8000-000000000002',accepted_at=now() where id in ('27400000-0000-4000-8000-0000000000a1','27400000-0000-4000-8000-0000000000a2');

commit;

begin;
do $$ declare c record; v jsonb; chg jsonb; cid uuid; before_n int; rel jsonb; home jsonb; revs int;
begin
 select * into c from ctx;
 -- The owner sees the Requests; a stranger sees nothing.
 v:=public.list_connected_site_changes(c.ws,c.owner,'owner@kys.example.test',c.sys);
 perform pg_temp.ok(jsonb_array_length(v->'requests')=2,'owner sees both requests');
 perform pg_temp.ok((v->'viewer'->>'isOwner')::boolean and v->'viewer'->>'agencyName'='Agency' and v->'viewer'->>'actingAgencyId' is null,'owner viewer');
 perform pg_temp.ok(v->'site'->>'platform'='wix' and v->'site'->>'siteHost'='bakery.example','site platform');
 v:=public.list_connected_site_changes(c.ws,c.staff,'staff@kys.example.test',c.sys);
 perform pg_temp.ok(v->'viewer'->>'actingAgencyId'='27400000-0000-4000-8000-000000000020','agency viewer acting id');
 perform pg_temp.denied(format('select public.list_connected_site_changes(%L,%L,%L,%L)',c.ws,c.stranger,'stranger@kys.example.test',c.sys),'workspace_access_denied');
 perform pg_temp.denied(format('select public.list_connected_site_changes(%L,%L,%L,%L)',c.ws,c.staff,'wrong@kys.example.test',c.sys),'workspace_access_denied');

 -- Plan: only the accepted agency; the page must be on the site.
 perform pg_temp.denied(format('select public.plan_connected_site_change(%L,%L,%L,%L,null,%L,null,%L::jsonb)',c.ws,c.owner,'owner@kys.example.test',c.site,'27400000-0000-4000-8000-0000000000a1',
   '{"pageUrl":"https://bakery.example/hours","editSteps":["a"],"expectText":"Open Saturday 9-2","ownerFacing":true}'),'connected_site_change_agency_required');
 perform pg_temp.denied(format('select public.plan_connected_site_change(%L,%L,%L,%L,null,%L,null,%L::jsonb)',c.ws,c.staff,'staff@kys.example.test',c.site,'27400000-0000-4000-8000-0000000000a1',
   '{"pageUrl":"https://evil.example/hours","editSteps":["a"],"expectText":"Open Saturday 9-2","ownerFacing":true}'),'connected_site_change_invalid');
 perform pg_temp.denied(format('select public.plan_connected_site_change(%L,%L,%L,%L,null,%L,null,%L::jsonb)',c.ws,c.staff,'staff@kys.example.test',c.site,'27400000-0000-4000-8000-0000000000a1',
   '{"pageUrl":"https://bakery.example/hours","editSteps":["a"],"expectText":"Open Saturday 9-2","ownerFacing":true,"extra":1}'),'connected_site_change_invalid');
 chg:=public.plan_connected_site_change(c.ws,c.staff,'staff@kys.example.test',c.site,null,'27400000-0000-4000-8000-0000000000a1',null,
   '{"pageUrl":"https://bakery.example/hours","editSteps":["Open Pages.","Make this change: x","Choose Publish.","Come back."],"expectText":"Open Saturday 9-2","removeText":"Closed Saturdays","ownerFacing":true}');
 cid:=(chg->>'id')::uuid;
 perform pg_temp.ok(chg->>'stage'='planned_waiting' and chg->>'origin'='request' and chg->>'title'='Update the Saturday hours to 9-2','planned stage');
 perform pg_temp.ok(chg->'steps'->0->'actor'->>'displayName'='Agency','step actor is the agency');
 perform pg_temp.ok(public.connected_site_change_request_stage('27400000-0000-4000-8000-0000000000a1')='needs_you','request stage needs_you');
 perform pg_temp.denied(format('select public.plan_connected_site_change(%L,%L,%L,%L,null,%L,null,%L::jsonb)',c.ws,c.staff,'staff@kys.example.test',c.site,'27400000-0000-4000-8000-0000000000a1',
   '{"pageUrl":"https://bakery.example/hours","editSteps":["a"],"expectText":"x","ownerFacing":true}'),'connected_site_change_out_of_order');
 -- A pending (unaccepted) request cannot be planned.
 update public.service_requests set provider_acceptance='pending',accepted_by=null,accepted_at=null where id='27400000-0000-4000-8000-0000000000a2';
 perform pg_temp.denied(format('select public.plan_connected_site_change(%L,%L,%L,%L,null,%L,null,%L::jsonb)',c.ws,c.staff,'staff@kys.example.test',c.site,'27400000-0000-4000-8000-0000000000a2',
   '{"pageUrl":"https://bakery.example/about","editSteps":["a"],"expectText":"x","ownerFacing":false}'),'connected_site_change_not_accepted');

 -- Needs you: the owner (and nobody else) sees it and decides.
 v:=public.list_connected_site_change_reviews(c.ws,c.owner,'owner@kys.example.test');
 perform pg_temp.ok(jsonb_array_length(v)=1 and v->0->>'changeId'=cid::text and v->0->>'agencyName'='Agency' and v->0->>'platform'='wix','owner review item');
 perform pg_temp.ok(public.list_connected_site_change_reviews(c.ws,c.staff,'staff@kys.example.test')='[]'::jsonb,'agency sees no review item');
 perform pg_temp.ok(public.list_connected_site_change_reviews(c.ws,c.admin,'admin@kys.example.test')='[]'::jsonb,'admin sees no review item');
 perform pg_temp.denied(format('select public.decide_connected_site_change(%L,%L,%L,%L,%L)',c.ws,c.staff,'staff@kys.example.test',cid,'approved'),'connected_site_change_owner_required');
 perform pg_temp.denied(format('select public.decide_connected_site_change(%L,%L,%L,%L,%L)',c.ws,c.admin,'admin@kys.example.test',cid,'approved'),'connected_site_change_owner_required');
 perform pg_temp.denied(format('select public.mark_connected_site_change_done(%L,%L,%L,%L,null)',c.ws,c.staff,'staff@kys.example.test',cid),'connected_site_change_out_of_order');
 chg:=public.decide_connected_site_change(c.ws,c.owner,'owner@kys.example.test',cid,'approved');
 perform pg_temp.ok(chg->>'stage'='ready_to_make','approved -> ready_to_make');
 perform pg_temp.ok(public.connected_site_change_request_stage('27400000-0000-4000-8000-0000000000a1')='in_progress','request stage in_progress');
 perform pg_temp.denied(format('select public.decide_connected_site_change(%L,%L,%L,%L,%L)',c.ws,c.owner,'owner@kys.example.test',cid,'approved'),'connected_site_change_out_of_order');
 perform pg_temp.ok(public.list_connected_site_change_reviews(c.ws,c.owner,'owner@kys.example.test')='[]'::jsonb,'review item gone once decided');

 -- Mark done is the agency's; the check is Strelva's reading.
 perform pg_temp.denied(format('select public.mark_connected_site_change_done(%L,%L,%L,%L,null)',c.ws,c.owner,'owner@kys.example.test',cid),'connected_site_change_agency_required');
 chg:=public.mark_connected_site_change_done(c.ws,c.staff,'staff@kys.example.test',cid,null);
 perform pg_temp.ok(chg->>'stage'='checking','marked done -> checking');
 select count(*) into before_n from public.system_revisions where system_id=c.sys;
 rel:=public.record_connected_site_change_check(c.ws,c.staff,'staff@kys.example.test',cid,'not_visible',null,null);
 perform pg_temp.ok(rel->'change'->>'stage'='not_seen' and rel->'release' is null or rel->'release'='null'::jsonb,'not seen, no release');
 perform pg_temp.ok((select count(*) from public.system_revisions where system_id=c.sys)=before_n,'no revision before visible');
 perform pg_temp.denied(format('select public.record_connected_site_change_check(%L,%L,%L,%L,%L,null,null)',c.ws,c.staff,'staff@kys.example.test',cid,'bogus'),'connected_site_change_invalid');
 rel:=public.record_connected_site_change_check(c.ws,c.staff,'staff@kys.example.test',cid,'visible',repeat('f',64),'Open Saturday 9-2');
 perform pg_temp.ok(rel->'change'->>'stage'='done' and (rel->'release'->>'number')::int=before_n+1,'visible -> Release and done');
 perform pg_temp.ok(rel->'change'->'steps'->-1->>'kind'='released' and rel->'change'->'steps'->-1->>'readBack'='confirmed','released step');
 select count(*) into revs from public.system_revisions where system_id=c.sys and implementation->>'kind'='connected_site' and summary like 'Changed on Wix: Update the Saturday hours to 9-2. Strelva saw it%';
 perform pg_temp.ok(revs=1,'one numbered revision with the summary');
 perform pg_temp.ok((select actor_snapshot->>'displayName' from public.system_revisions where system_id=c.sys order by number desc limit 1)='Agency','revision actor is the agency');
 perform pg_temp.ok((select current_revision_number from public.systems where id=c.sys)=before_n+1,'System points at the Release');
 perform pg_temp.ok(public.connected_site_change_request_stage('27400000-0000-4000-8000-0000000000a1')='done','request stage done');
 perform pg_temp.denied(format('select public.record_connected_site_change_check(%L,%L,%L,%L,%L,null,null)',c.ws,c.staff,'staff@kys.example.test',cid,'visible'),'connected_site_change_out_of_order');
 -- What changed
 v:=public.read_connected_site_change_releases(c.ws,c.owner,'owner@kys.example.test',now()-interval '1 day');
 perform pg_temp.ok(jsonb_array_length(v)=1 and v->0->>'readBack'='confirmed' and v->0->'actor'->>'displayName'='Agency' and v->0->>'platform'='wix','what changed row');
 perform pg_temp.denied(format('select public.read_connected_site_change_releases(%L,%L,%L,now())',c.ws,c.stranger,'stranger@kys.example.test'),'workspace_access_denied');
 -- Home: stage follows the change
 home:=public.read_agency_client_home(c.ws,c.staff,'staff@kys.example.test');
 -- The Request task page
 v:=public.read_connected_site_change_for_request(c.owner,'owner@kys.example.test','27400000-0000-4000-8000-0000000000a1');
 perform pg_temp.ok(v->>'workspaceId'=c.ws::text and v->>'systemId'=c.sys::text,'request target');
 perform pg_temp.ok(public.read_connected_site_change_for_request(c.owner,'owner@kys.example.test',gen_random_uuid()) is null,'unknown request is null');
 perform pg_temp.denied(format('select public.read_connected_site_change_for_request(%L,%L,%L)',c.stranger,'stranger@kys.example.test','27400000-0000-4000-8000-0000000000a1'),'workspace_access_denied');
end $$;
rollback;

-- Second pass: a plan the owner need not see, not seen, Release without confirmation, declined, withdrawn,
-- an agency-origin change, immutability, grants and the agency bulk view.
begin;
do $$ declare c record; chg jsonb; cid uuid; cid2 uuid; cid3 uuid; rel jsonb; v jsonb; n int;
begin
 select * into c from ctx;
 update public.service_requests set provider_acceptance='accepted',accepted_by=c.staff,accepted_at=now() where id='27400000-0000-4000-8000-0000000000a2';
 chg:=public.plan_connected_site_change(c.ws,c.staff,'staff@kys.example.test',c.site,null,'27400000-0000-4000-8000-0000000000a2',null,
   '{"pageUrl":"https://bakery.example/about","editSteps":["Open.","Make this change: typo","Publish.","Done."],"expectText":"Our story","ownerFacing":false,"note":"typo only"}');
 cid:=(chg->>'id')::uuid;
 perform pg_temp.ok(chg->>'stage'='ready_to_make','owner need not say yes');
 perform pg_temp.ok(public.list_connected_site_change_reviews(c.ws,c.owner,'owner@kys.example.test')='[]'::jsonb,'no review item for a plan the owner need not see');
 perform pg_temp.denied(format('select public.decide_connected_site_change(%L,%L,%L,%L,%L)',c.ws,c.owner,'owner@kys.example.test',cid,'approved'),'connected_site_change_out_of_order');
 chg:=public.mark_connected_site_change_done(c.ws,c.staff,'staff@kys.example.test',cid,'published');
 rel:=public.record_connected_site_change_check(c.ws,c.staff,'staff@kys.example.test',cid,'unreachable',null,null);
 perform pg_temp.ok(rel->'change'->>'stage'='not_seen','unreachable -> not seen');
 -- An owner may not record "no confirmation"; the agency may.
 perform pg_temp.denied(format('select public.release_connected_site_change_unconfirmed(%L,%L,%L,%L,null)',c.ws,c.owner,'owner@kys.example.test',cid),'connected_site_change_agency_required');
 rel:=public.release_connected_site_change_unconfirmed(c.ws,c.staff,'staff@kys.example.test',cid,null);
 perform pg_temp.ok(rel->'change'->>'stage'='done_unconfirmed' and rel->'change'->'steps'->-1->>'readBack'='not_confirmed','Release recorded as not confirmed');
 perform pg_temp.ok(exists(select 1 from public.system_revisions where system_id=c.sys and summary like 'Changed on Wix: Fix the typo on the about page. Not confirmed on the live page.'),'revision says not confirmed');
 perform pg_temp.denied(format('select public.withdraw_connected_site_change(%L,%L,%L,%L,null)',c.ws,c.staff,'staff@kys.example.test',cid),'connected_site_change_out_of_order');
 perform pg_temp.ok(public.connected_site_change_request_stage('27400000-0000-4000-8000-0000000000a2')='done','unconfirmed counts as done in the Queue');

 -- An agency-origin change: declined, re-planned, then withdrawn by the owner.
 perform pg_temp.denied(format('select public.plan_connected_site_change(%L,%L,%L,%L,null,null,%L,%L::jsonb)',c.ws,c.staff,'staff@kys.example.test',c.site,'   ',
   '{"pageUrl":"https://bakery.example/menu","editSteps":["a"],"expectText":"x","ownerFacing":true}'),'connected_site_change_invalid');
 chg:=public.plan_connected_site_change(c.ws,c.staff,'staff@kys.example.test',c.site,null,null,'Add the new menu',
   '{"pageUrl":"https://bakery.example/menu","editSteps":["a","b"],"expectText":"Fall menu","ownerFacing":true}');
 cid2:=(chg->>'id')::uuid;
 perform pg_temp.ok(chg->>'origin'='agency' and chg->>'requestId' is null,'agency origin');
 chg:=public.decide_connected_site_change(c.ws,c.owner,'owner@kys.example.test',cid2,'declined');
 perform pg_temp.ok(chg->>'stage'='declined','declined');
 chg:=public.plan_connected_site_change(c.ws,c.staff,'staff@kys.example.test',c.site,cid2,null,null,
   '{"pageUrl":"https://bakery.example/menu","editSteps":["a","b"],"expectText":"Fall menu 2026","ownerFacing":true}');
 perform pg_temp.ok(chg->>'stage'='planned_waiting' and (select count(*) from jsonb_array_elements(chg->'steps'))=3,'re-plan after declined');
 v:=public.list_connected_site_change_reviews(c.ws,c.owner,'owner@kys.example.test');
 perform pg_temp.ok(v->0->>'expectText'='Fall menu 2026','review shows the latest plan');
 chg:=public.withdraw_connected_site_change(c.ws,c.owner,'owner@kys.example.test',cid2,'changed my mind');
 perform pg_temp.ok(chg->>'stage'='withdrawn','owner can withdraw');
 perform pg_temp.denied(format('select public.withdraw_connected_site_change(%L,%L,%L,%L,null)',c.ws,c.stranger,'stranger@kys.example.test',cid2),'workspace_access_denied');

 -- An unverified site takes no plans.
 perform pg_temp.denied(format('select public.plan_connected_site_change(%L,%L,%L,%L,null,null,%L,%L::jsonb)','27400000-0000-4000-8000-000000000011',c.staff,'staff@kys.example.test','27400000-0000-4000-8000-0000000000c2','x',
   '{"pageUrl":"https://cafe.example/x","editSteps":["a"],"expectText":"x","ownerFacing":true}'),'connected_site_not_verified');

 -- Append-only.
 perform pg_temp.denied('update public.connected_site_change_steps set note=''x''','connected_site_change_immutable');
 perform pg_temp.denied('update public.connected_site_changes set title=''x''','connected_site_change_immutable');

 -- Grants: RPCs for service_role only; helpers for nobody.
 perform pg_temp.ok(has_function_privilege('service_role','public.plan_connected_site_change(uuid,uuid,text,uuid,uuid,uuid,text,jsonb)','execute'),'service_role runs plan');
 perform pg_temp.ok(not has_function_privilege('authenticated','public.plan_connected_site_change(uuid,uuid,text,uuid,uuid,uuid,text,jsonb)','execute'),'authenticated cannot plan');
 perform pg_temp.ok(not has_function_privilege('anon','public.read_agency_client_sites(uuid,uuid,text,text,uuid,integer)','execute'),'anon cannot read client sites');
 perform pg_temp.ok(not has_function_privilege('service_role','public.connected_site_change_release(public.connected_site_changes,uuid,text,text,uuid)','execute'),'release helper is internal');
 perform pg_temp.ok(not has_function_privilege('service_role','public.connected_site_change_stage(uuid)','execute'),'stage helper is internal');
 perform pg_temp.ok(not has_table_privilege('service_role','public.connected_site_change_steps','select'),'steps table is closed');
 perform pg_temp.ok(has_function_privilege('service_role','public.record_connected_site_check(uuid,uuid,text,uuid,text,text,text[])','execute'),'service_role records checks');

 -- Health columns.
 v:=public.record_connected_site_check(c.ws,c.staff,'staff@kys.example.test',c.site,'present','wix',array['generator: Wix.com Website Builder']);
 perform pg_temp.ok(v->>'lastCheckResult'='present' and v->>'detectedPlatform'='wix' and v->>'lastCheckedAt' is not null,'check recorded');
 v:=public.record_connected_site_check(c.ws,c.staff,'staff@kys.example.test',c.site,'unreachable',null,'{}');
 perform pg_temp.ok(v->>'lastCheckResult'='unreachable' and v->>'detectedPlatform'='wix','an unreachable site keeps what we knew');
 perform pg_temp.denied(format('select public.record_connected_site_check(%L,%L,%L,%L,%L,%L,%L)',c.ws,c.staff,'staff@kys.example.test',c.site,'bogus',null,'{}'),'connected_site_invalid');
 perform pg_temp.denied(format('select public.record_connected_site_check(%L,%L,%L,%L,%L,%L,%L)',c.ws,c.stranger,'stranger@kys.example.test',c.site,'present',null,'{}'),'workspace_access_denied');

 -- Agency bulk view.
 perform pg_temp.denied(format('select public.read_agency_client_sites(%L,%L,%L)','27400000-0000-4000-8000-000000000020',c.stranger,'stranger@kys.example.test'),'workspace_access_denied');
 perform pg_temp.denied(format('select public.read_agency_client_sites(%L,%L,%L,null,null,0)','27400000-0000-4000-8000-000000000020',c.staff,'staff@kys.example.test'),'system_input_invalid');
 v:=public.read_agency_client_sites('27400000-0000-4000-8000-000000000020',c.staff,'staff@kys.example.test',null,null,1);
 perform pg_temp.ok(jsonb_array_length(v->'clients')=1 and v->'clients'->0->>'name'='Bakery' and v->'nextCursor'->>'name'='Bakery','first page and cursor');
 perform pg_temp.ok(v::text not like '%sk_pub_%' and v::text not like '%verificationToken%','no key or token leaves');
 v:=public.read_agency_client_sites('27400000-0000-4000-8000-000000000020',c.staff,'staff@kys.example.test',v->'nextCursor'->>'name',(v->'nextCursor'->>'id')::uuid,1);
 perform pg_temp.ok(jsonb_array_length(v->'clients')=1 and v->'clients'->0->>'name'='Cafe' and v->'nextCursor' = 'null'::jsonb,'second page ends');
 perform pg_temp.ok(v->'clients'->0->'site'->>'platform'='godaddy' and v->'clients'->0->'site'->>'verifiedAt' is null,'unverified site shown');
 -- Detection.
 v:=public.record_connected_site_detection('27400000-0000-4000-8000-000000000011',c.staff,'staff@kys.example.test','https://cafe.example/','cafe.example','godaddy',array['img1.wsimg.com'],true);
 perform pg_temp.ok(v->>'platform'='godaddy' and (v->>'reachable')::boolean,'detection recorded');
 perform pg_temp.ok((select detected_platform from public.connected_sites where id='27400000-0000-4000-8000-0000000000c2')='godaddy','detection reaches the connected site');
 v:=public.record_connected_site_detection('27400000-0000-4000-8000-000000000011',c.staff,'staff@kys.example.test','https://cafe.example/','cafe.example','unknown','{}',false);
 perform pg_temp.ok(v->>'platform'='unknown' and not (v->>'reachable')::boolean,'unreachable detection recorded');
 perform pg_temp.ok((select detected_platform from public.connected_sites where id='27400000-0000-4000-8000-0000000000c2')='godaddy','unreachable detection leaves the site');
 v:=public.read_agency_client_sites('27400000-0000-4000-8000-000000000020',c.staff,'staff@kys.example.test',null,null,10);
 perform pg_temp.ok(v->'clients'->1->'detection'->>'platform'='unknown','detection in the bulk view');
 perform pg_temp.denied(format('select public.record_connected_site_detection(%L,%L,%L,%L,%L,%L,%L,true)','27400000-0000-4000-8000-000000000011',c.staff,'staff@kys.example.test','http://x y','cafe.example','wix','{}'),'connected_site_invalid');

 -- Rollback refuses once a Release exists.
end $$;
rollback;
