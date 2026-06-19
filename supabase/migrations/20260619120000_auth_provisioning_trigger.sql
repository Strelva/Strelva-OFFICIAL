-- Auth provisioning trigger (migration Phase 4) — replaces the Clerk user.created
-- webhook (src/app/api/clerk/webhook). When a Supabase auth user is created (first
-- sign-in), this auto-provisions the app-side identity so the membership model and
-- super-admin access "just work" without pre-creating accounts.
--
-- Design note: users.id == auth.users.id by construction (we never pre-seed users
-- with a random id), so memberships/super_admins key off the real auth uid. This is
-- why the provisioning is a trigger on first sign-in, not a pre-backfill — it avoids
-- any OAuth identity-linking conflict for the one real (Google) user.

-- Bootstrap list: emails that become super-admins on first sign-in. Runtime-editable
-- (replaces the SUPER_ADMIN_EMAILS env allowlist). Seeded from that env value.
create table if not exists public.super_admin_bootstrap (
  email text primary key
);
insert into public.super_admin_bootstrap (email) values
  ('rhinehart514@gmail.com'),
  ('noahowsh@gmail.com')
on conflict (email) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 1. Mirror the auth user into public.users (id = auth uid).
  insert into public.users (id, email, verified_at)
  values (new.id, new.email, new.email_confirmed_at)
  on conflict (id) do nothing;

  -- 2. Bootstrap super-admin by email (verified-email gate: auth users created via
  --    OAuth/OTP arrive with a confirmed email; password signups confirm before this
  --    fires on the confirm path — guard on email_confirmed_at to be safe).
  if new.email_confirmed_at is not null then
    insert into public.super_admins (user_id, email)
    select new.id, new.email
    where exists (
      select 1 from public.super_admin_bootstrap b where b.email = new.email
    )
    on conflict (user_id) do nothing;
  end if;

  -- 3. Claim pending invites for this email -> memberships.
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
