-- 20261024500000: Forward your inquiries. Who may issue, rotate and revoke a
-- business's forwarding address; receive refuses unknown and revoked
-- addresses; dedupe by message key and by sender+words; spam and volume
-- holds; cross-business isolation; held review and the workspace inbox read.
\set ON_ERROR_STOP 1
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm <> expected then raise exception 'expected %, got %', expected, sqlerrm; end if; return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end $$;
insert into public.users(id,email,verified_at) values
  ('24500000-0000-4000-8000-000000000001','owner@bakery.example.test',now()),
  ('24500000-0000-4000-8000-000000000002','member@bakery.example.test',now()),
  ('24500000-0000-4000-8000-000000000003','lead@north.example.test',now()),
  ('24500000-0000-4000-8000-000000000004','staff@north.example.test',now()),
  ('24500000-0000-4000-8000-000000000005','owner@florist.example.test',now()),
  ('24500000-0000-4000-8000-000000000006','outsider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('24500000-0000-4000-8000-0000000000b1','customer','Bakery','24500000-0000-4000-8000-000000000001'),
  ('24500000-0000-4000-8000-0000000000b2','customer','Florist','24500000-0000-4000-8000-000000000005'),
  ('24500000-0000-4000-8000-0000000000b3','customer','Plumber (awaiting claim)','24500000-0000-4000-8000-000000000003'),
  ('24500000-0000-4000-8000-0000000000a1','agency','North Studio','24500000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('24500000-0000-4000-8000-0000000000b1','24500000-0000-4000-8000-000000000001','owner','24500000-0000-4000-8000-000000000001'),
  ('24500000-0000-4000-8000-0000000000b1','24500000-0000-4000-8000-000000000002','member','24500000-0000-4000-8000-000000000001'),
  ('24500000-0000-4000-8000-0000000000b2','24500000-0000-4000-8000-000000000005','owner','24500000-0000-4000-8000-000000000005'),
  ('24500000-0000-4000-8000-0000000000a1','24500000-0000-4000-8000-000000000003','owner','24500000-0000-4000-8000-000000000003'),
  ('24500000-0000-4000-8000-0000000000a1','24500000-0000-4000-8000-000000000004','member','24500000-0000-4000-8000-000000000003');
-- North serves the bakery (owner-granted seat) and added the plumber itself.
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
  ('24500000-0000-4000-8000-0000000000b1','24500000-0000-4000-8000-0000000000a1','owner','24500000-0000-4000-8000-000000000001'),
  ('24500000-0000-4000-8000-0000000000b3','24500000-0000-4000-8000-0000000000a1','agency_added','24500000-0000-4000-8000-000000000003');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
  ('24500000-0000-4000-8000-0000000000a1','24500000-0000-4000-8000-0000000000b1','24500000-0000-4000-8000-000000000004','24500000-0000-4000-8000-000000000003'),
  ('24500000-0000-4000-8000-0000000000a1','24500000-0000-4000-8000-0000000000b3','24500000-0000-4000-8000-000000000004','24500000-0000-4000-8000-000000000003');
insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at) values
  ('24500000-0000-4000-8000-0000000000b1','24500000-0000-4000-8000-0000000000a1','website','prepare','active','North may prepare the website.',
   '24500000-0000-4000-8000-000000000001','24500000-0000-4000-8000-000000000003',now());

do $$
declare
  owner_id constant uuid := '24500000-0000-4000-8000-000000000001';
  member_id constant uuid := '24500000-0000-4000-8000-000000000002';
  staff_id constant uuid := '24500000-0000-4000-8000-000000000004';
  florist_owner constant uuid := '24500000-0000-4000-8000-000000000005';
  bakery constant uuid := '24500000-0000-4000-8000-0000000000b1';
  florist constant uuid := '24500000-0000-4000-8000-0000000000b2';
  plumber constant uuid := '24500000-0000-4000-8000-0000000000b3';
  north constant uuid := '24500000-0000-4000-8000-0000000000a1';
  first_local constant text := 'fwd-aaaaaaaaaaaaaaaaaaaaaaaa';
  second_local constant text := 'fwd-bbbbbbbbbbbbbbbbbbbbbbbb';
  florist_local constant text := 'fwd-cccccccccccccccccccccccc';
  key_one constant text := 'lead_fwd_' || repeat('1',40);
  key_two constant text := 'lead_fwd_' || repeat('2',40);
  key_three constant text := 'lead_fwd_' || repeat('3',40);
  result jsonb; inquiry jsonb; held_id uuid; inbox jsonb;
begin
  -- Members read but never issue; outsiders and other businesses' owners get nothing.
  perform pg_temp.expect_error(format('select public.issue_inquiry_forwarding_address(%L,%L,%L,%L,false)',bakery,member_id,'member@bakery.example.test',first_local),'inquiry_forwarding_access_denied');
  perform pg_temp.expect_error(format('select public.read_inquiry_forwarding(%L,%L,%L)',bakery,'24500000-0000-4000-8000-000000000006','outsider@example.test'),'inquiry_forwarding_access_denied');
  perform pg_temp.expect_error(format('select public.read_inquiry_forwarding(%L,%L,%L)',bakery,florist_owner,'owner@florist.example.test'),'inquiry_forwarding_access_denied');
  -- An agency with only the website area does not hold inquiries.
  perform pg_temp.expect_error(format('select public.issue_inquiry_forwarding_address(%L,%L,%L,%L,false)',bakery,staff_id,'staff@north.example.test',first_local),'inquiry_forwarding_access_denied');
  perform pg_temp.expect_error(format('select public.issue_inquiry_forwarding_address(%L,%L,%L,%L,false)',bakery,owner_id,'owner@bakery.example.test','fwd-short'),'inquiry_forwarding_invalid');

  result := public.issue_inquiry_forwarding_address(bakery,owner_id,'owner@bakery.example.test',first_local,false);
  if result->>'status' <> 'issued' or result#>>'{address,localPart}' <> first_local or result#>>'{address,issuedAs}' <> 'owner' then raise exception 'owner issue failed: %', result; end if;
  result := public.issue_inquiry_forwarding_address(bakery,owner_id,'owner@bakery.example.test',second_local,false);
  if result->>'status' <> 'existing' or result#>>'{address,localPart}' <> first_local then raise exception 'second issue must return the active address: %', result; end if;
  result := public.read_inquiry_forwarding(bakery,member_id,'member@bakery.example.test');
  if (result->>'canManage')::boolean or result#>>'{address,localPart}' <> first_local or result->'latest' <> 'null'::jsonb then raise exception 'member read wrong: %', result; end if;

  -- Receive: unknown address refused; first message recorded with counters.
  result := public.receive_forwarded_inquiry('fwd-zzzzzzzzzzzzzzzzzzzzzzzz', '{"kind":"inquiry"}');
  if result->>'status' <> 'refused' or result->>'reason' <> 'unknown' then raise exception 'unknown address accepted: %', result; end if;
  inquiry := jsonb_build_object('kind','inquiry','leadId',key_one,'submissionHash','1111111111111111','name','Jane Doe','email','Jane@Example.test',
    'message','Do you cater weddings?','fields',jsonb_build_object('subject','Wedding cake','format','gmail'));
  result := public.receive_forwarded_inquiry(upper(first_local), inquiry);
  if result->>'status' <> 'recorded' or (result->>'workspaceId')::uuid <> bakery then raise exception 'receive failed: %', result; end if;
  if not exists (select 1 from public.tenant_leads where id=(result->>'id')::uuid and email='jane@example.test' and source='forwarded_email'
      and recorded_via='forwarded_email' and intake_state='kept' and tenant_stable_id is null and workspace_id=bakery) then raise exception 'forwarded row shape wrong'; end if;
  if (select received_count from public.inquiry_forwarding_addresses where local_part=first_local) <> 1 then raise exception 'counter not bumped'; end if;
  -- Same message key: duplicate. Same sender and words within a day: duplicate.
  result := public.receive_forwarded_inquiry(first_local, inquiry);
  if result->>'status' <> 'duplicate' then raise exception 'message key dedupe failed: %', result; end if;
  result := public.receive_forwarded_inquiry(first_local, inquiry || jsonb_build_object('leadId',key_two));
  if result->>'status' <> 'duplicate' then raise exception 'content dedupe failed: %', result; end if;
  perform pg_temp.expect_error(format('select public.receive_forwarded_inquiry(%L,%L)',first_local,(inquiry || '{"leadId":"lead_1"}')::text),'inquiry_forwarding_invalid');
  perform pg_temp.expect_error(format('select public.receive_forwarded_inquiry(%L,%L)',first_local,(inquiry || '{"email":"not an email"}')::text),'inquiry_forwarding_invalid');

  -- Spam is held with the existing held states, and can be released by the owner.
  result := public.receive_forwarded_inquiry(first_local, inquiry || jsonb_build_object('leadId',key_two,'submissionHash','2222222222222222','spamReason','spam_header'));
  if result->>'status' <> 'held' then raise exception 'spam not held: %', result; end if;
  held_id := (result->>'id')::uuid;
  if not exists (select 1 from public.tenant_leads where id=held_id and intake_state='held_as_spam' and held_reason='spam_header') then raise exception 'held shape wrong'; end if;
  result := public.decide_held_workspace_lead(bakery,owner_id,'owner@bakery.example.test',held_id,'release');
  if result->>'status' <> 'decided' or result#>>'{lead,intakeState}' <> 'released' then raise exception 'release failed: %', result; end if;
  if exists (select 1 from public.inquiry_events where lead_id=key_two) then raise exception 'forwarded rows must not write inquiry events'; end if;

  -- The workspace inbox read returns forwarded rows to members.
  inbox := public.read_workspace_inquiry_inbox_page(bakery,member_id,'member@bakery.example.test',array['kept','released'],100,null,null);
  if jsonb_array_length(inbox) <> 2 or not (inbox @> '[{"recordedVia":"forwarded_email"}]') then raise exception 'inbox read wrong: %', inbox; end if;

  -- Cross-business: the florist's address writes only to the florist, even with the same message key.
  perform public.issue_inquiry_forwarding_address(florist,florist_owner,'owner@florist.example.test',florist_local,false);
  perform pg_temp.expect_error(format('select public.issue_inquiry_forwarding_address(%L,%L,%L,%L,true)',bakery,florist_owner,'owner@florist.example.test',florist_local),'inquiry_forwarding_access_denied');
  result := public.receive_forwarded_inquiry(florist_local, inquiry);
  if result->>'status' <> 'recorded' or (result->>'workspaceId')::uuid <> florist then raise exception 'florist receive wrong: %', result; end if;
  if (select count(*) from public.tenant_leads where workspace_id=bakery and forwarding_address_id is not null) <> 2 then raise exception 'florist message reached the bakery'; end if;
  result := public.read_inquiry_forwarding(florist,florist_owner,'owner@florist.example.test');
  if result#>>'{latest,id}' is null or (select workspace_id from public.tenant_leads where id=(result#>>'{latest,id}')::uuid) <> florist then raise exception 'florist latest wrong: %', result; end if;

  -- Rotation: the old address stops; dedupe survives the new one.
  result := public.issue_inquiry_forwarding_address(bakery,owner_id,'owner@bakery.example.test',second_local,true);
  if result->>'status' <> 'rotated' or result#>>'{address,localPart}' <> second_local then raise exception 'rotate failed: %', result; end if;
  result := public.receive_forwarded_inquiry(first_local, inquiry || jsonb_build_object('leadId',key_three,'submissionHash','3333333333333333'));
  if result->>'status' <> 'refused' or result->>'reason' <> 'revoked' then raise exception 'rotated address accepted: %', result; end if;
  result := public.receive_forwarded_inquiry(second_local, inquiry);
  if result->>'status' <> 'duplicate' then raise exception 'dedupe lost across rotation: %', result; end if;
  result := public.read_inquiry_forwarding(bakery,owner_id,'owner@bakery.example.test');
  if result#>>'{address,localPart}' <> second_local or jsonb_array_length(result->'revoked') <> 1 or result#>>'{revoked,0,localPart}' is not null
    or result#>>'{revoked,0,revokedReason}' <> 'rotated' or not (result->>'canManage')::boolean then raise exception 'read after rotation wrong: %', result; end if;

  -- Gmail's forwarding confirmation is recorded on the address, never an Inquiry.
  perform pg_temp.expect_error(format('select public.receive_forwarded_inquiry(%L,%L)',second_local,'{"kind":"provider_confirmation","provider":"gmail","code":"123456789","url":"https://evil.example.test/mail/vf-1"}'),'inquiry_forwarding_invalid');
  result := public.receive_forwarded_inquiry(second_local, '{"kind":"provider_confirmation","provider":"gmail","code":"123456789","url":"https://mail-settings.google.com/mail/vf-%5Babc%5D","requestedBy":"owner@gmail.example.test"}');
  if result->>'status' <> 'confirmation' then raise exception 'confirmation failed: %', result; end if;
  result := public.read_inquiry_forwarding(bakery,owner_id,'owner@bakery.example.test');
  if result#>>'{address,providerConfirmation,code}' <> '123456789' then raise exception 'confirmation not shown: %', result; end if;
  if (select count(*) from public.tenant_leads where workspace_id=bakery and forwarding_address_id is not null) <> 2 then raise exception 'confirmation became an inquiry'; end if;

  -- Volume: past 120 in an hour, new arrivals are held as volume.
  insert into public.tenant_leads(forwarding_address_id,tenant_slug_at_capture,workspace_id,lead_id,submission_hash,name,source,captured_at,recorded_via,intake_state)
    select (select id from public.inquiry_forwarding_addresses where local_part=second_local),'forwarded-email',bakery,'lead_fwd_' || lpad(n::text,40,'0'),
      lpad(to_hex(n),16,'a'),'Bulk','forwarded_email',clock_timestamp(),'forwarded_email','kept' from generate_series(1,120) n;
  result := public.receive_forwarded_inquiry(second_local, inquiry || jsonb_build_object('leadId','lead_fwd_' || repeat('4',40),'submissionHash','4444444444444444'));
  if result->>'status' <> 'held' or (select held_reason from public.tenant_leads where id=(result->>'id')::uuid) <> 'volume' then raise exception 'volume hold failed: %', result; end if;

  -- An agency holding the inquiries area may rotate; one that added a business awaiting its claim may issue.
  insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at)
    values (bakery,north,'inquiries','prepare','active','North may prepare inquiries.',owner_id,'24500000-0000-4000-8000-000000000003',now());
  result := public.issue_inquiry_forwarding_address(bakery,staff_id,'staff@north.example.test','fwd-dddddddddddddddddddddddd',true);
  if result#>>'{address,issuedAs}' <> 'agency' or (select agency_workspace_id from public.inquiry_forwarding_addresses where local_part='fwd-dddddddddddddddddddddddd') <> north then raise exception 'agency rotate wrong: %', result; end if;
  result := public.issue_inquiry_forwarding_address(plumber,staff_id,'staff@north.example.test','fwd-eeeeeeeeeeeeeeeeeeeeeeee',false);
  if result->>'status' <> 'issued' then raise exception 'pre-claim agency issue failed: %', result; end if;
  -- Once the plumber's owner claims, the agency needs an inquiries grant.
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values (plumber,'24500000-0000-4000-8000-000000000006','owner','24500000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error(format('select public.issue_inquiry_forwarding_address(%L,%L,%L,%L,true)',plumber,staff_id,'staff@north.example.test','fwd-ffffffffffffffffffffffff'),'inquiry_forwarding_access_denied');

  -- Revoke: nothing more is accepted and the address disappears from reads.
  result := public.revoke_inquiry_forwarding_address(bakery,owner_id,'owner@bakery.example.test',(select id from public.inquiry_forwarding_addresses where local_part='fwd-dddddddddddddddddddddddd'));
  if result#>>'{address,status}' <> 'revoked' or result#>>'{address,localPart}' is not null then raise exception 'revoke failed: %', result; end if;
  result := public.receive_forwarded_inquiry('fwd-dddddddddddddddddddddddd', inquiry || jsonb_build_object('leadId','lead_fwd_' || repeat('5',40),'submissionHash','5555555555555555'));
  if result->>'status' <> 'refused' or result->>'reason' <> 'revoked' then raise exception 'revoked address accepted: %', result; end if;
  if public.read_inquiry_forwarding(bakery,owner_id,'owner@bakery.example.test')->'address' <> 'null'::jsonb then raise exception 'revoked address still shown'; end if;
  perform pg_temp.expect_error(format('select public.revoke_inquiry_forwarding_address(%L,%L,%L,%L)',florist,florist_owner,'owner@florist.example.test',
    (select id from public.inquiry_forwarding_addresses where local_part=second_local)),'inquiry_forwarding_not_found');
end $$;

-- Service role only; app roles cannot call or read anything here.
do $$
begin
  if has_function_privilege('authenticated','public.receive_forwarded_inquiry(text,jsonb)','execute')
    or has_function_privilege('anon','public.read_inquiry_forwarding(uuid,uuid,text)','execute')
    or has_function_privilege('service_role','public.inquiry_forwarding_actor(uuid,uuid,text,boolean)','execute')
    or not has_function_privilege('service_role','public.receive_forwarded_inquiry(text,jsonb)','execute')
    or has_table_privilege('service_role','public.inquiry_forwarding_addresses','select') then
    raise exception 'inquiry forwarding grants are wrong';
  end if;
end $$;
rollback;
