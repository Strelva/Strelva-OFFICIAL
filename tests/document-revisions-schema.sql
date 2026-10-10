\set ON_ERROR_STOP on
-- Documents take any number of edits: 1000 edits and an Undo through the real
-- RPC, every receipt in document_revisions, a bounded payload window, and
-- the same denials as before.
create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(not has_table_privilege('authenticated','public.document_revisions','SELECT'),'revisions hidden from authenticated');
select pg_temp.assert_true(not has_table_privilege('anon','public.document_revisions','SELECT'),'revisions hidden from anon');
select pg_temp.assert_true(not has_table_privilege('service_role','public.document_revisions','INSERT'),'service role cannot insert revisions directly');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.document_revisions'::regclass),'revisions RLS on');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.update_document_work(uuid,uuid,uuid,text,integer,jsonb)','EXECUTE'),'document RPC service only');
-- The earlier fixture's receipt was backfilled when the migration ran.
select pg_temp.assert_true(exists(select 1 from public.document_revisions r join public.saved_product_work w on w.id=r.work_id where w.title='Changed' or w.payload->>'text'='Changed'),'existing receipts backfilled');

DO $$
declare
  w uuid; other_workspace uuid; actor uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  item public.saved_product_work; current_payload jsonb; next_payload jsonb; rcpt jsonb;
  new_text text; i integer; stored integer;
begin
  select id into w from public.workspaces where created_by=actor and kind='personal' limit 1;
  select id into other_workspace from public.workspaces where id<>w limit 1;
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
  values(w,'documents','document','Long-lived','{"version":1,"revision":0,"title":"Long-lived","text":"v0","createdBy":"owner","createdAt":"2026-10-06T12:00:00Z","history":[]}',actor)
  returning * into item;
  current_payload := item.payload;

  for i in 1..1000 loop
    new_text := 'v' || i;
    rcpt := jsonb_build_object('revision', i, 'actorId', actor::text, 'at', '2026-10-06T12:00:00Z', 'kind', 'edit',
      'before', jsonb_build_object('title', 'Long-lived', 'text', current_payload->>'text'),
      'after', jsonb_build_object('title', 'Long-lived', 'text', new_text));
    next_payload := current_payload || jsonb_build_object('revision', i, 'text', new_text,
      'history', (select coalesce(jsonb_agg(e order by p), '[]'::jsonb) from jsonb_array_elements(current_payload->'history') with ordinality x(e,p)
                  where p > jsonb_array_length(current_payload->'history') - 19) || jsonb_build_array(rcpt));
    select payload into current_payload from public.update_document_work(item.id,w,actor,'agency@example.com',i-1,next_payload);
  end loop;
  if current_payload->>'text' <> 'v1000' or (current_payload->>'revision')::integer <> 1000 then raise exception 'edit 1000 not saved'; end if;
  if jsonb_array_length(current_payload->'history') <> 20 then raise exception 'payload window is not 20 receipts'; end if;
  select count(*) into stored from public.document_revisions where work_id=item.id;
  if stored <> 1000 then raise exception 'expected 1000 stored receipts, found %', stored; end if;

  -- Undo of the latest edit (revision 1001) still works past the old cap.
  rcpt := jsonb_build_object('revision', 1001, 'actorId', actor::text, 'at', '2026-10-06T12:01:00Z', 'kind', 'undo', 'undoesRevision', 1000,
    'before', jsonb_build_object('title', 'Long-lived', 'text', 'v1000'),
    'after', jsonb_build_object('title', 'Long-lived', 'text', 'v999'));
  next_payload := current_payload || jsonb_build_object('revision', 1001, 'text', 'v999',
    'history', ((current_payload->'history') - 0) || jsonb_build_array(rcpt));
  select payload into current_payload from public.update_document_work(item.id,w,actor,'agency@example.com',1000,next_payload);
  if current_payload->>'text' <> 'v999' then raise exception 'undo past the old cap failed'; end if;
  if not exists(select 1 from public.document_revisions where work_id=item.id and revision=1001 and receipt->>'kind'='undo') then raise exception 'undo receipt not stored'; end if;

  -- A window that drops a recent receipt or rewrites one is refused.
  begin
    perform public.update_document_work(item.id,w,actor,'agency@example.com',1001,
      current_payload || jsonb_build_object('revision',1002,'text','x','history',jsonb_build_array(
        jsonb_build_object('revision',1002,'actorId',actor::text,'at','2026-10-06T12:02:00Z','kind','edit',
          'before',jsonb_build_object('title','Long-lived','text','v999'),'after',jsonb_build_object('title','Long-lived','text','x')))));
    raise exception 'truncated window accepted';
  exception when others then if SQLERRM<>'document_payload_invalid' then raise; end if; end;

  -- Stale revision, foreign actor and another workspace stay denied.
  begin
    perform public.update_document_work(item.id,w,actor,'agency@example.com',1000,next_payload);
    raise exception 'stale edit accepted';
  exception when others then if SQLERRM<>'document_revision_conflict' then raise; end if; end;
  begin
    insert into public.users(id,email,verified_at) values('d1900000-0000-4000-8000-000000000001','outsider-doc@example.test',now()) on conflict do nothing;
    perform public.update_document_work(item.id,w,'d1900000-0000-4000-8000-000000000001','outsider-doc@example.test',1001,next_payload);
    raise exception 'foreign edit accepted';
  exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
  if other_workspace is not null then
    begin
      perform public.update_document_work(item.id,other_workspace,actor,'agency@example.com',1001,next_payload);
      raise exception 'cross-workspace edit accepted';
    exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
  end if;

  -- Receipts are append-only.
  begin
    update public.document_revisions set receipt=receipt where work_id=item.id and revision=1;
    raise exception 'receipt rewrite accepted';
  exception when others then if SQLERRM<>'document_revision_immutable' then raise; end if; end;
end $$;
