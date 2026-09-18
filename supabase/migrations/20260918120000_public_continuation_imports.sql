-- Idempotent import of a browser-held public brief into one explicitly chosen,
-- directly authorized workspace. No anonymous brief content is stored here.

create table public.public_continuation_imports (
  continuation_id uuid primary key,
  imported_by uuid not null references public.users(id) on delete restrict,
  -- Keep the importer claim after the destination is deleted. A retained
  -- browser cookie must never become claimable or readable by another account.
  workspace_id uuid not null,
  work_id uuid references public.saved_product_work(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.public_continuation_imports enable row level security;
revoke all on table public.public_continuation_imports from public, anon, authenticated;
grant select, insert on table public.public_continuation_imports to service_role;

create or replace function public.import_public_continuation(
  p_continuation_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_workspace_id uuid,
  p_title text,
  p_payload jsonb,
  p_input jsonb
) returns table (work_id uuid, workspace_id uuid, already_imported boolean)
language plpgsql security definer set search_path = public as $$
declare
  existing public.public_continuation_imports%rowtype;
  created_work_id uuid;
  normalized_email text := lower(btrim(p_verified_email));
begin
  perform pg_advisory_xact_lock(hashtextextended('public-continuation:' || p_continuation_id::text, 0));
  perform 1 from public.users identity where identity.id = p_user_id
    and lower(identity.email) = normalized_email and identity.verified_at is not null
    for share of identity;
  if not found then raise exception 'verified_identity_required'; end if;
  perform 1 from public.workspace_memberships membership
    where membership.workspace_id = p_workspace_id and membership.user_id = p_user_id
    for share of membership;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspaces workspace where workspace.id = p_workspace_id for update;
  if not found then raise exception 'workspace_access_denied'; end if;

  select * into existing from public.public_continuation_imports where continuation_id = p_continuation_id;
  if found then
    if existing.imported_by <> p_user_id then raise exception 'continuation_unavailable'; end if;
    if existing.workspace_id is null or existing.work_id is null then raise exception 'continuation_unavailable'; end if;
    if existing.workspace_id <> p_workspace_id then raise exception 'continuation_destination_changed'; end if;
    return query select existing.work_id, existing.workspace_id, true;
    return;
  end if;
  if (select count(*) from public.saved_product_work where saved_product_work.workspace_id = p_workspace_id) >= 500 then
    raise exception 'saved_work_limit_reached';
  end if;

  insert into public.saved_product_work (workspace_id, product_id, resource_kind, title, payload, input, created_by)
  values (p_workspace_id, 'documents', 'document', nullif(btrim(p_title), ''), p_payload, p_input, p_user_id)
  returning saved_product_work.id into created_work_id;
  insert into public.public_continuation_imports (continuation_id, imported_by, workspace_id, work_id)
  values (p_continuation_id, p_user_id, p_workspace_id, created_work_id);
  return query select created_work_id, p_workspace_id, false;
end;
$$;

create or replace function public.read_public_continuation_import(
  p_continuation_id uuid,
  p_user_id uuid,
  p_verified_email text
) returns table (work_id uuid, workspace_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  imported public.public_continuation_imports%rowtype;
  normalized_email text := lower(btrim(p_verified_email));
begin
  perform 1 from public.users identity where identity.id = p_user_id
    and lower(identity.email) = normalized_email and identity.verified_at is not null
    for share of identity;
  if not found then raise exception 'verified_identity_required'; end if;
  select * into imported from public.public_continuation_imports where continuation_id = p_continuation_id;
  if not found then return; end if;
  if imported.imported_by <> p_user_id then raise exception 'continuation_unavailable'; end if;
  perform 1 from public.workspace_memberships membership
    where membership.workspace_id = imported.workspace_id and membership.user_id = p_user_id
    for share of membership;
  if not found then raise exception 'workspace_access_denied'; end if;
  if imported.work_id is null then raise exception 'continuation_unavailable'; end if;
  return query select imported.work_id, imported.workspace_id;
end;
$$;

revoke all on function public.import_public_continuation(uuid, uuid, text, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_public_continuation(uuid, uuid, text, uuid, text, jsonb, jsonb) to service_role;
revoke all on function public.read_public_continuation_import(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.read_public_continuation_import(uuid, uuid, text) to service_role;
