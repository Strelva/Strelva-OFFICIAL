\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

-- Hosted website publication: exact approved candidate only, stable address,
-- address uniqueness, membership, offline, workspace exit and public reads.
do $$
declare
  owner_id uuid := '13000000-0000-4000-8000-000000000001';
  outsider_id uuid := '13000000-0000-4000-8000-000000000002';
  workspace_id uuid := '13000000-0000-4000-8000-000000000010';
  other_workspace_id uuid := '13000000-0000-4000-8000-000000000011';
  work_id uuid := '13000000-0000-4000-8000-000000000020';
  second_work_id uuid := '13000000-0000-4000-8000-000000000021';
  other_work_id uuid := '13000000-0000-4000-8000-000000000022';
  hash_a text := repeat('a', 64);
  hash_b text := repeat('b', 64);
  digest_c text := repeat('c', 64);
  approved jsonb;
  published public.website_publications;
  live record;
begin
  insert into public.users (id, email, verified_at) values
    (owner_id, 'publication-owner@example.test', clock_timestamp()),
    (outsider_id, 'publication-outsider@example.test', clock_timestamp());
  insert into public.workspaces (id, kind, name, created_by) values
    (workspace_id, 'personal', 'Publication owner', owner_id),
    (other_workspace_id, 'personal', 'Publication other', outsider_id);
  insert into public.workspace_memberships (workspace_id, user_id, role, created_by) values
    (workspace_id, owner_id, 'owner', owner_id),
    (other_workspace_id, outsider_id, 'owner', outsider_id);

  approved := jsonb_build_object('version', 1, 'revision', 3, 'title', 'Northstar', 'status', 'launch_pending',
    'approvedCandidateRevision', 2,
    'candidate', jsonb_build_object('revision', 2, 'contentHash', hash_a, 'artifactDigest', digest_c));
  insert into public.saved_product_work (id, workspace_id, product_id, resource_kind, title, payload, input, created_by) values
    (work_id, workspace_id, 'websites', 'website', 'Northstar', approved, '{"version":1,"requestId":"publication-1"}'::jsonb, owner_id),
    (second_work_id, workspace_id, 'websites', 'website', 'Northstar again', approved, '{"version":1,"requestId":"publication-2"}'::jsonb, owner_id),
    (other_work_id, other_workspace_id, 'websites', 'website', 'Other', approved, '{"version":1,"requestId":"publication-3"}'::jsonb, outsider_id);

  -- Only the exact approved candidate can be published.
  begin
    perform public.publish_website(work_id, workspace_id, owner_id, 'publication-owner@example.test', 'northstar', 2, hash_b, digest_c, null, '{"/":"<html></html>"}'::jsonb);
    raise exception 'an unapproved content hash was published';
  exception when others then
    perform pg_temp.assert_true(sqlerrm like '%website_publication_not_approved%', 'unapproved publish must be refused: ' || sqlerrm);
  end;

  -- Direct membership and a verified identity are required.
  begin
    perform public.publish_website(work_id, workspace_id, outsider_id, 'publication-outsider@example.test', 'northstar', 2, hash_a, digest_c, null, '{"/":"<html></html>"}'::jsonb);
    raise exception 'a non-member published a website';
  exception when others then
    perform pg_temp.assert_true(sqlerrm like '%workspace_access_denied%', 'non-member publish must be denied: ' || sqlerrm);
  end;
  begin
    perform public.publish_website(work_id, workspace_id, owner_id, 'someone-else@example.test', 'northstar', 2, hash_a, digest_c, null, '{"/":"<html></html>"}'::jsonb);
    raise exception 'an unverified email published a website';
  exception when others then
    perform pg_temp.assert_true(sqlerrm like '%workspace_access_denied%', 'wrong identity must be denied: ' || sqlerrm);
  end;

  -- A home page is required.
  begin
    perform public.publish_website(work_id, workspace_id, owner_id, 'publication-owner@example.test', 'northstar', 2, hash_a, digest_c, null, '{"/about":"<html></html>"}'::jsonb);
    raise exception 'a site without a home page was published';
  exception when check_violation then null;
  end;

  select * into published from public.publish_website(work_id, workspace_id, owner_id, 'publication-owner@example.test', 'northstar', 2, hash_a, digest_c, 'https://app.strelva.com', '{"/":"<html>v2</html>"}'::jsonb);
  perform pg_temp.assert_true(published.address = 'northstar' and published.status = 'live', 'first publish must be live at the proposed address');

  select * into live from public.read_live_website('NorthStar');
  perform pg_temp.assert_true(live.pages->>'/' = '<html>v2</html>' and live.connect_origin = 'https://app.strelva.com', 'public read must return the live pages');

  -- Another website cannot take a used address.
  begin
    perform public.publish_website(second_work_id, workspace_id, owner_id, 'publication-owner@example.test', 'northstar', 2, hash_a, digest_c, null, '{"/":"<html></html>"}'::jsonb);
    raise exception 'two websites shared one address';
  exception when others then
    perform pg_temp.assert_true(sqlerrm like '%website_address_taken%', 'duplicate address must be refused: ' || sqlerrm);
  end;

  -- Republishing keeps the original address and replaces the pages.
  update public.saved_product_work
     set payload = jsonb_set(jsonb_set(payload, '{approvedCandidateRevision}', '4'), '{candidate}', jsonb_build_object('revision', 4, 'contentHash', hash_b, 'artifactDigest', digest_c))
   where id = work_id;
  select * into published from public.publish_website(work_id, workspace_id, owner_id, 'publication-owner@example.test', 'ignored-new-address', 4, hash_b, digest_c, null, '{"/":"<html>v4</html>"}'::jsonb);
  perform pg_temp.assert_true(published.address = 'northstar' and published.candidate_revision = 4, 'republish must keep the address');
  select * into live from public.read_live_website('northstar');
  perform pg_temp.assert_true(live.pages->>'/' = '<html>v4</html>', 'republish must replace the pages');

  -- A non-member cannot take a site offline; the owner can.
  begin
    perform public.take_website_offline(work_id, workspace_id, outsider_id, 'publication-outsider@example.test');
    raise exception 'a non-member took a website offline';
  exception when others then
    perform pg_temp.assert_true(sqlerrm like '%workspace_access_denied%', 'non-member offline must be denied: ' || sqlerrm);
  end;
  select * into published from public.take_website_offline(work_id, workspace_id, owner_id, 'publication-owner@example.test');
  perform pg_temp.assert_true(published.status = 'offline', 'offline must be recorded');
  perform pg_temp.assert_true(not exists(select 1 from public.read_live_website('northstar')), 'offline sites must not be served');
  begin
    perform public.take_website_offline(second_work_id, workspace_id, owner_id, 'publication-owner@example.test');
    raise exception 'an unpublished website was taken offline';
  exception when others then
    perform pg_temp.assert_true(sqlerrm like '%website_publication_missing%', 'unpublished offline must be refused: ' || sqlerrm);
  end;

  -- A completed workspace exit hides live sites and blocks new publication,
  -- while taking the site offline stays possible.
  select * into published from public.publish_website(work_id, workspace_id, owner_id, 'publication-owner@example.test', 'northstar', 4, hash_b, digest_c, null, '{"/":"<html>v4</html>"}'::jsonb);
  insert into public.workspace_exit_requests (workspace_id, requested_by, idempotency_key, command_digest, future_work, provider_participation, maintained_resource_action, state, completed_at)
  values (workspace_id, owner_id, 'publication-exit', repeat('d', 64), 'pause', 'keep', 'stop', '{"status":"completed"}'::jsonb, clock_timestamp());
  perform pg_temp.assert_true(not exists(select 1 from public.read_live_website('northstar')), 'an exited workspace must not serve its site');
  begin
    perform public.publish_website(work_id, workspace_id, owner_id, 'publication-owner@example.test', 'northstar', 4, hash_b, digest_c, null, '{"/":"<html>v4</html>"}'::jsonb);
    raise exception 'an exited workspace published a website';
  exception when others then
    perform pg_temp.assert_true(sqlerrm like '%workspace_exit_future_work_blocked%', 'exit must block publish: ' || sqlerrm);
  end;
  select * into published from public.take_website_offline(work_id, workspace_id, owner_id, 'publication-owner@example.test');
  perform pg_temp.assert_true(published.status = 'offline', 'an exited workspace can still take its site offline');
end;
$$;

-- Browser roles never read or write publications directly.
select pg_temp.assert_true(not has_table_privilege('anon', 'public.website_publications', 'select'), 'anon must not read publications');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.website_publications', 'select'), 'authenticated must not read publications');
select pg_temp.assert_true(not has_table_privilege('service_role', 'public.website_publications', 'insert'), 'service role writes only through functions');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.read_live_website(text)', 'execute'), 'anon must not call the public read directly');
