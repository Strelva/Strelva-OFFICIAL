begin;
create function pg_temp.ao6_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'w6 agency overview: %',label; end if; end $$;
create function pg_temp.ao6_expect(q text, message text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if position(message in sqlerrm)>0 then return; end if; raise;
  end;
  raise exception 'expected %',message;
end $$;

insert into public.users(id,email,verified_at) values
 ('ad600000-0000-4000-8000-000000000001','overview-operator@example.test',now()),
 ('ad600000-0000-4000-8000-000000000002','overview-owner@example.test',now()),
 ('ad600000-0000-4000-8000-000000000003','overview-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ad600000-0000-4000-8000-000000000010','agency','Fixture agency','ad600000-0000-4000-8000-000000000001'),
 ('ad600000-0000-4000-8000-000000000011','customer','Fixture business','ad600000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ad600000-0000-4000-8000-000000000010','ad600000-0000-4000-8000-000000000001','owner','ad600000-0000-4000-8000-000000000001'),
 ('ad600000-0000-4000-8000-000000000011','ad600000-0000-4000-8000-000000000001','admin','ad600000-0000-4000-8000-000000000002'),
 ('ad600000-0000-4000-8000-000000000011','ad600000-0000-4000-8000-000000000002','owner','ad600000-0000-4000-8000-000000000002');
insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by) values
 ('ad600000-0000-4000-8000-000000000011','ad600000-0000-4000-8000-000000000010','operator','ad600000-0000-4000-8000-000000000002');
insert into public.owner_decisions(id,workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,
 revision_hash,sign_in_required,delivery_state,opened_at,expires_at) values
 ('ad600000-0000-4000-8000-000000000020','ad600000-0000-4000-8000-000000000011','system.go_live','owner_decides','Booking flow','Publish','Stay draft','version_release','fixture',repeat('a',64),false,'bounced',now()-interval '3 days',now()+interval '11 days'),
 ('ad600000-0000-4000-8000-000000000021','ad600000-0000-4000-8000-000000000011','copy.routine','strelva_reviews','Operator copy','Apply','Wait','content','operator-copy',repeat('b',64),false,'not_sent',now()-interval '5 days',now()+interval '9 days');
insert into public.google_listing_receipts(workspace_id,location_id,action,status,authority,readback,idempotency_key,completed_at) values
 ('ad600000-0000-4000-8000-000000000011','fixture','hours_patch','posted','{"kind":"operator_instruction"}','matched','overview-fixture',now());

select pg_temp.ao6_assert(not has_function_privilege('authenticated','public.agency_client_overview_v2(uuid,uuid,text,uuid,integer)','EXECUTE'),'authenticated cannot call the service RPC');
select pg_temp.ao6_expect($q$select public.agency_client_overview_v2('ad600000-0000-4000-8000-000000000010','ad600000-0000-4000-8000-000000000003','overview-stranger@example.test',null,100)$q$,'business_record_access_denied');
do $$ declare old jsonb; upgraded jsonb; row jsonb; begin
 old:=public.agency_client_overview('ad600000-0000-4000-8000-000000000010','ad600000-0000-4000-8000-000000000001','overview-operator@example.test',null,100);
 upgraded:=public.agency_client_overview_v2('ad600000-0000-4000-8000-000000000010','ad600000-0000-4000-8000-000000000001','overview-operator@example.test',null,100);
 row:=upgraded->'clients'->0;
 perform pg_temp.ao6_assert(old->'clients'->0->'needsYou'->>'count'='0','flags-off old projection is unchanged');
 perform pg_temp.ao6_assert(row->'needsYou'->>'count'='1','only real owner decisions count, not operator review');
 perform pg_temp.ao6_assert((row->'needsYou'->>'oldestAt')::timestamptz=date_trunc('milliseconds',now()-interval '3 days'),'oldest wait reads the real decision opening at the projection timestamp precision');
 perform pg_temp.ao6_assert(row->>'lastReceiptAt' is not null,'Google receipt appears in the client summary');
 perform pg_temp.ao6_assert(jsonb_array_length(upgraded->'queue')=1 and upgraded->'queue'->0->>'kind'='owner_email','one bounced owner decision is visible');
 perform pg_temp.ao6_assert(upgraded->'queue'->0->>'title'='Owner email bounced: Booking flow','bounced email is named');
 perform pg_temp.ao6_assert(upgraded->'clients'->0->'systems'=old->'clients'->0->'systems','System access is exactly the original scope');
end $$;

-- Provider rows never grant access and decision details disappear on revocation.
delete from public.workspace_memberships where workspace_id='ad600000-0000-4000-8000-000000000011' and user_id='ad600000-0000-4000-8000-000000000001';
select pg_temp.ao6_assert(jsonb_array_length(public.agency_client_overview_v2('ad600000-0000-4000-8000-000000000010','ad600000-0000-4000-8000-000000000001','overview-operator@example.test',null,100)->'clients')=0,'provider alone does not disclose decisions or receipts');
rollback;
