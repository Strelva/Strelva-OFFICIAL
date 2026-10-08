-- The audit trail cannot be discarded by a rollback after any access change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (select 1 from public.super_admin_access_events) then
    raise exception 'super_admin_grants_rollback_requires_data_preservation';
  end if;
end;
$$;

drop view public.super_admin_access_review;
drop function public.grant_super_admin(uuid, text, uuid);
drop function public.revoke_super_admin(uuid, text, uuid);
drop function public.bootstrap_super_admin(uuid, text);
drop function public.super_admin_manager_actor(uuid);
drop trigger super_admin_access_events_no_truncate on public.super_admin_access_events;
drop trigger super_admin_access_events_immutable on public.super_admin_access_events;
drop function public.super_admin_access_event_immutable();
drop table public.super_admin_access_events;

-- Restore the prior table grants and auth bootstrap behavior if this migration
-- is rolled back before it has recorded any grants or revocations.
grant all on table public.super_admins to anon, authenticated, service_role;

create table public.super_admin_bootstrap (
  email text primary key
);
insert into public.super_admin_bootstrap (email) values
  ('rhinehart514@gmail.com'),
  ('noahowsh@gmail.com');
alter table public.super_admin_bootstrap enable row level security;
grant select, insert, update, delete on table public.super_admin_bootstrap to service_role;

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

commit;
