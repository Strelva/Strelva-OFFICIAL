begin;
-- API-observed content is deletable independently of immutable action history.
-- 29 days leaves a daily-operation margin below the provider's 30-day ceiling.
alter table public.google_listing_receipts
 add column authored_input jsonb,
 add column before_origin text not null default 'provider' check(before_origin in ('authored','provider')),
 add column after_origin text not null default 'provider' check(after_origin in ('authored','provider')),
 add column undo_origin text not null default 'authored' check(undo_origin in ('authored','provider')),
 add column provider_payload_expires_at timestamptz;
create table public.google_listing_receipt_payloads (
 receipt_id uuid primary key references public.google_listing_receipts(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=768000),
 expires_at timestamptz not null
);
create index google_receipt_payload_expiry on public.google_listing_receipt_payloads(expires_at,receipt_id);
alter table public.google_listing_receipt_payloads enable row level security;
revoke all on public.google_listing_receipt_payloads from public,anon,authenticated,service_role;
-- Legacy after-state has no reliable provenance: expire its receipt copy;
-- independently authored records, Versions and approval events are untouched.
insert into public.google_listing_receipt_payloads(receipt_id,workspace_id,payload,expires_at)
 select id,workspace_id,jsonb_strip_nulls(jsonb_build_object('before',before_state,'after',after_state,
  'undo',case when undo->>'kind' in ('restore_reply','patch_snapshot') then undo end)),created_at+interval '29 days'
 from public.google_listing_receipts where created_at+interval '29 days'>clock_timestamp();
update public.google_listing_receipts set before_state=null,after_state=null,
 error=case when error is null or error like 'Google API access is still pending%' then error else 'Prior failure detail expired; status retained.' end,
 undo_origin=case when undo->>'kind' in ('restore_reply','patch_snapshot') then 'provider' else 'authored' end,
 provider_payload_expires_at=created_at+interval '29 days',
 undo=case when undo->>'kind' in ('restore_reply','patch_snapshot') then null else undo end;

