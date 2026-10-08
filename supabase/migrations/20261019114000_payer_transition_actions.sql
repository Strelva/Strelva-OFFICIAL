-- #278: party-aware, lock-free read projections for payer-change controls.
-- Additive v2 RPCs leave all original readers, commands and commitments intact.
-- can_respond means the current verified actor can answer this pending proposal;
-- it does not promise acceptance. The unchanged command rechecks the proposer
-- and can resolve the proposal stale. Rejection remains available in that case.
-- is_current is resolved before visibility filtering; a former payer seeing
-- only their own history must not be told that an older acceptance is current.
-- These projections confer no authority; mutation-time SQL is authoritative.
-- No allowance, entitlement, price, Stripe, release-flag or production changes.
begin;
set local lock_timeout = '3s';

create function public.workspace_payer_transition_snapshot_v2(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_verified_email text
) returns table (
  id uuid, workspace_id uuid, successor_user_id uuid, successor_email text, status text,
  proposed_by uuid, proposer_email text, resolved_by uuid, proposed_at timestamptz,
  resolved_at timestamptz, accepted_at timestamptz,
  successor_kind text, successor_workspace_id uuid, successor_workspace_name text,
  can_respond boolean, can_revoke boolean, is_current boolean
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare is_owner boolean;
begin
  perform 1 from public.users u where u.id=p_actor_id
    and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  is_owner := exists(select 1 from public.workspace_memberships m
    where m.workspace_id=p_workspace_id and m.user_id=p_actor_id and m.role='owner');
  if not is_owner and not exists(select 1 from public.workspace_payer_transitions x where x.workspace_id=p_workspace_id
      and ((x.successor_user_id=p_actor_id and x.successor_email=lower(btrim(p_verified_email)))
        or exists(select 1 from public.workspace_memberships am where am.workspace_id=x.successor_workspace_id
          and am.user_id=p_actor_id and am.role in ('owner','admin')))) then
    raise exception 'payer_transition_workspace_denied';
  end if;
  return query select t.id,t.workspace_id,t.successor_user_id,t.successor_email,t.status,
    t.proposed_by,p.email,t.resolved_by,t.proposed_at,t.resolved_at,t.accepted_at,
    t.successor_kind,t.successor_workspace_id,sw.name,
    t.status = 'pending' and case t.successor_kind
      when 'user' then t.successor_user_id = p_actor_id and t.successor_email = lower(btrim(p_verified_email))
      when 'agency' then exists(select 1 from public.workspace_memberships am
        join public.workspaces aw on aw.id = am.workspace_id and aw.kind = 'agency'
        where am.workspace_id = t.successor_workspace_id and am.user_id = p_actor_id and am.role in ('owner','admin'))
      when 'business' then exists(select 1 from public.workspace_memberships bm
        where bm.workspace_id = t.workspace_id and bm.user_id = p_actor_id and bm.role = 'owner')
      else false end,
    t.status = 'pending' and exists(select 1 from public.workspace_memberships bm
      where bm.workspace_id = t.workspace_id and bm.user_id = p_actor_id and bm.role = 'owner'),
    coalesce(t.id = (select latest.id from public.workspace_payer_transitions latest
      where latest.workspace_id = t.workspace_id and latest.status = 'accepted'
      order by latest.accepted_at desc, latest.id desc limit 1), false)
    from public.workspace_payer_transitions t join public.users p on p.id=t.proposed_by
    left join public.workspaces sw on sw.id=t.successor_workspace_id
    where t.workspace_id=p_workspace_id and (
      is_owner
      or (t.successor_user_id=p_actor_id and t.successor_email=lower(btrim(p_verified_email)))
      or exists(select 1 from public.workspace_memberships am where am.workspace_id=t.successor_workspace_id
        and am.user_id=p_actor_id and am.role in ('owner','admin'))
    ) order by t.proposed_at desc;
end $$;

-- The account inbox also includes business successors for current owners.
-- No business membership, provider mandate or financial acceptance is granted.
create function public.workspace_payer_transition_inbox_v2(p_actor_id uuid,p_verified_email text)
returns table (
  id uuid, workspace_id uuid, workspace_name text, successor_user_id uuid,
  successor_email text, status text, proposed_by uuid, proposer_email text,
  resolved_by uuid, proposed_at timestamptz, resolved_at timestamptz, accepted_at timestamptz,
  successor_kind text, successor_workspace_id uuid, successor_workspace_name text,
  can_respond boolean, can_revoke boolean, is_current boolean
) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u where u.id=p_actor_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  return query select t.id,t.workspace_id,w.name,t.successor_user_id,t.successor_email,t.status,
    t.proposed_by,p.email,t.resolved_by,t.proposed_at,t.resolved_at,t.accepted_at,
    t.successor_kind,t.successor_workspace_id,sw.name,
    t.status = 'pending' and case t.successor_kind
      when 'user' then t.successor_user_id = p_actor_id and t.successor_email = lower(btrim(p_verified_email))
      when 'agency' then exists(select 1 from public.workspace_memberships am
        join public.workspaces aw on aw.id = am.workspace_id and aw.kind = 'agency'
        where am.workspace_id = t.successor_workspace_id and am.user_id = p_actor_id and am.role in ('owner','admin'))
      when 'business' then exists(select 1 from public.workspace_memberships bm
        where bm.workspace_id = t.workspace_id and bm.user_id = p_actor_id and bm.role = 'owner')
      else false end,
    t.status = 'pending' and exists(select 1 from public.workspace_memberships bm
      where bm.workspace_id = t.workspace_id and bm.user_id = p_actor_id and bm.role = 'owner'),
    coalesce(t.id = (select latest.id from public.workspace_payer_transitions latest
      where latest.workspace_id = t.workspace_id and latest.status = 'accepted'
      order by latest.accepted_at desc, latest.id desc limit 1), false)
    from public.workspace_payer_transitions t
    join public.workspaces w on w.id=t.workspace_id
    join public.users p on p.id=t.proposed_by
    left join public.workspaces sw on sw.id=t.successor_workspace_id
    where (t.successor_kind = 'business' and exists(select 1 from public.workspace_memberships bm
        where bm.workspace_id = t.workspace_id and bm.user_id = p_actor_id and bm.role = 'owner'))
      or (t.successor_user_id=p_actor_id and t.successor_email=lower(btrim(p_verified_email)))
      or exists(select 1 from public.workspace_memberships am where am.workspace_id=t.successor_workspace_id
        and am.user_id=p_actor_id and am.role in ('owner','admin'))
    order by t.proposed_at desc;
end $$;


revoke all on function public.workspace_payer_transition_snapshot_v2(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.workspace_payer_transition_inbox_v2(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.workspace_payer_transition_snapshot_v2(uuid,uuid,text) to service_role;
grant execute on function public.workspace_payer_transition_inbox_v2(uuid,text) to service_role;

-- Preserve the exact installed definitions/ACLs so rollback refuses a later
-- successor or permission change rather than silently removing it.
create schema if not exists release_rollback_baseline;
revoke all on schema release_rollback_baseline from public,anon,authenticated,service_role;
create table release_rollback_baseline.payer_transition_actions (
  signature text primary key,
  definition_hash text not null,
  owner_oid oid not null,
  installed_acl aclitem[] not null
);
revoke all on release_rollback_baseline.payer_transition_actions from public,anon,authenticated,service_role;
insert into release_rollback_baseline.payer_transition_actions
select signature,md5(pg_get_functiondef(p.oid)),p.proowner,coalesce(p.proacl,acldefault('f',p.proowner))
from unnest(array[
  'public.workspace_payer_transition_snapshot_v2(uuid,uuid,text)',
  'public.workspace_payer_transition_inbox_v2(uuid,text)'
]) signature join pg_proc p on p.oid=signature::regprocedure;
commit;
