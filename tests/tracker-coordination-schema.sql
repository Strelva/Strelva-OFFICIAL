\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;
create function pg_temp.coordinate_payload(previous jsonb, next_coord jsonb, command_kind text default 'coordinate_records') returns jsonb language plpgsql as $$
declare next_revision integer := (previous->'tracker'->>'revision')::integer+1; next_payload jsonb; before_coord jsonb;
begin
 before_coord:=coalesce(previous->'tracker'->'rows'->0->'coordination','{"assigneeId":null,"links":[]}'::jsonb);
 next_payload:=jsonb_set(previous,'{tracker,revision}',to_jsonb(next_revision));
 next_payload:=jsonb_set(next_payload,'{tracker,rows,0,coordination}',next_coord);
 return jsonb_set(next_payload,'{tracker,history}',previous->'tracker'->'history' || jsonb_build_array(jsonb_build_object('commandId','coord-'||next_revision,'revision',next_revision,'kind',command_kind,'actorId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','coordinationChanges',jsonb_build_array(jsonb_build_object('rowId','row1','before',before_coord,'after',next_coord)))));
end $$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.update_tracker_work(uuid,uuid,uuid,text,integer,jsonb)','EXECUTE'),'coordination remains service-only');
DO $$
declare w uuid:=gen_random_uuid(); other_w uuid:=gen_random_uuid(); source_id uuid; target_id uuid; foreign_id uuid; base jsonb; proposal jsonb; current_payload jsonb; coord jsonb; target_link jsonb; changed public.saved_product_work;
begin
 insert into public.workspaces(id,kind,name,created_by) values(w,'agency','Coordination proof','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),(other_w,'agency','Other coordination proof','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),(w,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','member','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 base:='{"tracker":{"id":"tracker","revision":0,"originalSource":"Name\nRoof\nPorch","rows":[{"id":"row1","state":"active","cells":{"name":{"value":"Roof"}}},{"id":"row2","state":"active","cells":{"name":{"value":"Porch"}}}],"history":[]}}';
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by) values(w,'tracker','tracker','Tasks',base,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning id into source_id;
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by) values(w,'tracker','tracker','Projects',base,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning id into target_id;
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by) values(other_w,'tracker','tracker','Other projects',base,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning id into foreign_id;
 target_link:=jsonb_build_object('workId',target_id,'rowId','row1','linkedRevision',0);
 coord:=jsonb_build_object('assigneeId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','links',jsonb_build_array(target_link));
 begin
  proposal:=pg_temp.coordinate_payload(base,jsonb_set(coord,'{assigneeId}','"cccccccc-cccc-4ccc-8ccc-cccccccccccc"'));
  perform public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',0,proposal);
  raise exception 'nonmember assignment accepted';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 begin
  proposal:=pg_temp.coordinate_payload(base,jsonb_set(coord,'{links,0,workId}',to_jsonb(foreign_id)));
  perform public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',0,proposal);
  raise exception 'foreign tracker link accepted';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 begin
  proposal:=pg_temp.coordinate_payload(base,jsonb_set(coord,'{links,0,linkedRevision}','9'));
  perform public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',0,proposal);
  raise exception 'stale related record accepted';
 exception when others then if SQLERRM<>'tracker_revision_conflict' then raise; end if; end;
 update public.saved_product_work set payload=jsonb_set(jsonb_set(base,'{tracker,revision}','1'),'{tracker,rows,0,state}','"deleted"') where id=target_id;
 begin
  proposal:=pg_temp.coordinate_payload(base,jsonb_set(coord,'{links,0,linkedRevision}','1'));
  perform public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',0,proposal);
  raise exception 'deleted target record accepted';
 exception when others then if SQLERRM<>'tracker_revision_conflict' then raise; end if; end;
 update public.saved_product_work set payload=base where id=target_id;
 proposal:=pg_temp.coordinate_payload(base,coord);
 delete from public.workspace_memberships where workspace_id=w and user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 begin
  perform public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',0,proposal);
  raise exception 'revoked member assignment accepted';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(w,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','member','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 select * into changed from public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',0,proposal);
 perform pg_temp.assert_true(changed.payload->'tracker'->'rows'->0->'coordination'=coord,'assignment and record link commit together');
 current_payload:=changed.payload;
 begin
  perform public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',0,proposal);
  raise exception 'stale source command accepted';
 exception when others then if SQLERRM<>'tracker_revision_conflict' then raise; end if; end;
 -- A later ordinary cell edit survives undo of assignment/link metadata.
 current_payload:=jsonb_set(current_payload,'{tracker,revision}','2');
 current_payload:=jsonb_set(current_payload,'{tracker,rows,1,cells,name,value}','"Deck"');
 current_payload:=jsonb_set(current_payload,'{tracker,history}',current_payload->'tracker'->'history' || '[{"revision":2,"kind":"update_cell"}]'::jsonb);
 perform public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',1,current_payload);
 proposal:=pg_temp.coordinate_payload(current_payload,'{"assigneeId":null,"links":[]}'::jsonb,'undo_change');
 select * into changed from public.update_tracker_work(source_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',2,proposal);
 perform pg_temp.assert_true(changed.payload->'tracker'->'rows'->0->'coordination'='{"assigneeId":null,"links":[]}'::jsonb and changed.payload->'tracker'->'rows'->1->'cells'->'name'->>'value'='Deck','coordination undo preserves later cell edit');
end $$;
