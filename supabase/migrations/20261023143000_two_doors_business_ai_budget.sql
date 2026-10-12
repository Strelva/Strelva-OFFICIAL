-- ADR 0015 (two doors): usage pauses at the payer's cap. One read for the
-- model-call helper: what this business's AI calls cost in its current period,
-- and the cap its active subscription carries (if any). The period is the
-- subscription's, else the UTC calendar month. Read-only; no row changes.
begin;
set local lock_timeout = '5s';
create function public.business_ai_budget(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ent record; since timestamptz; spent numeric;
begin
  if p_workspace_id is null then return null; end if;
  select e.spending_cap_cents, e.period_start into ent
    from public.work_allowance_subscription_entitlements e
    where e.workspace_id = p_workspace_id and e.status in ('active','trialing')
      and clock_timestamp() >= e.period_start and clock_timestamp() < e.period_end
    order by e.period_start desc, e.id limit 1;
  since := coalesce(ent.period_start, date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC');
  select coalesce(sum(cost_usd), 0) into spent from public.model_call_log
    where workspace_id = p_workspace_id and called_at >= since and cost_usd is not null;
  return jsonb_build_object('spentUsd', spent::text, 'since', since,
    'capCents', ent.spending_cap_cents, 'subscribed', ent.period_start is not null);
end;
$$;
revoke all on function public.business_ai_budget(uuid) from public, anon, authenticated;
grant execute on function public.business_ai_budget(uuid) to service_role;
commit;