create function public.store_google_receipt_payload(p_receipt_id uuid,p_workspace_id uuid,p_expires_at timestamptz,p_fields jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_expires_at>clock_timestamp() then
  insert into public.google_listing_receipt_payloads(receipt_id,workspace_id,payload,expires_at)
   values(p_receipt_id,p_workspace_id,jsonb_strip_nulls(p_fields),p_expires_at)
  on conflict(receipt_id) do update set payload=jsonb_strip_nulls(google_listing_receipt_payloads.payload||p_fields);
 end if;
end;
$$;
revoke all on function public.store_google_receipt_payload(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;

create function public.purge_expired_google_receipt_payloads(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare removed integer;
begin
 if p_limit is null or p_limit not between 1 and 10000 then raise exception 'google_payload_purge_invalid'; end if;
 delete from public.google_listing_receipt_payloads where receipt_id in (
  select receipt_id from public.google_listing_receipt_payloads where expires_at<=clock_timestamp()
  order by expires_at,receipt_id limit p_limit for update skip locked);
 get diagnostics removed=row_count;
 return removed;
end;
$$;
revoke all on function public.purge_expired_google_receipt_payloads(integer) from public,anon,authenticated;
grant execute on function public.purge_expired_google_receipt_payloads(integer) to service_role;

create or replace function public.google_listing_receipt_json(r public.google_listing_receipts) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('intentDigest', r.intent_digest, 'id', r.id, 'workspaceId', r.workspace_id, 'bindingId', r.binding_id,
    'locationId', r.location_id, 'action', r.action, 'targetRef', r.target_ref, 'status', r.status,
    'authority', r.authority, 'before', case when r.before_origin='provider' then p.payload->'before' else r.before_state end, 'after', case when r.after_origin='provider' then p.payload->'after' else r.after_state end, 'readback', r.readback,
    'providerRef', r.provider_ref, 'undo', case when r.undo_origin='provider' then p.payload->'undo' else r.undo end, 'undoesReceiptId', r.undoes_receipt_id,
    'undoneByReceiptId', r.undone_by_receipt_id, 'idempotencyKey', r.idempotency_key, 'error', r.error,
    'createdAt', r.created_at, 'updatedAt', r.updated_at, 'completedAt', r.completed_at, 'providerPayloadExpiresAt',r.provider_payload_expires_at,
    'providerPayloadExpired',r.provider_payload_expires_at<=clock_timestamp(),'authoredInput',r.authored_input)
  from (select payload from public.google_listing_receipt_payloads where receipt_id=r.id and workspace_id=r.workspace_id and expires_at>clock_timestamp()) p
  right join (select 1) singleton on true
$$;
create or replace function public.record_google_listing_receipt(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.google_listing_receipts%rowtype; v_workspace uuid; v_binding uuid; v_undoes uuid; v_intent text; v_expiry timestamptz; v_after_origin text; v_undo_origin text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['workspaceId','bindingId','locationId','action','targetRef','authority','before','after',
      'undo','undoesReceiptId','idempotencyKey','intentDigest','afterOrigin','providerPayloadExpiresAt']::text[]) <> '{}'::jsonb then
    raise exception 'google_receipt_invalid';
  end if;
  v_intent := encode(sha256(convert_to((p_input - array['idempotencyKey','undo','intentDigest','afterOrigin','providerPayloadExpiresAt']::text[])::text,'UTF8')),'hex');
  v_after_origin:=coalesce(p_input->>'afterOrigin','authored');
  v_undo_origin:=case when p_input->'undo'->>'kind' in ('restore_reply','patch_snapshot') then 'provider' else 'authored' end;
  if v_after_origin not in ('authored','provider') then raise exception 'google_receipt_invalid'; end if;
  begin
    v_expiry:=least(coalesce((p_input->>'providerPayloadExpiresAt')::timestamptz,clock_timestamp()+interval '29 days'),clock_timestamp()+interval '29 days');
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
  if v_expiry<=clock_timestamp() and v_after_origin='provider' then raise exception 'google_receipt_snapshot_expired'; end if;
  insert into public.google_listing_receipts(workspace_id, binding_id, location_id, action, target_ref, authority,
    before_state, after_state, undo, undoes_receipt_id, idempotency_key, intent_digest,before_origin,after_origin,undo_origin,provider_payload_expires_at,authored_input)
  values (v_workspace, v_binding, p_input->>'locationId', p_input->>'action', p_input->>'targetRef', p_input->'authority',
    null,case when v_after_origin='authored' then p_input->'after' end,case when v_undo_origin='authored' and jsonb_typeof(p_input->'undo')='object' then p_input->'undo' end,
    v_undoes,p_input->>'idempotencyKey',v_intent,'provider',v_after_origin,v_undo_origin,v_expiry,case when v_after_origin='authored' then p_input->'after' end)
  returning * into r;
  perform public.store_google_receipt_payload(r.id,r.workspace_id,v_expiry,jsonb_build_object('before',p_input->'before','after',case when v_after_origin='provider' then p_input->'after' end,'undo',case when v_undo_origin='provider' then p_input->'undo' end));
  return public.google_listing_receipt_json(r) || jsonb_build_object('replayed', false);
end;
$$;
create or replace function public.settle_google_listing_receipt(p_receipt_id uuid, p_workspace_id uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.google_listing_receipts%rowtype; v_after_origin text; v_undo_origin text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['status','readback','after','providerRef','error','undo','afterOrigin']::text[]) <> '{}'::jsonb
    or (p_input->>'status') not in ('posted', 'posted_unverified', 'held_by_google', 'failed') then
    raise exception 'google_receipt_invalid';
  end if;
  select * into r from public.google_listing_receipts where id = p_receipt_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'google_receipt_not_found'; end if;
  v_after_origin:=case when p_input ? 'after' then coalesce(p_input->>'afterOrigin','authored') else r.after_origin end;
  v_undo_origin:=case when p_input ? 'undo' then case when p_input->'undo'->>'kind' in ('restore_reply','patch_snapshot') then 'provider' else 'authored' end else r.undo_origin end;
  if v_after_origin not in ('authored','provider') then raise exception 'google_receipt_invalid'; end if;
  perform public.store_google_receipt_payload(r.id,r.workspace_id,r.provider_payload_expires_at,
   (case when p_input ? 'after' then jsonb_build_object('after',case when v_after_origin='provider' then p_input->'after' end) else '{}'::jsonb end)
   ||(case when p_input ? 'undo' then jsonb_build_object('undo',case when v_undo_origin='provider' then p_input->'undo' end) else '{}'::jsonb end));
  update public.google_listing_receipts set
    status = p_input->>'status',
    readback = p_input->>'readback',
    after_origin=v_after_origin,undo_origin=v_undo_origin,
    after_state=case when v_after_origin='provider' then null else coalesce(p_input->'after',after_state) end,
    provider_ref = coalesce(p_input->>'providerRef', provider_ref),
    error = left(p_input->>'error', 500),
    undo = case when v_undo_origin='provider' then null when p_input ? 'undo' then
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
create or replace function public.google_listing_receipt_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.authored_input is distinct from old.authored_input or new.provider_payload_expires_at is distinct from old.provider_payload_expires_at or new.before_origin<>old.before_origin or new.intent_digest is distinct from old.intent_digest or new.id <> old.id or new.workspace_id <> old.workspace_id or new.action <> old.action
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
commit;
