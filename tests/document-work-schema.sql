\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(not has_function_privilege('authenticated','public.update_document_work(uuid,uuid,uuid,text,integer,jsonb)','EXECUTE'),'document RPC service only');
DO $$
declare w uuid; item public.saved_product_work; updated public.saved_product_work; draft jsonb;
begin
 select id into w from public.workspaces where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='personal' limit 1;
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
 values(w,'documents','document','Procedure','{"version":1,"revision":0,"title":"Procedure","text":"First","createdBy":"owner","createdAt":"2026-09-11T12:00:00Z","history":[]}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning * into item;
 draft := item.payload || jsonb_build_object(
   'revision', 1,
   'text', 'Changed',
   'history', jsonb_build_array(jsonb_build_object(
     'revision', 1,
     'actorId', item.created_by::text,
     'at', '2026-09-11T12:01:00Z',
     'kind', 'edit',
     'before', jsonb_build_object('title', 'Procedure', 'text', 'First'),
     'after', jsonb_build_object('title', 'Procedure', 'text', 'Changed')
   ))
 );
 select * into updated from public.update_document_work(item.id,w,item.created_by,'agency@example.com',0,draft);
 if updated.payload->>'text'<>'Changed' then raise exception 'document change not saved'; end if;
 begin
  perform public.update_document_work(item.id,w,item.created_by,'agency@example.com',0,draft);
  raise exception 'stale edit accepted';
 exception when others then if SQLERRM<>'document_revision_conflict' then raise; end if; end;
 begin
  perform public.update_document_work(item.id,w,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',1,draft);
  raise exception 'foreign edit accepted';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 begin
  perform public.update_document_work(item.id,w,item.created_by,'agency@example.com',1,draft || '{"revision":2,"history":[]}'::jsonb);
  raise exception 'history replacement accepted';
 exception when others then if SQLERRM<>'document_payload_invalid' then raise; end if; end;
 begin
  perform public.update_document_work(
    item.id,
    w,
    item.created_by,
    'agency@example.com',
    1,
    draft || jsonb_build_object(
      'revision', 2,
      'text', 'Third',
      'history', jsonb_build_array(
        draft->'history'->0,
        jsonb_build_object('revision', 2, 'kind', 'edit')
      )
    )
  );
  raise exception 'incomplete receipt accepted';
 exception when others then if SQLERRM<>'document_payload_invalid' then raise; end if; end;
end $$;
