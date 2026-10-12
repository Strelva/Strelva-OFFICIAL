-- ADR 0015 (20261023141000): a business's owners and admins make its Systems;
-- members do not; the failed-plan fallback files only to a single agency.
\set ON_ERROR_STOP 1
begin;
insert into public.users(id,email,verified_at) values
  ('7e000000-0000-4000-8000-000000000001','owner@self-serve.example.test',now()),
  ('7e000000-0000-4000-8000-000000000002','admin@self-serve.example.test',now()),
  ('7e000000-0000-4000-8000-000000000003','member@self-serve.example.test',now()),
  ('7e000000-0000-4000-8000-000000000004','agent@self-serve.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('7e000000-0000-4000-8000-0000000000b1','customer','Self Serve Bakery','7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-0000000000a1','agency','North Studio','7e000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('7e000000-0000-4000-8000-0000000000b1','7e000000-0000-4000-8000-000000000001','owner','7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-0000000000b1','7e000000-0000-4000-8000-000000000002','admin','7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-0000000000b1','7e000000-0000-4000-8000-000000000003','member','7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-0000000000a1','7e000000-0000-4000-8000-000000000004','owner','7e000000-0000-4000-8000-000000000004');

do $$
declare business constant uuid := '7e000000-0000-4000-8000-0000000000b1'; filed uuid;
begin
  if public.workspace_make_systems_authority(business,'7e000000-0000-4000-8000-000000000001') <> 'owner' then raise exception 'owner cannot make Systems'; end if;
  if public.workspace_make_systems_authority(business,'7e000000-0000-4000-8000-000000000002') <> 'owner' then raise exception 'admin cannot make Systems'; end if;
  if public.workspace_make_systems_authority(business,'7e000000-0000-4000-8000-000000000003') <> 'member' then raise exception 'member gained make_systems'; end if;
  if public.workspace_make_systems_authority('7e000000-0000-4000-8000-0000000000a1','7e000000-0000-4000-8000-000000000004') = 'owner' then
    raise exception 'an agency workspace is not a business making its own Systems';
  end if;
  perform public.workspace_require_make_systems(business,'7e000000-0000-4000-8000-000000000001');
  begin
    perform public.workspace_require_make_systems(business,'7e000000-0000-4000-8000-000000000003');
    raise exception 'member passed workspace_require_make_systems';
  exception when others then
    if sqlerrm <> 'workspace_make_systems_required' then raise; end if;
  end;

  -- Failed plan with no agency: nothing is filed, nothing goes to Strelva.
  filed := public.file_failed_system_plan_request(business,'7e000000-0000-4000-8000-000000000001','owner@self-serve.example.test','Track supplier onboarding',repeat('d',64));
  if filed is not null then raise exception 'a failed plan with no agency filed a Request'; end if;
  -- With one agency the fallback goes to it.
  insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by)
    values (business,'7e000000-0000-4000-8000-0000000000a1','owner','7e000000-0000-4000-8000-000000000001');
  filed := public.file_failed_system_plan_request(business,'7e000000-0000-4000-8000-000000000001','owner@self-serve.example.test','Track supplier onboarding',repeat('e',64));
  if not exists (select 1 from public.service_requests where id=filed and provider_kind='agency' and provider_agency_workspace_id='7e000000-0000-4000-8000-0000000000a1') then
    raise exception 'failed plan not filed to the single agency';
  end if;
end $$;
rollback;
