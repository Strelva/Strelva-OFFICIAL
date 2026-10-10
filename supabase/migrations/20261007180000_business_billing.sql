-- Money and the client's data, part (a): billing follows the client.
--
-- Activates the dormant org-layer tables (20260729180000) as the business's
-- billing home. One `accounts` row per converted business workspace holds
-- exactly one billing state: subscription, custom, comped, grandfathered or
-- none (`none` is the only open item). Payment status (active, trialing,
-- past_due, cancelled, none) sits beside it and mirrors Stripe.
--
-- Derived at conversion, never typed in. When `convert_tenant_to_business`
-- inserts a `tenant_workspace_links` row, a trigger reads the billing and
-- account JSON the conversion already records in its receipt and writes the
-- billing home: tier -> subscription, custom -> custom, case_study (and the
-- legacy founder_comp) -> comped, a protected or STRIPE_BILLING_GRANDFATHER
-- tenant -> grandfathered, nothing -> none. Each source is kept in
-- `billing_sources`. A second site joining the same business (Twin Trees)
-- adds its line item to the same account; the state keeps the stronger of the
-- two (grandfathered > subscription > custom > comped > none) and the sources
-- record both. Nothing here reads or changes Stripe, prices, amounts or cards.
--
-- No payer user. The payer is named by the business record's owner recipient
-- (`resolve_business_owner_recipient`) at read time, so an owner who never
-- signed in still has a billing state.
--
-- No foreign key from accounts.workspace_id to workspaces. Unlinking a
-- conversion counts every foreign key to `workspaces` as use and would keep a
-- workspace alive for its billing row. Instead the link triggers maintain it:
-- unlinking a site removes its line item and, once no site of that business is
-- linked, removes the account the conversion created.
--
-- Access. RLS was already on. API roles lose every privilege on the four
-- org-layer tables; service_role keeps table access because the deprovision
-- sweep counts and deletes `subscription_items` by tenant. Reads go through
-- security-definer functions.

alter table public.accounts add column workspace_id uuid unique;
alter table public.accounts add column billing_type text
  check (billing_type is null or billing_type in ('subscription','custom','comped','grandfathered','none'));
alter table public.accounts add column payment_status text
  check (payment_status is null or payment_status in ('active','trialing','past_due','cancelled','none'));
alter table public.accounts add column monthly_cents integer check (monthly_cents is null or monthly_cents >= 0);
alter table public.accounts add column plan_key text check (plan_key is null or plan_key ~ '^[a-z][a-z0-9_]{0,39}$');
alter table public.accounts add column billing_sources jsonb not null default '[]'::jsonb
  check (jsonb_typeof(billing_sources) = 'array' and octet_length(billing_sources::text) <= 64000);
alter table public.accounts add column grandfathered_terms text check (grandfathered_terms is null or char_length(grandfathered_terms) <= 1000);
alter table public.accounts add column created_via text check (created_via is null or created_via in ('tenant_conversion','operator'));
alter table public.accounts add column payment_updated_at timestamptz;
alter table public.accounts add constraint accounts_workspace_billing_state
  check (workspace_id is null or billing_type is not null);

-- A slug rename cascades through every slug FK; this one was created after
-- the cascade migration and would block a rename once a line item exists.
alter table public.subscription_items drop constraint if exists subscription_items_tenant_id_fkey;
alter table public.subscription_items add constraint subscription_items_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id) on update cascade on delete cascade;

revoke all on public.accounts, public.account_memberships, public.subscriptions, public.subscription_items
  from public, anon, authenticated;

-- The billing state the conversion's billing JSON implies. Mirrors
-- deriveBusinessBillingState in src/platform/business-billing/derive.ts.
create function public.business_billing_state_from(p_billing jsonb) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_billing is null or jsonb_typeof(p_billing) <> 'object' then 'none'
    when p_billing->'grandfathered' = 'true'::jsonb then 'grandfathered'
    when p_billing->>'billingType' = 'tier' then 'subscription'
    when p_billing->>'billingType' = 'custom' then 'custom'
    when p_billing->>'billingType' = 'case_study' then 'comped'
    else 'none'
  end
$$;

