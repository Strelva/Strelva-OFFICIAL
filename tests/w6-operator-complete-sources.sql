\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values ('ea614000-0000-4000-8000-000000000001','complete-queue@example.test',now());
insert into public.super_admins(user_id,email) values ('ea614000-0000-4000-8000-000000000001','complete-queue@example.test');
insert into public.tenants(id,site_name,stable_id) values ('complete-queue-fixture','Complete queue','ea614000-0000-4000-8000-000000000010');
do $$ declare i integer; snapshot jsonb; begin
  for i in 1..205 loop
    perform public.record_outside_write_receipt(jsonb_build_object('commandKey','complete-queue:'||i,'tenantId','complete-queue-fixture',
      'provider','strelva_content','writeKind','content_publish','subject','Fixture content','request','{}'::jsonb,
      'acceptance','accepted','readback',case when i=205 then 'pending' else 'failed' end,'undo','available',
      'undoLabel','Restore the prior version.','actor','fixture'));
  end loop;
  snapshot := public.read_operator_queue_context_v2('ea614000-0000-4000-8000-000000000001','complete-queue@example.test');
  if (select count(*) from jsonb_array_elements(snapshot->'readbackFailures') x where x->>'tenantId'='complete-queue-fixture') <> 205 then
    raise exception 'flag-on queue omitted accepted unverified receipts';
  end if;
  snapshot := public.read_operator_queue_context('ea614000-0000-4000-8000-000000000001','complete-queue@example.test');
  if jsonb_array_length(snapshot->'readbackFailures') <> 200 then raise exception 'legacy receipt limit changed'; end if;
  begin perform public.read_operator_queue_context_v2('ea614000-0000-4000-8000-000000000001','forged@example.test');
    raise exception 'identity forgery accepted';
  exception when others then if sqlerrm <> 'operator_queue_access_denied' then raise; end if; end;
  if has_function_privilege('authenticated','public.read_operator_queue_context_v2(uuid,text)','EXECUTE')
    or has_function_privilege('anon','public.read_google_listing_readback_failures_v2(uuid,text)','EXECUTE') then raise exception 'public queue RPC access'; end if;
end $$;
rollback;
