\set ON_ERROR_STOP on

create function pg_temp.custom_assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.custom_assert_true(
  has_function_privilege('service_role', 'public.custom_application_read(uuid,uuid,text)', 'EXECUTE'),
  'service_role must execute the custom application read RPC'
);
select pg_temp.custom_assert_true(
  not has_function_privilege('authenticated', 'public.custom_application_read(uuid,uuid,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.custom_application_read(uuid,uuid,text)', 'EXECUTE'),
  'browser roles must not execute the custom application read RPC'
);
select pg_temp.custom_assert_true(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.custom_application_states'::regclass,
    'public.custom_application_artifacts'::regclass,
    'public.custom_application_reviews'::regclass,
    'public.custom_application_releases'::regclass,
    'public.custom_application_grants'::regclass
  )),
  'custom application lifecycle tables must have RLS enabled'
);

do $custom_application_test$
<<custom_application_test>>
declare
  owner_id uuid := 'e1000000-0000-4000-8000-000000000001';
  recipient_id uuid := 'e1000000-0000-4000-8000-000000000002';
  workspace_id uuid := 'e1000000-0000-4000-8000-000000000010';
  work_id uuid := 'e1000000-0000-4000-8000-000000000020';
  job_id uuid;
  app jsonb;
  files jsonb := jsonb_build_object('build.mjs', 'local build source');
  html_v1 text := '<main>v1</main>';
  html_v2 text := '<main>v2</main>';
  digest_v1 text;
  digest_v2 text;
  grant_row public.custom_application_grants;
  use_row jsonb;
  caught text;
