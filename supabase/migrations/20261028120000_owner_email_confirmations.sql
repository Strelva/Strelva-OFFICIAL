-- Owner email confirmations (switch-on, October 16, 2026).
--
-- Jacob turned on two owner email streams (owner claim and Needs you) on the
-- condition that they reach only owner addresses he has confirmed. An address
-- on file is not a confirmation: a converted site's contact email, an imported
-- owner_email or an agency's claim recipient can all be someone else's inbox.
--
--   owner_email_confirmations   an operator's recorded confirmation that an
--                               address belongs to a business's owner, with a
--                               note saying how it was confirmed. Revoked, not
--                               deleted, so the history stays.
--   owner_email_confirmed       the one read the email transport makes
--                               (src/platform/infra/email/owner-streams.ts):
--                               true for an active confirmation, or for the
--                               business's own signed-in owner (a verified user
--                               with the owner role on that business).
--   confirm_owner_email /
--   revoke_owner_email_confirmation   operator-only writes.
--
-- Nothing here sends mail. Before this migration the transport's RPC call
-- fails and every stream send is held, so the code can ship first.
begin;
set local lock_timeout = '3s';

-- No foreign key to workspaces: tenant_unlink_plan counts every table that
-- references a workspace as use. Rows go with the business (trigger below).
create table public.owner_email_confirmations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email text not null check (email = lower(btrim(email)) and public.business_record_email_valid(email)),
  note text not null check (char_length(btrim(note)) between 1 and 300),
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default clock_timestamp(),
  revoked_by uuid,
  revoked_at timestamptz,
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index owner_email_confirmations_active_idx
  on public.owner_email_confirmations(workspace_id, email) where revoked_at is null;

alter table public.owner_email_confirmations enable row level security;
revoke all on public.owner_email_confirmations from public, anon, authenticated, service_role;

create function public.owner_email_confirmations_forget() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.owner_email_confirmations where workspace_id = old.id;
  return null;
end;
$$;
create trigger workspaces_forget_owner_email_confirmations after delete on public.workspaces
  for each row execute function public.owner_email_confirmations_forget();

-- The transport's read. Staff addresses are never an owner's, even when confirmed.
create function public.owner_email_confirmed(p_workspace_id uuid, p_email text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if p_workspace_id is null or not public.business_record_email_valid(e) then return false; end if;
  if public.owner_contact_staff_reason(p_workspace_id, e) is not null then return false; end if;
  if exists (select 1 from public.owner_email_confirmations c
      where c.workspace_id = p_workspace_id and c.email = e and c.revoked_at is null) then
    return true;
  end if;
  return exists (select 1 from public.workspace_memberships m
    join public.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id and m.role = 'owner'
      and lower(u.email) = e and u.verified_at is not null);
end;
$$;

create function public.confirm_owner_email(
  p_operator_user_id uuid, p_verified_email text, p_workspace_id uuid, p_email text, p_note text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid := public.needs_you_operator_id(p_operator_user_id, p_verified_email);
  e text := lower(btrim(coalesce(p_email, '')));
  created uuid;
begin
  if operator_id is null then raise exception 'owner_email_confirmation_operator_required'; end if;
  if p_workspace_id is null or not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.kind = 'customer') then
    raise exception 'owner_email_confirmation_business_unknown';
  end if;
  if not public.business_record_email_valid(e) then raise exception 'owner_email_confirmation_email_invalid'; end if;
  if char_length(btrim(coalesce(p_note, ''))) not between 1 and 300 then raise exception 'owner_email_confirmation_note_required'; end if;
  if public.owner_contact_staff_reason(p_workspace_id, e) is not null then raise exception 'owner_email_confirmation_staff_address'; end if;
  select c.id into created from public.owner_email_confirmations c
    where c.workspace_id = p_workspace_id and c.email = e and c.revoked_at is null;
  if found then return created; end if;
  insert into public.owner_email_confirmations(workspace_id, email, note, confirmed_by)
    values (p_workspace_id, e, btrim(p_note), operator_id) returning id into created;
  return created;
end;
$$;

create function public.revoke_owner_email_confirmation(
  p_operator_user_id uuid, p_verified_email text, p_workspace_id uuid, p_email text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid := public.needs_you_operator_id(p_operator_user_id, p_verified_email);
begin
  if operator_id is null then raise exception 'owner_email_confirmation_operator_required'; end if;
  update public.owner_email_confirmations set revoked_at = clock_timestamp(), revoked_by = operator_id
    where workspace_id = p_workspace_id and email = lower(btrim(coalesce(p_email, ''))) and revoked_at is null;
  return found;
end;
$$;

revoke all on function public.owner_email_confirmations_forget() from public, anon, authenticated;
revoke all on function public.owner_email_confirmed(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_owner_email(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_owner_email_confirmation(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.owner_email_confirmed(uuid, text) to service_role;
grant execute on function public.confirm_owner_email(uuid, text, uuid, text, text) to service_role;
grant execute on function public.revoke_owner_email_confirmation(uuid, text, uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
