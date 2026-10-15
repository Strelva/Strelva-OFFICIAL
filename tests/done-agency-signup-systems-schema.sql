-- Disposable local database only, after all forward migrations. Not yet executed.
\set ON_ERROR_STOP on
begin;

insert into public.users(id,email,verified_at) values
  ('25131000-0000-4000-8000-000000000001','signup-agency@example.test',now()),
  ('25131000-0000-4000-8000-000000000002','signup-unverified@example.test',null);
insert into public.workspaces(id,kind,name,created_by) values
  ('25131000-0000-4000-8000-000000000010','customer','Existing converted business','25131000-0000-4000-8000-000000000001');
insert into public.workspace_release_flags(workspace_id,flag,state,changed_by) values
  ('25131000-0000-4000-8000-000000000010','systems','off','25131000-0000-4000-8000-000000000001');

do $contract$
declare
  actor_id uuid := '25131000-0000-4000-8000-000000000001';
  enabled public.workspaces%rowtype;
  disabled public.workspaces%rowtype;
  existing_agency public.workspaces%rowtype;
  old_flags jsonb;
  old_customer_flags jsonb;
  workspace_count integer;
  signature text := 'public.create_agency_workspace(uuid,text,text,boolean)';
begin
  if has_function_privilege('anon',signature,'EXECUTE')
    or has_function_privilege('authenticated',signature,'EXECUTE')
    or not has_function_privilege('service_role',signature,'EXECUTE') then
    raise exception 'signup_rpc_acl_invalid';
  end if;
  select * into existing_agency from public.create_owned_workspace(actor_id,'signup-agency@example.test','agency','Existing agency');
  insert into public.workspace_release_flags(workspace_id,flag,state,changed_by)
    values(existing_agency.id,'systems','off',actor_id);
  old_flags := public.read_workspace_release_flags(existing_agency.id);
  old_customer_flags := public.read_workspace_release_flags('25131000-0000-4000-8000-000000000010');

  select * into enabled from public.create_agency_workspace(actor_id,'signup-agency@example.test','New enabled agency',true);
  if enabled.kind <> 'agency' or not exists(select 1 from public.workspace_memberships
    where workspace_id=enabled.id and user_id=actor_id and role='owner') then raise exception 'signup_owner_missing'; end if;
  if not exists(select 1 from public.workspace_release_flags where workspace_id=enabled.id
    and flag='systems' and state='on' and revision=1 and changed_by=actor_id) then raise exception 'signup_systems_missing'; end if;
  if (select count(*) from public.workspace_release_flag_changes where workspace_id=enabled.id)<>1
    or not exists(select 1 from public.workspace_release_flag_changes where workspace_id=enabled.id
      and subject='systems' and from_state='unset' and to_state='on' and changed_by=actor_id) then raise exception 'signup_history_missing'; end if;
  if exists(select 1 from public.provider_seats where agency_workspace_id=enabled.id) then raise exception 'signup_granted_client_access'; end if;

  select * into disabled from public.create_agency_workspace(actor_id,'signup-agency@example.test','New dark agency',false);
  if exists(select 1 from public.workspace_release_flags where workspace_id=disabled.id)
    or exists(select 1 from public.workspace_release_flag_changes where workspace_id=disabled.id) then raise exception 'signup_dark_enrolled'; end if;
  if public.read_workspace_release_flags(existing_agency.id) is distinct from old_flags then raise exception 'signup_changed_existing_agency'; end if;
  if public.read_workspace_release_flags('25131000-0000-4000-8000-000000000010') is distinct from old_customer_flags then raise exception 'signup_changed_existing_customer'; end if;
  begin
    update public.workspace_release_flag_changes set reason='Changed history' where workspace_id=enabled.id;
    raise exception 'signup_history_mutable';
  exception when others then
    if sqlerrm <> 'workspace_release_history_immutable' then raise; end if;
  end;

  select count(*) into workspace_count from public.workspaces where created_by=actor_id;
  begin
    perform public.create_agency_workspace('25131000-0000-4000-8000-000000000002','signup-unverified@example.test','Unverified identity',true);
    raise exception 'signup_unverified_accepted';
  exception when others then
    if sqlerrm <> 'verified_identity_required' then raise; end if;
  end;
  begin
    perform public.create_agency_workspace(actor_id,'wrong@example.test','Invalid identity',true);
    raise exception 'signup_identity_accepted';
  exception when others then
    if sqlerrm <> 'verified_identity_required' then raise; end if;
  end;
  begin
    perform public.create_agency_workspace(actor_id,'signup-agency@example.test','Missing policy',null);
    raise exception 'signup_null_policy_accepted';
  exception when others then
    if sqlerrm <> 'agency_signup_release_policy_required' then raise; end if;
  end;
  if (select count(*) from public.workspaces where created_by=actor_id)<>workspace_count then raise exception 'signup_failure_created_workspace'; end if;
end $contract$;

-- Force the second write to fail; workspace, membership and flag must vanish.
create function public.done_agency_signup_history_failure() returns trigger language plpgsql as $$
begin
  if new.changed_by='25131000-0000-4000-8000-000000000001'::uuid then raise exception 'signup_history_failure'; end if;
  return new;
end $$;
create trigger done_agency_signup_history_failure before insert on public.workspace_release_flag_changes
  for each row execute function public.done_agency_signup_history_failure();
do $atomic$
declare before_workspaces bigint; before_memberships bigint; before_flags bigint;
begin
  select count(*) into before_workspaces from public.workspaces;
  select count(*) into before_memberships from public.workspace_memberships;
  select count(*) into before_flags from public.workspace_release_flags;
  begin
    perform public.create_agency_workspace('25131000-0000-4000-8000-000000000001','signup-agency@example.test','Must roll back',true);
    raise exception 'signup_failed_to_abort';
  exception when others then
    if sqlerrm <> 'signup_history_failure' then raise; end if;
  end;
  if (select count(*) from public.workspaces)<>before_workspaces
    or (select count(*) from public.workspace_memberships)<>before_memberships
    or (select count(*) from public.workspace_release_flags)<>before_flags then raise exception 'signup_not_atomic'; end if;
end $atomic$;

-- Four existing creations; the fifth is allowed and the sixth is refused.
do $cap$
declare actor_id uuid := '25131000-0000-4000-8000-000000000001';
begin
  perform public.create_agency_workspace(actor_id,'signup-agency@example.test','Last allowed agency',false);
  begin
    perform public.create_agency_workspace(actor_id,'signup-agency@example.test','Over cap',true);
    raise exception 'signup_cap_accepted';
  exception when others then
    if sqlerrm <> 'workspace_limit_reached' then raise; end if;
  end;
  if (select count(*) from public.workspaces where created_by=actor_id)<>5 then raise exception 'signup_cap_count_invalid'; end if;
end $cap$;

rollback;
