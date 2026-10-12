-- ADR 0015 (two doors): measure the direct door end to end. One row per step
-- per reference, no personal data: the public check (its report id, and the
-- agency when an agency ran it as prospecting), the check saved into a
-- business, the business created, and the business's first thing made live.
begin;
set local lock_timeout = '5s';
create table public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  step text not null check (step in ('check_run','check_saved','business_created','first_live')),
  ref text not null check (ref ~ '^[A-Za-z0-9][A-Za-z0-9_:.-]{0,159}$'),
  workspace_id uuid references public.workspaces(id) on delete set null,
  agency_workspace_id uuid references public.workspaces(id) on delete set null,
  at timestamptz not null default clock_timestamp(),
  unique (step, ref)
);
create index funnel_events_step_at_idx on public.funnel_events(step, at);
alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from public, anon, authenticated;

create function public.record_funnel_event(p_step text, p_ref text, p_workspace_id uuid, p_agency_workspace_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.funnel_events(step, ref, workspace_id, agency_workspace_id)
    values (p_step, p_ref, p_workspace_id, p_agency_workspace_id)
    on conflict (step, ref) do nothing;
  return found;
end;
$$;
revoke all on function public.record_funnel_event(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_funnel_event(text, text, uuid, uuid) to service_role;
commit;
