-- Pause effort writes before rollback; restore the old code only after success.
-- If zero logs exist, keep the forward schema and a reader that accepts zero.
-- Refuse rollback once explicit zero logs exist: never destroy the ledger to
-- restore the old constraint. Keep the forward migration in that case.
begin;
lock table public.business_effort_entries in access exclusive mode;
do $$ begin
  if exists (select 1 from public.business_effort_entries where minutes = 0) then
    raise exception 'business_effort_coverage_rollback_has_zero_logs';
  end if;
end $$;
alter table public.business_effort_entries drop constraint business_effort_entries_minutes_check;
alter table public.business_effort_entries add constraint business_effort_entries_minutes_check check (minutes between 1 and 1440);

create or replace function public.record_business_effort(
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

create or replace function public.read_effort_businesses(p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.business_effort_assert_operator(p_user_id, p_verified_email);
  return coalesce((
    select jsonb_agg(item order by lower(item->>'name'), item->>'id')
    from (
      select jsonb_build_object(
        'id', w.id, 'name', w.name,
        'tenantIds', coalesce((
          select jsonb_agg(sites.id order by sites.id)
          from (
            select t.id
            from public.tenant_workspace_links l
            join public.tenants t on t.stable_id = l.tenant_stable_id
            where l.workspace_id = w.id
            union
            select t.id
            from public.offering_website_bindings b
            join public.tenants t on t.stable_id = b.tenant_stable_id
            where b.business_workspace_id = w.id and b.status = 'active'
          ) sites), '[]'::jsonb),
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
create or replace function public.read_business_effort(
  p_user_id uuid, p_verified_email text, p_from date, p_business_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
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
commit;
