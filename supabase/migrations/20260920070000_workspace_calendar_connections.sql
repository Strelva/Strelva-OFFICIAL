-- Workspace calendars are owned by the workspace release, not by a managed
-- website tenant. Provider secrets stay server-side and are encrypted by the
-- scheduling repository before they reach this table.

create table public.workspace_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('outlook', 'google')),
  calendar_id text not null check (char_length(btrim(calendar_id)) between 1 and 512),
  calendar_name text not null check (char_length(btrim(calendar_name)) between 1 and 200),
  time_zone text not null check (char_length(btrim(time_zone)) between 1 and 128),
  status text not null default 'authorized' check (status in ('authorized', 'connected', 'revoked', 'error')),
  scopes text[] not null default '{}'::text[],
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  reminder_policy jsonb not null default '{"mode":"off"}'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider),
  check (jsonb_typeof(reminder_policy) = 'object'),
  check (reminder_policy->>'mode' in ('off', 'provider_default', 'provider_minutes')),
  check ((reminder_policy->>'mode' <> 'provider_minutes') or ((reminder_policy->>'minutes') ~ '^[0-9]+$' and (reminder_policy->>'minutes')::integer between 0 and 40320))
);

create index workspace_calendar_connections_workspace_idx
  on public.workspace_calendar_connections (workspace_id, provider);

alter table public.workspace_calendar_connections enable row level security;
revoke all on table public.workspace_calendar_connections from public, anon, authenticated;
grant select, insert, update on table public.workspace_calendar_connections to service_role;
