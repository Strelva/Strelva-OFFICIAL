\set ON_ERROR_STOP on
begin;
create function pg_temp.website_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'MCP website assertion: %',message; end if; end $$;
create function pg_temp.website_error(statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end; raise exception 'Expected %', expected; end $$;
do $$
declare owner_id uuid:='ae181300-0000-4000-8000-000000000001'; ws uuid:='ae181300-0000-4000-8000-000000000010'; other_ws uuid:='ae181300-0000-4000-8000-000000000020'; work_id uuid:='ae181300-0000-4000-8000-000000000030'; request_id uuid:='ae181300-0000-4000-8000-000000000040'; resource text:='https://app.strelva.com/api/mcp/public'; doc jsonb:='{"version":2,"siteName":"Fictional","nodes":{"hero":{"id":"hero","type":"Hero","props":{"title":"Original"},"factIds":[]}},"pages":[],"facts":{}}'; next_doc jsonb; payload jsonb; next_payload jsonb; receipt jsonb; actual jsonb;
begin
 insert into public.users(id,email,verified_at) values(owner_id,'mcp-website@example.test',now());
 insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Fictional MCP website',owner_id),(other_ws,'customer','Other business',owner_id);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id),(other_ws,owner_id,'owner',owner_id);
 perform public.issue_agent_oauth_connection_code(owner_id,'mcp-website@example.test',ws,null,repeat('3',64),'https://assistant.example.test/client.json','Fictional assistant','https://assistant.example.test/callback',resource,repeat('x',43),array['business:read','website:read','website:propose']);
 perform public.exchange_agent_oauth_connection_code(repeat('3',64),'https://assistant.example.test/client.json','https://assistant.example.test/callback',resource,repeat('x',43),repeat('4',64),repeat('7',64));
 payload:=jsonb_build_object('version',2,'revision',0,'title','Fictional','status','review_ready','createdBy',owner_id,'createdAt','2026-10-08T12:00:00Z','history','[]'::jsonb,'checkpoint',null,'lastError',null,'audit',null,'approvedCandidateRevision',null,'candidate',jsonb_build_object('revision',1,'contentHash',repeat('a',64),'document',doc));
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(work_id,ws,'websites','website','Fictional',payload,owner_id);
 perform public.append_website_document(ws,work_id,owner_id,'mcp-website@example.test',0,repeat('a',64),doc);
 perform public.approve_website_document(ws,work_id,owner_id,'mcp-website@example.test',1,repeat('a',64));
 perform pg_temp.website_assert(jsonb_array_length(public.list_agent_websites(repeat('4',64),resource,ws))=1,'selected native website listed');
 actual:=public.read_agent_website_work(repeat('4',64),resource,ws,work_id);
 perform pg_temp.website_assert(actual->>'contentHash'=repeat('a',64) and actual->>'approvedRevision'='1','snapshot identifies exact head and approval');
 perform pg_temp.website_error(format('select public.read_agent_website_work(%L,%L,%L,%L)',repeat('4',64),resource,other_ws,work_id),'oauth_invalid_token');
 perform pg_temp.website_error(format('select public.read_agent_website_work(%L,%L,%L,%L)',repeat('4',64),'https://other.example.test/mcp',ws,work_id),'oauth_invalid_token');
 perform pg_temp.website_error(format('select public.read_agent_website_work(%L,%L,%L,%L)',repeat('4',64),resource,ws,request_id),'workspace_access_denied');
 next_doc:=jsonb_set(doc,'{nodes,hero,props,title}','"Proposed"');
 next_payload:=payload||jsonb_build_object('revision',1,'candidate',jsonb_build_object('revision',2,'contentHash',repeat('b',64),'document',next_doc),'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','agent_document_proposal','actorId',owner_id,'at','2026-10-08T12:01:00Z')));
 perform pg_temp.website_error(format('select public.commit_agent_website_candidate(%L,%L,%L,%L,%L,%L,%L,0,1,%L,%L,%L,%L)',repeat('4',64),resource,ws,work_id,request_id,repeat('5',64),'Proposed headline',repeat('c',64),repeat('b',64),next_doc,next_payload),'website_revision_conflict');
 perform pg_temp.website_assert((select revision=1 and approved_revision=1 from public.website_document_heads where website_work_id=work_id),'losing baseline preserves approval');
 receipt:=public.commit_agent_website_candidate(repeat('4',64),resource,ws,work_id,request_id,repeat('5',64),'Proposed headline',0,1,repeat('a',64),repeat('b',64),next_doc,next_payload);
 perform pg_temp.website_assert(receipt->>'status'='awaiting_review' and receipt->>'revision'='2','proposal saves review revision');
 perform pg_temp.website_assert((select revision=2 and approved_revision is null from public.website_document_heads where website_work_id=work_id),'proposal clears approval');
 perform pg_temp.website_assert(not exists(select 1 from public.website_document_publications where website_work_id=work_id),'proposal never publishes');
 actual:=public.commit_agent_website_candidate(repeat('4',64),resource,ws,work_id,request_id,repeat('5',64),'Proposed headline',0,1,repeat('a',64),repeat('b',64),next_doc,next_payload);
 perform pg_temp.website_assert(actual=receipt and (select count(*)=2 from public.website_documents where website_work_id=work_id),'retry returns one receipt and creates no extra document');
 perform pg_temp.website_error(format('select public.read_agent_website_proposal_retry(%L,%L,%L,%L,%L)',repeat('4',64),resource,ws,request_id,repeat('6',64)),'website_request_conflict');
 perform public.approve_website_document(ws,work_id,owner_id,'mcp-website@example.test',2,repeat('b',64));
 perform pg_temp.website_assert(public.list_agent_website_proposals(repeat('4',64),resource,ws,work_id)->0->>'status'='approved','status tracks native owner approval');
 -- Native owner fact review/continuation appends a new immutable candidate.
 next_payload:=next_payload||jsonb_build_object('revision',2,'candidate',jsonb_build_object('revision',3,'contentHash',repeat('c',64),'document',next_doc),'history',(next_payload->'history')||jsonb_build_array(jsonb_build_object('revision',2,'kind','fact_confirmed','actorId',owner_id,'at','2026-10-08T12:02:00Z')));
 perform public.commit_website_document_candidate(ws,work_id,owner_id,'mcp-website@example.test',2,1,repeat('c',64),next_doc,next_payload);
 actual:=public.list_agent_website_proposals(repeat('4',64),resource,ws,work_id)->0;
 perform pg_temp.website_assert(actual->>'status'='superseded' and actual->>'revision'='2' and actual->>'currentRevision'='3' and actual->>'currentContentHash'=repeat('c',64),'exact proposal identity retained while current owner-reviewed revision is exposed');
 update public.assistant_tokens set scopes=array['website:propose'] where token_hash=repeat('4',64);
 perform pg_temp.website_assert(public.read_agent_website_work(repeat('4',64),resource,ws,work_id,'website:propose')->>'documentRevision'='3','proposal scope can prepare a candidate without granting unrelated read tools');
 perform pg_temp.website_error(format('select public.read_agent_website_work(%L,%L,%L,%L,%L)',repeat('4',64),resource,ws,work_id,'quotes:approve'),'oauth_invalid_token');
 update public.assistant_tokens set scopes=array['business:read'] where token_hash=repeat('4',64);
 perform pg_temp.website_error(format('select public.list_agent_websites(%L,%L,%L)',repeat('4',64),resource,ws),'oauth_invalid_token');
 update public.assistant_tokens set scopes=array['business:read','website:read','website:propose'] where token_hash=repeat('4',64);
 update public.assistant_connections set revoked_at=clock_timestamp() where id=(select connection_id from public.assistant_tokens where token_hash=repeat('4',64));
 perform pg_temp.website_error(format('select public.read_agent_website_proposal_retry(%L,%L,%L,%L,%L)',repeat('4',64),resource,ws,request_id,repeat('5',64)),'oauth_invalid_token');
 update public.assistant_connections set revoked_at=null where id=(select connection_id from public.assistant_tokens where token_hash=repeat('4',64));
 delete from public.workspace_memberships where workspace_id=ws and user_id=owner_id;
 perform pg_temp.website_error(format('select public.list_agent_websites(%L,%L,%L)',repeat('4',64),resource,ws),'oauth_invalid_token');
 perform pg_temp.website_error(format('select public.read_agent_website_proposal_retry(%L,%L,%L,%L,%L)',repeat('4',64),resource,ws,request_id,repeat('5',64)),'oauth_invalid_token');
end $$;
select pg_temp.website_assert(not has_table_privilege('service_role','public.assistant_website_proposals','select') and not has_function_privilege('anon','public.list_agent_websites(text,text,uuid)','execute') and has_function_privilege('service_role','public.list_agent_websites(text,text,uuid)','execute'),'receipts protected by internal token-scoped RPCs');
rollback;
\ir ../supabase/migrations/rollback-20261018130000_agent_website_tools.sql
\ir ../supabase/migrations/20261018130000_agent_website_tools.sql
