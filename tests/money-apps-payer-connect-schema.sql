\set ON_ERROR_STOP on
-- Native joint payer/provider handoff on fictional identities. No rates or prices
-- are introduced. Both response policies below are local fixture-only choices;
-- every row is rolled back. Run before any fixture that commits a notice policy.
begin;
create function pg_temp.mpc_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'joint payer/provider assertion: %',label; end if; end $$;
create function pg_temp.mpc_expect(q text,expected text) returns void language plpgsql as $$
begin
 begin execute q;
 exception when others then
  if sqlstate='P0001' and sqlerrm=expected then return; end if;
  raise exception 'Expected %, got % %',expected,sqlstate,sqlerrm;
 end;
 raise exception 'Expected % but native command succeeded: %',expected,q;
end $$;
create function pg_temp.mpc_payer(command jsonb,actor uuid,email text) returns public.workspace_payer_transitions language sql as $$
 select * from public.workspace_payer_transition_command(command,actor,email)
$$;
create function pg_temp.mpc_propose(agency uuid) returns public.workspace_payer_transitions language sql as $$
 select pg_temp.mpc_payer(jsonb_build_object('action','propose','workspaceId','d2940000-0000-4000-8000-000000000010','successorAgencyWorkspaceId',agency),'d2940000-0000-4000-8000-000000000001','joint-owner@example.test')
$$;
create function pg_temp.mpc_accept(transition uuid,actor uuid,email text) returns public.workspace_payer_transitions language sql as $$
 select pg_temp.mpc_payer(jsonb_build_object('action','accept','transitionId',transition),actor,email)
$$;
create function pg_temp.mpc_request(transition uuid,key text,agency uuid default 'd2940000-0000-4000-8000-000000000021') returns jsonb language sql as $$
 select public.request_provider_change('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test',agency,key,transition)
$$;
create function pg_temp.mpc_complete(request uuid) returns jsonb language sql as $$
 select public.complete_provider_change(request,'d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test')
