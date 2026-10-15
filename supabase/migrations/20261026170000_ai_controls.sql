-- Per-client usage controls: an agency or Strelva operator can pause one
-- client's Strelva work, set a monthly usage limit, and hold automatic review
-- replies. Enforcement lives in the one admission path (reserve v2) so no
-- surface can skip it. v1 budget functions stay untouched, so code with the
-- flags off and older deploys keep working.
begin;
set local lock_timeout = '5s';

create table public.business_ai_controls (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  paused boolean not null default false,
  monthly_cap_cents integer check (monthly_cap_cents is null or monthly_cap_cents between 0 and 10000000),
  review_auto_post text not null default 'client_choice' check (review_auto_post in ('client_choice','held')),
  set_by_kind text not null check (set_by_kind in ('agency','operator')),
  set_by_agency_workspace_id uuid references public.workspaces(id) on delete set null,
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1 check (revision > 0),
  check ((set_by_kind = 'agency') = (set_by_agency_workspace_id is not null))
);

create table public.business_ai_control_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  before jsonb,
  after jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_by_kind text not null check (changed_by_kind in ('agency','operator')),
  agency_workspace_id uuid references public.workspaces(id) on delete set null,
  changed_at timestamptz not null default clock_timestamp()
);
create index business_ai_control_changes_workspace_idx on public.business_ai_control_changes(workspace_id, changed_at desc);

alter table public.business_ai_controls enable row level security;
alter table public.business_ai_control_changes enable row level security;
revoke all on public.business_ai_controls, public.business_ai_control_changes from public, anon, authenticated, service_role;

-- Where a hold came from: a qualified (provider-evidenced) ceiling keeps its
-- hold until the period ends; a list-price ceiling is released once the call's
-- own estimated cost is logged, because both come from the same price table.
alter table public.business_ai_budget_reservations
  add column ceiling_source text not null default 'qualified' check (ceiling_source in ('qualified','list_price'));

create function public.business_ai_controls_state(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select jsonb_build_object(
      'paused', c.paused, 'monthlyCapCents', c.monthly_cap_cents, 'reviewAutoPost', c.review_auto_post,
      'revision', c.revision,
      'setBy', jsonb_build_object('kind', c.set_by_kind,
        'agencyName', case when a.id is null then null
          when coalesce(nullif(a.agency_brand->>'displayName',''),a.name)='Strelva' then 'Strelva Agency'
          else coalesce(nullif(a.agency_brand->>'displayName',''),a.name) end),
      'changedAt', c.changed_at)
    from public.business_ai_controls c
    left join public.workspaces a on a.id = c.set_by_agency_workspace_id
    where c.workspace_id = p_workspace_id
  ), jsonb_build_object('paused', false, 'monthlyCapCents', null, 'reviewAutoPost', 'client_choice',
    'revision', 0, 'setBy', null, 'changedAt', null));
$$;

