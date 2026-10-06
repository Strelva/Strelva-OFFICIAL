-- Documents take any number of edits. Before this migration the payload held
-- every receipt, the TypeScript schema capped it at 200, and
-- update_document_work required the payload history to grow by exactly one,
-- so edit 201 failed and Undo (which also appends) could never recover.
--
-- Every receipt is now appended to document_revisions, and the payload keeps
-- only the most recent 20 receipts for the editor's change history. The RPC
-- validates the new receipt exactly as before and checks that the payload
-- window is the previous window's tail plus that receipt.
--
-- Additive and workspace-only: 0 production document rows as of Sept 30.
-- Re-check that count before applying. No tenant, reb: or /api/v1 change.

create table public.document_revisions (
  work_id uuid not null,
  workspace_id uuid not null,
  revision integer not null check (revision > 0),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (work_id, revision),
  foreign key (work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade,
  check (receipt->>'revision' = revision::text)
);
create index document_revisions_workspace_idx
  on public.document_revisions(workspace_id, work_id, revision desc);

alter table public.document_revisions enable row level security;
revoke all on public.document_revisions from public, anon, authenticated, service_role;
grant select on public.document_revisions to service_role;

-- Append-only. A receipt is never rewritten; it goes away only with its
-- document (the cascade above).
create function public.document_revision_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'document_revision_immutable'; end $$;
create trigger document_revision_append_only_trg
  before update on public.document_revisions
  for each row execute function public.document_revision_append_only();
revoke all on function public.document_revision_append_only() from public, anon, authenticated;

-- Keep every receipt already stored in a payload.
insert into public.document_revisions(work_id, workspace_id, revision, receipt)
select work.id, work.workspace_id, (receipt->>'revision')::integer, receipt
from public.saved_product_work work
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(work.payload->'history') = 'array' then work.payload->'history' else '[]'::jsonb end
) as receipt
where work.product_id = 'documents' and work.resource_kind = 'document'
  and jsonb_typeof(receipt) = 'object'
  and receipt->>'revision' ~ '^[0-9]{1,9}$'
  and (receipt->>'revision')::integer > 0
on conflict (work_id, revision) do nothing;

create or replace function public.update_document_work(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_revision integer, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  window_size constant integer := 20;
  existing public.saved_product_work;
  existing_revision integer;
  next_revision integer;
  existing_history jsonb;
  next_history jsonb;
  expected_tail jsonb;
  tail_length integer;
  latest_receipt jsonb;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or existing.product_id<>'documents' or existing.resource_kind<>'document' then raise exception 'workspace_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647 then
    raise exception 'document_payload_invalid';
  end if;
  if existing.payload is null or jsonb_typeof(existing.payload) is distinct from 'object'
    or jsonb_typeof(existing.payload->'revision') is distinct from 'number'
    or existing.payload->>'revision' is null
    or existing.payload->>'revision' !~ '^[0-9]+$'
    or jsonb_typeof(existing.payload->'title') is distinct from 'string'
    or existing.payload->>'title' is null
    or char_length(existing.payload->>'title') not between 1 and 160
    or jsonb_typeof(existing.payload->'text') is distinct from 'string'
    or existing.payload->>'text' is null
    or char_length(existing.payload->>'text') > 50000
    or jsonb_typeof(existing.payload->'history') is distinct from 'array' then
    raise exception 'document_payload_invalid';
  end if;
  begin
    existing_revision := (existing.payload->>'revision')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'document_payload_invalid';
  end;
  if existing_revision is distinct from p_expected_revision then raise exception 'document_revision_conflict'; end if;

  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'version' is distinct from '1'
    or jsonb_typeof(p_payload->'title') is distinct from 'string'
    or p_payload->>'title' is null
    or char_length(p_payload->>'title') not between 1 and 160
    or jsonb_typeof(p_payload->'text') is distinct from 'string'
    or p_payload->>'text' is null
    or char_length(p_payload->>'text') > 50000
    or p_payload->>'revision' is null
    or p_payload->>'revision' !~ '^[0-9]+$'
    or p_payload->'createdBy' is distinct from existing.payload->'createdBy'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or jsonb_typeof(p_payload->'history') is distinct from 'array' then
    raise exception 'document_payload_invalid';
  end if;
  begin
    next_revision := (p_payload->>'revision')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'document_payload_invalid';
  end;
  if next_revision is distinct from p_expected_revision + 1 then raise exception 'document_payload_invalid'; end if;

  -- The new window is the last (window_size - 1) receipts already stored,
  -- followed by exactly one new receipt. Older receipts live only in
  -- document_revisions; nothing earlier in the window may be rewritten.
  existing_history := existing.payload->'history';
  next_history := p_payload->'history';
  tail_length := least(jsonb_array_length(existing_history), window_size - 1);
  select coalesce(jsonb_agg(item order by position), '[]'::jsonb) into expected_tail
  from jsonb_array_elements(existing_history) with ordinality as entry(item, position)
  where position > jsonb_array_length(existing_history) - tail_length;
  if jsonb_array_length(next_history) is distinct from tail_length + 1
    or (next_history - tail_length) is distinct from expected_tail then
    raise exception 'document_payload_invalid';
  end if;
  latest_receipt := next_history->tail_length;
  if latest_receipt is null or jsonb_typeof(latest_receipt) is distinct from 'object'
    or latest_receipt->>'revision' is distinct from (p_expected_revision + 1)::text
    or latest_receipt->>'actorId' is distinct from p_user_id::text
    or latest_receipt->>'at' is null
    or btrim(latest_receipt->>'at') = ''
    or latest_receipt->>'kind' is null
    or latest_receipt->>'kind' not in ('edit', 'undo')
    or jsonb_typeof(latest_receipt->'before') is distinct from 'object'
    or jsonb_typeof(latest_receipt->'after') is distinct from 'object'
    or latest_receipt->'before' is distinct from jsonb_build_object(
      'title', existing.payload->>'title', 'text', existing.payload->>'text')
    or latest_receipt->'after' is distinct from jsonb_build_object(
      'title', p_payload->>'title', 'text', p_payload->>'text') then
    raise exception 'document_payload_invalid';
  end if;
  begin
    insert into public.document_revisions(work_id, workspace_id, revision, receipt)
    values (p_work_id, p_workspace_id, next_revision, latest_receipt);
  exception when unique_violation then
    raise exception 'document_revision_conflict';
  end;
  return query update public.saved_product_work set payload=p_payload, title=p_payload->>'title', updated_at=clock_timestamp()
    where id=p_work_id returning *;
end $$;
revoke all on function public.update_document_work(uuid,uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.update_document_work(uuid,uuid,uuid,text,integer,jsonb) to service_role;