$$;
select pg_temp.mpc_assert(not exists(select 1 from public.provider_change_policy),'no production/default notice window is assumed');
insert into public.users(id,email,verified_at) values
 ('d2940000-0000-4000-8000-000000000001','joint-owner@example.test',now()),
 ('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test',now()),
 ('d2940000-0000-4000-8000-000000000003','joint-old-agency@example.test',now()),
 ('d2940000-0000-4000-8000-000000000004','joint-new-agency-owner@example.test',now()),
 ('d2940000-0000-4000-8000-000000000005','joint-new-agency-admin@example.test',now()),
 ('d2940000-0000-4000-8000-000000000006','joint-other-agency@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('d2940000-0000-4000-8000-000000000010','customer','Joint handoff business','d2940000-0000-4000-8000-000000000001'),
 ('d2940000-0000-4000-8000-000000000011','customer','Other joint business','d2940000-0000-4000-8000-000000000002'),
 ('d2940000-0000-4000-8000-000000000020','agency','Outgoing joint agency','d2940000-0000-4000-8000-000000000003'),
 ('d2940000-0000-4000-8000-000000000021','agency','Incoming joint agency','d2940000-0000-4000-8000-000000000004'),
 ('d2940000-0000-4000-8000-000000000022','agency','Other joint agency','d2940000-0000-4000-8000-000000000006');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000001','owner','d2940000-0000-4000-8000-000000000001'),
 ('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000002','owner','d2940000-0000-4000-8000-000000000001'),
 ('d2940000-0000-4000-8000-000000000011','d2940000-0000-4000-8000-000000000002','owner','d2940000-0000-4000-8000-000000000002'),
 ('d2940000-0000-4000-8000-000000000020','d2940000-0000-4000-8000-000000000003','owner','d2940000-0000-4000-8000-000000000003'),
 ('d2940000-0000-4000-8000-000000000021','d2940000-0000-4000-8000-000000000004','owner','d2940000-0000-4000-8000-000000000004'),
 ('d2940000-0000-4000-8000-000000000021','d2940000-0000-4000-8000-000000000005','admin','d2940000-0000-4000-8000-000000000004'),
 ('d2940000-0000-4000-8000-000000000022','d2940000-0000-4000-8000-000000000006','owner','d2940000-0000-4000-8000-000000000006');
insert into public.accounts(id,name,workspace_id,billing_type,stripe_customer_id) values
 ('d2940000-0000-4000-8000-000000000030','Joint billing home','d2940000-0000-4000-8000-000000000010','subscription','cus_JointFictionalPayer');
insert into public.tenants(id,stable_id,site_name,active,account_id,subscription_status) values
 ('joint-payer-provider','d2940000-0000-4000-8000-000000000031','Joint fictional live site',true,'d2940000-0000-4000-8000-000000000030','active');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
 ('d2940000-0000-4000-8000-000000000031','joint-payer-provider','d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000001','d2940000-0000-4000-8000-000000000032',repeat('a',64),'{}');
create temporary table mpc_initial_provider as select public.choose_business_provider('d2940000-0000-4000-8000-000000000001','joint-owner@example.test','d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000020') body;
create temporary table mpc_transitions(name text primary key,id uuid);
insert into mpc_transitions values('old-agency',(pg_temp.mpc_propose('d2940000-0000-4000-8000-000000000021')).id);
select pg_temp.mpc_accept((select id from mpc_transitions where name='old-agency'),'d2940000-0000-4000-8000-000000000004','joint-new-agency-owner@example.test');
insert into mpc_transitions values('middle-business',(pg_temp.mpc_payer('{"action":"propose","workspaceId":"d2940000-0000-4000-8000-000000000010","successorKind":"business"}','d2940000-0000-4000-8000-000000000001','joint-owner@example.test')).id);
select pg_temp.mpc_accept((select id from mpc_transitions where name='middle-business'),'d2940000-0000-4000-8000-000000000001','joint-owner@example.test');
insert into mpc_transitions values('current-agency',(pg_temp.mpc_propose('d2940000-0000-4000-8000-000000000021')).id);
select pg_temp.mpc_expect(format('select pg_temp.mpc_request(%L,''unaccepted-provider-request'')',(select id from mpc_transitions where name='current-agency')),'provider_payer_transition_mismatch');
select pg_temp.mpc_assert(not exists(select 1 from public.provider_change_requests where business_workspace_id='d2940000-0000-4000-8000-000000000010'),'unaccepted payer schedules nothing');
select pg_temp.mpc_accept((select id from mpc_transitions where name='current-agency'),'d2940000-0000-4000-8000-000000000005','joint-new-agency-admin@example.test');
select pg_temp.mpc_assert((select payer_kind='agency' and payer_workspace_id='d2940000-0000-4000-8000-000000000021' from public.accounts where id='d2940000-0000-4000-8000-000000000030'),'native accepted payer updates billing home');
select pg_temp.mpc_assert(not exists(select 1 from public.workspace_memberships where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id in('d2940000-0000-4000-8000-000000000004','d2940000-0000-4000-8000-000000000005')),'payer acceptance creates no client membership');
select pg_temp.mpc_expect(format('select pg_temp.mpc_request(%L,''stale-provider-request'')',(select id from mpc_transitions where name='old-agency')),'provider_payer_transition_mismatch');
select pg_temp.mpc_expect(format('select pg_temp.mpc_request(%L,''wrong-agency-provider-request'',''d2940000-0000-4000-8000-000000000022'')',(select id from mpc_transitions where name='current-agency')),'provider_payer_transition_mismatch');
select pg_temp.mpc_expect(format('select public.request_provider_change(''d2940000-0000-4000-8000-000000000011'',''d2940000-0000-4000-8000-000000000002'',''joint-co-owner@example.test'',''d2940000-0000-4000-8000-000000000021'',''wrong-business-provider-request'',%L)',(select id from mpc_transitions where name='current-agency')),'provider_payer_transition_mismatch');
-- Both accepted parties must retain current roles and verified identities.
update public.workspace_memberships set role='member' where workspace_id='d2940000-0000-4000-8000-000000000021' and user_id='d2940000-0000-4000-8000-000000000005';
select pg_temp.mpc_expect(format('select pg_temp.mpc_request(%L,''lost-successor-request'')',(select id from mpc_transitions where name='current-agency')),'provider_payer_successor_authority_lost');
update public.workspace_memberships set role='admin' where workspace_id='d2940000-0000-4000-8000-000000000021' and user_id='d2940000-0000-4000-8000-000000000005';
update public.workspace_memberships set role='admin' where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id='d2940000-0000-4000-8000-000000000001';
select pg_temp.mpc_expect(format('select pg_temp.mpc_request(%L,''lost-proposer-request'')',(select id from mpc_transitions where name='current-agency')),'provider_payer_proposer_authority_lost');
update public.workspace_memberships set role='owner' where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id='d2940000-0000-4000-8000-000000000001';
update public.users set verified_at=null where id='d2940000-0000-4000-8000-000000000001';
select pg_temp.mpc_expect(format('select pg_temp.mpc_request(%L,''unverified-proposer-request'')',(select id from mpc_transitions where name='current-agency')),'provider_payer_proposer_authority_lost');
update public.users set verified_at=now() where id='d2940000-0000-4000-8000-000000000001';
update public.users set verified_at=null where id='d2940000-0000-4000-8000-000000000005';
select pg_temp.mpc_expect(format('select pg_temp.mpc_request(%L,''unverified-successor-request'')',(select id from mpc_transitions where name='current-agency')),'provider_payer_successor_authority_lost');
update public.users set verified_at=now() where id='d2940000-0000-4000-8000-000000000005';
create temporary table mpc_before as select to_jsonb(a) billing,(select to_jsonb(t) from public.tenants t where id='joint-payer-provider') site,(select to_jsonb(p) from public.workspace_providers p where id=(select (body->>'providerId')::uuid from mpc_initial_provider)) provider from public.accounts a where id='d2940000-0000-4000-8000-000000000030';
create temporary table mpc_request as select pg_temp.mpc_request((select id from mpc_transitions where name='current-agency'),'joint-accepted-provider-request') body;
select pg_temp.mpc_assert((select body->>'status'='awaiting_policy' and body->>'respond_by' is null and body->>'payerTransitionId'=(select id::text from mpc_transitions where name='current-agency') from mpc_request),'accepted payer binds chosen provider request while policy stays undecided');
select pg_temp.mpc_assert(pg_temp.mpc_request((select id from mpc_transitions where name='current-agency'),'joint-accepted-provider-request')->>'id'=(select body->>'id' from mpc_request),'same immutable accepted link replays');
select pg_temp.mpc_expect($q$select pg_temp.mpc_request(null,'joint-accepted-provider-request')$q$,'provider_payer_transition_conflict');
select pg_temp.mpc_expect(format('select pg_temp.mpc_request(%L,''joint-accepted-provider-request'')',(select id from mpc_transitions where name='old-agency')),'provider_payer_transition_conflict');
select pg_temp.mpc_expect(format('select pg_temp.mpc_complete(%L)',(select body->>'id' from mpc_request)),'provider_response_window_open');
select pg_temp.mpc_expect($q$select public.choose_business_provider('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test','d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000021')$q$,'provider_change_required');
select pg_temp.mpc_expect($q$select public.end_business_provider('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test','d2940000-0000-4000-8000-000000000010','Awaiting-policy bypass attempt')$q$,'provider_change_completion_required');
select pg_temp.mpc_expect(format('select public.acknowledge_provider_change_notice(%L,''d2940000-0000-4000-8000-000000000003'',''joint-old-agency@example.test'')',(select body->>'id' from mpc_request)),'provider_change_policy_required');
select pg_temp.mpc_assert((select to_jsonb(a)=b.billing and (select to_jsonb(t) from public.tenants t where id='joint-payer-provider')=b.site and (select to_jsonb(p) from public.workspace_providers p where id=(select (body->>'providerId')::uuid from mpc_initial_provider))=b.provider from public.accounts a cross join mpc_before b where a.id='d2940000-0000-4000-8000-000000000030'),'missing policy preserves current attribution, billing terms and live site/status');
select pg_temp.mpc_assert(exists(select 1 from public.agency_handoff_receipts where kind='change_requested' and reference_id=(select (body->>'id')::uuid from mpc_request) and agency_workspace_id='d2940000-0000-4000-8000-000000000020') and not exists(select 1 from public.provider_change_responses where request_id=(select (body->>'id')::uuid from mpc_request)),'queued notice is durable without claiming actual agency response');
savepoint linked_cancellation;
select pg_temp.mpc_assert(public.cancel_provider_change((select (body->>'id')::uuid from mpc_request),'d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test')->>'status'='cancelled','linked accepted payer request can be recovered without reversing payer');
select pg_temp.mpc_assert((select to_jsonb(a)=b.billing and (select to_jsonb(t) from public.tenants t where id='joint-payer-provider')=b.site and (select to_jsonb(p) from public.workspace_providers p where id=(select (body->>'providerId')::uuid from mpc_initial_provider))=b.provider from public.accounts a cross join mpc_before b where a.id='d2940000-0000-4000-8000-000000000030'),'linked cancellation preserves accepted billing, provider and site');
rollback to linked_cancellation;
-- A real fixture-only positive window blocks completion until its clock ends.
savepoint positive_window;
insert into public.provider_change_policy(version,response_window_seconds,approved_by,approved_at) values('fictional-joint-sixty-seconds',60,'d2940000-0000-4000-8000-000000000002',now());
select public.acknowledge_provider_change_notice((select (body->>'id')::uuid from mpc_request),'d2940000-0000-4000-8000-000000000003','joint-old-agency@example.test');
select pg_temp.mpc_expect(format('select public.cancel_provider_change(%L,''d2940000-0000-4000-8000-000000000002'',''joint-co-owner@example.test'')',(select body->>'id' from mpc_request)),'provider_change_stale');
select pg_temp.mpc_expect(format('select pg_temp.mpc_complete(%L)',(select body->>'id' from mpc_request)),'provider_response_window_open');
rollback to positive_window;
-- Zero is another explicit test choice, never an application/default policy.
insert into public.provider_change_policy(version,response_window_seconds,approved_by,approved_at) values('fictional-joint-zero-seconds',0,'d2940000-0000-4000-8000-000000000002',now());
select pg_temp.mpc_expect($q$select public.choose_business_provider('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test','d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000021')$q$,'provider_change_required');
select pg_temp.mpc_expect($q$select public.end_business_provider('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test','d2940000-0000-4000-8000-000000000010','Bypass attempt')$q$,'provider_change_completion_required');
select pg_temp.mpc_expect(format('select public.acknowledge_provider_change_notice(%L,''d2940000-0000-4000-8000-000000000004'',''joint-new-agency-owner@example.test'')',(select body->>'id' from mpc_request)),'connect_denied');
select pg_temp.mpc_expect(format('select public.acknowledge_provider_change_notice(%L,''d2940000-0000-4000-8000-000000000003'',''wrong@example.test'')',(select body->>'id' from mpc_request)),'connect_denied');
update public.users set verified_at=null where id='d2940000-0000-4000-8000-000000000003';
select pg_temp.mpc_expect(format('select public.acknowledge_provider_change_notice(%L,''d2940000-0000-4000-8000-000000000003'',''joint-old-agency@example.test'')',(select body->>'id' from mpc_request)),'connect_denied');
update public.users set verified_at=now() where id='d2940000-0000-4000-8000-000000000003';
select public.acknowledge_provider_change_notice((select (body->>'id')::uuid from mpc_request),'d2940000-0000-4000-8000-000000000003','joint-old-agency@example.test');
select public.acknowledge_provider_change_notice((select (body->>'id')::uuid from mpc_request),'d2940000-0000-4000-8000-000000000003','joint-old-agency@example.test');
select pg_temp.mpc_assert((select count(*)=1 from public.provider_change_responses where request_id=(select (body->>'id')::uuid from mpc_request) and agency_workspace_id='d2940000-0000-4000-8000-000000000020' and kind='acknowledged' and responded_by='d2940000-0000-4000-8000-000000000003'),'actual notice acknowledgement records exact outgoing agency once');
select pg_temp.mpc_expect(format('select public.respond_provider_change(%L,''d2940000-0000-4000-8000-000000000004'',''joint-new-agency-owner@example.test'',''handoff_ready'',''Incoming agency cannot answer for outgoing'',''joint-wrong-responder'')',(select body->>'id' from mpc_request)),'connect_denied');
select public.respond_provider_change((select (body->>'id')::uuid from mpc_request),'d2940000-0000-4000-8000-000000000003','joint-old-agency@example.test','handoff_ready','Prepared the handoff; original billing terms remain unchanged.','joint-handoff-ready');
select public.respond_provider_change((select (body->>'id')::uuid from mpc_request),'d2940000-0000-4000-8000-000000000003','joint-old-agency@example.test','handoff_ready','Prepared the handoff; original billing terms remain unchanged.','joint-handoff-ready');
select pg_temp.mpc_expect(format('select public.respond_provider_change(%L,''d2940000-0000-4000-8000-000000000003'',''joint-old-agency@example.test'',''objection'',''Changed response'',''joint-handoff-ready'')',(select body->>'id' from mpc_request)),'provider_response_conflict');
select pg_temp.mpc_assert((select count(*)=2 from public.provider_change_responses where request_id=(select (body->>'id')::uuid from mpc_request)),'response replay preserves exact immutable note/kind');
select pg_temp.mpc_assert(public.read_provider_change_requests('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test')->0->'responses' @> '[{"kind":"handoff_ready"}]'::jsonb,'business owner reads actual response');
-- Current acceptance is revalidated at completion, after request/notice.
select pg_temp.mpc_expect(format('select public.complete_provider_change(%L,''d2940000-0000-4000-8000-000000000005'',''joint-new-agency-admin@example.test'')',(select body->>'id' from mpc_request)),'provider_seat_owner_required');
savepoint stale_completion;
select pg_temp.mpc_accept((pg_temp.mpc_payer('{"action":"propose","workspaceId":"d2940000-0000-4000-8000-000000000010","successorKind":"business"}','d2940000-0000-4000-8000-000000000001','joint-owner@example.test')).id,'d2940000-0000-4000-8000-000000000001','joint-owner@example.test');
select pg_temp.mpc_expect(format('select pg_temp.mpc_complete(%L)',(select body->>'id' from mpc_request)),'provider_payer_transition_mismatch');
rollback to stale_completion;
update public.workspace_memberships set role='member' where workspace_id='d2940000-0000-4000-8000-000000000021' and user_id='d2940000-0000-4000-8000-000000000005';
select pg_temp.mpc_expect(format('select pg_temp.mpc_complete(%L)',(select body->>'id' from mpc_request)),'provider_payer_successor_authority_lost');
update public.workspace_memberships set role='admin' where workspace_id='d2940000-0000-4000-8000-000000000021' and user_id='d2940000-0000-4000-8000-000000000005';
update public.workspace_memberships set role='admin' where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id='d2940000-0000-4000-8000-000000000001';
select pg_temp.mpc_expect(format('select pg_temp.mpc_complete(%L)',(select body->>'id' from mpc_request)),'provider_payer_proposer_authority_lost');
update public.workspace_memberships set role='owner' where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id='d2940000-0000-4000-8000-000000000001';
update public.users set verified_at=null where id='d2940000-0000-4000-8000-000000000005';
select pg_temp.mpc_expect(format('select pg_temp.mpc_complete(%L)',(select body->>'id' from mpc_request)),'provider_payer_successor_authority_lost');
update public.users set verified_at=now() where id='d2940000-0000-4000-8000-000000000005';
update public.users set verified_at=null where id='d2940000-0000-4000-8000-000000000001';
select pg_temp.mpc_expect(format('select pg_temp.mpc_complete(%L)',(select body->>'id' from mpc_request)),'provider_payer_proposer_authority_lost');
update public.users set verified_at=now() where id='d2940000-0000-4000-8000-000000000001';
select pg_temp.mpc_assert((select status='notified' from public.provider_change_requests where id=(select (body->>'id')::uuid from mpc_request)) and exists(select 1 from public.workspace_providers where id=(select (body->>'providerId')::uuid from mpc_initial_provider) and status='active'),'all denied completion paths leave notice and attribution intact');
select pg_temp.mpc_complete((select (body->>'id')::uuid from mpc_request));
select pg_temp.mpc_complete((select (body->>'id')::uuid from mpc_request));
select pg_temp.mpc_assert((select status='completed' and payer_transition_id=(select id from mpc_transitions where name='current-agency') from public.provider_change_requests where id=(select (body->>'id')::uuid from mpc_request)),'completed provider request retains exact accepted payer link');
select pg_temp.mpc_assert((select count(*)=1 and bool_and(provider_workspace_id='d2940000-0000-4000-8000-000000000021') from public.workspace_providers where customer_workspace_id='d2940000-0000-4000-8000-000000000010' and status='active') and exists(select 1 from public.workspace_providers where id=(select (body->>'providerId')::uuid from mpc_initial_provider) and status='ended'),'exact incoming provider replaces outgoing attribution once');
select pg_temp.mpc_assert((select status='ended' from public.provider_seats where customer_workspace_id='d2940000-0000-4000-8000-000000000010' and agency_workspace_id='d2940000-0000-4000-8000-000000000020') and exists(select 1 from public.provider_seats where customer_workspace_id='d2940000-0000-4000-8000-000000000010' and agency_workspace_id='d2940000-0000-4000-8000-000000000021' and status='active'),'native provider-seat authority follows completion');
select pg_temp.mpc_assert((select to_jsonb(a)=b.billing and (select to_jsonb(t) from public.tenants t where id='joint-payer-provider')=b.site from public.accounts a cross join mpc_before b where a.id='d2940000-0000-4000-8000-000000000030'),'completed handoff preserves accepted payer billing terms and live site/status');
select pg_temp.mpc_assert(exists(select 1 from public.agency_handoff_receipts where kind='provider_ended' and reference_id=(select (body->>'providerId')::uuid from mpc_initial_provider) and agency_workspace_id='d2940000-0000-4000-8000-000000000020') and exists(select 1 from public.agency_package_handoffs where provider_id=(select (body->>'providerId')::uuid from mpc_initial_provider)),'outgoing agency has durable end receipt and definition-only handoff');
select pg_temp.mpc_expect(format('select public.cancel_provider_change(%L,''d2940000-0000-4000-8000-000000000002'',''joint-co-owner@example.test'')',(select body->>'id' from mpc_request)),'provider_change_stale');
select pg_temp.mpc_expect(format('select public.respond_provider_change(%L,''d2940000-0000-4000-8000-000000000003'',''joint-old-agency@example.test'',''question'',''Late reply'',''joint-late-reply'')',(select body->>'id' from mpc_request)),'provider_response_window_closed');
select pg_temp.mpc_assert(not has_table_privilege('service_role','public.provider_change_responses','SELECT') and not has_function_privilege('authenticated','public.respond_provider_change(uuid,uuid,text,text,text,text)','EXECUTE') and not has_function_privilege('service_role','public.request_provider_change_without_payer(uuid,uuid,text,uuid,text)','EXECUTE') and not has_function_privilege('service_role','public.complete_provider_change_without_payer(uuid,uuid,text)','EXECUTE'),'public response and handoff entry points cannot bypass authority');
rollback;
\echo 'Joint native payer acceptance/provider handoff, current party authority, actual notice/response and undecided policy contracts passed.'