-- business_ai_budget, from 20261025110000_done_trust_legacy_ai.sql, with a list-price
-- hold released once its provider row records a cost, and the controls attached.
create function public.business_ai_budget_v2(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ent record; since timestamptz; resets timestamptz; spent numeric; held numeric; unknown_calls bigint;
begin
  if p_workspace_id is null or not exists(select 1 from public.workspaces where id = p_workspace_id) then return null; end if;
  select e.spending_cap_cents, e.period_start, e.period_end into ent
    from public.work_allowance_subscription_entitlements e
    where e.workspace_id = p_workspace_id and e.status in ('active','trialing')
      and clock_timestamp() >= e.period_start and clock_timestamp() < e.period_end
    order by e.period_start desc, e.id limit 1;
  since := coalesce(ent.period_start, date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC');
  resets := coalesce(ent.period_end, since + interval '1 month');
  select coalesce(sum(cost_usd), 0), count(*) filter (where cost_usd is null and budget_reservation_id is null)
    into spent, unknown_calls from public.model_call_log
    where workspace_id = p_workspace_id and called_at >= since and called_at < resets
      and purpose in ('ask','ask.background','rebuild','work_plan','report','review_reply','suggestion','weekly_brief');
  -- Retain upper bounds rather than releasing estimated/unknown provider charges.
  -- The known portion is displayed as spend; the remainder stays reserved.
  -- A list-price hold is released once its cost is known: that estimate comes
  -- from the same price table as the ceiling, so keeping the hold would
  -- drain the cap at the ceiling rate instead of the actual rate.
  select coalesce(sum(case when r.ceiling_source = 'list_price' and c.cost is not null then 0
      else greatest(r.maximum_cost_usd - coalesce(c.cost,0),0) end),0) into held
    from public.business_ai_budget_reservations r
    left join lateral (select sum(cost_usd) as cost from public.model_call_log
      where budget_reservation_id = r.id) c on true
    where r.workspace_id = p_workspace_id and r.period_start < resets and r.period_end > since;
  return jsonb_build_object('spentUsd', spent::text, 'reservedUsd', held::text,
    'since', since, 'resetsAt', resets, 'capCents', ent.spending_cap_cents,
    'subscribed', ent.period_start is not null or exists (
      select 1 from public.tenant_workspace_links l
      join public.tenants t on t.stable_id = l.tenant_stable_id
      where l.workspace_id = p_workspace_id and (t.subscription_status in ('active','trialing')
        -- An active managed client served outside Stripe (case study or agreed tier) keeps the AI it had before 1.0.
        or (t.active is true and coalesce(t.subscription_status,'none') = 'none'))
    ), 'unknownCostCalls', unknown_calls,
    'controls', public.business_ai_controls_state(p_workspace_id));
end;
$$;

create function public.reserve_business_ai_budget_v2(p_workspace_id uuid, p_maximum_cost_usd numeric, p_free_cap_usd numeric,
  p_apply_base_cap boolean, p_ceiling_source text, p_apply_controls boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_budget jsonb; controls jsonb; base_cap numeric; agency_cap numeric; cap numeric; reservation uuid;
begin
  if p_workspace_id is null or p_maximum_cost_usd is null or p_maximum_cost_usd <= 0
    or p_maximum_cost_usd::text in ('NaN','Infinity','-Infinity')
    or p_maximum_cost_usd > 999999.99999999 or scale(p_maximum_cost_usd) > 8
    or (p_free_cap_usd is not null and (p_free_cap_usd < 0 or scale(p_free_cap_usd) > 8
      or p_free_cap_usd::text in ('NaN','Infinity','-Infinity')))
    or p_apply_base_cap is null or p_apply_controls is null or p_ceiling_source is null or p_ceiling_source not in ('qualified','list_price') then
    raise exception 'business_ai_budget_invalid';
  end if;
  -- Same locks in the same order as v1: a control change and an admission for
  -- one workspace serialize, and a concurrent call sees the first hold.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 202610241215));
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'business_ai_budget_unavailable'; end if;
  perform 1 from public.tenant_workspace_links l
    join public.tenants t on t.stable_id = l.tenant_stable_id
    where l.workspace_id = p_workspace_id order by t.stable_id for share of t, l;
  perform 1 from public.work_allowance_subscription_entitlements
    where workspace_id = p_workspace_id for share;
  perform 1 from public.business_ai_controls where workspace_id = p_workspace_id for share;
  current_budget := public.business_ai_budget_v2(p_workspace_id);
  if current_budget is null or (current_budget->>'unknownCostCalls')::bigint > 0 then
    raise exception 'business_ai_budget_unavailable';
  end if;
  controls := current_budget->'controls';
  -- With STRELVA_AI_CONTROLS_RELEASE off the stored controls are not enforced, only read.
  if p_apply_controls and (controls->>'paused')::boolean then
    return jsonb_build_object('status','paused','reason','controls','reservationId',null,'budget',current_budget);
  end if;
  base_cap := case when not p_apply_base_cap then null
    when (current_budget->>'subscribed')::boolean then (current_budget->>'capCents')::numeric / 100
    else p_free_cap_usd end;
  agency_cap := case when p_apply_controls then (controls->>'monthlyCapCents')::numeric / 100 else null end;
  cap := least(base_cap, agency_cap);
  if cap is null then raise exception 'business_ai_budget_unavailable'; end if;
  if (current_budget->>'spentUsd')::numeric + (current_budget->>'reservedUsd')::numeric + p_maximum_cost_usd > cap then
    return jsonb_build_object('status','paused',
      'reason', case when agency_cap is not null and agency_cap <= coalesce(base_cap, agency_cap) then 'agency_cap' else 'cap' end,
      'reservationId',null,'budget',current_budget);
  end if;
  insert into public.business_ai_budget_reservations(workspace_id, period_start, period_end, maximum_cost_usd, ceiling_source)
    values (p_workspace_id, (current_budget->>'since')::timestamptz, (current_budget->>'resetsAt')::timestamptz, p_maximum_cost_usd, p_ceiling_source)
    returning id into reservation;
  return jsonb_build_object('status','reserved','reason',null,'reservationId',reservation,
    'budget',public.business_ai_budget_v2(p_workspace_id));
end;
$$;

-- Agency scope, modeled on agency_release_flag_scope. A write needs an owner or
-- admin seat in the agency; a read also admits assigned client staff.
create function public.agency_ai_controls_scope(p_agency_id uuid, p_workspace_id uuid, p_user_id uuid, p_email text, p_write boolean)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare member_role text;
begin
  select m.role into member_role from public.users u
    join public.workspace_memberships m on m.user_id = u.id and m.workspace_id = p_agency_id
    join public.workspaces a on a.id = m.workspace_id and a.kind = 'agency'
    join public.provider_seats s on s.agency_workspace_id = a.id and s.customer_workspace_id = p_workspace_id and s.status = 'active'
    where u.id = p_user_id and lower(u.email) = lower(btrim(coalesce(p_email, ''))) and u.verified_at is not null
    for share of u, m, s;
  if member_role is null then raise exception 'workspace_access_denied'; end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_access_denied'; end if;
  if member_role in ('owner','admin') then return; end if;
  if p_write then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.agency_client_staff st
    where st.agency_workspace_id = p_agency_id and st.customer_workspace_id = p_workspace_id
      and st.user_id = p_user_id and st.status = 'active' for share;
  if not found then raise exception 'workspace_access_denied'; end if;
end;
$$;

create function public.read_agency_ai_controls(p_agency_id uuid, p_user_id uuid, p_verified_email text, p_workspace_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare member_role text; result jsonb;
begin
  select m.role into member_role from public.users u
    join public.workspace_memberships m on m.user_id = u.id and m.workspace_id = p_agency_id
    join public.workspaces a on a.id = m.workspace_id and a.kind = 'agency'
    where u.id = p_user_id and lower(u.email) = lower(btrim(coalesce(p_verified_email, ''))) and u.verified_at is not null;
  if member_role is null then raise exception 'workspace_access_denied'; end if;
  if p_workspace_id is not null then
    perform public.agency_ai_controls_scope(p_agency_id, p_workspace_id, p_user_id, p_verified_email, false);
  end if;
  select jsonb_build_object('agencyWorkspaceId', p_agency_id, 'canChange', member_role in ('owner','admin'),
    'clients', coalesce(jsonb_agg(jsonb_build_object(
      'workspaceId', w.id, 'name', w.name, 'budget', public.business_ai_budget_v2(w.id),
      'linkedTenantIds', coalesce((select jsonb_agg(t.id order by t.id) from public.tenant_workspace_links l
        join public.tenants t on t.stable_id = l.tenant_stable_id where l.workspace_id = w.id), '[]'::jsonb))
      order by w.name, w.id), '[]'::jsonb))
    into result
    from public.provider_seats s
    join public.workspaces w on w.id = s.customer_workspace_id
    where s.agency_workspace_id = p_agency_id and s.status = 'active'
      and (p_workspace_id is null or s.customer_workspace_id = p_workspace_id)
      and not public.workspace_exit_completed(w.id)
      and (member_role in ('owner','admin') or exists (select 1 from public.agency_client_staff st
        where st.agency_workspace_id = p_agency_id and st.customer_workspace_id = w.id and st.user_id = p_user_id and st.status = 'active'));
  return result;
end;
$$;

create function public.set_agency_ai_controls(p_agency_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_paused boolean, p_monthly_cap_cents integer, p_review_auto_post text, p_expected_revision bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare before_row public.business_ai_controls; after_row public.business_ai_controls;
begin
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'ai_controls_reason_required'; end if;
  if p_paused is null or p_expected_revision is null
    or (p_monthly_cap_cents is not null and p_monthly_cap_cents not between 0 and 10000000)
    or p_review_auto_post is null or p_review_auto_post not in ('client_choice','held') then
    raise exception 'ai_controls_invalid';
  end if;
  -- First, so a control change serializes with admissions for this workspace.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 202610241215));
  perform public.agency_ai_controls_scope(p_agency_id, p_workspace_id, p_user_id, p_verified_email, true);
  select * into before_row from public.business_ai_controls where workspace_id = p_workspace_id for update;
  if coalesce(before_row.revision, 0) <> p_expected_revision then raise exception 'ai_controls_revision_conflict'; end if;
  insert into public.business_ai_controls(workspace_id, paused, monthly_cap_cents, review_auto_post, set_by_kind,
      set_by_agency_workspace_id, changed_by, revision)
    values (p_workspace_id, p_paused, p_monthly_cap_cents, p_review_auto_post, 'agency', p_agency_id, p_user_id, coalesce(before_row.revision, 0) + 1)
    on conflict (workspace_id) do update set paused = excluded.paused, monthly_cap_cents = excluded.monthly_cap_cents,
      review_auto_post = excluded.review_auto_post, set_by_kind = excluded.set_by_kind,
      set_by_agency_workspace_id = excluded.set_by_agency_workspace_id, changed_by = excluded.changed_by,
      changed_at = clock_timestamp(), revision = excluded.revision
    returning * into after_row;
  insert into public.business_ai_control_changes(workspace_id, before, after, reason, changed_by, changed_by_kind, agency_workspace_id)
    values (p_workspace_id, case when before_row.workspace_id is null then null else to_jsonb(before_row) end, to_jsonb(after_row), btrim(p_reason), p_user_id, 'agency', p_agency_id);
  return public.read_agency_ai_controls(p_agency_id, p_user_id, p_verified_email, p_workspace_id);
end;
$$;

create function public.operator_ai_controls_view(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('workspaceId', w.id, 'name', w.name, 'budget', public.business_ai_budget_v2(w.id),
    'linkedTenantIds', coalesce((select jsonb_agg(t.id order by t.id) from public.tenant_workspace_links l
      join public.tenants t on t.stable_id = l.tenant_stable_id where l.workspace_id = w.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', h.changed_at, 'kind', h.changed_by_kind,
        'agencyName', case when a.id is null then null
          when coalesce(nullif(a.agency_brand->>'displayName',''),a.name)='Strelva' then 'Strelva Agency'
          else coalesce(nullif(a.agency_brand->>'displayName',''),a.name) end,
        'reason', h.reason, 'after', h.after) order by h.changed_at desc, h.id)
      from (select * from public.business_ai_control_changes where workspace_id = w.id order by changed_at desc, id limit 20) h
      left join public.workspaces a on a.id = h.agency_workspace_id), '[]'::jsonb))
  from public.workspaces w where w.id = p_workspace_id;
