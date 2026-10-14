-- Disposable local database only, after all forward migrations. Not executed.
\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values
  ('25131100-0000-4000-8000-000000000001','client-enrollment@example.test',now()),
  ('25131100-0000-4000-8000-000000000002','client-enrollment-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('25131100-0000-4000-8000-000000000010','agency','Enrollment Agency','25131100-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('25131100-0000-4000-8000-000000000010','25131100-0000-4000-8000-000000000001','owner','25131100-0000-4000-8000-000000000001');

do $contract$
declare
  actor_id uuid := '25131100-0000-4000-8000-000000000001';
  agency_id uuid := '25131100-0000-4000-8000-000000000010';
  enabled jsonb; dark jsonb; old_client jsonb; replay jsonb; before_flags jsonb;
  signature text := 'public.agency_add_client_enrolled(uuid,text,uuid,jsonb,uuid,text,boolean)';
begin
  if has_function_privilege('anon',signature,'EXECUTE')
    or has_function_privilege('authenticated',signature,'EXECUTE')
    or not has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'client_enrollment_acl_invalid'; end if;

  enabled := public.agency_add_client_enrolled(actor_id,'client-enrollment@example.test',agency_id,
    '{"name":"Enabled client","facts":{}}','25131100-0000-4000-8000-000000000021',repeat('a',64),true);
  if enabled->'replayed' <> 'false'::jsonb
    or not exists(select 1 from public.workspace_release_flags where workspace_id=(enabled->>'customerWorkspaceId')::uuid
      and flag='systems' and state='on' and revision=1 and changed_by=actor_id)
    or not exists(select 1 from public.workspace_release_flag_changes where workspace_id=(enabled->>'customerWorkspaceId')::uuid
      and subject='systems' and from_state='unset' and to_state='on' and changed_by=actor_id) then raise exception 'client_enrollment_missing'; end if;
  if (select count(*) from public.workspace_release_flag_changes where workspace_id=(enabled->>'customerWorkspaceId')::uuid)<>1 then raise exception 'client_enrollment_history_count'; end if;
  if exists(select 1 from public.workspace_memberships where workspace_id=(enabled->>'customerWorkspaceId')::uuid and user_id=actor_id)
    or not exists(select 1 from public.provider_seats where customer_workspace_id=(enabled->>'customerWorkspaceId')::uuid and agency_workspace_id=agency_id)
    then raise exception 'client_enrollment_changed_authority'; end if;

  -- An explicit existing hold survives both replay modes, including its revision.
  update public.workspace_release_flags set state='off',revision=2 where workspace_id=(enabled->>'customerWorkspaceId')::uuid and flag='systems';
  before_flags := public.read_workspace_release_flags((enabled->>'customerWorkspaceId')::uuid);
  replay := public.agency_add_client_enrolled(actor_id,'client-enrollment@example.test',agency_id,
    '{"name":"Enabled client","facts":{}}','25131100-0000-4000-8000-000000000021',repeat('a',64),true);
  if replay->'replayed' <> 'true'::jsonb or public.read_workspace_release_flags((enabled->>'customerWorkspaceId')::uuid) is distinct from before_flags then raise exception 'client_enrollment_replay_overrode_hold'; end if;
  perform public.agency_add_client_enrolled(actor_id,'client-enrollment@example.test',agency_id,
    '{"name":"Enabled client","facts":{}}','25131100-0000-4000-8000-000000000021',repeat('a',64),false);
  if (select count(*) from public.workspace_release_flag_changes where workspace_id=(enabled->>'customerWorkspaceId')::uuid)<>1 then raise exception 'client_enrollment_replay_wrote_history'; end if;

  dark := public.agency_add_client_enrolled(actor_id,'client-enrollment@example.test',agency_id,
    '{"name":"Dark client","facts":{}}','25131100-0000-4000-8000-000000000022',repeat('b',64),false);
  perform public.agency_add_client_enrolled(actor_id,'client-enrollment@example.test',agency_id,
    '{"name":"Dark client","facts":{}}','25131100-0000-4000-8000-000000000022',repeat('b',64),true);
  if exists(select 1 from public.workspace_release_flags where workspace_id=(dark->>'customerWorkspaceId')::uuid)
    or exists(select 1 from public.workspace_release_flag_changes where workspace_id=(dark->>'customerWorkspaceId')::uuid) then raise exception 'client_enrollment_dark_replay_enrolled'; end if;

  -- A client added before this wrapper is an existing business too.
  old_client := public.agency_add_client(actor_id,'client-enrollment@example.test',agency_id,
    '{"name":"Preexisting client","facts":{}}','25131100-0000-4000-8000-000000000023',repeat('c',64));
  perform public.agency_add_client_enrolled(actor_id,'client-enrollment@example.test',agency_id,
    '{"name":"Preexisting client","facts":{}}','25131100-0000-4000-8000-000000000023',repeat('c',64),true);
  if exists(select 1 from public.workspace_release_flags where workspace_id=(old_client->>'customerWorkspaceId')::uuid) then raise exception 'client_enrollment_changed_existing_client'; end if;
  if exists(select 1 from public.workspace_release_flags where workspace_id=agency_id) then raise exception 'client_enrollment_changed_agency'; end if;
  if (select additions from public.agency_client_add_quota where agency_workspace_id=agency_id and day=(now() at time zone 'UTC')::date)<>3 then raise exception 'client_enrollment_replay_used_quota'; end if;

  begin
    perform public.agency_add_client_enrolled('25131100-0000-4000-8000-000000000002','client-enrollment-stranger@example.test',agency_id,
      '{"name":"Denied client"}','25131100-0000-4000-8000-000000000024',repeat('d',64),true);
    raise exception 'client_enrollment_stranger_accepted';
  exception when others then if sqlerrm <> 'agency_client_access_denied' then raise; end if; end;
  begin
    perform public.agency_add_client_enrolled(actor_id,'client-enrollment@example.test',agency_id,
      '{"name":"No policy"}','25131100-0000-4000-8000-000000000024',repeat('d',64),null);
    raise exception 'client_enrollment_null_accepted';
  exception when others then if sqlerrm <> 'agency_client_release_policy_required' then raise; end if; end;
end $contract$;

-- History failure must also undo the quota, addition receipt, staff, seat,
-- provider and seeded business facts, as well as the workspace and flag.
create function public.done_agency_client_history_failure() returns trigger language plpgsql as $$
begin
  if new.changed_by='25131100-0000-4000-8000-000000000001'::uuid then raise exception 'client_enrollment_history_failure'; end if;
  return new;
end $$;
create trigger done_agency_client_history_failure before insert on public.workspace_release_flag_changes
  for each row execute function public.done_agency_client_history_failure();
create function pg_temp.client_enrollment_counts() returns jsonb language sql as $$
select jsonb_build_array(
  (select count(*) from public.workspaces), (select count(*) from public.workspace_release_flags),
  (select count(*) from public.agency_client_additions), (select count(*) from public.provider_seats),
  (select count(*) from public.workspace_providers), (select count(*) from public.agency_client_staff),
  (select count(*) from public.business_record_facts),
  (select sum(additions) from public.agency_client_add_quota))
$$;
do $atomic$
declare before_counts jsonb;
begin
  before_counts := pg_temp.client_enrollment_counts();
  begin
    perform public.agency_add_client_enrolled('25131100-0000-4000-8000-000000000001','client-enrollment@example.test','25131100-0000-4000-8000-000000000010',
      '{"name":"Must roll back","facts":{}}','25131100-0000-4000-8000-000000000024',repeat('d',64),true);
    raise exception 'client_enrollment_failed_to_abort';
  exception when others then if sqlerrm <> 'client_enrollment_history_failure' then raise; end if; end;
  if pg_temp.client_enrollment_counts() is distinct from before_counts then raise exception 'client_enrollment_not_atomic'; end if;
end $atomic$;
rollback;
