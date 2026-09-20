\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  has_table_privilege('service_role', 'public.workspace_calendar_connections', 'SELECT,INSERT,UPDATE')
  and not has_table_privilege('authenticated', 'public.workspace_calendar_connections', 'SELECT')
  and has_table_privilege('service_role', 'public.workspace_calendar_event_receipts', 'SELECT,INSERT,UPDATE')
  and not has_table_privilege('authenticated', 'public.workspace_calendar_event_receipts', 'SELECT'),
  'workspace calendar records remain behind the server boundary'
);

insert into public.users(id, email, verified_at)
values ('b7000000-0000-4000-8000-000000000001', 'calendar-owner@example.test', now())
on conflict (id) do update set verified_at = excluded.verified_at;
insert into public.workspaces(id, kind, name, created_by)
values ('b7000000-0000-4000-8000-000000000010', 'customer', 'Calendar business', 'b7000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
values ('b7000000-0000-4000-8000-000000000010', 'b7000000-0000-4000-8000-000000000001', 'owner', 'b7000000-0000-4000-8000-000000000001')
on conflict (workspace_id, user_id) do nothing;
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values (
  'b7000000-0000-4000-8000-000000000020', 'b7000000-0000-4000-8000-000000000010',
  'scheduling', 'schedule', 'Consultations',
  '{"version":1,"revision":0,"title":"Consultations","createdBy":"b7000000-0000-4000-8000-000000000001","createdAt":"2026-09-20T00:00:00Z","history":[],"availability":[{"start":"2026-09-20T09:00:00Z","end":"2026-09-20T12:00:00Z"}],"reservations":[]}'::jsonb,
  'b7000000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

insert into public.workspace_calendar_connections(
  id, workspace_id, provider, calendar_id, calendar_name, time_zone, status, scopes,
  access_token_ciphertext, refresh_token_ciphertext, reminder_policy, created_by
) values (
  'b7000000-0000-4000-8000-000000000030', 'b7000000-0000-4000-8000-000000000010',
  'outlook', 'calendar-1', 'Operations', 'America/New_York', 'connected',
  array['Calendars.ReadWrite'], 'fixture-access-token', 'fixture-refresh-token', '{"mode":"provider_minutes","minutes":30}'::jsonb,
  'b7000000-0000-4000-8000-000000000001'
)
on conflict (workspace_id, provider) do update set calendar_id = excluded.calendar_id, status = excluded.status;

insert into public.workspace_calendar_event_receipts(
  id, workspace_id, work_id, request_id, provider, calendar_id, idempotency_key,
  external_event_id, operation, status, revision, title, start_at, end_at, time_zone,
  reminder_policy
) values (
  'b7000000-0000-4000-8000-000000000040', 'b7000000-0000-4000-8000-000000000010',
  'b7000000-0000-4000-8000-000000000020', 'request-1', 'outlook', 'calendar-1',
  'schedule:b7000000:request-1', 'event-1', 'create', 'accepted', 1, 'Roof inspection',
  '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 'America/New_York', '{"mode":"provider_minutes","minutes":30}'::jsonb
)
on conflict (workspace_id, work_id, request_id, provider) do update set external_event_id = excluded.external_event_id, status = excluded.status;

select pg_temp.assert_true(
  (select calendar_id from public.workspace_calendar_connections where workspace_id = 'b7000000-0000-4000-8000-000000000010' and provider = 'outlook') = 'calendar-1'
  and (select external_event_id from public.workspace_calendar_event_receipts where work_id = 'b7000000-0000-4000-8000-000000000020' and request_id = 'request-1') = 'event-1',
  'calendar configuration and external event identity survive a receipt replay'
);

select 'workspace calendar schema checks passed' as result;

