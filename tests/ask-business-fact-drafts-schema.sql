\set ON_ERROR_STOP on
begin;
create function pg_temp.ask_assert(value boolean, message text) returns void language plpgsql as $$
begin if value is not true then raise exception 'Ask draft assertion failed: %',message; end if; end;
$$;
create function pg_temp.ask_expect(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlerrm <> expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
 end;
 raise exception 'expected failure %, query succeeded',expected;
end;
$$;
insert into public.users(id,email,verified_at) values
 ('ad000000-0000-4000-8000-000000000001','ask-owner@example.test',now()),
 ('ad000000-0000-4000-8000-000000000002','ask-member@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ad000000-0000-4000-8000-000000000010','customer','Ask Fictional Bakery','ad000000-0000-4000-8000-000000000001'),
 ('ad000000-0000-4000-8000-000000000011','customer','Ask Other Business','ad000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000001','owner','ad000000-0000-4000-8000-000000000001'),
 ('ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000001','owner','ad000000-0000-4000-8000-000000000001'),
 ('ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000002','member','ad000000-0000-4000-8000-000000000001');
select pg_temp.ask_assert(not has_function_privilege('authenticated','public.resolve_ask_business_draft(uuid,uuid,text,uuid,text)','EXECUTE')
 and not has_table_privilege('service_role','public.ask_business_record_drafts','UPDATE'),'source only reachable through checked RPC');
do $$
declare d jsonb; second jsonb; result jsonb; ws uuid := 'ad000000-0000-4000-8000-000000000010'; owner_id uuid := 'ad000000-0000-4000-8000-000000000001'; member_id uuid := 'ad000000-0000-4000-8000-000000000002';
begin
 d := public.save_ask_business_draft(ws,member_id,'ask-member@example.test',null,0,'{"facts":{"display_name":{"value":"Fictional Bakery"}}}', 'Change business name','ask-test-1');
 perform pg_temp.ask_assert(d->'patch'='{"facts":{"display_name":{"value":"Fictional Bakery"}}}'::jsonb and (d->>'expectedRevision')::int=0,'persist exact typed patch and baseline');
 perform pg_temp.ask_assert(not exists(select 1 from public.business_record_facts where workspace_id=ws),'draft does not mutate record');
 perform pg_temp.ask_assert(public.save_ask_business_draft(ws,member_id,'ask-member@example.test',null,0,'{"facts":{"display_name":{"value":"Fictional Bakery"}}}', 'Change business name','ask-test-1')->>'id'=d->>'id','idempotent draft retry');
 perform pg_temp.ask_expect(format('select public.resolve_ask_business_draft(%L,%L,%L,%L,%L)',ws,member_id,'ask-member@example.test',d->>'id','approve'),'business_record_access_denied');
 perform pg_temp.ask_expect(format('select public.resolve_ask_business_draft(%L,%L,%L,%L,%L)','ad000000-0000-4000-8000-000000000011',owner_id,'ask-owner@example.test',d->>'id','approve'),'business_record_entity_not_found');
 result := public.resolve_ask_business_draft(ws,owner_id,'ask-owner@example.test',(d->>'id')::uuid,'approve');
 perform pg_temp.ask_assert(result->>'status'='approved' and (result->'receipt'->>'sequence')::int=1,'real business writer receipt ID');
 perform pg_temp.ask_assert((select value='"Fictional Bakery"'::jsonb from public.business_record_facts where workspace_id=ws and fact_key='display_name'),'approval applies saved patch');
 perform pg_temp.ask_assert(public.resolve_ask_business_draft(ws,owner_id,'ask-owner@example.test',(d->>'id')::uuid,'approve')=result,'decision replay never repeats record write');
 second := public.save_ask_business_draft(ws,owner_id,'ask-owner@example.test',null,1,'{"facts":{"display_name":{"value":"Old draft"}}}', 'Stale name','ask-test-2');
 perform public.patch_business_record(ws,owner_id,'ask-owner@example.test','owner',1,'{"facts":{"display_name":{"value":"New direct change"}}}','ad000000-0000-4000-8000-000000000099',repeat('a',64));
 perform pg_temp.ask_expect(format('select public.resolve_ask_business_draft(%L,%L,%L,%L,%L)',ws,owner_id,'ask-owner@example.test',second->>'id','approve'),'business_record_revision_conflict');
 perform pg_temp.ask_assert((select status='pending' from public.ask_business_record_drafts where id=(second->>'id')::uuid),'failed apply leaves draft waiting');
 perform pg_temp.ask_assert((select value='"New direct change"'::jsonb from public.business_record_facts where workspace_id=ws and fact_key='display_name'),'stale draft never overwrites baseline');
 perform public.resolve_ask_business_draft(ws,owner_id,'ask-owner@example.test',(second->>'id')::uuid,'not_yet');
 perform pg_temp.ask_assert((select status='declined' from public.ask_business_record_drafts where id=(second->>'id')::uuid),'decline removes waiting draft with no write');
end;
$$;
rollback;
