-- Rollback for 20261008160000_convert_separate_business.sql
-- Forward SHA-256: d28b0eb4086d753a75fb5bc636d14d84cee47365d8c53a69cde74c5e1b58f802
-- Batch 4: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_billing_on_link()')))) is distinct from '1e68b0c68b5166147fdfd390be5736a3' then raise exception 'rollback_wrong_order_or_function_drift: business_billing_on_link'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.convert_tenant_to_business(text,text,jsonb,uuid,text)')))) is distinct from '9face52fccdfb0124e2dfa0071e670f7' then raise exception 'rollback_wrong_order_or_function_drift: convert_tenant_to_business'; end if;
end;
$rollback_guard$;
CREATE OR REPLACE FUNCTION public.business_billing_on_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
revoke all on function public.business_billing_on_link() from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.convert_tenant_to_business(p_operator_email text, p_tenant_id text, p_import jsonb, p_command_id uuid, p_command_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  operator_id uuid;
  tenant_row record;
  link public.tenant_workspace_links%rowtype;
  business_id uuid;
  joined boolean := false;
  patch jsonb;
  applied jsonb;
  receipt jsonb;
  workspace_name text;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or p_import is null or jsonb_typeof(p_import) <> 'object'
    or (p_import - array['tenantId','tenantStableId','workspaceName','targetWorkspaceId','billing','account','patch','contacts']::text[]) <> '{}'::jsonb
    or (p_import ? 'billing' and jsonb_typeof(p_import->'billing') not in ('object','null'))
    or (p_import ? 'account' and jsonb_typeof(p_import->'account') not in ('object','null'))
    or octet_length(coalesce(p_import->'billing', 'null')::text) + octet_length(coalesce(p_import->'account', 'null')::text) > 16000 then
    raise exception 'tenant_conversion_invalid';
  end if;
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id, t.site_name, t.active into tenant_row from public.tenants t where t.id = p_tenant_id for share;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  if p_import->>'tenantId' is distinct from tenant_row.id
    or p_import->>'tenantStableId' is distinct from tenant_row.stable_id::text then
    raise exception 'tenant_conversion_identity_mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tenant-conversion:' || tenant_row.stable_id::text, 0));

  select * into link from public.tenant_workspace_links where command_id = p_command_id;
  if found then
    if link.command_digest <> p_command_digest then raise exception 'tenant_conversion_idempotency_conflict'; end if;
    return link.receipt || jsonb_build_object('replayed', true, 'alreadyConverted', true);
  end if;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if found then
    return link.receipt || jsonb_build_object('replayed', true, 'alreadyConverted', true);
  end if;

  patch := coalesce(p_import->'patch', '{}'::jsonb);
  if jsonb_typeof(patch) <> 'object' then raise exception 'tenant_conversion_invalid'; end if;
  if p_import->>'targetWorkspaceId' is not null then
    begin business_id := (p_import->>'targetWorkspaceId')::uuid;
    exception when invalid_text_representation then raise exception 'tenant_conversion_invalid'; end;
    -- Joining requires a customer business that already holds a converted
    -- site and that this operator already operates.
    perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
    perform 1 from public.workspaces w
      join public.workspace_memberships m on m.workspace_id = w.id and m.user_id = operator_id and m.role in ('owner','admin')
      where w.id = business_id and w.kind = 'customer' for update of w;
    if not found or not exists (select 1 from public.tenant_workspace_links where workspace_id = business_id) then
      raise exception 'tenant_conversion_target_invalid';
    end if;
    if public.workspace_exit_completed(business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
    select name into workspace_name from public.workspaces where id = business_id;
    joined := true;
    patch := jsonb_strip_nulls(jsonb_build_object(
      'facts', (select jsonb_object_agg(e.key, e.value) from jsonb_each(coalesce(patch->'facts', '{}'::jsonb)) e
        where not exists (select 1 from public.business_record_facts f where f.workspace_id = business_id and f.fact_key = e.key)),
      'services', case when exists (select 1 from public.business_services where workspace_id = business_id) then null else patch->'services' end,
      'people', case when exists (select 1 from public.business_people where workspace_id = business_id) then null else patch->'people' end));
  else
    workspace_name := left(btrim(coalesce(p_import->>'workspaceName', tenant_row.site_name)), 120);
    if char_length(workspace_name) < 1 then raise exception 'tenant_conversion_invalid'; end if;
    insert into public.workspaces(kind, name, created_by) values ('customer', workspace_name, operator_id)
      returning id into business_id;
    insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
      values (business_id, operator_id, 'admin', operator_id);
    perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
  end if;

  -- Conversion idempotency lives on the link. When this site was converted
  -- into this same business before and then unlinked, the record's history
  -- already holds the command id, so the new import revision gets its own.
  applied := public.business_record_apply(business_id, operator_id, 'operator', 'tenant_import', patch,
    case when jsonb_array_length(coalesce(p_import->'contacts', '[]'::jsonb)) = 0 then null else p_import->'contacts' end,
    null,
    case when exists (select 1 from public.business_record_revisions where workspace_id = business_id and command_id = p_command_id)
      then gen_random_uuid() else p_command_id end,
    p_command_digest);

  receipt := jsonb_build_object(
    'kind', 'tenant_conversion',
    'version', 1,
    'tenantId', tenant_row.id,
    'tenantStableId', tenant_row.stable_id,
    'tenantActive', tenant_row.active,
    'workspaceId', business_id,
    'workspaceName', workspace_name,
    'joinedExistingWorkspace', joined,
    'operatorId', operator_id,
    'operatorRole', 'admin',
    'billing', coalesce(p_import->'billing', 'null'::jsonb),
    'account', coalesce(p_import->'account', 'null'::jsonb),
    'sequence', applied->'sequence',
    'revision', applied->'revision',
    'changeCount', applied->'changeCount',
    'counts', jsonb_build_object(
      'facts', (select count(*) from public.business_record_facts where workspace_id = business_id),
      'services', (select count(*) from public.business_services where workspace_id = business_id),
      'people', (select count(*) from public.business_people where workspace_id = business_id),
      'contacts', (select count(*) from public.business_contacts where workspace_id = business_id),
      'contactsCreated', applied#>'{contacts,created}',
      'contactsMerged', applied#>'{contacts,merged}',
      'contactsUnchanged', applied#>'{contacts,unchanged}'),
    'convertedAt', clock_timestamp(),
    'replayed', false,
    'alreadyConverted', false
  );
  insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by,
      command_id, command_digest, receipt)
    values (tenant_row.stable_id, tenant_row.id, business_id, operator_id, p_command_id, p_command_digest, receipt);
  return receipt;
end;
$function$
;
revoke all on function public.convert_tenant_to_business(text,text,jsonb,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.convert_tenant_to_business(text,text,jsonb,uuid,text) to "service_role";
commit;
