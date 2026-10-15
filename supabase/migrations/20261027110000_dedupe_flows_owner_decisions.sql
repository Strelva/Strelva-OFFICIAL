begin;
set local lock_timeout = '3s';

-- One approval path: the review auto-post is a policy decision, recorded as a
-- closed handle_after_notice row (a receipt, never an ask), and a legacy
-- tenant-event link can find the Needs you item for its source. Additive only.

-- A notice-route row is a receipt written by policy, so it is never open.
alter table public.owner_decisions drop constraint if exists owner_decisions_route_check;
alter table public.owner_decisions add constraint owner_decisions_route_check
  check (route in ('strelva_reviews','owner_decides','handle_after_notice'));
alter table public.owner_decisions add constraint owner_decisions_policy_route_closed
  check (route <> 'handle_after_notice' or (decided_by_kind = 'policy' and state <> 'open'));

alter table public.owner_decisions drop constraint if exists owner_decisions_decided_by_kind_check;
alter table public.owner_decisions add constraint owner_decisions_decided_by_kind_check check (decided_by_kind is null or decided_by_kind in
  ('owner_link','owner_session','admin_session','member_session','agency_session','operator','expiry','system','policy'));

-- The open item for one source, if any. A legacy approve link uses this to
-- decide through the item instead of around it.
create function public.read_open_owner_decision_for_source(p_workspace_id uuid, p_lifecycle text, p_source_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.owner_decision_json(d) from public.owner_decisions d
    where d.workspace_id = p_workspace_id and d.source_lifecycle = p_lifecycle and d.source_id = p_source_id and d.state = 'open'
    order by d.opened_at desc limit 1
$$;

-- A policy (the auto-reply notice setting) handled a tenant event. One closed
-- row per attempt; it refuses while a person's decision for the source is open.
create function public.record_policy_owner_decision(p_workspace_id uuid, p_item jsonb, p_policy text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.owner_decisions%rowtype;
  created public.owner_decisions%rowtype;
  v_kind text := p_item->>'kind';
  stamp timestamptz := clock_timestamp();
begin
  if p_item is null or jsonb_typeof(p_item) <> 'object' or p_policy is distinct from 'auto_reply_policy'
    or v_kind is distinct from 'review.reply' or p_item->>'sourceLifecycle' is distinct from 'tenant_event' then
    raise exception 'owner_decision_invalid';
  end if;
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer';
  if not found then raise exception 'owner_decision_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended('owner_decision:' || p_workspace_id::text || ':'
    || coalesce(p_item->>'sourceLifecycle', '') || ':' || coalesce(p_item->>'sourceId', ''), 0));
  if exists (select 1 from public.owner_decisions where workspace_id = p_workspace_id
      and source_lifecycle = p_item->>'sourceLifecycle' and source_id = p_item->>'sourceId' and state = 'open') then
    raise exception 'owner_decision_open';
  end if;
  select * into existing from public.owner_decisions
    where workspace_id = p_workspace_id and source_lifecycle = p_item->>'sourceLifecycle'
      and source_id = p_item->>'sourceId' and revision_hash = p_item->>'revisionHash';
  if found then
    return jsonb_build_object('status', 'already_handled', 'item', public.owner_decision_json(existing));
  end if;
  begin
    insert into public.owner_decisions(workspace_id, system_id, change_kind, route, title, detail, approve_effect,
      not_yet_effect, source_lifecycle, source_id, revision_hash, urgent, sign_in_required, admin_may_decide,
      open_href, state, decided_by_kind, decided_by, decided_at, delivery_state, opened_at, expires_at)
    values (p_workspace_id, null, v_kind, 'handle_after_notice', p_item->>'title', p_item->>'detail',
      p_item->>'approveEffect', p_item->>'notYetEffect', p_item->>'sourceLifecycle', p_item->>'sourceId',
      p_item->>'revisionHash', false, public.needs_you_sign_in_kind(v_kind), false, p_item->>'openHref',
      'approved', 'policy', p_policy, stamp, 'not_sent', stamp, stamp + interval '1 day')
    returning * into created;
  exception
    when unique_violation then
      select * into existing from public.owner_decisions
        where workspace_id = p_workspace_id and source_lifecycle = p_item->>'sourceLifecycle'
          and source_id = p_item->>'sourceId' and revision_hash = p_item->>'revisionHash';
      return jsonb_build_object('status', 'already_handled', 'item', public.owner_decision_json(existing));
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'owner_decision_invalid';
  end;
  return jsonb_build_object('status', 'claimed', 'item', public.owner_decision_json(created));
end;
$$;

revoke all on function public.read_open_owner_decision_for_source(uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_policy_owner_decision(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.read_open_owner_decision_for_source(uuid, text, text) to service_role;
grant execute on function public.record_policy_owner_decision(uuid, jsonb, text) to service_role;

commit;
