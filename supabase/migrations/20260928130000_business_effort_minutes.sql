-- Human minutes per business per month (ADR 0009 factory test).
-- The business is the customer workspace. A managed website is measured through
-- its active offering_website_bindings row; this migration creates no binding.
-- Entries and voids are append-only. A mistaken entry is corrected by one void
-- record that names the acting super-admin and reason; the entry is retained.
create table public.business_effort_entries (
  -- Supplied by the server command so a lost response can be retried safely.
  id uuid primary key,
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  minutes integer not null check (minutes between 1 and 1440),
  category text not null check (category in ('delivery','change','review','support','recovery','sales','other')),
  occurred_on date not null check (occurred_on >= date '2020-01-01'),
  note text check (note is null or char_length(btrim(note)) between 1 and 280),
  recorded_by uuid not null references public.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);
create index business_effort_entries_business_idx
  on public.business_effort_entries (business_workspace_id, occurred_on desc, id);
create index business_effort_entries_occurred_idx
  on public.business_effort_entries (occurred_on desc, id);

create table public.business_effort_voids (
  entry_id uuid primary key references public.business_effort_entries(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 280),
  voided_by uuid not null references public.users(id) on delete restrict,
  voided_at timestamptz not null default now()
);

alter table public.business_effort_entries enable row level security;
alter table public.business_effort_voids enable row level security;
revoke all on public.business_effort_entries from public, anon, authenticated, service_role;
revoke all on public.business_effort_voids from public, anon, authenticated, service_role;

-- Rows never change. Direct deletes are refused; deleting the business workspace
-- still cascades (the cascade runs inside the foreign-key trigger).
create function public.business_effort_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'business_effort_append_only';
  end if;
  return old;
end;
$$;
create trigger business_effort_entries_append_only
  before update or delete on public.business_effort_entries
  for each row execute function public.business_effort_append_only();
create trigger business_effort_voids_append_only
  before update or delete on public.business_effort_voids
  for each row execute function public.business_effort_append_only();

