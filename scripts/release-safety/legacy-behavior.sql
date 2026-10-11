-- The Sept 30 authority and client data paths must survive every reversal.
-- Every probe is rolled back so the proof itself changes no retained rows.
begin;
do $proof$
declare w uuid; denied boolean := false;
begin
  if not exists(select 1 from public.content c join public.tenants t on t.id=c.tenant_id
    where t.id='release-fixture' and t.active and c.section='hero'
      and c.tenant_stable_id=t.stable_id and c.data->>'headline'='Before 1.0') then
    raise exception 'legacy_content_or_routing_changed';
  end if;
  if not exists(select 1 from public.memberships where tenant_id='release-fixture'
    and user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='owner') then
    raise exception 'legacy_owner_access_changed';
  end if;
  if not exists(select 1 from public.tenants where id='release-fixture'
    and subscription_status='active' and subscription_plan='growth') then
    raise exception 'legacy_billing_changed';
  end if;
  insert into public.content(tenant_id,section,data) values('release-fixture','rollback-probe','{"write":"works"}');
  update public.content set data='{"write":"still works"}' where tenant_id='release-fixture' and section='rollback-probe';
  if not exists(select 1 from public.content where tenant_id='release-fixture'
    and section='rollback-probe' and data->>'write'='still works' and tenant_stable_id is not null) then
    raise exception 'legacy_content_write_failed';
  end if;
  select id into w from public.create_owned_workspace('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'owner@release.example','personal','Rollback proof');
  if not exists(select 1 from public.workspace_memberships where workspace_id=w
    and user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='owner') then
    raise exception 'legacy_workspace_entry_failed';
  end if;
  begin
    perform public.create_owned_workspace('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'unverified@release.example','personal','Must refuse');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'legacy_unverified_identity_was_allowed'; end if;
  if has_function_privilege('anon','public.create_owned_workspace(uuid,text,text,text)','execute')
    or has_table_privilege('authenticated','public.workspaces','select') then
    raise exception 'legacy_permission_boundary_changed';
  end if;
end; $proof$;
rollback;
