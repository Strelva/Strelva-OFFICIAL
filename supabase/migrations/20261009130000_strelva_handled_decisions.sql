-- Strelva handled lists the owner's decided Needs you items. Additive.
-- Local only until Jacob's yes.
--
-- Why. read_strelva_handled (20261007120000_needs_you.sql) listed business
-- record revisions, website document receipts, policy history and only
-- *expired* owner decisions. An owner who approved a booking request (or said
-- Not yet to one) saw it leave Needs you and appear nowhere: "Strelva
-- confirmed Dana Reed's booking" had no receipt.
--
-- What this changes: read_strelva_handled also returns approved and declined
-- owner_decisions in the window, with what the receipt needs to say what
-- happened and whether it can be undone: the source lifecycle and id, who
-- decided (owner link, owner session, admin, operator), the outcome and its
-- reason, the receipt ref, the item's two effects and its System and open
-- link. It writes nothing and adds no receipt store.
--
-- Undo stays honest. This function reports `not_undoable` for every decision
-- row: no source lifecycle has a one-tap undo of an owner's decision today
-- (a confirmed booking is cancelled or moved, a launch is restored as a new
-- draft for approval, a sent reply stays sent). The app maps each lifecycle
-- to the reason it shows (src/platform/needs-you/handled.ts). Only business
-- record revisions remain one tap, unchanged.
--
-- Replaces read_strelva_handled only, same signature and grants. Rollback:
-- re-run the function body from 20261007120000_needs_you.sql (lines 731-772)
-- with `create or replace`; nothing else depends on the new keys.

set local lock_timeout = '3s';

create or replace function public.read_strelva_handled(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_since timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare since timestamptz := coalesce(p_since, clock_timestamp() - interval '7 days');
begin
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null
    and public.needs_you_operator_id(p_user_id, p_verified_email) is null then
    raise exception 'owner_decision_access_denied';
  end if;
  return coalesce((select jsonb_agg(entry order by (entry->>'at') desc) from (
    select jsonb_build_object('store', 'business_record_revisions', 'id', r.sequence::text, 'at', r.created_at,
        'source', r.source, 'changes', (select coalesce(jsonb_agg((c->>'entity') || ':' || coalesce(c->>'id', '')), '[]'::jsonb) from jsonb_array_elements(r.changes) c),
        'undoOf', r.undo_of_sequence,
        'undo', case
          when r.undo_of_sequence is not null then 'not_undoable'
          when exists (select 1 from public.business_record_revisions u where u.workspace_id = r.workspace_id and u.undo_of_sequence = r.sequence) then 'undone'
          when exists (select 1 from public.business_record_revisions later where later.workspace_id = r.workspace_id and later.sequence > r.sequence) then 'undo_needs_review'
          else 'undo' end) as entry
      from public.business_record_revisions r
      where r.workspace_id = p_workspace_id and r.created_at >= since
        and r.source in ('operator','agent','website_rebuild','bookings','inquiries','tenant_import')
    union all
    select jsonb_build_object('store', 'website_document_receipts', 'id', x.id::text, 'at', x.created_at,
        'websiteWorkId', x.website_work_id, 'revision', x.revision, 'action', x.receipt->>'action',
        'undo', 'undo_needs_review')
      from public.website_document_receipts x
      where x.workspace_id = p_workspace_id and x.created_at >= since
    union all
    select jsonb_build_object('store', 'decision_policy_history', 'id', h.id::text, 'at', h.created_at,
        'kind', h.change_kind, 'layer', h.layer, 'oldRoute', h.old_route, 'newRoute', h.new_route, 'reason', h.set_reason,
        'undo', 'undo')
      from public.decision_policy_history h
      where h.workspace_id = p_workspace_id and h.created_at >= since
    union all
    select jsonb_build_object('store', 'owner_decisions', 'id', d.id::text, 'at', d.decided_at, 'kind', d.change_kind,
        'title', d.title, 'state', d.state, 'outcome', d.outcome, 'outcomeReason', d.outcome_reason,
        'sourceLifecycle', d.source_lifecycle, 'sourceId', d.source_id, 'decidedByKind', d.decided_by_kind,
        'receiptRef', d.receipt_ref, 'approveEffect', d.approve_effect, 'notYetEffect', d.not_yet_effect,
        'systemId', d.system_id, 'openHref', d.open_href, 'undo', 'not_undoable')
      from public.owner_decisions d
      where d.workspace_id = p_workspace_id and d.decided_at >= since
        and d.state in ('expired', 'approved', 'declined')
  ) entries), '[]'::jsonb);
end;
$$;

revoke all on function public.read_strelva_handled(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.read_strelva_handled(uuid, uuid, text, timestamptz) to service_role;
