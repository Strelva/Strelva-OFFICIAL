\set ON_ERROR_STOP on
-- Website repo-change Requests and their receipts on fictional rows. Rolled back.
begin;
create or replace function pg_temp.wc_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'website change assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.wc_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.wc_assert(
  not has_table_privilege('service_role', 'public.website_change_receipts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.website_change_receipts', 'INSERT')
  and (select relrowsecurity from pg_class where oid = 'public.website_change_receipts'::regclass)
  and has_function_privilege('service_role', 'public.record_website_change_receipt(uuid,uuid,text,uuid,text,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.list_website_change_requests(uuid,uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_website_change_receipt(uuid,uuid,text,uuid,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_website_change_requests(uuid,uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.website_change_actor_role(uuid,uuid,text)', 'EXECUTE'),
  'receipts are RLS-on with no direct grants; only service_role runs the two functions');

insert into public.users(id, email, verified_at) values
  ('7b000000-0000-4000-8000-000000000001', 'wc-owner@example.test', now()),
  ('7b000000-0000-4000-8000-000000000002', 'wc-operator@example.test', now()),
  ('7b000000-0000-4000-8000-000000000003', 'wc-member@example.test', now()),
  ('7b000000-0000-4000-8000-000000000004', 'wc-other@example.test', now()),
  ('7b000000-0000-4000-8000-000000000005', 'wc-admin@example.test', now());
