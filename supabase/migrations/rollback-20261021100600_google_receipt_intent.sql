begin;
do $$ begin if exists(select 1 from public.google_listing_receipts where intent_digest is not null) then raise exception 'google_receipt_intent_rollback_requires_archive'; end if; end $$;
create or replace function public.google_listing_receipt_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id <> old.id or new.workspace_id <> old.workspace_id or new.action <> old.action
    or new.idempotency_key <> old.idempotency_key or new.authority <> old.authority
    or new.location_id <> old.location_id or new.created_at <> old.created_at
    or new.undoes_receipt_id is distinct from old.undoes_receipt_id then
    raise exception 'google_receipt_immutable';
  end if;
  if old.status <> new.status and not (
    (old.status = 'posting' and new.status in ('posted', 'posted_unverified', 'held_by_google', 'failed'))
    or (old.status in ('posted_unverified', 'held_by_google') and new.status in ('posted', 'undone'))
    or (old.status = 'posted_unverified' and new.status = 'held_by_google')
    or (old.status = 'held_by_google' and new.status = 'posted_unverified')
    or (old.status = 'posted' and new.status = 'undone')
  ) then
    raise exception 'google_receipt_transition_invalid';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create or replace function public.google_listing_receipt_json(r public.google_listing_receipts) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', r.id, 'workspaceId', r.workspace_id, 'bindingId', r.binding_id,
    'locationId', r.location_id, 'action', r.action, 'targetRef', r.target_ref, 'status', r.status,
    'authority', r.authority, 'before', r.before_state, 'after', r.after_state, 'readback', r.readback,
    'providerRef', r.provider_ref, 'undo', r.undo, 'undoesReceiptId', r.undoes_receipt_id,
    'undoneByReceiptId', r.undone_by_receipt_id, 'idempotencyKey', r.idempotency_key, 'error', r.error,
    'createdAt', r.created_at, 'updatedAt', r.updated_at, 'completedAt', r.completed_at)
$$;
create or replace function public.record_google_listing_receipt(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.google_listing_receipts%rowtype; v_workspace uuid; v_binding uuid; v_undoes uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['workspaceId','bindingId','locationId','action','targetRef','authority','before','after',
      'undo','undoesReceiptId','idempotencyKey']::text[]) <> '{}'::jsonb then
    raise exception 'google_receipt_invalid';
  end if;
  begin
    v_workspace := (p_input->>'workspaceId')::uuid;
    v_binding := (p_input->>'bindingId')::uuid;
    v_undoes := (p_input->>'undoesReceiptId')::uuid;
  exception when others then raise exception 'google_receipt_invalid';
  end;
  if v_binding is not null and not exists (select 1 from public.workspace_account_bindings
      where id = v_binding and workspace_id = v_workspace) then
    raise exception 'account_binding_not_found';
  end if;
  if v_undoes is not null and not exists (select 1 from public.google_listing_receipts
      where id = v_undoes and workspace_id = v_workspace) then
    raise exception 'google_receipt_not_found';
  end if;
  select * into r from public.google_listing_receipts
    where workspace_id = v_workspace and idempotency_key = p_input->>'idempotencyKey';
  if found then
    return public.google_listing_receipt_json(r) || jsonb_build_object('replayed', true);
  end if;
  insert into public.google_listing_receipts(workspace_id, binding_id, location_id, action, target_ref, authority,
    before_state, after_state, undo, undoes_receipt_id, idempotency_key)
  values (v_workspace, v_binding, p_input->>'locationId', p_input->>'action', p_input->>'targetRef', p_input->'authority',
    p_input->'before', p_input->'after', case when jsonb_typeof(p_input->'undo') = 'object' then p_input->'undo' end,
    v_undoes, p_input->>'idempotencyKey')
  returning * into r;
  return public.google_listing_receipt_json(r) || jsonb_build_object('replayed', false);
end;
$$;
alter table public.google_listing_receipts drop column intent_digest;
commit;
