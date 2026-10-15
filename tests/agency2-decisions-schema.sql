\set ON_ERROR_STOP 1
-- Run after the ordered schema, including 20261024132400. Fictional records
-- roll back. This proves decision authority, not hosted/provider execution.
begin;
\ir support/agency-proposal-response.sql
create function pg_temp.ux_assert(value boolean, message text) returns void language plpgsql as $$
begin if value is not true then raise exception 'agency decision proof: %',message; end if; end $$;
create function pg_temp.ux_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm <> expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
  end;
  raise exception 'expected % but succeeded: %',expected,statement;
end $$;
insert into public.users(id,email,verified_at) values
  ('b2000000-0000-4000-8000-000000000001','ux-owner@bakery.example.test',now()),
  ('b2000000-0000-4000-8000-000000000002','ux-lead@agency.example.test',now()),
  ('b2000000-0000-4000-8000-000000000003','ux-staff@agency.example.test',now());
-- The same person has a platform support identity and an ordinary agency seat.
insert into public.super_admins(user_id,email) values ('b2000000-0000-4000-8000-000000000003','ux-staff@agency.example.test');
insert into public.workspaces(id,kind,name,created_by) values
  ('b2000000-0000-4000-8000-0000000000b1','customer','Decision Bakery','b2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-0000000000a1','agency','Outside Agency','b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-0000000000a2','agency','Second Agency','b2000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-000000000001','owner','b2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-000000000002','owner','b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-0000000000a2','b2000000-0000-4000-8000-000000000002','owner','b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-000000000003','member','b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-0000000000a2','b2000000-0000-4000-8000-000000000003','member','b2000000-0000-4000-8000-000000000002');
update public.workspaces set agency_brand = '{"displayName":"Outside Brand","accentColor":"#325c42","replyTo":null,"logo":null,"credit":"runs_on_strelva"}'
  where id = 'b2000000-0000-4000-8000-0000000000a1';
update public.workspaces set agency_brand = '{"displayName":"Strelva","accentColor":"#325c42","replyTo":null,"logo":null,"credit":"runs_on_strelva"}'
  where id = 'b2000000-0000-4000-8000-0000000000a2';
insert into public.systems(id,business_workspace_id,name,kind,origin_kind,origin_ref,command_id,command_digest,created_by,updated_by)
  values(public.system_origin_id('b2000000-0000-4000-8000-0000000000b1','saved_work','b2000000-0000-4000-8000-0000000000c1'),
    'b2000000-0000-4000-8000-0000000000b1','Client app','internal_app','saved_work','b2000000-0000-4000-8000-0000000000c1',
    gen_random_uuid(),repeat('1',64),'b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001');

select pg_temp.ux_assert(not has_function_privilege('anon','public.list_agency_owner_decisions(uuid,uuid,text,uuid)','EXECUTE'),'anonymous cannot read');
select pg_temp.ux_assert(not has_function_privilege('authenticated','public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid)','EXECUTE'),'native authenticated cannot claim');
select pg_temp.ux_assert(has_function_privilege('service_role','public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid)','EXECUTE'),'service claim retained');
select format('grant usage on schema %I to service_role',nspname) from pg_namespace where oid = pg_my_temp_schema() \gexec
set local role service_role;
do $$
declare owner_id uuid := 'b2000000-0000-4000-8000-000000000001'; lead_id uuid := 'b2000000-0000-4000-8000-000000000002';
  staff_id uuid := 'b2000000-0000-4000-8000-000000000003'; business uuid := 'b2000000-0000-4000-8000-0000000000b1';
  agency uuid := 'b2000000-0000-4000-8000-0000000000a1'; other_agency uuid := 'b2000000-0000-4000-8000-0000000000a2';
  h text := repeat('a',64); item jsonb; result jsonb; source text; kind text; rows jsonb; publication uuid; app_id uuid; email_id uuid; google_id uuid; booking_id uuid;