-- The existing verified identity and active super_admins authority are held
-- through commit, matching the internal product-learning commands.
create function public.business_effort_assert_operator(p_user_id uuid, p_verified_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'business_effort_access_denied'; end if;
  perform 1 from public.super_admins where user_id = p_user_id and revoked_at is null for share;
  if not found then raise exception 'business_effort_access_denied'; end if;
end;
$$;
revoke all on function public.business_effort_assert_operator(uuid,text) from public, anon, authenticated, service_role;

create function public.business_effort_row(p_entry_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', e.id, 'businessId', e.business_workspace_id, 'minutes', e.minutes,
    'category', e.category, 'occurredOn', e.occurred_on, 'note', e.note,
    'recordedBy', e.recorded_by, 'recordedAt', e.recorded_at,
    'void', case when v.entry_id is null then null else jsonb_build_object(
      'reason', v.reason, 'voidedBy', v.voided_by, 'voidedAt', v.voided_at) end)
  from public.business_effort_entries e
  left join public.business_effort_voids v on v.entry_id = e.id
  where e.id = p_entry_id;
$$;
revoke all on function public.business_effort_row(uuid) from public, anon, authenticated, service_role;

create function public.record_business_effort(
  p_user_id uuid, p_verified_email text, p_entry_id uuid, p_business_id uuid,
  p_minutes integer, p_category text, p_occurred_on date, p_note text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.business_effort_entries%rowtype;
begin
  perform public.business_effort_assert_operator(p_user_id, p_verified_email);
  if p_entry_id is null or p_minutes is null or p_minutes not between 1 and 1440
    or p_category is null or p_category not in ('delivery','change','review','support','recovery','sales','other')
    or p_occurred_on is null or p_occurred_on < date '2020-01-01'
    or p_occurred_on > (now() at time zone 'utc')::date
    or (p_note is not null and char_length(btrim(p_note)) not between 1 and 280) then
    raise exception 'business_effort_invalid';
  end if;
  perform 1 from public.workspaces where id = p_business_id and kind = 'customer' for key share;
  if not found then raise exception 'business_effort_business_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('business-effort:' || p_entry_id::text, 0));
  select * into existing from public.business_effort_entries where id = p_entry_id;
  if found then
    if existing.business_workspace_id <> p_business_id or existing.minutes <> p_minutes
      or existing.category <> p_category or existing.occurred_on <> p_occurred_on
      or existing.note is distinct from nullif(btrim(p_note), '') or existing.recorded_by <> p_user_id then
      raise exception 'business_effort_conflict';
    end if;
    return public.business_effort_row(p_entry_id);
  end if;
  insert into public.business_effort_entries(id, business_workspace_id, minutes, category, occurred_on, note, recorded_by)
    values (p_entry_id, p_business_id, p_minutes, p_category, p_occurred_on, nullif(btrim(p_note), ''), p_user_id);
  return public.business_effort_row(p_entry_id);
end;
$$;
revoke all on function public.record_business_effort(uuid,text,uuid,uuid,integer,text,date,text) from public, anon, authenticated;
grant execute on function public.record_business_effort(uuid,text,uuid,uuid,integer,text,date,text) to service_role;

create function public.void_business_effort(
  p_user_id uuid, p_verified_email text, p_entry_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.business_effort_voids%rowtype;
begin
  perform public.business_effort_assert_operator(p_user_id, p_verified_email);
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 280 then
    raise exception 'business_effort_invalid';
  end if;
  perform 1 from public.business_effort_entries where id = p_entry_id for key share;
  if not found then raise exception 'business_effort_entry_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('business-effort:' || p_entry_id::text, 0));
  select * into existing from public.business_effort_voids where entry_id = p_entry_id;
  if found then
    if existing.voided_by <> p_user_id or existing.reason <> btrim(p_reason) then
      raise exception 'business_effort_conflict';
    end if;
    return public.business_effort_row(p_entry_id);
  end if;
  insert into public.business_effort_voids(entry_id, reason, voided_by) values (p_entry_id, btrim(p_reason), p_user_id);
  return public.business_effort_row(p_entry_id);
end;
$$;
revoke all on function public.void_business_effort(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.void_business_effort(uuid,text,uuid,text) to service_role;

-- Customer businesses with their active managed websites and first effort date.
-- The first date lets the measure distinguish a zero month from no measurement.
create function public.read_effort_businesses(p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.business_effort_assert_operator(p_user_id, p_verified_email);
  return coalesce((
    select jsonb_agg(item order by lower(item->>'name'), item->>'id')
    from (
      select jsonb_build_object(
        'id', w.id, 'name', w.name,
        'tenantIds', coalesce((
          select jsonb_agg(t.id order by t.id)
          from public.offering_website_bindings b
          join public.tenants t on t.stable_id = b.tenant_stable_id
          where b.business_workspace_id = w.id and b.status = 'active'), '[]'::jsonb),
        'firstEffortOn', (
          select min(e.occurred_on) from public.business_effort_entries e
          where e.business_workspace_id = w.id
            and not exists (select 1 from public.business_effort_voids v where v.entry_id = e.id))
      ) as item
      from public.workspaces w
      where w.kind = 'customer'
      order by lower(w.name), w.id
      limit 500
    ) businesses
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.read_effort_businesses(uuid,text) from public, anon, authenticated;
grant execute on function public.read_effort_businesses(uuid,text) to service_role;

create function public.read_business_effort(
  p_user_id uuid, p_verified_email text, p_from date, p_business_id uuid
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.business_effort_assert_operator(p_user_id, p_verified_email);
  if p_from is null then raise exception 'business_effort_invalid'; end if;
  return coalesce((
    select jsonb_agg(public.business_effort_row(recent.id) order by recent.occurred_on desc, recent.recorded_at desc, recent.id)
    from (
      select e.id, e.occurred_on, e.recorded_at
      from public.business_effort_entries e
      where e.occurred_on >= p_from
        and (p_business_id is null or e.business_workspace_id = p_business_id)
      order by e.occurred_on desc, e.recorded_at desc, e.id
      limit 10000
    ) recent
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.read_business_effort(uuid,text,date,uuid) from public, anon, authenticated;
grant execute on function public.read_business_effort(uuid,text,date,uuid) to service_role;
