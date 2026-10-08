\set ON_ERROR_STOP on
begin;
DO $$
declare w uuid; item public.saved_product_work; draft jsonb; events jsonb; runs jsonb; e jsonb; r jsonb; i integer; page jsonb;
begin
 select id into w from public.workspaces where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='personal' limit 1;
 if w is null then raise exception 'runtime_history_fixture_missing'; end if;
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
 values(w,'investigations','investigation','History qualification',jsonb_build_object('version',1,'revision',0,'title','History qualification','createdBy','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','createdAt','2026-10-08T12:00:00Z','history','[]'::jsonb,'runs','[]'::jsonb),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning * into item;
 for i in 1..501 loop
  e:=jsonb_build_object('revision',i,'actorId',item.created_by,'kind',case when i%2=0 then 'investigate_unavailable' else 'investigate' end,'at','2026-10-08T12:00:00Z');
  r:=jsonb_build_object('requestId','history-run-'||i,'at','2026-10-08T12:00:00Z','result',case when i%2=0 then 'unavailable' else 'agreement' end,'fingerprint','test','sources',jsonb_build_array(jsonb_build_object('workId','source','revision',0,'updatedAt','2026-10-08T12:00:00Z')),'differences','[]'::jsonb);
  select jsonb_agg(value order by ord) into events from jsonb_array_elements((item.payload->'history')||jsonb_build_array(e)) with ordinality a(value,ord) where ord>greatest(0,jsonb_array_length(item.payload->'history')+1-500);
  select jsonb_agg(value order by ord) into runs from jsonb_array_elements((item.payload->'runs')||jsonb_build_array(r)) with ordinality a(value,ord) where ord>greatest(0,jsonb_array_length(item.payload->'runs')+1-200);
  draft:=item.payload||jsonb_build_object('revision',i,'history',events,'runs',runs);
  select * into item from public.update_bounded_product_work(item.id,w,item.created_by,'agency@example.com','investigations',i-1,draft);
 end loop;
 if jsonb_array_length(item.payload->'runs')<>200 or jsonb_array_length(item.payload->'history')<>500 then raise exception 'history_snapshot_not_bounded'; end if;
 if (select count(*) from public.investigation_history_events where work_id=item.id)<>501 then raise exception 'history_receipts_lost'; end if;
 page:=public.read_investigation_runs(item.id,item.created_by,'agency@example.com','history-run-1',null,1);
 if page->0->'run'->>'requestId'<>'history-run-1' then raise exception 'evicted_request_not_recoverable'; end if;
 page:=public.read_investigation_runs(item.id,item.created_by,'agency@example.com',null,402,100);
 if jsonb_array_length(page)<>100 or (page->0->>'revision')::integer<>401 or (page->99->>'revision')::integer<>302 then raise exception 'history_keyset_page_wrong'; end if;
 begin
  update public.investigation_history_events set run='{}' where work_id=item.id and revision=1;
  raise exception 'history_receipt_mutable';
 exception when others then if SQLERRM<>'investigation_history_immutable' then raise; end if; end;
 begin
  perform public.update_bounded_product_work(item.id,w,item.created_by,'agency@example.com','investigations',500,draft);
  raise exception 'history_stale_revision_accepted';
 exception when others then if SQLERRM<>'bounded_revision_conflict' then raise; end if; end;
 delete from public.workspace_memberships where workspace_id=w and user_id=item.created_by;
 begin
  perform public.read_investigation_runs(item.id,item.created_by,'agency@example.com',null,null,50);
  raise exception 'revoked_history_visible';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 -- The only deletion allowance is the existing parent-work lifecycle: no
 -- freestanding history wipe or selected-retention policy is invented here.
 delete from public.saved_product_work where id=item.id;
 if exists(select 1 from public.investigation_history_events where work_id=item.id) then raise exception 'parent_cleanup_blocked_by_history'; end if;
end $$;
rollback;
