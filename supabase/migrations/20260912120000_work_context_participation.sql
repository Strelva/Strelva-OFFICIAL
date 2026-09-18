-- Local-only work context and scoped contributions. Existing workspace membership remains authority.
-- No provider connection credentials, external execution grants, or second organization model.
create table public.workspace_work_context (
  work_id uuid primary key references public.saved_product_work(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);
create table public.workspace_work_participation (
  work_id uuid primary key references public.saved_product_work(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);
alter table public.workspace_work_context enable row level security;
alter table public.workspace_work_participation enable row level security;
revoke all on public.workspace_work_context, public.workspace_work_participation from public, anon, authenticated;
grant all on public.workspace_work_context, public.workspace_work_participation to service_role;

create function public.work_auxiliary_revision(p_work public.saved_product_work) returns text
language sql stable set search_path = public, pg_temp as $$
  select coalesce(p_work.payload->>'revision', to_char(p_work.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
$$;
revoke all on function public.work_auxiliary_revision(public.saved_product_work) from public, anon, authenticated;

create function public.read_work_auxiliary(p_user_id uuid, p_verified_email text, p_work_id uuid, p_domain text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.saved_product_work; member_role text; state jsonb;
begin
  if p_domain not in ('context','participation') or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  select * into w from public.saved_product_work where id=p_work_id;
  if not found or w.product_id='product-learning' then raise exception 'workspace_access_denied'; end if;
  select role into member_role from public.workspace_memberships where workspace_id=w.workspace_id and user_id=p_user_id;
  if p_domain='context' then select payload into state from public.workspace_work_context where work_id=p_work_id;
  else select payload into state from public.workspace_work_participation where work_id=p_work_id;
  end if;
  if member_role is null and (p_domain <> 'participation' or not exists(
    select 1 from jsonb_array_elements(coalesce(state->'grants','[]')) g
    where g->>'participantEmail'=lower(p_verified_email) and g->>'status'='active' and (g->>'expiresAt')::timestamptz > clock_timestamp()
  )) then raise exception 'workspace_access_denied'; end if;
  return jsonb_build_object('work',jsonb_build_object('id',w.id,'workspaceId',w.workspace_id,'title',coalesce(w.title,'Untitled work'),'revision',public.work_auxiliary_revision(w),'payload',w.payload),'role',member_role,'payload',state);
end $$;
revoke all on function public.read_work_auxiliary(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.read_work_auxiliary(uuid,text,uuid,text) to service_role;

create function public.commit_work_auxiliary(p_user_id uuid, p_verified_email text, p_work_id uuid, p_domain text, p_expected_revision integer, p_payload jsonb, p_intent text, p_expected_work_revision text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w public.saved_product_work; source_work public.saved_product_work; member_role text; old_state jsonb;
  new_item jsonb; grant_item jsonb; latest_event jsonb; prior_count integer; spent bigint;
begin
  if p_domain not in ('context','participation') or p_intent not in ('manage','contribute')
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  -- One work lock serializes context, grants, domain edits and revocations.
  select * into w from public.saved_product_work where id=p_work_id for update;
  if not found or w.product_id='product-learning' then raise exception 'workspace_access_denied'; end if;
  select role into member_role from public.workspace_memberships where workspace_id=w.workspace_id and user_id=p_user_id for share;
  if p_intent='manage' and coalesce(member_role,'') not in ('owner','admin') then raise exception 'workspace_access_denied'; end if;
  if p_domain='context' and p_intent <> 'manage' then raise exception 'workspace_access_denied'; end if;
  if public.work_auxiliary_revision(w) is distinct from p_expected_work_revision then raise exception 'work_source_changed'; end if;
  if p_domain='context' then select payload into old_state from public.workspace_work_context where work_id=p_work_id;
  else select payload into old_state from public.workspace_work_participation where work_id=p_work_id;
  end if;
  if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647
    or coalesce((old_state->>'revision')::integer,0) <> p_expected_revision then raise exception 'work_auxiliary_conflict'; end if;
  if p_payload->>'version' is distinct from '1' or p_payload->>'revision' is distinct from (p_expected_revision+1)::text
    or jsonb_typeof(p_payload->'grants') is distinct from 'array'
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or jsonb_array_length(p_payload->'grants')>100 or jsonb_array_length(p_payload->'history')>1000
    or octet_length(p_payload::text)>2000000 then raise exception 'work_auxiliary_invalid'; end if;
  prior_count := jsonb_array_length(coalesce(old_state->'history','[]'));
  latest_event := p_payload->'history'->prior_count;
  if jsonb_array_length(p_payload->'history') <> prior_count+1
    or ((p_payload->'history')-prior_count) is distinct from coalesce(old_state->'history','[]')
    or latest_event->>'actorId' is distinct from p_user_id::text then raise exception 'work_auxiliary_invalid'; end if;
  if p_intent='contribute' then
    prior_count := jsonb_array_length(coalesce(old_state->'contributions','[]'));
    if jsonb_typeof(p_payload->'contributions') is distinct from 'array' or jsonb_array_length(p_payload->'contributions') <> prior_count+1
      or ((p_payload->'contributions')-prior_count) is distinct from coalesce(old_state->'contributions','[]')
      or p_payload->'grants' is distinct from old_state->'grants' or latest_event->>'kind' is distinct from 'contribute' then raise exception 'work_auxiliary_invalid'; end if;
    new_item := p_payload->'contributions'->prior_count;
    select g into grant_item from jsonb_array_elements(old_state->'grants') g where g->>'id'=new_item->>'grantId';
    if grant_item is null or grant_item->>'status'<>'active' or (grant_item->>'expiresAt')::timestamptz <= clock_timestamp()
      or grant_item->>'participantEmail' is distinct from lower(p_verified_email) or not (grant_item->'scope' ? 'propose')
      or new_item->>'actorId' is distinct from p_user_id::text or new_item->>'actorEmail' is distinct from lower(p_verified_email)
      or new_item->>'sponsorId' is distinct from grant_item->>'sponsorId'
      or new_item->>'currency' is distinct from grant_item->>'currency'
      or new_item->>'status' is distinct from 'pending'
      or new_item->>'baseWorkRevision' is distinct from public.work_auxiliary_revision(w) then raise exception 'work_grant_denied'; end if;
    if new_item->>'costMinor' is null or new_item->>'costMinor' !~ '^[0-9]+$' then raise exception 'work_grant_budget'; end if;
    select coalesce(sum((c->>'costMinor')::bigint),0) into spent from jsonb_array_elements(coalesce(old_state->'contributions','[]')) c where c->>'grantId'=grant_item->>'id';
    if spent+(new_item->>'costMinor')::bigint > (grant_item->>'budgetMinor')::bigint then raise exception 'work_grant_budget'; end if;
    if exists(select 1 from jsonb_array_elements(coalesce(old_state->'contributions','[]')) c where c->>'grantId'=grant_item->>'id' and c->>'idempotencyKey'=new_item->>'idempotencyKey') then raise exception 'work_auxiliary_conflict'; end if;
  end if;
  if p_domain='context' then
    if jsonb_typeof(p_payload->'facts') is distinct from 'array' or jsonb_typeof(p_payload->'preferences') is distinct from 'array'
      or jsonb_array_length(p_payload->'facts')>500 or jsonb_array_length(p_payload->'preferences')>100 then raise exception 'work_auxiliary_invalid'; end if;
    -- New authority must still point to the exact local source version under lock.
    for grant_item in select g from jsonb_array_elements(p_payload->'grants') g where g->>'status'='active' and not coalesce(old_state->'grants','[]') @> jsonb_build_array(g)
    loop
      select * into source_work from public.saved_product_work where id=(grant_item->>'sourceWorkId')::uuid and workspace_id=w.workspace_id and id<>w.id and product_id<>'product-learning' for share;
      if not found or public.work_auxiliary_revision(source_work) is distinct from grant_item->>'sourceRevision' then raise exception 'work_source_changed'; end if;
      if (grant_item->>'expiresAt')::timestamptz <= clock_timestamp() then raise exception 'work_grant_denied'; end if;
    end loop;
    if latest_event->>'kind'='record_fact' then
      select f into new_item from jsonb_array_elements(p_payload->'facts') f where f->>'id'=latest_event->>'subjectId';
      select * into source_work from public.saved_product_work where id=(new_item->>'sourceWorkId')::uuid and workspace_id=w.workspace_id and product_id<>'product-learning' for share;
      if not found or public.work_auxiliary_revision(source_work) is distinct from new_item->>'sourceRevision' then raise exception 'work_source_changed'; end if;
      if not exists(select 1 from jsonb_array_elements(p_payload->'grants') g where g->>'sourceWorkId'=new_item->>'sourceWorkId' and g->>'status'='active' and (g->'scope' ? 'read') and (g->>'expiresAt')::timestamptz>clock_timestamp()) then raise exception 'work_grant_denied'; end if;
    end if;
    insert into public.workspace_work_context(work_id,payload) values(p_work_id,p_payload) on conflict(work_id) do update set payload=excluded.payload,updated_at=clock_timestamp();
  else
    if jsonb_typeof(p_payload->'contributions') is distinct from 'array' or jsonb_array_length(p_payload->'contributions')>500 then raise exception 'work_auxiliary_invalid'; end if;
    insert into public.workspace_work_participation(work_id,payload) values(p_work_id,p_payload) on conflict(work_id) do update set payload=excluded.payload,updated_at=clock_timestamp();
  end if;
end $$;
revoke all on function public.commit_work_auxiliary(uuid,text,uuid,text,integer,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.commit_work_auxiliary(uuid,text,uuid,text,integer,jsonb,text,text) to service_role;

-- The final source read checks current authority and source version together.
create function public.read_work_granted_source(p_user_id uuid, p_verified_email text, p_work_id uuid, p_source_work_id uuid, p_operation text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.saved_product_work; source_work public.saved_product_work; state jsonb; grant_item jsonb;
begin
  if p_operation not in ('read','use_in_work') or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  select * into w from public.saved_product_work where id=p_work_id for share;
  if not found or w.product_id='product-learning' then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=w.workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select payload into state from public.workspace_work_context where work_id=p_work_id;
  select g into grant_item from jsonb_array_elements(coalesce(state->'grants','[]')) g
    where g->>'sourceWorkId'=p_source_work_id::text and g->>'status'='active' and g->'scope' ? p_operation and (g->>'expiresAt')::timestamptz>clock_timestamp();
  if grant_item is null then raise exception 'work_grant_denied'; end if;
  select * into source_work from public.saved_product_work where id=p_source_work_id and workspace_id=w.workspace_id and product_id<>'product-learning' for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  if public.work_auxiliary_revision(source_work) is distinct from grant_item->>'sourceRevision' then raise exception 'work_source_changed'; end if;
  return jsonb_build_object('id',source_work.id,'workspaceId',source_work.workspace_id,'title',coalesce(source_work.title,'Untitled work'),'revision',public.work_auxiliary_revision(source_work),'payload',source_work.payload);
end $$;
revoke all on function public.read_work_granted_source(uuid,text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.read_work_granted_source(uuid,text,uuid,uuid,text) to service_role;
