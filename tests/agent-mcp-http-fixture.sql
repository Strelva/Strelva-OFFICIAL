\set ON_ERROR_STOP on
-- Committed only inside the disposable cluster owned by the SQL runner.
-- These fictional records bypass sign-in solely to prove HTTP-to-SQL behavior.
\getenv fixture_document STRELVA_HTTP_FIXTURE_DOCUMENT
\getenv fixture_payload STRELVA_HTTP_FIXTURE_PAYLOAD
\getenv fixture_hash STRELVA_HTTP_FIXTURE_HASH
begin;
insert into public.users(id,email,verified_at) values
 ('ae181400-0000-4000-8000-000000000001','mcp-http-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ae181400-0000-4000-8000-000000000010','customer','Fictional HTTP business','ae181400-0000-4000-8000-000000000001'),
 ('ae181400-0000-4000-8000-000000000020','customer','Other fictional business','ae181400-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ae181400-0000-4000-8000-000000000010','ae181400-0000-4000-8000-000000000001','owner','ae181400-0000-4000-8000-000000000001'),
 ('ae181400-0000-4000-8000-000000000020','ae181400-0000-4000-8000-000000000001','owner','ae181400-0000-4000-8000-000000000001');
insert into public.business_records(workspace_id,created_by,updated_by) values
 ('ae181400-0000-4000-8000-000000000010','ae181400-0000-4000-8000-000000000001','ae181400-0000-4000-8000-000000000001');
insert into public.business_record_facts(workspace_id,fact_key,value,source,verified,updated_by) values
 ('ae181400-0000-4000-8000-000000000010','display_name','"Fictional HTTP business"','owner',true,'ae181400-0000-4000-8000-000000000001'),
 ('ae181400-0000-4000-8000-000000000010','description','"Fictional facts for local MCP proof"','owner',false,'ae181400-0000-4000-8000-000000000001');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('ae181400-0000-4000-8000-000000000030','ae181400-0000-4000-8000-000000000010','websites','website','Fictional HTTP website',:'fixture_payload'::jsonb,'ae181400-0000-4000-8000-000000000001');
select public.append_website_document('ae181400-0000-4000-8000-000000000010','ae181400-0000-4000-8000-000000000030','ae181400-0000-4000-8000-000000000001','mcp-http-owner@example.test',0,:'fixture_hash',:'fixture_document'::jsonb);
select public.approve_website_document('ae181400-0000-4000-8000-000000000010','ae181400-0000-4000-8000-000000000030','ae181400-0000-4000-8000-000000000001','mcp-http-owner@example.test',1,:'fixture_hash');
commit;