create function public.business_billing_state_rank(p_state text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case p_state when 'grandfathered' then 5 when 'subscription' then 4 when 'custom' then 3 when 'comped' then 2 else 1 end
$$;

create function public.business_billing_payment_status(p_status text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case lower(coalesce(p_status, ''))
    when 'active' then 'active' when 'trialing' then 'trialing' when 'past_due' then 'past_due'
    when 'canceled' then 'cancelled' when 'cancelled' then 'cancelled' else 'none' end
$$;

-- Write (or extend) the billing home for a newly linked site.
create function public.business_billing_on_link() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_billing jsonb := new.receipt->'billing';
  v_account jsonb := new.receipt->'account';
  v_state text := public.business_billing_state_from(new.receipt->'billing');
  v_tenant text;
  v_account_id uuid;
  v_subscription_id uuid;
  v_item_cents integer;
  v_line_cents integer;
  v_bundle_cents integer;
  v_source jsonb;
  v_existing public.accounts%rowtype;
begin
  if new.tenant_stable_id is null then return new; end if;
  select id into v_tenant from public.tenants where stable_id = new.tenant_stable_id;
  if v_tenant is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('business-billing:' || new.workspace_id::text, 0));

  v_item_cents := case when (v_billing->>'monthlyCents') ~ '^[0-9]{1,9}$'
    then (v_billing->>'monthlyCents')::integer else 0 end;
  -- A multi-site account's own per-site line item and bundle total win over
  -- the tenant's tier price: they are what Stripe actually charges.
  v_line_cents := (select (i->>'amountCents')::integer
    from jsonb_array_elements(case when jsonb_typeof(v_account#>'{subscription,items}') = 'array'
      then v_account#>'{subscription,items}' else '[]'::jsonb end) i
    where i->>'tenantId' = v_tenant and (i->>'amountCents') ~ '^[0-9]{1,9}$' limit 1);
  if v_line_cents is not null then v_item_cents := v_line_cents; end if;
  v_bundle_cents := case when (v_account#>>'{subscription,amountCents}') ~ '^[0-9]{1,9}$'
    then (v_account#>>'{subscription,amountCents}')::integer end;
  v_source := jsonb_strip_nulls(jsonb_build_object(
    'tenantId', v_tenant, 'tenantStableId', new.tenant_stable_id, 'linkId', new.id,
    'derivedState', v_state, 'billing', v_billing,
    'accountId', v_account->>'id', 'recordedAt', clock_timestamp()));

  select * into v_existing from public.accounts where workspace_id = new.workspace_id for update;
  if not found then
    insert into public.accounts(name, status, workspace_id, billing_type, payment_status, monthly_cents,
        billing_sources, grandfathered_terms, created_via)
      values (left(coalesce(nullif(btrim(v_account->>'name'), ''), new.receipt->>'workspaceName', v_tenant), 120), 'active',
        new.workspace_id, v_state, public.business_billing_payment_status(v_billing->>'subscriptionStatus'),
        coalesce(v_bundle_cents, v_item_cents), jsonb_build_array(v_source),
        case when v_state = 'grandfathered' then 'Old terms kept at conversion; amount and method as before.' end,
        'tenant_conversion')
      returning id into v_account_id;
  else
    v_account_id := v_existing.id;
    update public.accounts set
      billing_type = case when public.business_billing_state_rank(v_state) > public.business_billing_state_rank(v_existing.billing_type)
        then v_state else v_existing.billing_type end,
      billing_sources = v_existing.billing_sources || jsonb_build_array(v_source),
      grandfathered_terms = coalesce(v_existing.grandfathered_terms,
        case when v_state = 'grandfathered' then 'Old terms kept at conversion; amount and method as before.' end),
      updated_at = clock_timestamp()
      where id = v_account_id;
  end if;

  select id into v_subscription_id from public.subscriptions where account_id = v_account_id order by created_at limit 1;
  if v_subscription_id is null then
    insert into public.subscriptions(account_id, status, plan, amount_cents, current_period_end)
      values (v_account_id, public.business_billing_payment_status(coalesce(v_account#>>'{subscription,status}', v_billing->>'subscriptionStatus')),
        'legacy', v_bundle_cents,
        case when (v_account#>>'{subscription,currentPeriodEnd}') ~ '^\d{4}-\d{2}-\d{2}' then (v_account#>>'{subscription,currentPeriodEnd}')::timestamptz end)
      returning id into v_subscription_id;
  end if;
  insert into public.subscription_items(subscription_id, tenant_id, amount_cents)
    values (v_subscription_id, v_tenant, v_item_cents)
    on conflict (subscription_id, tenant_id) do update set amount_cents = excluded.amount_cents;

  -- Monthly amount: the bundle total when Stripe bills one, else the items.
  update public.accounts a set monthly_cents = coalesce(
      (select s.amount_cents from public.subscriptions s where s.id = v_subscription_id),
      (select coalesce(sum(i.amount_cents), 0) from public.subscription_items i where i.subscription_id = v_subscription_id))
    where a.id = v_account_id;
  update public.tenants set account_id = v_account_id where stable_id = new.tenant_stable_id;
  return new;
end;
$$;

-- Undo the billing home for an unlinked site (see the header).
create function public.business_billing_on_unlink() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account public.accounts%rowtype; v_tenant text;
begin
  if old.tenant_stable_id is null then return old; end if;
  select * into v_account from public.accounts where workspace_id = old.workspace_id for update;
  if not found then return old; end if;
  select id into v_tenant from public.tenants where stable_id = old.tenant_stable_id;
  delete from public.subscription_items i using public.subscriptions s
    where i.subscription_id = s.id and s.account_id = v_account.id and i.tenant_id = v_tenant;
  update public.tenants set account_id = null where stable_id = old.tenant_stable_id and account_id = v_account.id;
  update public.accounts set billing_sources = coalesce((select jsonb_agg(e) from jsonb_array_elements(billing_sources) e
      where e->>'linkId' is distinct from old.id::text), '[]'::jsonb), updated_at = clock_timestamp()
    where id = v_account.id;
  if not exists (select 1 from public.tenant_workspace_links l where l.workspace_id = old.workspace_id and l.id <> old.id) then
    if v_account.created_via = 'tenant_conversion' and v_account.stripe_customer_id is null then
      delete from public.accounts where id = v_account.id;
    else
      update public.accounts set workspace_id = null, updated_at = clock_timestamp() where id = v_account.id;
    end if;
  end if;
  return old;
end;
$$;

create trigger tenant_workspace_links_business_billing after insert on public.tenant_workspace_links
  for each row execute function public.business_billing_on_link();
create trigger tenant_workspace_links_business_billing_unlink before delete on public.tenant_workspace_links
  for each row execute function public.business_billing_on_unlink();

create function public.business_billing_json(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'workspaceId', a.workspace_id,
    'accountId', a.id,
    'state', a.billing_type,
    'openItem', a.billing_type = 'none',
    'paymentStatus', coalesce(a.payment_status, 'none'),
    'monthlyCents', coalesce(a.monthly_cents, 0),
    'planKey', a.plan_key,
    'grandfatheredTerms', a.grandfathered_terms,
    'paidThrough', (select to_char(s.current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      from public.subscriptions s where s.account_id = a.id order by s.created_at limit 1),
    'payer', public.resolve_business_owner_recipient(a.workspace_id),
    'sites', coalesce((select jsonb_agg(jsonb_build_object('tenantId', i.tenant_id, 'siteName', t.site_name,
        'amountCents', coalesce(i.amount_cents, 0)) order by i.created_at, i.tenant_id)
      from public.subscriptions s join public.subscription_items i on i.subscription_id = s.id
      join public.tenants t on t.id = i.tenant_id where s.account_id = a.id), '[]'::jsonb),
    'sources', a.billing_sources,
    'paymentUpdatedAt', a.payment_updated_at)
  from public.accounts a where a.workspace_id = p_workspace_id
$$;

-- Owner and the Strelva operator (admin) see billing; members do not.
create function public.read_business_billing(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_workspace_id and m.role in ('owner','admin');
  if not found then raise exception 'business_billing_denied'; end if;
  return public.business_billing_json(p_workspace_id);
end;
$$;

-- Webhook resolution: workspace first by metadata.workspaceId, then through
-- the tenant link. Returns null when neither resolves (processed on the
-- tenant as today).
create function public.resolve_billing_workspace(p_workspace_id text, p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_workspace uuid; v_via text;
begin
  if p_workspace_id ~ '^[0-9a-fA-F-]{36}$' then
    select workspace_id into v_workspace from public.accounts where workspace_id = p_workspace_id::uuid;
    if v_workspace is not null then v_via := 'workspace_metadata'; end if;
  end if;
  if v_workspace is null and p_tenant_id is not null then
    select l.workspace_id into v_workspace from public.tenant_workspace_links l
      join public.tenants t on t.stable_id = l.tenant_stable_id where t.id = p_tenant_id;
    if v_workspace is not null then v_via := 'tenant_link'; end if;
  end if;
  if v_workspace is null then return null; end if;
  return jsonb_build_object('workspaceId', v_workspace, 'via', v_via);
end;
$$;

-- Mirror a Stripe subscription event onto the billing home. Payment status
-- only: the billing state, amount and line items never change here.
create function public.record_business_billing_payment(
  p_workspace_id uuid, p_status text, p_stripe_subscription_id text, p_current_period_end timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account uuid; v_status text := public.business_billing_payment_status(p_status);
begin
  if p_stripe_subscription_id is not null and p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]{1,200}$' then
    raise exception 'business_billing_invalid';
  end if;
  select id into v_account from public.accounts where workspace_id = p_workspace_id for update;
  if v_account is null then raise exception 'business_billing_not_found'; end if;
  update public.accounts set payment_status = v_status, payment_updated_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = v_account;
  update public.subscriptions set status = v_status,
      stripe_subscription_id = coalesce(stripe_subscription_id, p_stripe_subscription_id),
      current_period_end = coalesce(p_current_period_end, current_period_end), updated_at = clock_timestamp()
    where id = (select id from public.subscriptions where account_id = v_account order by created_at limit 1);
  return public.business_billing_json(p_workspace_id);
end;
$$;

revoke all on function public.business_billing_state_from(jsonb) from public, anon, authenticated;
revoke all on function public.business_billing_state_rank(text) from public, anon, authenticated;
revoke all on function public.business_billing_payment_status(text) from public, anon, authenticated;
revoke all on function public.business_billing_on_link() from public, anon, authenticated, service_role;
revoke all on function public.business_billing_on_unlink() from public, anon, authenticated, service_role;
revoke all on function public.business_billing_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.read_business_billing(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_billing_workspace(text, text) from public, anon, authenticated;
revoke all on function public.record_business_billing_payment(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.read_business_billing(uuid, uuid, text) to service_role;
grant execute on function public.resolve_billing_workspace(text, text) to service_role;
grant execute on function public.record_business_billing_payment(uuid, text, text, timestamptz) to service_role;