begin
  perform public.set_agency_directory_listing(lead_id,'ux-lead@agency.example.test',agency,'Website help',true);
  perform public.set_agency_directory_listing(lead_id,'ux-lead@agency.example.test',other_agency,'Google help',true);
  perform public.bring_in_agency(owner_id,'ux-owner@bakery.example.test',business,agency,
    '[{"scope":"website","level":"full_control"},{"scope":"internal_tools","level":"full_control"},{"scope":"inquiries","level":"full_control"},{"scope":"bookings","level":"full_control"}]','I agree');
  perform pg_temp.respond_to_agency_proposal(lead_id,'ux-lead@agency.example.test',agency,business,true);
  perform public.bring_in_agency(owner_id,'ux-owner@bakery.example.test',business,other_agency,'[{"scope":"google","level":"full_control"}]','I agree');
  perform pg_temp.respond_to_agency_proposal(lead_id,'ux-lead@agency.example.test',other_agency,business,true);
  perform public.set_agency_client_staff(lead_id,'ux-lead@agency.example.test',agency,business,staff_id,true);
  perform public.set_agency_client_staff(lead_id,'ux-lead@agency.example.test',other_agency,business,staff_id,true);
  item := public.open_owner_decision(business,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Website publishing',
    'approveEffect','The website goes live.','notYetEffect','Nothing changes.','sourceLifecycle','website_document','sourceId','website:launch',
    'revisionHash',h,'actor',jsonb_build_object('kind','agency','displayName','Recorded Designer')));
  -- This reference deliberately has no native saved-work candidate. It
  -- remains refused after done_agency_website_decisions; real exact native
  -- approval/launch and domain execution are exercised in that fixture.
  publication := (item->>'id')::uuid;
  perform pg_temp.ux_assert(item->'actor'->>'displayName' = 'Recorded Designer','explicit proposing actor survives');
  item := public.open_owner_decision(business,jsonb_build_object('kind','system.go_live','route','owner_decides','title','App release',
    'approveEffect','The app goes live.','notYetEffect','Nothing changes.','sourceLifecycle','application_release',
    'sourceId','native:b2000000-0000-4000-8000-0000000000c1','revisionHash',h));
  app_id := (item->>'id')::uuid;
  item := public.open_owner_decision(business,jsonb_build_object('kind','customer.message','route','owner_decides','title','Send inquiry reply',
    'approveEffect','The message sends.','notYetEffect','Nothing sends.','sourceLifecycle','tenant_event','sourceId','inquiry:reply','revisionHash',h));
  email_id := (item->>'id')::uuid;
  item := public.open_owner_decision(business,jsonb_build_object('kind','google.post','route','owner_decides','title','Google post',
    'approveEffect','The post goes live.','notYetEffect','Nothing posts.','sourceLifecycle','tenant_event','sourceId','google:post','revisionHash',h));
  google_id := (item->>'id')::uuid;
  item := public.open_owner_decision(business,jsonb_build_object('kind','customer.commitment','route','owner_decides','title','Confirm booking',
    'approveEffect','The booking is confirmed.','notYetEffect','Nothing changes.','sourceLifecycle','booking_request','sourceId','booking:confirm','revisionHash',h));
  booking_id := (item->>'id')::uuid;
  for source,kind in select * from (values ('work_money','money'),('workspace_exit','exit'),('agency_grant','access.grant'),
    ('business_facts','fact.inferred'),('business_record_draft','fact.inferred'),('inquiry_fact','fact.inferred'),('tenant_event','customer.commitment')) denied(source,kind) loop
    item := public.open_owner_decision(business,jsonb_build_object('kind',kind,'route','owner_decides','title','Owner-only decision',
      'approveEffect','Owner action.','notYetEffect','Nothing changes.','sourceLifecycle',source,'sourceId','private:'||kind,'revisionHash',h));
    perform pg_temp.ux_expect(format('select public.claim_scoped_agency_owner_decision(%L,%L,%L,%L,%L,%L,%L)',
      business,item->>'id',h,'approve',staff_id,'ux-staff@agency.example.test',agency),'owner_decision_owner_only');
  end loop;
  rows := public.list_agency_owner_decisions(business,staff_id,'ux-staff@agency.example.test',agency);
  perform pg_temp.ux_assert(jsonb_array_length(rows) = 3,'only supported selected agency app/email/booking scope is readable');
  perform pg_temp.ux_assert(not exists(select 1 from jsonb_array_elements(rows) d where d->>'id' = google_id::text),'other agency Google decision cannot leak into selected agency');
  perform pg_temp.ux_assert(jsonb_array_length(public.list_agency_owner_decisions(business,staff_id,'ux-staff@agency.example.test',other_agency)) = 1,'second agency sees only Google');
  perform pg_temp.ux_expect(format('select public.list_agency_owner_decisions(%L,%L,%L)',business,staff_id,'ux-staff@agency.example.test'),'owner_decision_access_denied');
  perform pg_temp.ux_expect(format('select public.claim_scoped_agency_owner_decision(%L,%L,%L,%L,%L,%L,%L)',
    business,google_id,h,'approve',staff_id,'ux-staff@agency.example.test',agency),'owner_decision_owner_only');
  perform pg_temp.ux_assert(not exists(select 1 from jsonb_array_elements(rows) d where d->>'id' = publication::text),'unsupported website publishing is withheld');
  perform pg_temp.ux_expect(format('select public.claim_scoped_agency_owner_decision(%L,%L,%L,%L,%L,%L,%L)',
    business,publication,h,'approve',staff_id,'ux-staff@agency.example.test',agency),'owner_decision_owner_only');
  item := public.open_owner_decision(business,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Domain attachment',
    'approveEffect','The domain attaches.','notYetEffect','Nothing changes.','sourceLifecycle','website_domain','sourceId','website:domain','revisionHash',h));
  perform pg_temp.ux_expect(format('select public.claim_scoped_agency_owner_decision(%L,%L,%L,%L,%L,%L,%L)',
    business,item->>'id',h,'approve',staff_id,'ux-staff@agency.example.test',agency),'owner_decision_owner_only');
  result := public.read_agency_decision_receipt(business,agency,app_id,h,staff_id,'ux-staff@agency.example.test');
  perform pg_temp.ux_assert(result->>'state' = 'open','exact unclaimed review can reconcile');
  result := public.claim_scoped_agency_owner_decision(business,app_id,repeat('b',64),'approve',staff_id,'ux-staff@agency.example.test',agency);
  perform pg_temp.ux_assert(result->>'status' = 'changed','stale revision never claims');
  result := public.claim_scoped_agency_owner_decision(business,app_id,h,'approve',staff_id,'ux-staff@agency.example.test',agency);
  perform pg_temp.ux_assert(result->>'status' = 'claimed' and result->'item'->>'decidedByKind' = 'agency_session','agency claims supported exact app release');
  perform pg_temp.ux_assert(result->'item'->'decidedActor'->>'agencyId' = agency::text and result->'item'->'decidedActor'->>'displayName' = 'Outside Brand','selected agency brand is captured');
  result := public.read_agency_decision_receipt(business,agency,app_id,h,staff_id,'ux-staff@agency.example.test');
  perform pg_temp.ux_assert(result->>'state' = 'approved' and result->>'outcome' is null,'claim is visible separately from incomplete execution');
  perform public.finish_owner_decision(business,app_id,'done_unverified','Accepted; confirmation pending.','app:fixture');
  result := public.read_agency_decision_receipt(business,agency,app_id,h,staff_id,'ux-staff@agency.example.test');
  perform pg_temp.ux_assert(result->>'outcome' = 'done_unverified','uncertain readback is retained after accepted write');
  perform pg_temp.ux_expect(format('select public.read_agency_decision_receipt(%L,%L,%L,%L,%L,%L)',
    business,other_agency,app_id,h,staff_id,'ux-staff@agency.example.test'),'owner_decision_access_denied');
  perform pg_temp.ux_expect(format('select public.read_agency_decision_receipt(%L,%L,%L,%L,%L,%L)',
    business,agency,app_id,repeat('b',64),staff_id,'ux-staff@agency.example.test'),'owner_decision_access_denied');
  result := public.claim_scoped_agency_owner_decision(business,app_id,h,'approve',staff_id,'ux-staff@agency.example.test',agency);
  perform pg_temp.ux_assert(result->>'status' = 'already_handled','repeat approval cannot replay');
  result := public.claim_scoped_agency_owner_decision(business,google_id,h,'not_yet',staff_id,'ux-staff@agency.example.test',other_agency);
  perform pg_temp.ux_assert(result->'item'->'decidedActor'->>'displayName' = 'Strelva Agency','literal Strelva agency brand retains agency attribution');
  perform pg_temp.ux_expect(format('select public.read_agency_decision_receipt(%L,%L,%L,%L,%L,%L)',
    business,agency,app_id,h,staff_id,'changed@agency.example.test'),'owner_decision_access_denied');
  perform public.end_agency_for_business(owner_id,'ux-owner@bakery.example.test',business,agency,null);
  perform pg_temp.ux_expect(format('select public.list_agency_owner_decisions(%L,%L,%L,%L)',business,staff_id,'ux-staff@agency.example.test',agency),'owner_decision_access_denied');
  perform pg_temp.ux_expect(format('select public.claim_scoped_agency_owner_decision(%L,%L,%L,%L,%L,%L,%L)',
    business,email_id,h,'approve',staff_id,'ux-staff@agency.example.test',agency),'owner_decision_owner_only');
  perform pg_temp.ux_expect(format('select public.read_agency_decision_receipt(%L,%L,%L,%L,%L,%L)',
    business,agency,app_id,h,staff_id,'ux-staff@agency.example.test'),'owner_decision_access_denied');
end $$;
reset role;
select pg_temp.ux_expect($q$update public.owner_decisions set agency_decision_scopes = array['website'] where decided_by_kind = 'agency_session' and agency_decision_scopes is not null$q$,'agency_decision_scopes_immutable');
rollback;

-- New reader and all callees run without writer locks in PostgREST's real
-- READ ONLY transaction mode. No credentials/providers are involved.
begin read only;
set local role service_role;
do $$ begin
  begin perform public.list_agency_owner_decisions('b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-000000000003','ux-staff@agency.example.test','b2000000-0000-4000-8000-0000000000a1');
  exception when others then if sqlerrm <> 'owner_decision_access_denied' then raise; end if; end;
end $$;
rollback;

-- A reader invocation is legal under actual PostgREST READ ONLY, even refusal.
begin read only;
set local role service_role;
do $$ begin
  begin perform public.read_agency_decision_receipt('b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-0000000000c1',repeat('a',64),'b2000000-0000-4000-8000-000000000003','ux-staff@agency.example.test');
  exception when others then if sqlerrm <> 'owner_decision_access_denied' then raise; end if; end;
end $$;
rollback;
