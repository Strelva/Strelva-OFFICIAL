-- Import clients from GoHighLevel (onboarding L6, 2026-10-12): the agency's
-- account connection to a tool it already uses, and the install deliveries
-- that tell Strelva a new client may be waiting to import.
--
-- Additive only. No existing table, function or /api/v1 contract changes.
-- Off unless STRELVA_GHL_IMPORT_RELEASE=1; nothing writes here while it is off.
--
-- agency_source_connections
--   One account connection per (agency workspace, provider), and one Strelva
--   agency per outside account (provider, external_account_id), so a webhook
--   about a HighLevel company finds exactly one agency. An account
--   connection grants no authority (GLOSSARY): reading it never adds a client.
--   Tokens are stored only as `enc:v1:` envelopes from
--   src/platform/infra/crypto/secrets.ts; the CHECK refuses plaintext even if
--   SECRETS_ENC_KEY is unset, because encryptSecret passes plaintext through.
--
-- agency_source_events
--   One row per signed delivery, unique by the provider's delivery id, so a
--   retried delivery is recorded once. A hint only: the import always reads
--   the source again and the agency confirms every add.
--
-- Access: RLS on, every privilege revoked from public/anon/authenticated;
-- the service role reads and writes, and the app checks agency membership.

create table public.agency_source_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('gohighlevel')),
  external_account_id text not null check (external_account_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  scopes text[] not null default '{}'::text[]
    check (cardinality(scopes) <= 40 and array_position(scopes, null) is null),
  access_token_ciphertext text check (access_token_ciphertext is null
    or access_token_ciphertext ~ '^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  refresh_token_ciphertext text check (refresh_token_ciphertext is null
    or refresh_token_ciphertext ~ '^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'revoked')),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  connected_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, provider),
  unique (provider, external_account_id),
  -- A connected row always holds a token; a revoked one holds none.
  check (status <> 'connected' or access_token_ciphertext is not null),
  check (status <> 'revoked' or (access_token_ciphertext is null and refresh_token_ciphertext is null))
);

create table public.agency_source_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('gohighlevel')),
  delivery_id text not null check (char_length(btrim(delivery_id)) between 1 and 200),
  event_kind text not null check (event_kind in (
    'location_installed', 'agency_installed', 'location_created', 'location_uninstalled', 'agency_uninstalled', 'ignored')),
  external_account_id text check (external_account_id is null or external_account_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  external_ref text check (external_ref is null or external_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  received_at timestamptz not null default clock_timestamp(),
  unique (provider, delivery_id)
);
create index agency_source_events_account_idx
  on public.agency_source_events (provider, external_account_id, received_at desc);

alter table public.agency_source_connections enable row level security;
alter table public.agency_source_events enable row level security;
revoke all on table public.agency_source_connections, public.agency_source_events from public, anon, authenticated;
grant select, insert, update, delete on table public.agency_source_connections to service_role;
grant select, insert on table public.agency_source_events to service_role;

create function public.agency_source_connections_touch() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.workspace_id <> old.workspace_id or new.provider <> old.provider or new.created_at <> old.created_at then
    raise exception 'agency_source_connection_immutable';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.agency_source_connections_touch() from public, anon, authenticated;
create trigger agency_source_connections_touch before update on public.agency_source_connections
  for each row execute function public.agency_source_connections_touch();
