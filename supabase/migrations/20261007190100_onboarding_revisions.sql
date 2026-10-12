-- Onboarding cases take any number of changes. Before this migration the
-- payload held every history entry, capped at 500, and update_onboarding_work
-- required it to grow by exactly one, so change 500 stuck the case for good.
--
-- Every entry is now appended to onboarding_revisions and the payload keeps
-- the latest 50 for the case's History card. Same pattern as
-- 20261007190000_document_revisions.sql.
--
-- Additive and workspace-only: 0 production onboarding rows as of Sept 30.
-- Re-check that count before applying. No tenant, reb: or /api/v1 change.

create table public.onboarding_revisions (
  work_id uuid not null,
  workspace_id uuid not null,
  revision integer not null check (revision > 0),
  entry jsonb not null check (jsonb_typeof(entry) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (work_id, revision),
  foreign key (work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade,
  check (entry->>'revision' = revision::text)
);
create index onboarding_revisions_workspace_idx
  on public.onboarding_revisions(workspace_id, work_id, revision desc);

alter table public.onboarding_revisions enable row level security;
revoke all on public.onboarding_revisions from public, anon, authenticated, service_role;
grant select on public.onboarding_revisions to service_role;

create function public.onboarding_revision_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'onboarding_revision_immutable'; end $$;
create trigger onboarding_revision_append_only_trg
  before update on public.onboarding_revisions
  for each row execute function public.onboarding_revision_append_only();
revoke all on function public.onboarding_revision_append_only() from public, anon, authenticated;

insert into public.onboarding_revisions(work_id, workspace_id, revision, entry)
select work.id, work.workspace_id, (entry->>'revision')::integer, entry
from public.saved_product_work work
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(work.payload->'history') = 'array' then work.payload->'history' else '[]'::jsonb end
) as entry
where work.product_id = 'onboarding' and work.resource_kind = 'case'
  and jsonb_typeof(entry) = 'object'
  and entry->>'revision' ~ '^[0-9]{1,9}$'
  and (entry->>'revision')::integer > 0
on conflict (work_id, revision) do nothing;

create or replace function public.update_onboarding_work(
  p_work_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_expected_revision integer,
  p_payload jsonb
) returns setof public.saved_product_work
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  window_size constant integer := 50;
  existing public.saved_product_work;
  existing_history jsonb;
  expected_tail jsonb;
  tail_length integer;
  existing_revision integer;
  latest jsonb;
  history_count integer;
begin
  if not exists (
    select 1
    from public.users
    where id = p_user_id
      and lower(email) = lower(btrim(p_verified_email))
      and verified_at is not null
  ) then
    raise exception 'workspace_access_denied';
  end if;

  perform 1
  from public.workspace_memberships
  where workspace_id = p_workspace_id and user_id = p_user_id
  for share;
  if not found then raise exception 'workspace_access_denied'; end if;

  select * into existing
  from public.saved_product_work
  where id = p_work_id and workspace_id = p_workspace_id
  for update;
  if not found or existing.product_id is distinct from 'onboarding'
    or existing.resource_kind is distinct from 'case' then
    raise exception 'workspace_access_denied';
  end if;

  if p_expected_revision is null or p_expected_revision < 1
    or p_expected_revision >= 2147483647 then
    raise exception 'onboarding_payload_invalid';
  end if;
  if existing.payload is null
    or jsonb_typeof(existing.payload) is distinct from 'object'
    or jsonb_typeof(existing.payload->'revision') is distinct from 'number'
    or existing.payload->>'revision' is null
    or existing.payload->>'revision' !~ '^[0-9]+$'
    or jsonb_typeof(existing.payload->'history') is distinct from 'array' then
    raise exception 'onboarding_payload_invalid';
  end if;
  begin
    existing_revision := (existing.payload->>'revision')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'onboarding_payload_invalid';
  end;
  if existing_revision is distinct from p_expected_revision then
    raise exception 'onboarding_revision_conflict';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'version') is distinct from 'number'
    or jsonb_typeof(p_payload->'revision') is distinct from 'number'
    or p_payload->>'version' is distinct from '1'
    or p_payload->>'revision' is null
    or p_payload->>'revision' !~ '^[0-9]+$'
    or p_payload->>'title' is null
    or char_length(p_payload->>'title') not between 1 and 160
    or jsonb_typeof(p_payload->'createdBy') is distinct from 'string'
    or jsonb_typeof(p_payload->'createdAt') is distinct from 'string'
    or p_payload->'createdBy' is distinct from existing.payload->'createdBy'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or jsonb_typeof(p_payload->'status') is distinct from 'string'
    or p_payload->>'status' not in ('in_progress', 'complete')
    or coalesce(jsonb_typeof(p_payload->'assignee'), 'missing') not in ('object', 'null')
    or jsonb_typeof(p_payload->'requirements') is distinct from 'array'
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or octet_length(p_payload::text) > 2_000_000 then
    raise exception 'onboarding_payload_invalid';
  end if;

  if (p_payload->>'revision')::integer is distinct from p_expected_revision + 1 then
    raise exception 'onboarding_payload_invalid';
  end if;
  -- The new window is the last (window_size - 1) stored entries followed by
  -- exactly one new entry. Older entries live only in onboarding_revisions.
  existing_history := existing.payload->'history';
  tail_length := least(jsonb_array_length(existing_history), window_size - 1);
  select coalesce(jsonb_agg(item order by position), '[]'::jsonb) into expected_tail
  from jsonb_array_elements(existing_history) with ordinality as entry(item, position)
  where position > jsonb_array_length(existing_history) - tail_length;
  history_count := jsonb_array_length(p_payload->'history');
  if history_count is distinct from tail_length + 1
    or ((p_payload->'history') - (history_count - 1)) is distinct from expected_tail then
    raise exception 'onboarding_payload_invalid';
  end if;
  latest := p_payload->'history'->(history_count - 1);
  if jsonb_typeof(latest) is distinct from 'object'
    or jsonb_typeof(latest->'revision') is distinct from 'number'
    or latest->>'revision' is distinct from (p_expected_revision + 1)::text
    or latest->>'actorId' is distinct from p_user_id::text
    or latest->>'at' is null
    or latest->>'kind' not in ('assigned', 'supplied', 'reviewed', 'correction_requested', 'accepted')
    or coalesce(jsonb_typeof(latest->'requirementId'), 'missing') not in ('string', 'null') then
    raise exception 'onboarding_payload_invalid';
  end if;

  -- Store every entry in the window. Earlier entries (the "created" entry,
  -- or entries from before this table) are kept on first sight; the new
  -- entry must be new.
  insert into public.onboarding_revisions(work_id, workspace_id, revision, entry)
  select p_work_id, p_workspace_id, (item->>'revision')::integer, item
  from jsonb_array_elements(expected_tail) as item
  where jsonb_typeof(item) = 'object' and item->>'revision' ~ '^[0-9]{1,9}$' and (item->>'revision')::integer > 0
  on conflict (work_id, revision) do nothing;
  begin
    insert into public.onboarding_revisions(work_id, workspace_id, revision, entry)
    values (p_work_id, p_workspace_id, p_expected_revision + 1, latest);
  exception when unique_violation then
    raise exception 'onboarding_revision_conflict';
  end;

  return query
  update public.saved_product_work
  set payload = p_payload,
      title = p_payload->>'title',
      updated_at = clock_timestamp()
  where id = p_work_id
  returning *;
end
$$;

revoke all on function public.update_onboarding_work(uuid, uuid, uuid, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_onboarding_work(uuid, uuid, uuid, text, integer, jsonb)
  to service_role;
