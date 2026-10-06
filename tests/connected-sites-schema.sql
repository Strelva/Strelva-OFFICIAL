\set ON_ERROR_STOP on
-- Connected sites on the business record, the one lead store and the one
-- spam pit, with domain-ownership proof. Fictional local fixture only.
-- Rolled back at the end so the shared lead-store fixtures that count rows
-- stay re-runnable after it.
begin;
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected error % for %',expected,statement;
end $$;

select pg_temp.assert_true(not has_table_privilege('service_role','public.connected_sites','select'),'connected sites are reached through functions only');
select pg_temp.assert_true(not has_table_privilege('service_role','public.connected_site_events','insert'),'events are reached through functions only');
select pg_temp.assert_true(not has_function_privilege('anon','public.record_connected_site_inquiry(text,text,jsonb)','execute'),'the public write is service-role only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.create_connected_site(uuid,uuid,text,jsonb)','execute'),'creating a connection is service-role only');
select pg_temp.assert_true(has_function_privilege('service_role','public.read_connected_site_context(text)','execute'),'the context read is service-role');
select pg_temp.assert_true(not has_function_privilege('service_role','public.connected_site_for_write(text,text)','execute'),'the write gate is internal');
select pg_temp.assert_true(not has_function_privilege('service_role','public.connected_site_assert_actor(uuid,uuid,text,boolean)','execute'),'the actor check is internal');
select pg_temp.assert_true('connected_site' = any(public.system_origin_kinds()),'connected_site is a System origin');
select pg_temp.assert_true('tenant_newsletter' = any(public.system_origin_kinds()) and 'google_location' = any(public.system_origin_kinds()),'earlier origins keep their meaning');

do $$
declare
  owner_id uuid := '63000000-0000-4000-8000-000000000101';
  admin_id uuid := '63000000-0000-4000-8000-000000000102';
  member_id uuid := '63000000-0000-4000-8000-000000000103';
  other_owner uuid := '63000000-0000-4000-8000-000000000104';
  ws uuid := '63000000-0000-4000-8000-000000000110';
  other_ws uuid := '63000000-0000-4000-8000-000000000111';
  personal_ws uuid := '63000000-0000-4000-8000-000000000112';
  site jsonb; other_site jsonb; listing jsonb; result jsonb; context jsonb;
  key text := 'sk_pub_' || repeat('a',24);
  other_key text := 'sk_pub_' || repeat('b',24);
  token text := repeat('c',32);
  origin text := 'https://www.fictional-bakery.example';
  lead jsonb;
  count_before bigint;
