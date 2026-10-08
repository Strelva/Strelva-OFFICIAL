-- Recovery stops destructive retention without deleting or rewriting evidence.
-- Already purged visitor data is irrecoverable from aggregate receipts; use a
-- separately reviewed backup restoration if recovery of that data is required.
-- Reapply the forward migration to resume the hourly cleanup.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
drop trigger if exists inquiry_events_retention_on_tenant_delete on public.tenants;
drop trigger if exists inquiry_events_retention_on_workspace_delete on public.workspaces;

create or replace function public.purge_expired_tenant_leads(p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'inquiry_lead_retention_rolled_back';
end;
$$;
revoke all on function public.purge_expired_tenant_leads(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_tenant_leads(integer) to service_role;

-- Remove the deletion exception as well: no ordinary API can mutate history.
create or replace function public.inquiry_events_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.workspace_id is null and old.workspace_id is not null
    and (to_jsonb(new) - 'workspace_id') = (to_jsonb(old) - 'workspace_id') then
    return new;
  end if;
  raise exception 'inquiry_events_immutable';
end;
$$;
revoke all on function public.inquiry_events_immutable() from public, anon, authenticated;
commit;
