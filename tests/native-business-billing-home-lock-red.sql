-- Negative control: exact provisioner body from b40827cd, restored only in a disposable database.
create or replace function public.ensure_native_business_billing_home(p_workspace_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare home uuid;
begin
  perform 1 from public.workspaces where id=p_workspace_id and kind='customer' for share;
  if not found then raise exception 'native_business_billing_denied';end if;
  -- Same workspace boundary as payer transitions: a backfill cannot stamp an
  -- old party while concurrent acceptance updates a not-yet-existing account.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
  insert into public.accounts(workspace_id,name,billing_type,payment_status,billing_home_kind,created_via)
    select id,name,'none','none','business','business' from public.workspaces where id=p_workspace_id
    on conflict(workspace_id) do nothing;
  select id into home from public.accounts where workspace_id=p_workspace_id and billing_home_kind='business';
  if home is null then raise exception 'native_business_billing_account_conflict';end if;
  return home;
end $$;
