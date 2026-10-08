\set ON_ERROR_STOP on
-- Run after the retained declaration fixture. The owning Version's pin must
-- remain readable after source unsharing without acquiring writer locks.
select id::text as declaration_version_id from public.system_versions
  where business_workspace_id='bc326000-0000-4000-8000-000000000011' \gset
begin read only;
select set_config('declaration_fixture.version_id', :'declaration_version_id', true);
set local role service_role;
do $$
declare version_id uuid:=current_setting('declaration_fixture.version_id')::uuid; revision jsonb;
begin
  if current_setting('transaction_read_only')<>'on' then raise exception 'declaration_readonly_test_not_readonly'; end if;
  if version_id is null then raise exception 'declaration_readonly_fixture_missing'; end if;
  revision:=public.read_system_version_pinned_revision('bc326000-0000-4000-8000-000000000002',
    'declaration-owner@example.test',version_id);
  if revision->'source'->>'number' is distinct from '5'
    or revision->'definition'->'declaration'->'bindingKinds' is distinct from '["booking_calendar"]'::jsonb then
    raise exception 'declaration_readonly_pin_wrong';
  end if;
  begin
    perform public.read_system_version_pinned_revision('bc326000-0000-4000-8000-000000000003',
      'declaration-stranger@example.test',version_id);
    raise exception 'declaration_readonly_outsider_accepted';
  exception when others then
    if sqlerrm<>'business_record_access_denied' then raise; end if;
  end;
end $$;
rollback;
