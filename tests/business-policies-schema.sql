\set ON_ERROR_STOP on
begin;
create function pg_temp.policy_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'policy assertion failed: %',message; end if; end $$;
select pg_temp.policy_assert((select relrowsecurity from pg_class where oid='public.business_policies'::regclass),'RLS on');
select pg_temp.policy_assert(not has_table_privilege('service_role','public.business_policies','SELECT')
  and not has_table_privilege('authenticated','public.business_policies','INSERT')
  and not has_function_privilege('anon','public.read_business_policies(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.read_business_policies(uuid,uuid,text)','EXECUTE')
  and has_function_privilege('service_role','public.read_business_policies(uuid,uuid,text)','EXECUTE'),'actor RPC only');
select pg_temp.policy_assert(not exists(select 1 from public.business_record_facts f where fact_key='service_area'
  and not exists(select 1 from public.business_policies p where p.workspace_id=f.workspace_id and p.policy_key=f.fact_key
    and p.value=f.value and p.verified=f.verified and p.source=f.source)),'existing service areas backfilled');

insert into public.users(id,email,verified_at) values
  ('bf305000-0000-4000-8000-000000000001','policies-owner@example.test',now()),
  ('bf305000-0000-4000-8000-000000000002','policies-member@example.test',now()),
  ('bf305000-0000-4000-8000-000000000003','policies-outsider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('bf305000-0000-4000-8000-000000000010','customer','Policy fixture','bf305000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('bf305000-0000-4000-8000-000000000010','bf305000-0000-4000-8000-000000000001','owner','bf305000-0000-4000-8000-000000000001'),
  ('bf305000-0000-4000-8000-000000000010','bf305000-0000-4000-8000-000000000002','member','bf305000-0000-4000-8000-000000000001');

do $$
declare
  w uuid := 'bf305000-0000-4000-8000-000000000010'; actor uuid := 'bf305000-0000-4000-8000-000000000001';
  cmd uuid := gen_random_uuid(); patch jsonb; result jsonb; terms jsonb; seq bigint; invalid jsonb; key text;
begin
  terms := public.read_business_policies(w,actor,'policies-owner@example.test');
  perform pg_temp.policy_assert(terms->'confirmed'='{}' and terms->'unconfirmed'='{}','absence is unknown');
  patch := '{"facts":{
    "cancellation":{"value":{"summary":"Cancel 24 hours ahead","noticeHours":24},"verified":true},
    "deposit":{"value":{"required":true,"amountCents":2500,"currency":"USD"},"verified":true},
    "service_area":{"value":["Buffalo"],"verified":true},
    "payment_methods":{"value":["cash","credit_card"],"verified":true},
    "age_waiver":{"value":{"minimumAge":18,"waiverRequired":true},"verified":true},
    "booking_rules":{"value":{"summary":"Book ahead","advanceNoticeHours":0,"reservationRequired":true},"verified":true},
    "response_time":{"value":{"maximumHours":48}}
  }}';
  result := public.patch_business_record(w,actor,'policies-owner@example.test','owner',0,patch,cmd,repeat('a',64));
  seq := (result->>'sequence')::bigint;
  perform pg_temp.policy_assert((result->>'changeCount')::integer=7,'all policy kinds written');
  perform pg_temp.policy_assert((select count(*)=7 from public.business_policies where workspace_id=w),'projection complete');
  perform pg_temp.policy_assert((select bool_and(p.value=f.value and p.verified=f.verified and p.source=f.source and p.updated_by=f.updated_by and p.updated_at=f.updated_at)
    from public.business_policies p join public.business_record_facts f on (p.workspace_id,p.policy_key)=(f.workspace_id,f.fact_key) where p.workspace_id=w),'one value and provenance');
  terms := public.read_business_policies(w,'bf305000-0000-4000-8000-000000000002','policies-member@example.test');
  perform pg_temp.policy_assert((terms->'confirmed'->'deposit'->'value'->>'amountCents')::integer=2500
    and terms->'unconfirmed' ? 'response_time' and not terms->'confirmed' ? 'response_time','member reads separated terms');
  perform pg_temp.policy_assert((public.patch_business_record(w,actor,'policies-owner@example.test','owner',0,patch,cmd,repeat('a',64))->>'replayed')::boolean,'retry replays');
  perform pg_temp.policy_assert((select jsonb_array_length(changes)=7 from public.business_record_revisions where workspace_id=w and sequence=seq),'one history revision for policy patch');
  perform pg_temp.policy_assert(jsonb_array_length(public.read_business_record_history(w,actor,'policies-owner@example.test',10))=1,'policy history readable');

  -- Confirmation cannot be forged by an agent source, even using an owner actor.
  begin
    perform public.patch_business_record(w,actor,'policies-owner@example.test','agent',1,
      '{"facts":{"response_time":{"value":{"maximumHours":1},"verified":true}}}',gen_random_uuid(),repeat('b',64));
    raise exception 'agent confirmation accepted';
  exception when others then if sqlerrm <> 'business_record_patch_invalid' then raise; end if; end;
  perform public.patch_business_record(w,actor,'policies-owner@example.test','agent',1,
    '{"facts":{"deposit":{"value":{"required":false}}}}',gen_random_uuid(),repeat('c',64));
  terms := public.read_business_policies(w,actor,'policies-owner@example.test');
  perform pg_temp.policy_assert(terms->'unconfirmed'->'deposit'->'value'->>'required'='false'
    and not terms->'confirmed' ? 'deposit','agent edit removes confirmation');

  -- A stale Undo cannot erase later policy changes.
  begin
    perform public.undo_business_record_revision(w,actor,'policies-owner@example.test','owner',seq,gen_random_uuid(),repeat('d',64));
    raise exception 'stale undo accepted';
  exception when others then if sqlerrm <> 'business_record_undo_conflict' then raise; end if; end;
  perform public.undo_business_record_revision(w,actor,'policies-owner@example.test','owner',seq+1,gen_random_uuid(),repeat('e',64));
  terms := public.read_business_policies(w,actor,'policies-owner@example.test');
  perform pg_temp.policy_assert(terms->'confirmed'->'deposit'->'value'->>'amountCents'='2500','undo restores confirmed value');
  perform pg_temp.policy_assert((select verified and value->>'amountCents'='2500' from public.business_policies where workspace_id=w and policy_key='deposit'),'undo restores projection');

  -- No wrong-business read or write; members can read but cannot edit.
  begin
    perform public.read_business_policies(w,'bf305000-0000-4000-8000-000000000003','policies-outsider@example.test');
    raise exception 'outsider read accepted';
  exception when others then if sqlerrm <> 'business_record_access_denied' then raise; end if; end;
  begin
    perform public.patch_business_record(w,'bf305000-0000-4000-8000-000000000002','policies-member@example.test','owner',3,
      '{"facts":{"deposit":null}}',gen_random_uuid(),repeat('f',64));
    raise exception 'member write accepted';
  exception when others then if sqlerrm <> 'business_record_access_denied' then raise; end if; end;
  begin
    perform public.patch_business_record(w,actor,'policies-owner@example.test','owner',0,patch,gen_random_uuid(),repeat('f',64));
    raise exception 'stale revision accepted';
  exception when others then if sqlerrm <> 'business_record_revision_conflict' then raise; end if; end;

  -- SQL validators reject every malformed field seen by the typed unit tests.
  for key,invalid in select * from (values
    ('cancellation','{"summary":"","noticeHours":24}'::jsonb),
    ('cancellation','{"summary":"Policy","noticeHours":-1}'::jsonb),
    ('deposit','{"required":true,"amountCents":500}'::jsonb),
    ('deposit','{"required":true,"currency":"USD"}'::jsonb),
    ('deposit','{"required":false,"percent":20}'::jsonb),
    ('deposit','{"required":true,"percent":101}'::jsonb),
    ('deposit','{"required":true,"amountCents":500,"currency":"USD","percent":20}'::jsonb),
    ('deposit','{"required":true,"amountCents":0,"currency":"usd"}'::jsonb),
    ('payment_methods','["cash","cash"]'::jsonb),('payment_methods','["bitcoin"]'::jsonb),
    ('age_waiver','{"minimumAge":21}'::jsonb),('age_waiver','{"waiverRequired":true,"minimumAge":121}'::jsonb),
    ('booking_rules','{"summary":"Book ahead","maximumAdvanceDays":0.5}'::jsonb),
    ('response_time','{"maximumHours":0}'::jsonb),('response_time','{"maximumHours":24,"extra":true}'::jsonb),
    ('service_area','[]'::jsonb),('deposit','{"required":null}'::jsonb),('response_time','{}'::jsonb)
  ) cases(k,v) loop
    perform pg_temp.policy_assert(public.business_policy_valid(key,invalid) is false,'invalid '||key||' refused');
    begin
      perform public.patch_business_record(w,actor,'policies-owner@example.test','owner',3,
        jsonb_build_object('facts',jsonb_build_object(key,jsonb_build_object('value',invalid))),gen_random_uuid(),repeat('f',64));
      raise exception 'malformed policy accepted';
    exception when others then if sqlerrm <> 'business_record_patch_invalid' then raise; end if; end;
  end loop;
  perform pg_temp.policy_assert(public.business_policy_valid('deposit','{"required":false}')
    and public.business_policy_valid('deposit','{"required":true,"percent":20}')
    and public.business_policy_valid('age_waiver','{"waiverRequired":false,"minimumAge":0}')
    and public.business_policy_valid('booking_rules','{"summary":"Walk-ins welcome","reservationRequired":false}'),'explicit false and alternate types');

  -- Clearing terms removes the projection; Undo puts it back.
  result := public.patch_business_record(w,actor,'policies-owner@example.test','owner',3,
    '{"facts":{"cancellation":null}}',gen_random_uuid(),repeat('1',64));
  perform pg_temp.policy_assert(not exists(select 1 from public.business_policies where workspace_id=w and policy_key='cancellation'),'clear removes projection');
  perform public.undo_business_record_revision(w,actor,'policies-owner@example.test','owner',(result->>'sequence')::bigint,gen_random_uuid(),repeat('2',64));
  perform pg_temp.policy_assert(exists(select 1 from public.business_policies where workspace_id=w and policy_key='cancellation'),'undo deletion restores projection');
end $$;
rollback;