insert into public.super_admins(user_id, email, revoked_at) values ('7b000000-0000-4000-8000-000000000002', 'wc-operator@example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
  ('7b000000-0000-4000-8000-000000000010', 'customer', 'Harborview Tavern', '7b000000-0000-4000-8000-000000000001'),
  ('7b000000-0000-4000-8000-000000000011', 'customer', 'Lakeside Books', '7b000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('7b000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000001', 'owner', '7b000000-0000-4000-8000-000000000001'),
  ('7b000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002', 'admin', '7b000000-0000-4000-8000-000000000001'),
  ('7b000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000003', 'member', '7b000000-0000-4000-8000-000000000001'),
  ('7b000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000005', 'admin', '7b000000-0000-4000-8000-000000000001'),
  ('7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000004', 'owner', '7b000000-0000-4000-8000-000000000004'),
  ('7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000002', 'admin', '7b000000-0000-4000-8000-000000000004');
insert into public.service_requests(id, business_workspace_id, status, request_text, outcome, context, scope, provider_kind, created_by) values
  ('7b000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000010', 'requested', 'Add a private events page', 'A private events page on the site',
    '{"source":"website_change","systemId":"7b000000-0000-4000-8000-0000000000bb","implementation":"custom_repo"}', array['website.repo_change'], 'strelva', '7b000000-0000-4000-8000-000000000001'),
  ('7b000000-0000-4000-8000-0000000000a2', '7b000000-0000-4000-8000-000000000010', 'requested', 'General help', 'Help',
    '{"source":"ask_strelva"}', array['help'], 'strelva', '7b000000-0000-4000-8000-000000000001'),
  ('7b000000-0000-4000-8000-0000000000a3', '7b000000-0000-4000-8000-000000000010', 'withdrawn', 'Old ask', 'Old',
    '{"source":"website_change","systemId":"7b000000-0000-4000-8000-0000000000bb"}', array['website.repo_change'], 'strelva', '7b000000-0000-4000-8000-000000000001');

do $$
declare
  ws uuid := '7b000000-0000-4000-8000-000000000010';
  req uuid := '7b000000-0000-4000-8000-0000000000a1';
  owner_id uuid := '7b000000-0000-4000-8000-000000000001';
  operator_id uuid := '7b000000-0000-4000-8000-000000000002';
  member_id uuid := '7b000000-0000-4000-8000-000000000003';
  admin_id uuid := '7b000000-0000-4000-8000-000000000005';
  saved jsonb;
  listed jsonb;
begin
  -- Order: a decision or a deploy before a preview is refused.
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-owner@example.test', %L, 'approved', '{}')$q$, ws, owner_id, req), '%website_change_out_of_order%');
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-operator@example.test', %L, 'deployed', '{"commitSha":"abc1234","deploymentUrl":"https://x.vercel.app","readBack":"confirmed"}')$q$, ws, operator_id, req), '%website_change_out_of_order%');
  -- Only an operator records a preview; an owner or a non-operator admin can't.
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-owner@example.test', %L, 'preview', '{"previewUrl":"https://preview.example.test"}')$q$, ws, owner_id, req), '%website_change_operator_required%');
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-admin@example.test', %L, 'preview', '{"previewUrl":"https://preview.example.test"}')$q$, ws, admin_id, req), '%website_change_operator_required%');
  -- A preview must be an https URL.
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-operator@example.test', %L, 'preview', '{"previewUrl":"http://preview.example.test"}')$q$, ws, operator_id, req), '%website_change_invalid%');
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-operator@example.test', %L, 'preview', '{"previewUrl":"https://p.test","token":"x"}')$q$, ws, operator_id, req), '%website_change_invalid%');
  saved := public.record_website_change_receipt(ws, operator_id, 'WC-OPERATOR@example.test', req, 'preview', '{"previewUrl":"https://mclears-git-private-events.vercel.app","note":"Built on a branch"}');
  perform pg_temp.wc_assert(saved->>'kind' = 'preview' and saved->>'previewUrl' like 'https://mclears%' and (saved->>'systemId')::uuid = '7b000000-0000-4000-8000-0000000000bb', 'preview recorded on the Request''s System');
  -- Only the owner decides; an admin (even the operator) and a member can't.
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-operator@example.test', %L, 'approved', '{}')$q$, ws, operator_id, req), '%website_change_owner_required%');
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-member@example.test', %L, 'approved', '{}')$q$, ws, member_id, req), '%website_change_owner_required%');
  saved := public.record_website_change_receipt(ws, owner_id, 'wc-owner@example.test', req, 'approved', '{}');
  perform pg_temp.wc_assert(saved->>'kind' = 'approved', 'owner approved the preview');
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-owner@example.test', %L, 'declined', '{}')$q$, ws, owner_id, req), '%website_change_out_of_order%');
  -- A deploy needs commit, URL and read-back.
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-operator@example.test', %L, 'deployed', '{"commitSha":"abc1234","deploymentUrl":"https://x.vercel.app"}')$q$, ws, operator_id, req), '%website_change_invalid%');
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-operator@example.test', %L, 'deployed', '{"commitSha":"not-a-sha","deploymentUrl":"https://x.vercel.app","readBack":"confirmed"}')$q$, ws, operator_id, req), '%website_change_invalid%');
  saved := public.record_website_change_receipt(ws, operator_id, 'wc-operator@example.test', req, 'deployed', '{"commitSha":"ABC1234DEF","deploymentUrl":"https://mclears.vercel.app","readBack":"not_confirmed"}');
  perform pg_temp.wc_assert(saved->>'commitSha' = 'abc1234def' and saved->>'readBack' = 'not_confirmed', 'deploy recorded with a failed read-back, as recorded');
  -- A failed read-back is not a retry: another deploy needs a new preview and approval.
  perform pg_temp.wc_expect(format($q$select public.record_website_change_receipt(%L, %L, 'wc-operator@example.test', %L, 'deployed', '{"commitSha":"abc1234","deploymentUrl":"https://x.vercel.app","readBack":"confirmed"}')$q$, ws, operator_id, req), '%website_change_out_of_order%');

  -- Any member reads the System's Requests with receipts, in order; other Requests stay out.
  listed := public.list_website_change_requests(ws, member_id, 'wc-member@example.test', '7b000000-0000-4000-8000-0000000000bb');
  perform pg_temp.wc_assert(jsonb_array_length(listed) = 2, 'both website-change Requests for this System, including the withdrawn one');
  perform pg_temp.wc_assert((select jsonb_agg(x->>'kind') from jsonb_array_elements((select r from jsonb_array_elements(listed) r where r->>'id' = req::text)->'receipts') x)
    = '["preview","approved","deployed"]'::jsonb, 'receipts in order');
  perform pg_temp.wc_assert(jsonb_array_length(public.list_website_change_requests(ws, member_id, 'wc-member@example.test', '7b000000-0000-4000-8000-0000000000cc')) = 0, 'another System has none');
end $$;

-- Not a website-change Request, a closed one, or another business's.
select pg_temp.wc_expect($$select public.record_website_change_receipt('7b000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002', 'wc-operator@example.test', '7b000000-0000-4000-8000-0000000000a2', 'preview', '{"previewUrl":"https://p.test"}')$$, '%website_change_not_found%');
select pg_temp.wc_expect($$select public.record_website_change_receipt('7b000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002', 'wc-operator@example.test', '7b000000-0000-4000-8000-0000000000a3', 'preview', '{"previewUrl":"https://p.test"}')$$, '%website_change_closed%');
select pg_temp.wc_expect($$select public.record_website_change_receipt('7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000002', 'wc-operator@example.test', '7b000000-0000-4000-8000-0000000000a1', 'preview', '{"previewUrl":"https://p.test"}')$$, '%website_change_not_found%');
select pg_temp.wc_expect($$select public.list_website_change_requests('7b000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000004', 'wc-other@example.test', '7b000000-0000-4000-8000-0000000000bb')$$, '%website_change_access_denied%');
select pg_temp.wc_expect($$select public.list_website_change_requests('7b000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000001', 'wc-other@example.test', '7b000000-0000-4000-8000-0000000000bb')$$, '%website_change_access_denied%');

rollback;
\echo 'Website change receipt checks passed.'
