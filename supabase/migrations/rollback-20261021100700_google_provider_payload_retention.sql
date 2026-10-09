begin;
do $$ begin if exists(select 1 from public.google_listing_receipts) then raise exception 'google_payload_retention_rollback_requires_archive'; end if; end $$;
create or replace function public.google_listing_receipt_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.intent_digest is distinct from old.intent_digest or new.id <> old.id or new.workspace_id <> old.workspace_id or new.action <> old.action
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
  select jsonb_build_object('intentDigest', r.intent_digest, 'id', r.id, 'workspaceId', r.workspace_id, 'bindingId', r.binding_id,
    'locationId', r.location_id, 'action', r.action, 'targetRef', r.target_ref, 'status', r.status,
    'authority', r.authority, 'before', r.before_state, 'after', r.after_state, 'readback', r.readback,
    'providerRef', r.provider_ref, 'undo', r.undo, 'undoesReceiptId', r.undoes_receipt_id,
    'undoneByReceiptId', r.undone_by_receipt_id, 'idempotencyKey', r.idempotency_key, 'error', r.error,
    'createdAt', r.created_at, 'updatedAt', r.updated_at, 'completedAt', r.completed_at)
$$;
create or replace function public.record_google_listing_receipt(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.google_listing_receipts%rowtype; v_workspace uuid; v_binding uuid; v_undoes uuid; v_intent text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['workspaceId','bindingId','locationId','action','targetRef','authority','before','after',
      'undo','undoesReceiptId','idempotencyKey','intentDigest']::text[]) <> '{}'::jsonb then
    raise exception 'google_receipt_invalid';
  end if;
  v_intent := encode(sha256(convert_to((p_input - array['idempotencyKey','undo','intentDigest']::text[])::text,'UTF8')),'hex');
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
    before_state, after_state, undo, undoes_receipt_id, idempotency_key, intent_digest)
  values (v_workspace, v_binding, p_input->>'locationId', p_input->>'action', p_input->>'targetRef', p_input->'authority',
    p_input->'before', p_input->'after', case when jsonb_typeof(p_input->'undo') = 'object' then p_input->'undo' end,
    v_undoes, p_input->>'idempotencyKey', v_intent)
  returning * into r;
  return public.google_listing_receipt_json(r) || jsonb_build_object('replayed', false);
end;
$$;
create or replace function public.settle_google_listing_receipt(p_receipt_id uuid, p_workspace_id uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.google_listing_receipts%rowtype;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['status','readback','after','providerRef','error','undo']::text[]) <> '{}'::jsonb
    or (p_input->>'status') not in ('posted', 'posted_unverified', 'held_by_google', 'failed') then
    raise exception 'google_receipt_invalid';
  end if;
  select * into r from public.google_listing_receipts where id = p_receipt_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'google_receipt_not_found'; end if;
  update public.google_listing_receipts set
    status = p_input->>'status',
    readback = p_input->>'readback',
    after_state = coalesce(p_input->'after', after_state),
    provider_ref = coalesce(p_input->>'providerRef', provider_ref),
    error = left(p_input->>'error', 500),
    undo = case when p_input ? 'undo' then
      case when jsonb_typeof(p_input->'undo') = 'object' then p_input->'undo' end else undo end,
    completed_at = clock_timestamp()
  where id = r.id returning * into r;
  if r.undoes_receipt_id is not null and r.status in ('posted', 'posted_unverified', 'held_by_google') then
    update public.google_listing_receipts set status = 'undone', undone_by_receipt_id = r.id
      where id = r.undoes_receipt_id and status in ('posted', 'posted_unverified', 'held_by_google');
  end if;
  return public.google_listing_receipt_json(r);
end;
$$;
drop function public.purge_expired_google_receipt_payloads(integer);
drop function public.store_google_receipt_payload(uuid,uuid,timestamptz,jsonb);
drop table public.google_listing_receipt_payloads;
alter table public.google_listing_receipts drop column authored_input,drop column before_origin,drop column after_origin,drop column undo_origin,drop column provider_payload_expires_at;
commit;