begin
  insert into public.users(id, email, verified_at) values
    (owner_id, 'custom-owner@example.com', now()),
    (recipient_id, 'custom-recipient@example.com', now());
  insert into public.workspaces(id, kind, name, created_by)
    values (workspace_id, 'personal', 'Custom application fixture', owner_id);
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values (workspace_id, owner_id, 'owner', owner_id);

  insert into public.saved_product_work(
    id, workspace_id, product_id, resource_kind, title, payload, created_by
  ) values (
    work_id, workspace_id, 'custom-applications', 'custom-application', 'Local handoff',
    jsonb_build_object(
      'version', 1, 'revision', 0, 'title', 'Local handoff', 'createdBy', owner_id,
      'createdAt', clock_timestamp(), 'history', '[]'::jsonb,
      'product', 'custom-applications', 'status', 'draft', 'maintenanceOwner', owner_id,
      'candidate', jsonb_build_object(
        'revision', 0, 'version', 1, 'title', 'Local handoff', 'files', files,
        'sourceDigest', public.custom_application_source_digest(files), 'artifact', null
      ),
      'currentReleaseVersion', null, 'releases', '[]'::jsonb, 'budget', null,
      'updatedAt', clock_timestamp()
    ), owner_id
  );

  -- The custom build is admitted through the shared work-economics ledger.
  select id into job_id from public.job_economics_command(
    jsonb_build_object(
      'action', 'create', 'productId', 'custom-applications', 'resourceKind', 'custom-application',
      'workspaceId', workspace_id, 'workId', work_id, 'payerId', owner_id,
      'estimateCents', 0, 'maxAuthorizedCents', 0
    ), owner_id, 'custom-owner@example.com'
  );
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'accept', 'jobId', job_id), owner_id, 'custom-owner@example.com'
  );
  perform public.custom_application_set_budget(
    work_id, workspace_id, job_id, 0, 0, owner_id, 'custom-owner@example.com'
  );

  begin
    perform public.custom_application_release(work_id, 0, null, owner_id, 'custom-owner@example.com');
    raise exception 'unreviewed custom artifact was released';
  exception when others then
    caught := sqlerrm;
    perform pg_temp.custom_assert_true(caught = 'custom_application_review_required', 'release requires a reviewed artifact');
  end;

  digest_v1 := public.custom_application_digest(workspace_id, work_id, 1, html_v1);
  perform public.custom_application_store_artifact(
    work_id, 1, public.custom_application_source_digest(files), digest_v1,
    'node@sha256:test', html_v1, clock_timestamp(), 4,
    '{"network":"none","memoryMb":256,"cpuCount":1,"timeoutSeconds":30}'::jsonb,
    0, owner_id, 'custom-owner@example.com'
  );
  perform public.custom_application_review(
    work_id, 0, digest_v1,
    '[{"id":"build","passed":true,"evidence":"ledger receipt"},{"id":"desktop","passed":true,"evidence":"desktop fixture"},{"id":"mobile","passed":true,"evidence":"mobile fixture"},{"id":"keyboard","passed":true,"evidence":"keyboard fixture"}]'::jsonb,
    owner_id, 'custom-owner@example.com'
  );
  select public.custom_application_release(work_id, 0, null, owner_id, 'custom-owner@example.com') into app;
  perform pg_temp.custom_assert_true((app->>'currentReleaseVersion')::integer = 1, 'first reviewed artifact must become release one');

  select * into grant_row from public.custom_application_grant(
    work_id, 'custom-recipient@example.com', null, 'Use the released handoff', now() + interval '30 days',
    owner_id, 'custom-owner@example.com'
  );
  select public.custom_application_use(work_id, recipient_id, 'custom-recipient@example.com') into use_row;
  perform pg_temp.custom_assert_true(use_row->>'html' = html_v1 and (use_row->>'releaseVersion')::integer = 1, 'recipient must receive the exact granted artifact');

  begin
    update public.custom_application_artifacts as artifact set html = '<main>tampered</main>'
      where artifact.work_id = custom_application_test.work_id and artifact.application_version = 1;
    raise exception 'immutable artifact accepted an update';
  exception when others then
    caught := sqlerrm;
    perform pg_temp.custom_assert_true(caught = 'custom_application_artifact_immutable', 'artifact updates must be rejected');
  end;

  app := public.custom_application_update_candidate(
    work_id, 0, 'Local handoff v2', jsonb_build_object('build.mjs', 'local build source v2'),
    owner_id, 'custom-owner@example.com'
  );
  digest_v2 := public.custom_application_digest(workspace_id, work_id, 2, html_v2);
  perform public.custom_application_store_artifact(
    work_id, 2, public.custom_application_source_digest(jsonb_build_object('build.mjs', 'local build source v2')),
    digest_v2, 'node@sha256:test', html_v2, clock_timestamp(), 4,
    '{"network":"none","memoryMb":256,"cpuCount":1,"timeoutSeconds":30}'::jsonb,
    (app->'candidate'->>'revision')::integer, owner_id, 'custom-owner@example.com'
  );
  perform public.custom_application_review(
    work_id, (app->'candidate'->>'revision')::integer, digest_v2,
    '[{"id":"build","passed":true,"evidence":"ledger receipt"},{"id":"desktop","passed":true,"evidence":"desktop fixture"},{"id":"mobile","passed":true,"evidence":"mobile fixture"},{"id":"keyboard","passed":true,"evidence":"keyboard fixture"}]'::jsonb,
    owner_id, 'custom-owner@example.com'
  );
  select public.custom_application_release(work_id, (app->'candidate'->>'revision')::integer, 1, owner_id, 'custom-owner@example.com') into app;
  select public.custom_application_use(work_id, recipient_id, 'custom-recipient@example.com') into use_row;
  perform pg_temp.custom_assert_true(use_row->>'html' = html_v1 and (use_row->>'releaseVersion')::integer = 1, 'existing recipient access must remain on its original release');

  perform public.custom_application_rollback(work_id, 2, 1, owner_id, 'custom-owner@example.com');
  perform pg_temp.custom_assert_true(
    (public.custom_application_read(work_id, owner_id, 'custom-owner@example.com')->>'currentReleaseVersion')::integer = 1,
    'rollback must move the live pointer without deleting release history'
  );
  perform pg_temp.custom_assert_true(
    (select count(*) from public.custom_application_releases as release where release.work_id = custom_application_test.work_id) = 2,
    'rollback must preserve both immutable release records'
  );

  perform public.custom_application_revoke_grant(work_id, grant_row.id, owner_id, 'custom-owner@example.com');
  begin
    perform public.custom_application_use(work_id, recipient_id, 'custom-recipient@example.com');
    raise exception 'revoked recipient access remained usable';
  exception when others then
    caught := sqlerrm;
    perform pg_temp.custom_assert_true(caught = 'custom_application_recipient_denied', 'revoked access must deny recipient use');
  end;
end;
$custom_application_test$;

select 'custom application lifecycle schema checks passed' as result;
