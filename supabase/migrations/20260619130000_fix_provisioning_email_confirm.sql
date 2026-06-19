-- Fix for the auth-provisioning trigger (20260619120000). Discovered by testing:
-- a user created via the Auth admin API (and any email/password signup) has
-- email_confirmed_at NULL at INSERT time and gets it set by a later UPDATE. The
-- original trigger only ran AFTER INSERT, so the verified-email-gated branches
-- (super-admin bootstrap) never fired for those users.
--
-- Fix: run on INSERT *and* UPDATE OF email_confirmed_at, and put BOTH access-
-- granting branches (super-admin + invite claim) behind the confirmation gate so
-- they fire the moment the email is verified — exactly once, idempotently.
-- public.users is created up front (unconfirmed is fine) so the row always exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Always ensure the app-side user row exists (id = auth uid). verified_at is
  -- backfilled once the email is confirmed.
  insert into public.users (id, email, verified_at)
  values (new.id, new.email, new.email_confirmed_at)
  on conflict (id) do update
    set verified_at = coalesce(public.users.verified_at, excluded.verified_at);

  -- Verified-email gate: grant access only once the email is confirmed.
  if new.email_confirmed_at is not null then
    -- super-admin bootstrap (controlled allowlist -> super_admins)
    insert into public.super_admins (user_id, email)
    select new.id, new.email
    where exists (
      select 1 from public.super_admin_bootstrap b where b.email = new.email
    )
    on conflict (user_id) do nothing;

    -- claim pending invites -> memberships
    insert into public.memberships (user_id, tenant_id, role)
    select new.id, i.tenant_id, i.role
    from public.invites i
    where i.email = new.email
      and i.claimed_at is null
      and i.expires_at > now()
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

-- Recreate the trigger to also fire when email_confirmed_at is set by a later UPDATE.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.handle_new_user();
