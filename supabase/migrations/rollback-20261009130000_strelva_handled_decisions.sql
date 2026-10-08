-- Rollback for 20261009130000_strelva_handled_decisions.sql
-- Forward SHA-256: 5f85457c73e353d7fb37c5c5033b8f4835fd12de565d71bdc9618b1c90711a1d
-- Batch 7: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_strelva_handled(uuid,uuid,text,timestamp with time zone)')))) is distinct from '0fbbe01b2f4f3904161a520f7c3e6453' then raise exception 'rollback_wrong_order_or_function_drift: read_strelva_handled'; end if;
end;
$rollback_guard$;
CREATE OR REPLACE FUNCTION public.read_strelva_handled(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        'title', d.title, 'state', d.state, 'outcome', d.outcome, 'undo', 'not_undoable')
      from public.owner_decisions d
      where d.workspace_id = p_workspace_id and d.decided_at >= since and d.state = 'expired'
  ) entries), '[]'::jsonb);
end;
$function$
;
revoke all on function public.read_strelva_handled(uuid,uuid,text,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.read_strelva_handled(uuid,uuid,text,timestamp with time zone) to "service_role";
commit;
