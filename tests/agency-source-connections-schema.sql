-- Contract for 20261024600000_agency_source_connections.sql. Runs as the
-- bootstrap superuser on a throwaway cluster; each refusal is asserted.
\set ON_ERROR_STOP 1
begin;
insert into public.users(id, email, verified_at) values ('6e000000-0000-4000-8000-000000000001', 'ghl-owner@agency.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('6e000000-0000-4000-8000-000000000020', 'agency', 'GHL Agency', '6e000000-0000-4000-8000-000000000001'),
  ('6e000000-0000-4000-8000-000000000021', 'agency', 'Other Agency', '6e000000-0000-4000-8000-000000000001');

do $$
declare
  sealed constant text := 'enc:v1:AAAA:BBBB:CCCC';
  refused boolean;
begin
  insert into public.agency_source_connections(workspace_id, provider, external_account_id, access_token_ciphertext, refresh_token_ciphertext, connected_by)
  values ('6e000000-0000-4000-8000-000000000020', 'gohighlevel', 'cmpFixture01', sealed, sealed, '6e000000-0000-4000-8000-000000000001');

  -- Plaintext tokens are refused even if a caller skipped encryption.
  refused := false;
  begin
    insert into public.agency_source_connections(workspace_id, provider, external_account_id, access_token_ciphertext, connected_by)
    values ('6e000000-0000-4000-8000-000000000021', 'gohighlevel', 'cmpFixture02', 'plain-token', '6e000000-0000-4000-8000-000000000001');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'plaintext token accepted'; end if;

  -- One Strelva agency per HighLevel company.
  refused := false;
  begin
    insert into public.agency_source_connections(workspace_id, provider, external_account_id, access_token_ciphertext, connected_by)
    values ('6e000000-0000-4000-8000-000000000021', 'gohighlevel', 'cmpFixture01', sealed, '6e000000-0000-4000-8000-000000000001');
  exception when unique_violation then refused := true; end;
  if not refused then raise exception 'second agency for one company accepted'; end if;

  -- Unknown providers are refused.
  refused := false;
  begin
    insert into public.agency_source_connections(workspace_id, provider, external_account_id, access_token_ciphertext, connected_by)
    values ('6e000000-0000-4000-8000-000000000021', 'hubspot', 'x1', sealed, '6e000000-0000-4000-8000-000000000001');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'unknown provider accepted'; end if;

  -- A revoked connection holds no token.
  refused := false;
  begin
    update public.agency_source_connections set status = 'revoked' where external_account_id = 'cmpFixture01';
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'revoked connection kept its tokens'; end if;

  -- The agency and provider never move.
  refused := false;
  begin
    update public.agency_source_connections set workspace_id = '6e000000-0000-4000-8000-000000000021' where external_account_id = 'cmpFixture01';
  exception when others then refused := sqlerrm like '%agency_source_connection_immutable%'; end;
  if not refused then raise exception 'connection moved between agencies'; end if;

  -- A retried delivery is recorded once.
  insert into public.agency_source_events(provider, delivery_id, event_kind, external_account_id, external_ref)
  values ('gohighlevel', 'wh-1', 'location_installed', 'cmpFixture01', 'loc00001');
  refused := false;
  begin
    insert into public.agency_source_events(provider, delivery_id, event_kind) values ('gohighlevel', 'wh-1', 'location_installed');
  exception when unique_violation then refused := true; end;
  if not refused then raise exception 'duplicate delivery accepted'; end if;
end;
$$;

-- No client role can read or write either table; the service role can.
do $$
begin
  if has_table_privilege('anon', 'public.agency_source_connections', 'select')
    or has_table_privilege('authenticated', 'public.agency_source_connections', 'select')
    or has_table_privilege('authenticated', 'public.agency_source_events', 'insert') then
    raise exception 'client role can reach agency source tables';
  end if;
  if not has_table_privilege('service_role', 'public.agency_source_connections', 'update')
    or not has_table_privilege('service_role', 'public.agency_source_events', 'insert')
    or has_table_privilege('service_role', 'public.agency_source_events', 'update') then
    raise exception 'service role privileges differ from the contract';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.agency_source_connections'::regclass) then
    raise exception 'RLS off';
  end if;
end;
$$;

-- Leave the cluster as it was so rollback can be checked from empty.
rollback;
