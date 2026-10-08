-- Ordinary customer creation gets an unpriced billing home when its durable
-- creation receipt lands. Conversion retains its own billing/link transaction.
-- No plan, charge, subscription, provider intent or price is selected here.
begin;
set local lock_timeout='3s';
alter table public.accounts drop constraint accounts_created_via_check;
alter table public.accounts add constraint accounts_created_via_check
  check(created_via is null or created_via in ('tenant_conversion','operator','agency','business'));

create function public.ensure_native_business_billing_home(p_workspace_id uuid) returns uuid
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
revoke all on function public.ensure_native_business_billing_home(uuid) from public,anon,authenticated,service_role;

create function public.native_business_billing_on_creation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='agency_client_additions' then
    perform public.ensure_native_business_billing_home(new.customer_workspace_id);
  else
    perform public.ensure_native_business_billing_home(new.workspace_id);
  end if;
  return new;
end $$;
revoke all on function public.native_business_billing_on_creation() from public,anon,authenticated,service_role;
create trigger agency_client_additions_business_billing after insert on public.agency_client_additions
  for each row execute function public.native_business_billing_on_creation();
create trigger workspace_creation_receipts_business_billing after insert on public.workspace_creation_receipts
  for each row execute function public.native_business_billing_on_creation();
-- Inverse may remove only these exact definitions, never a later successor.
do $$
declare item record;fingerprint text;
begin
 for item in select oid,oid::regprocedure::text signature from pg_proc where oid in
  ('public.ensure_native_business_billing_home(uuid)'::regprocedure,'public.native_business_billing_on_creation()'::regprocedure) loop
  fingerprint:='native_business_billing_20261021095000:'||encode(sha256(convert_to(pg_get_functiondef(item.oid),'UTF8')),'hex');
  execute format('comment on function %s is %L',item.signature,fingerprint);
 end loop;
 for item in select oid,tgname,tgrelid::regclass relation from pg_trigger where tgname in
  ('agency_client_additions_business_billing','workspace_creation_receipts_business_billing') and not tgisinternal loop
  fingerprint:='native_business_billing_20261021095000:'||encode(sha256(convert_to(pg_get_triggerdef(item.oid,true),'UTF8')),'hex');
  execute format('comment on trigger %I on %s is %L',item.tgname,item.relation,fingerprint);
 end loop;
end $$;
-- Existing accounts (including converted prices, sources and payer snapshots)
-- are untouched. Insert stamping binds accepted payer provenance; existing
-- account triggers derive only the current agency's unpriced client line.
select public.ensure_native_business_billing_home(w.id) from public.workspaces w
  where w.kind='customer' and not exists(select 1 from public.accounts a where a.workspace_id=w.id)
  order by w.id;
notify pgrst,'reload schema';
commit;
