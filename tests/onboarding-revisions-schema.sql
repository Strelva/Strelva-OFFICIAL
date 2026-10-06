\set ON_ERROR_STOP on
-- Onboarding cases take any number of changes: 600 assignments through the
-- real RPC, every entry in onboarding_revisions, a bounded payload window.
create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(not has_table_privilege('authenticated','public.onboarding_revisions','SELECT'),'onboarding revisions hidden from authenticated');
select pg_temp.assert_true(not has_table_privilege('service_role','public.onboarding_revisions','INSERT'),'service role cannot insert onboarding revisions directly');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.onboarding_revisions'::regclass),'onboarding revisions RLS on');
-- The earlier fixture's entries were backfilled when the migration ran.
select pg_temp.assert_true(exists(select 1 from public.onboarding_revisions where work_id='d2000000-0000-4000-8000-000000000020'),'existing onboarding entries backfilled');

DO $$
declare
  owner_id uuid := 'd2000000-0000-4000-8000-000000000001';
  workspace uuid := 'd2000000-0000-4000-8000-000000000010';
  case_id uuid := 'd2190000-0000-4000-8000-000000000020';
  current_payload jsonb; next_payload jsonb; entry_value jsonb; i integer; stored integer;
begin
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
  values (case_id, workspace, 'onboarding', 'case', 'Long onboarding',
    jsonb_build_object('version', 1, 'revision', 1, 'title', 'Long onboarding', 'subjectType', 'supplier', 'subjectLabel', 'Acme',
      'status', 'in_progress', 'assignee', null,
      'requirements', jsonb_build_array(jsonb_build_object('id', 'd2190000-0000-4000-8000-000000000030', 'key', 'tax_id', 'label', 'Tax ID',
        'fields', jsonb_build_array(), 'status', 'missing', 'document', null, 'proposedData', jsonb_build_object(),
        'reviewedData', null, 'acceptedRevision', null, 'acceptedAt', null)),
      'history', jsonb_build_array(jsonb_build_object('revision', 1, 'kind', 'created', 'actorId', owner_id::text, 'at', '2026-10-06T12:00:00Z',
        'requirementId', null, 'before', null, 'after', jsonb_build_object('requirementCount', 1), 'note', null)),
      'createdBy', owner_id::text, 'createdAt', '2026-10-06T12:00:00Z'),
    owner_id);
  select payload into current_payload from public.saved_product_work where id = case_id;

  for i in 2..601 loop
    entry_value := jsonb_build_object('revision', i, 'kind', 'assigned', 'actorId', owner_id::text, 'at', '2026-10-06T12:00:00Z',
      'requirementId', null, 'before', current_payload->'assignee', 'after', jsonb_build_object('email', 'reviewer' || i || '@example.com'), 'note', null);
    next_payload := current_payload || jsonb_build_object('revision', i,
      'assignee', jsonb_build_object('email', 'reviewer' || i || '@example.com'),
      'history', (select coalesce(jsonb_agg(e order by p), '[]'::jsonb) from jsonb_array_elements(current_payload->'history') with ordinality x(e, p)
                  where p > jsonb_array_length(current_payload->'history') - 49) || jsonb_build_array(entry_value));
    select payload into current_payload from public.update_onboarding_work(case_id, workspace, owner_id, 'onboarding-owner@example.com', i - 1, next_payload);
  end loop;

  if (current_payload->>'revision')::integer <> 601 then raise exception 'change 600 not saved'; end if;
  if jsonb_array_length(current_payload->'history') <> 50 then raise exception 'onboarding payload window is not 50 entries'; end if;
  select count(*) into stored from public.onboarding_revisions where work_id = case_id;
  if stored <> 601 then raise exception 'expected 601 stored onboarding entries (created + 600), found %', stored; end if;
  if not exists(select 1 from public.onboarding_revisions where work_id = case_id and revision = 1 and entry->>'kind' = 'created') then
    raise exception 'created entry not kept';
  end if;

  -- A window that drops recent entries is refused.
  begin
    perform public.update_onboarding_work(case_id, workspace, owner_id, 'onboarding-owner@example.com', 601,
      current_payload || jsonb_build_object('revision', 602, 'history', jsonb_build_array(
        jsonb_build_object('revision', 602, 'kind', 'assigned', 'actorId', owner_id::text, 'at', '2026-10-06T12:00:00Z', 'requirementId', null, 'before', null, 'after', null, 'note', null))));
    raise exception 'truncated onboarding window accepted';
  exception when others then if SQLERRM <> 'onboarding_payload_invalid' then raise; end if; end;

  -- Outsiders and other workspaces stay denied.
  begin
    perform public.update_onboarding_work(case_id, workspace, 'd2000000-0000-4000-8000-000000000002', 'onboarding-outsider@example.com', 601, next_payload);
    raise exception 'outsider onboarding change accepted';
  exception when others then if SQLERRM <> 'workspace_access_denied' then raise; end if; end;
  begin
    perform public.update_onboarding_work(case_id, (select id from public.workspaces where id <> workspace limit 1), owner_id, 'onboarding-owner@example.com', 601, next_payload);
    raise exception 'cross-workspace onboarding change accepted';
  exception when others then if SQLERRM <> 'workspace_access_denied' then raise; end if; end;

  begin
    update public.onboarding_revisions set entry = entry where work_id = case_id and revision = 1;
    raise exception 'onboarding entry rewrite accepted';
  exception when others then if SQLERRM <> 'onboarding_revision_immutable' then raise; end if; end;
end $$;