begin
  insert into public.users(id,email,verified_at) values (owner_id,'cs-owner@example.test',now()),(admin_id,'cs-admin@example.test',now()),(member_id,'cs-member@example.test',now()),(other_owner,'cs-other@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values (ws,'customer','Fictional Bakery',owner_id),(other_ws,'customer','Other Fictional Bakery',other_owner),(personal_ws,'personal','Personal fictional',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values (ws,owner_id,'owner',owner_id),(ws,admin_id,'admin',owner_id),(ws,member_id,'member',owner_id),(other_ws,other_owner,'owner',other_owner),(personal_ws,owner_id,'owner',owner_id);

  -- Facts come from the business record; only confirmed ones are served.
  insert into public.business_records(workspace_id,created_by,updated_by) values (ws,owner_id,owner_id);
  insert into public.business_record_facts(workspace_id,fact_key,value,source,verified,updated_by) values
    (ws,'display_name','"Fictional Bakery"','owner',false,owner_id),
    (ws,'phone','"716-555-0100"','operator',false,owner_id),
    (ws,'description','"A guess the model made."','agent',false,owner_id),
    (ws,'owner_recipient','{"email":"cs-owner@example.test"}','owner',true,owner_id);
  insert into public.business_services(workspace_id,name,source,verified,created_by,updated_by) values (ws,'Custom cakes','owner',false,owner_id,owner_id),(ws,'Guessed service','agent',false,owner_id,owner_id);

  -- Create: managers only, customer businesses only, valid input only.
  perform pg_temp.expect_error(format('select public.create_connected_site(%L,%L,%L,%L)',ws,member_id,'cs-member@example.test',jsonb_build_object('publicKey',key,'verificationToken',token,'label','Bakery','siteUrl',origin||'/','siteHost','www.fictional-bakery.example','allowedOrigins',jsonb_build_array(origin))),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.create_connected_site(%L,%L,%L,%L)',ws,other_owner,'cs-other@example.test',jsonb_build_object('publicKey',key,'verificationToken',token,'label','Bakery','siteUrl',origin||'/','siteHost','www.fictional-bakery.example','allowedOrigins',jsonb_build_array(origin))),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.create_connected_site(%L,%L,%L,%L)',personal_ws,owner_id,'cs-owner@example.test',jsonb_build_object('publicKey',key,'verificationToken',token,'label','Bakery','siteUrl',origin||'/','siteHost','www.fictional-bakery.example','allowedOrigins',jsonb_build_array(origin))),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.create_connected_site(%L,%L,%L,%L)',ws,owner_id,'cs-owner@example.test',jsonb_build_object('publicKey','not-a-key','verificationToken',token,'label','Bakery','siteUrl',origin||'/','siteHost','www.fictional-bakery.example','allowedOrigins',jsonb_build_array(origin))),'connected_site_invalid');
  site := public.create_connected_site(ws,admin_id,'cs-admin@example.test',jsonb_build_object('publicKey',key,'verificationToken',token,'label','Bakery','siteUrl',origin||'/','siteHost','www.fictional-bakery.example','allowedOrigins',jsonb_build_array(origin,'https://fictional-bakery.example'),'platform','wix'));
  perform pg_temp.assert_true(site->>'verificationToken'=token and site->>'verifiedAt' is null,'a new site is unverified and its manager sees the token');

  listing := public.list_connected_sites(ws,member_id,'cs-member@example.test');
  perform pg_temp.assert_true(jsonb_array_length(listing)=1 and listing->0->>'verificationToken' is null,'a member sees the site but not the token');
  perform pg_temp.expect_error(format('select public.list_connected_sites(%L,%L,%L)',ws,other_owner,'cs-other@example.test'),'workspace_access_denied');

  -- No writes until the owner proves control of the host.
  lead := jsonb_build_object('leadId','lead_fixture_one','submissionHash','abc123','name','Pat Visitor','email','pat@example.test','message','A cake for Friday?','source','connected-site:strelva-form','capturedAt','2026-10-08T12:00:00Z','fields',jsonb_build_object('name','Pat Visitor'));
  perform pg_temp.expect_error(format('select public.record_connected_site_inquiry(%L,%L,%L)',key,origin,lead),'connected_site_not_verified');
  perform pg_temp.expect_error(format('select public.record_connected_site_events(%L,%L,%L)',key,origin,'[{"kind":"visit","occurredAt":"2026-10-08T12:00:00Z","dedupeKey":"evt-00000001"}]'),'connected_site_not_verified');
  perform pg_temp.assert_true((public.resolve_connected_site(key)->>'verified')::boolean = false,'resolve reports unverified');
  perform pg_temp.expect_error(format('select public.confirm_connected_site_verification(%L,%L,%L,%L,%L)',ws,owner_id,'cs-owner@example.test',(site->>'id')::uuid,array['something-else']),'connected_site_proof_missing');
  perform pg_temp.expect_error(format('select public.confirm_connected_site_verification(%L,%L,%L,%L,%L)',ws,member_id,'cs-member@example.test',(site->>'id')::uuid,array[token]),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.confirm_connected_site_verification(%L,%L,%L,%L,%L)',other_ws,other_owner,'cs-other@example.test',(site->>'id')::uuid,array[token]),'connected_site_not_found');
  site := public.confirm_connected_site_verification(ws,owner_id,'cs-owner@example.test',(site->>'id')::uuid,array[token]);
  perform pg_temp.assert_true(site->>'verifiedAt' is not null and site->>'verificationToken' is null,'verified with the meta token; the token is no longer shown');

  -- Another business cannot take a verified host.
  other_site := public.create_connected_site(other_ws,other_owner,'cs-other@example.test',jsonb_build_object('publicKey',other_key,'verificationToken',repeat('d',32),'label','Copycat','siteUrl',origin||'/','siteHost','www.fictional-bakery.example','allowedOrigins',jsonb_build_array(origin)));
  perform pg_temp.expect_error(format('select public.confirm_connected_site_verification(%L,%L,%L,%L,%L)',other_ws,other_owner,'cs-other@example.test',(other_site->>'id')::uuid,array[repeat('d',32)]),'connected_site_host_claimed');

  -- Writes need the verified host's Origin; no Origin is refused.
  perform pg_temp.expect_error(format('select public.record_connected_site_inquiry(%L,%L,%L)',key,null,lead),'connected_site_origin_denied');
  perform pg_temp.expect_error(format('select public.record_connected_site_inquiry(%L,%L,%L)',key,'https://evil.example',lead),'connected_site_origin_denied');
  perform pg_temp.expect_error(format('select public.record_connected_site_inquiry(%L,%L,%L)','sk_pub_'||repeat('z',24),origin,lead),'connected_site_unknown');
  result := public.record_connected_site_inquiry(key,origin,lead);
  perform pg_temp.assert_true(result->>'status'='recorded' and (result->>'workspaceId')::uuid=ws,'the inquiry is recorded for the business');
  perform pg_temp.assert_true(exists(select 1 from public.tenant_leads where connected_site_id=(site->>'id')::uuid and tenant_stable_id is null and workspace_id=ws and recorded_via='connected_site' and tenant_slug_at_capture='www.fictional-bakery.example'),'it lands in the one lead store');
  perform pg_temp.assert_true(public.record_connected_site_inquiry(key,origin,lead)->>'status'='exists','a replay is not stored twice');
  perform pg_temp.assert_true(public.record_connected_site_inquiry(key,origin,lead||'{"leadId":"lead_fixture_two","capturedAt":"2026-10-08T12:02:00Z"}')->>'status'='duplicate','a double submit is not stored twice');
  perform pg_temp.assert_true(public.record_connected_site_inquiry(key,'https://fictional-bakery.example',lead||'{"leadId":"lead_fixture_three","submissionHash":"def456"}')->>'status'='recorded','the apex twin is allowed');
  perform pg_temp.expect_error(format('select public.record_connected_site_inquiry(%L,%L,%L)',key,origin,lead||'{"leadId":"bad id"}'),'connected_site_invalid');
  perform pg_temp.expect_error('insert into public.tenant_leads(tenant_slug_at_capture,lead_id,submission_hash,name,captured_at,recorded_via) values (''x'',''lead_orphan'',''abc'',''x'',now(),''repair'')','tenant_leads_one_origin');

  perform pg_temp.assert_true(jsonb_array_length(public.read_connected_site_inquiries(ws,member_id,'cs-member@example.test',50))=2,'members read the business inquiries');
  perform pg_temp.assert_true(jsonb_array_length(public.read_connected_site_inquiries(other_ws,other_owner,'cs-other@example.test',50))=0,'another business reads none');
  perform pg_temp.expect_error(format('select public.read_connected_site_inquiries(%L,%L,%L,50)',ws,other_owner,'cs-other@example.test'),'workspace_access_denied');

  -- Held spam goes into the same pit.
  result := public.record_connected_site_spam(key,origin,'spam_fixture_one','{"name":"Buy now"}',repeat('e',64),now());
  perform pg_temp.assert_true(result->>'status'='recorded','spam is held');
  perform pg_temp.assert_true(public.record_connected_site_spam(key,origin,'spam_fixture_one','{"name":"Buy now"}',repeat('e',64),now())->>'status'='exists','held spam is not stored twice');
  perform pg_temp.assert_true(exists(select 1 from public.tenant_client_records where connected_site_id=(site->>'id')::uuid and store='spam_held' and tenant_stable_id is null and workspace_id=ws),'held spam sits in tenant_client_records');
  perform pg_temp.expect_error(format('insert into public.tenant_client_records(connected_site_id,workspace_id,store,record_id,payload,payload_hash,captured_at,recorded_via) values (%L,%L,''inquiry_reply'',''x'',''{}'',%L,now(),''connected_site'')',(site->>'id')::uuid,ws,repeat('f',64)),'tenant_client_records_connected_spam_only');

  -- Events: deduplicated, append-only.
  perform pg_temp.assert_true(public.record_connected_site_events(key,origin,'[{"kind":"visit","occurredAt":"2026-10-08T12:00:00Z","dedupeKey":"evt-00000001","pagePath":"/"},{"kind":"call_click","occurredAt":"2026-10-08T12:01:00Z","dedupeKey":"evt-00000002","target":"tel:7165550100"}]')=2,'two events recorded');
  perform pg_temp.assert_true(public.record_connected_site_events(key,origin,'[{"kind":"visit","occurredAt":"2026-10-08T12:00:00Z","dedupeKey":"evt-00000001"}]')=0,'a replayed event is not stored twice');
  perform pg_temp.expect_error(format('select public.record_connected_site_events(%L,%L,%L)',key,origin,'[{"kind":"booking","occurredAt":"2026-10-08T12:00:00Z","dedupeKey":"evt-00000003"}]'),'connected_site_invalid');
  perform pg_temp.expect_error(format('select public.record_connected_site_events(%L,%L,%L)',key,origin,'[]'),'connected_site_invalid');
  perform pg_temp.expect_error('update public.connected_site_events set target=null','connected_site_event_immutable');
  perform pg_temp.expect_error('delete from public.connected_site_events','connected_site_event_immutable');
  perform pg_temp.assert_true((public.read_connected_site_activity(ws,member_id,'cs-member@example.test',30)->(site->>'id')->>'visit')::int=1,'activity counts by kind');
  perform pg_temp.assert_true((select last_event_at is not null and first_event_at is not null from public.connected_sites where id=(site->>'id')::uuid),'the site is reporting');

  -- Public context: confirmed facts and services only; never the owner recipient.
  context := public.read_connected_site_context(key);
  perform pg_temp.assert_true(context->'facts'->>'display_name'='Fictional Bakery' and context->'facts'->>'phone'='716-555-0100','owner and operator facts are served');
  perform pg_temp.assert_true(not (context->'facts' ? 'description') and not (context->'facts' ? 'owner_recipient'),'model guesses and the owner recipient are not served');
  perform pg_temp.assert_true(jsonb_array_length(context->'services')=1 and context->'services'->0->>'name'='Custom cakes','only confirmed services are served');
  perform pg_temp.assert_true(public.read_connected_site_context('sk_pub_'||repeat('z',24)) is null,'an unknown key reads nothing');

  -- Update and revoke.
  site := public.update_connected_site(ws,admin_id,'cs-admin@example.test',(site->>'id')::uuid,'{"label":"Bakery site","captureForms":false}');
  perform pg_temp.assert_true(site->>'label'='Bakery site' and (site->>'captureForms')::boolean=false,'managers update settings');
  perform pg_temp.expect_error(format('select public.update_connected_site(%L,%L,%L,%L,%L)',ws,admin_id,'cs-admin@example.test',(site->>'id')::uuid,'{"siteHost":"evil.example"}'),'connected_site_invalid');
  perform pg_temp.expect_error(format('select public.update_connected_site(%L,%L,%L,%L,%L)',ws,member_id,'cs-member@example.test',(site->>'id')::uuid,'{"label":"x"}'),'workspace_access_denied');
  perform public.revoke_connected_site(ws,owner_id,'cs-owner@example.test',(site->>'id')::uuid);
  perform pg_temp.assert_true(public.resolve_connected_site(key) is null,'a revoked key resolves to nothing');
  perform pg_temp.expect_error(format('select public.record_connected_site_inquiry(%L,%L,%L)',key,origin,lead||'{"leadId":"lead_fixture_four","submissionHash":"ghi789"}'),'connected_site_unknown');
  perform pg_temp.assert_true(jsonb_array_length(public.read_connected_site_inquiries(ws,owner_id,'cs-owner@example.test',50))=2,'revoking keeps the inquiries');
  -- A revoked host can be proven by another business.
  other_site := public.confirm_connected_site_verification(other_ws,other_owner,'cs-other@example.test',(other_site->>'id')::uuid,array[other_key]);
  perform pg_temp.assert_true(other_site->>'verifiedAt' is not null,'the site key on the page also proves control');

  -- Retention: events after 400 days, held spam after 30; inquiries stay.
  update public.tenant_client_records set captured_at=now()-interval '31 days' where connected_site_id=(site->>'id')::uuid;
  insert into public.connected_site_events(business_workspace_id,site_id,kind,occurred_at,received_at,dedupe_key)
    values (ws,(site->>'id')::uuid,'visit',now()-interval '401 days',now()-interval '401 days','evt-old-00000001');
  select count(*) into count_before from public.tenant_leads where connected_site_id=(site->>'id')::uuid;
  result := public.purge_connected_site_records(100);
  perform pg_temp.assert_true((result->>'events')::int=1 and (result->>'spam')::int=1,'old events and old spam are purged');
  perform pg_temp.assert_true((select count(*) from public.tenant_leads where connected_site_id=(site->>'id')::uuid)=count_before,'inquiries are kept');
  perform pg_temp.expect_error('delete from public.connected_site_events','connected_site_event_immutable');
  perform pg_temp.assert_true((select count(*) from public.connected_site_events where site_id=(site->>'id')::uuid)=2,'recent events are kept');
end $$;
rollback;
