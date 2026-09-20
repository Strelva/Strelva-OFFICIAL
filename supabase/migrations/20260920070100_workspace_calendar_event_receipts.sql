-- One receipt per native reservation/provider keeps the provider event identity
-- stable through response loss, reschedule, cancellation and recovery. A
-- receipt is evidence of an attempted provider write; it is not a second
-- reservation authority.

create table public.workspace_calendar_event_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  request_id text not null check (char_length(btrim(request_id)) between 1 and 100),
  provider text not null check (provider in ('outlook', 'google')),
  calendar_id text not null check (char_length(btrim(calendar_id)) between 1 and 512),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 256),
  external_event_id text,
  operation text not null check (operation in ('create', 'update', 'delete')),
  status text not null check (status in ('writing', 'accepted', 'unknown', 'verified', 'failed')),
  revision integer not null check (revision >= 0),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  start_at timestamptz not null,
  end_at timestamptz not null,
  time_zone text not null check (char_length(btrim(time_zone)) between 1 and 128),
  reminder_policy jsonb not null default '{"mode":"off"}'::jsonb,
  last_error text,
  attempted_at timestamptz,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, work_id, request_id, provider),
  unique (workspace_id, idempotency_key),
  foreign key (work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade,
  check (end_at > start_at),
  check (jsonb_typeof(reminder_policy) = 'object'),
  check (reminder_policy->>'mode' in ('off', 'provider_default', 'provider_minutes'))
);

create index workspace_calendar_event_receipts_work_idx
  on public.workspace_calendar_event_receipts (workspace_id, work_id, request_id);
create index workspace_calendar_event_receipts_recovery_idx
  on public.workspace_calendar_event_receipts (status, updated_at)
  where status in ('writing', 'unknown', 'failed');

alter table public.workspace_calendar_event_receipts enable row level security;
revoke all on table public.workspace_calendar_event_receipts from public, anon, authenticated;
grant select, insert, update on table public.workspace_calendar_event_receipts to service_role;

