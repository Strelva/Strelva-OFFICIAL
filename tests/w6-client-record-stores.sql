-- Additive stores, least privilege, keyset pagination, stable-id rename.
begin;
insert into public.tenants(id) values('w6-store-client');
do $$
declare v_table text; v_result jsonb;
begin
  foreach v_table in array array['orders','provider_connections','provider_metadata','reward_members','reward_transactions','threads','tenant_settings'] loop
    perform public.record_tenant_client_record('w6-store-client',v_table,'r1','{"value":1}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2026-10-06 12:00:00.123456+00','backfill','replace');
    v_result := public.read_tenant_client_records_page('w6-store-client',v_table,1,null,null);
    if jsonb_array_length(v_result)<>1 then raise exception 'missing new store %',v_table; end if;
  end loop;
  perform public.record_tenant_client_record('w6-store-client','orders','r2','{"value":2}','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','2026-10-06 12:00:00.123456+00','backfill','replace');
  v_result := public.read_tenant_client_records_page('w6-store-client','orders',1,'2026-10-06 12:00:00.123456+00','r2');
  if v_result->0->>'recordId'<>'r1' then raise exception 'keyset timestamp tie lost'; end if;
  if jsonb_array_length(public.read_tenant_client_records_page('unrelated','orders',1000,null,null))<>0 then raise exception 'tenant leak'; end if;
  if has_function_privilege('authenticated','public.read_tenant_client_records_page(text,text,integer,timestamptz,text)','EXECUTE')
    or has_function_privilege('anon','public.find_client_calendly_tenant(text)','EXECUTE') then raise exception 'public access'; end if;
  if has_table_privilege('service_role','public.tenant_client_records','SELECT') then raise exception 'direct table access'; end if;
  -- Removal before the first copy still blocks that copy's delayed retry.
  perform public.record_tenant_client_record('w6-store-client','orders','gone',null,null,'2026-10-06 13:00:00+00','dual_write','remove');
  v_result := public.record_tenant_client_record('w6-store-client','orders','gone','{"value":0}','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','2026-10-06 12:00:00+00','repair','replace');
  if v_result->>'status'<>'kept' then raise exception 'late initial save revived deletion'; end if;
  -- A repair loaded before a newer save cannot delete the saved value.
  v_result := public.record_tenant_client_record('w6-store-client','orders','r1',null,null,'2026-10-06 11:00:00+00','repair','remove');
  if v_result->>'status'<>'kept' then raise exception 'stale removal deleted newer save'; end if;
  perform public.record_tenant_client_record('w6-store-client','orders','r1',null,null,'2026-10-06 13:00:00+00','dual_write','remove');
  v_result := public.record_tenant_client_record('w6-store-client','orders','r1','{"value":0}','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','2026-10-06 12:30:00+00','repair','replace');
  if v_result->>'status'<>'kept' then raise exception 'stale save revived deletion'; end if;
  perform public.record_tenant_client_record('w6-store-client','orders','r1','{"value":3}','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','2026-10-06 14:00:00+00','dual_write','replace');
  if jsonb_array_length(public.read_tenant_client_records_page('w6-store-client','orders',1000,null,null))<>2 then raise exception 'new save did not revive record'; end if;
  -- Saving the same value later must still block an older, different retry.
  v_result := public.record_tenant_client_record('w6-store-client','orders','r1','{"value":3}','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','2026-10-06 16:00:00+00','dual_write','replace');
  if v_result->>'status'<>'unchanged' then raise exception 'identical save duplicated record'; end if;
  v_result := public.record_tenant_client_record('w6-store-client','orders','r1','{"value":4}','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','2026-10-06 15:00:00+00','repair','replace');
  if v_result->>'status'<>'kept' then raise exception 'identical newer save lost ordering watermark'; end if;
end $$;
update public.tenants set id='w6-store-renamed' where id='w6-store-client';
do $$begin
  if jsonb_array_length(public.read_tenant_client_records_page('w6-store-renamed','orders',1000,null,null))<>2 then raise exception 'rename lost data'; end if;
end $$;
rollback;
