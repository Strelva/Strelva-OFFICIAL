-- Site signing keys authenticate server-originated tracking outcomes. The
-- public keys are not secrets, but only the control plane may change them.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create table public.tenant_track_signing_keys (
  tenant_id text primary key references public.tenants(id) on update cascade on delete cascade,
  public_key text not null check (char_length(btrim(public_key)) between 80 and 512),
  created_at timestamptz not null default now()
);

alter table public.tenant_track_signing_keys enable row level security;
revoke all on table public.tenant_track_signing_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.tenant_track_signing_keys to service_role;

commit;
