-- Additive hardening for the live Supabase backbone. The control plane uses the
-- service role, but auth-facing helpers and bootstrap data should still be safe
-- if API exposure or grants drift later.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The bootstrap allowlist is operational auth configuration, never tenant data.
-- No authenticated policy is intentional: only the service role and the
-- security-definer auth trigger may read or mutate it.
alter table public.super_admin_bootstrap enable row level security;
revoke all on table public.super_admin_bootstrap from anon, authenticated;
grant select, insert, update, delete on table public.super_admin_bootstrap to service_role;

-- Security-definer helpers use an empty search_path and fully-qualified objects
-- so a caller cannot shadow a referenced table or function.
create or replace function public.app_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.super_admins as super_admin
    where super_admin.user_id = (select auth.uid())
      and super_admin.revoked_at is null
  );
$$;

create or replace function public.app_tenant_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.tenant_id
  from public.memberships as membership
  where membership.user_id = (select auth.uid());
$$;

revoke all on function public.app_is_super_admin() from public, anon;
revoke all on function public.app_tenant_ids() from public, anon;
grant execute on function public.app_is_super_admin() to authenticated, service_role;
grant execute on function public.app_tenant_ids() to authenticated, service_role;

-- Preserve the verified-email provisioning behavior while hardening its lookup
-- path and keeping the app-side email current after an auth email change.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, verified_at)
  values (new.id, new.email, new.email_confirmed_at)
  on conflict (id) do update
    set email = excluded.email,
        verified_at = coalesce(public.users.verified_at, excluded.verified_at);

  if new.email_confirmed_at is not null then
    insert into public.super_admins (user_id, email)
    select new.id, new.email
    where exists (
      select 1
      from public.super_admin_bootstrap as bootstrap
      where bootstrap.email = new.email
    )
    on conflict (user_id) do nothing;

    insert into public.memberships (user_id, tenant_id, role)
    select new.id, invite.tenant_id, invite.role
    from public.invites as invite
    where invite.email = new.email
      and invite.claimed_at is null
      and invite.expires_at > now()
    on conflict (user_id, tenant_id) do nothing;

    update public.invites
    set claimed_at = now()
    where email = new.email
      and claimed_at is null
      and expires_at > now();
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Foreign-key indexes keep deletes/updates on parent identity and tenant rows
-- from scanning entire child tables as the portfolio grows.
create index if not exists memberships_assigned_by_idx
  on public.memberships (assigned_by) where assigned_by is not null;
create index if not exists super_admins_granted_by_idx
  on public.super_admins (granted_by) where granted_by is not null;
create index if not exists invites_invited_by_idx
  on public.invites (invited_by) where invited_by is not null;
create index if not exists site_snapshots_actor_user_id_idx
  on public.site_snapshots (actor_user_id) where actor_user_id is not null;
create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id) where actor_user_id is not null;
create index if not exists build_payments_tenant_idx
  on public.build_payments (tenant_id) where tenant_id is not null;

-- Metrics are monotonic counters. Validate existing rows before making the
-- invariant active for future direct writes.
alter table public.site_metrics
  add constraint site_metrics_count_nonnegative check (count >= 0) not valid;
alter table public.site_metrics validate constraint site_metrics_count_nonnegative;

commit;