$$;

create function public.read_operator_ai_controls(p_operator_email text, p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.workspace_release_assert_operator(p_operator_email);
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer';
  if not found then raise exception 'workspace_release_workspace_invalid'; end if;
  return public.operator_ai_controls_view(p_workspace_id);
end;
$$;

create function public.set_operator_ai_controls(p_operator_email text, p_workspace_id uuid, p_paused boolean,
  p_monthly_cap_cents integer, p_review_auto_post text, p_expected_revision bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare who uuid; before_row public.business_ai_controls; after_row public.business_ai_controls;
begin
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'ai_controls_reason_required'; end if;
  if p_paused is null or p_expected_revision is null
    or (p_monthly_cap_cents is not null and p_monthly_cap_cents not between 0 and 10000000)
    or p_review_auto_post is null or p_review_auto_post not in ('client_choice','held') then
    raise exception 'ai_controls_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 202610241215));
  who := public.workspace_release_assert_operator(p_operator_email);
  -- Not workspace_release_assert_workspace: its newest definition also admits agencies.
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for update;
  if not found then raise exception 'workspace_release_workspace_invalid'; end if;
  select * into before_row from public.business_ai_controls where workspace_id = p_workspace_id for update;
  if coalesce(before_row.revision, 0) <> p_expected_revision then raise exception 'ai_controls_revision_conflict'; end if;
  insert into public.business_ai_controls(workspace_id, paused, monthly_cap_cents, review_auto_post, set_by_kind,
      set_by_agency_workspace_id, changed_by, revision)
    values (p_workspace_id, p_paused, p_monthly_cap_cents, p_review_auto_post, 'operator', null, who, coalesce(before_row.revision, 0) + 1)
    on conflict (workspace_id) do update set paused = excluded.paused, monthly_cap_cents = excluded.monthly_cap_cents,
      review_auto_post = excluded.review_auto_post, set_by_kind = excluded.set_by_kind,
      set_by_agency_workspace_id = excluded.set_by_agency_workspace_id, changed_by = excluded.changed_by,
      changed_at = clock_timestamp(), revision = excluded.revision
    returning * into after_row;
  insert into public.business_ai_control_changes(workspace_id, before, after, reason, changed_by, changed_by_kind, agency_workspace_id)
    values (p_workspace_id, case when before_row.workspace_id is null then null else to_jsonb(before_row) end, to_jsonb(after_row), btrim(p_reason), who, 'operator', null);
  return public.operator_ai_controls_view(p_workspace_id);
end;
$$;

revoke all on function
  public.business_ai_controls_state(uuid),
  public.business_ai_budget_v2(uuid),
  public.reserve_business_ai_budget_v2(uuid,numeric,numeric,boolean,text,boolean),
  public.agency_ai_controls_scope(uuid,uuid,uuid,text,boolean),
  public.read_agency_ai_controls(uuid,uuid,text,uuid),
  public.set_agency_ai_controls(uuid,uuid,uuid,text,boolean,integer,text,bigint,text),
  public.operator_ai_controls_view(uuid),
  public.read_operator_ai_controls(text,uuid),
  public.set_operator_ai_controls(text,uuid,boolean,integer,text,bigint,text)
  from public, anon, authenticated;
grant execute on function
  public.business_ai_controls_state(uuid),
  public.business_ai_budget_v2(uuid),
  public.reserve_business_ai_budget_v2(uuid,numeric,numeric,boolean,text,boolean),
  public.read_agency_ai_controls(uuid,uuid,text,uuid),
  public.set_agency_ai_controls(uuid,uuid,uuid,text,boolean,integer,text,bigint,text),
  public.operator_ai_controls_view(uuid),
  public.read_operator_ai_controls(text,uuid),
  public.set_operator_ai_controls(text,uuid,boolean,integer,text,bigint,text)
  to service_role;
-- The scope helper is internal to the agency functions and is never granted.
revoke all on function public.agency_ai_controls_scope(uuid,uuid,uuid,text,boolean) from service_role;

commit;
