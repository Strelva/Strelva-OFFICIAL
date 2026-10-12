-- Preparation only: preserve managed review approval across a silent conversion.
-- Depends on tenant conversion, owner-recipient trust, owner claims and workspace exit.
-- The reader performs no writes. Epochs retain revocation across change-back.
-- A durable command admission below serializes owner transitions. Network
-- dispatch occurs only for that already-admitted exact command, never under locks.
begin;

create table public.tenant_review_approval_epochs (
  tenant_stable_id uuid primary key references public.tenants(stable_id) on delete cascade,
  -- Keep the last workspace after unlink/deletion so ownership changes cannot
  -- resurrect an old link. This is evidence, deliberately not a workspace FK.
  workspace_id uuid,
  version uuid not null default gen_random_uuid(),
  legacy_revoked boolean not null default false
);
alter table public.tenant_review_approval_epochs enable row level security;
revoke all on public.tenant_review_approval_epochs from public, anon, authenticated, service_role;

create function public.rotate_tenant_review_approval_epoch(p_stable uuid, p_workspace uuid, p_revoke boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Existing writers may already hold identity/workspace tuples. Never wait
  -- while acquiring admission in the reverse order: one conflicting mutation
  -- fails atomically and can retry its existing command.
  if not pg_try_advisory_xact_lock(hashtextextended('review-authority:'||p_stable::text,7719)) then
    raise exception 'review_authority_busy_retry';
  end if;
  insert into public.tenant_review_approval_epochs(tenant_stable_id, workspace_id, legacy_revoked)
  values(p_stable, p_workspace, p_revoke)
  on conflict(tenant_stable_id) do update set
    workspace_id = coalesce(excluded.workspace_id, tenant_review_approval_epochs.workspace_id),
    version = gen_random_uuid(),
    legacy_revoked = tenant_review_approval_epochs.legacy_revoked or excluded.legacy_revoked;
end $$;

create function public.rotate_workspace_review_approval_epochs(p_workspace uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t record;
begin
  for t in select tenant_stable_id from public.tenant_workspace_links where workspace_id=p_workspace and tenant_stable_id is not null
    union select tenant_stable_id from public.tenant_review_approval_epochs where workspace_id=p_workspace order by tenant_stable_id
  loop perform public.rotate_tenant_review_approval_epoch(t.tenant_stable_id,p_workspace,true); end loop;
end $$;

create function public.tenant_review_approval_link_epoch() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op='DELETE' then
    if old.tenant_stable_id is not null then perform public.rotate_tenant_review_approval_epoch(old.tenant_stable_id,old.workspace_id,true); end if;
    return old;
  end if;
  if new.tenant_stable_id is not null then
    perform public.rotate_tenant_review_approval_epoch(new.tenant_stable_id,new.workspace_id,
      exists(select 1 from public.tenant_review_approval_epochs e where e.tenant_stable_id=new.tenant_stable_id));
  end if;
  return new;
end $$;
create trigger tenant_workspace_links_review_epoch after insert or delete on public.tenant_workspace_links
for each row execute function public.tenant_review_approval_link_epoch();

create function public.tenant_review_approval_owner_epoch() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare old_ws uuid; new_ws uuid; v record;
begin
  if tg_table_name='business_owner_recipient_trust' then
    -- Initial conversion trust precedes its link. Later owner-confirmed writes
    -- revoke old links even if the address changes back or stays identical.
    if tg_op='INSERT' and new.trusted_via='conversion' then return new; end if;
    if tg_op<>'INSERT' then old_ws:=old.workspace_id; end if;
    if tg_op<>'DELETE' then new_ws:=new.workspace_id; end if;
  elsif tg_table_name='workspace_memberships' then
    if tg_op<>'INSERT' and old.role='owner' then old_ws:=old.workspace_id; end if;
    if tg_op<>'DELETE' and new.role='owner' then new_ws:=new.workspace_id; end if;
  elsif tg_table_name='users' then
    if new.email is not distinct from old.email and new.verified_at is not distinct from old.verified_at then return new; end if;
    for v in select m.workspace_id from public.workspace_memberships m where m.user_id=old.id and m.role='owner'
      union select t.workspace_id from public.business_owner_recipient_trust t where t.email in(lower(btrim(old.email)),lower(btrim(new.email)))
    loop perform public.rotate_workspace_review_approval_epochs(v.workspace_id); end loop;
    return new;
  elsif tg_table_name='tenants' then
    -- This compatibility migration does not change unconverted approval
    -- contracts. Track only current/prior workspace authority.
    if new.owner_email is distinct from old.owner_email and (
      exists(select 1 from public.tenant_workspace_links where tenant_stable_id=new.stable_id)
      or exists(select 1 from public.tenant_review_approval_epochs where tenant_stable_id=new.stable_id)) then
      perform public.rotate_tenant_review_approval_epoch(new.stable_id,
        (select workspace_id from public.tenant_workspace_links where tenant_stable_id=new.stable_id),true);
    end if;
    return new;
  end if;
  if old_ws is not null then perform public.rotate_workspace_review_approval_epochs(old_ws); end if;
  if new_ws is not null and new_ws is distinct from old_ws then perform public.rotate_workspace_review_approval_epochs(new_ws); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger owner_recipient_trust_review_epoch after insert or update or delete on public.business_owner_recipient_trust
for each row execute function public.tenant_review_approval_owner_epoch();
create trigger workspace_owner_review_epoch after insert or update or delete on public.workspace_memberships
for each row execute function public.tenant_review_approval_owner_epoch();
create trigger user_identity_review_epoch after update of email,verified_at on public.users
for each row execute function public.tenant_review_approval_owner_epoch();
create trigger tenant_owner_identity_review_epoch after update of owner_email on public.tenants
for each row execute function public.tenant_review_approval_owner_epoch();

-- Existing conversions lack a provable complete pre-install ownership epoch.
-- Refuse their recipient-unbound tokens; bound future tokens still work.
insert into public.tenant_review_approval_epochs(tenant_stable_id,workspace_id,legacy_revoked)
select tenant_stable_id,workspace_id,true from public.tenant_workspace_links where tenant_stable_id is not null;

create function public.read_tenant_review_approval_authority(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t record; l public.tenant_workspace_links; e public.tenant_review_approval_epochs;
  trust public.business_owner_recipient_trust; imported_email text; legacy boolean; v_version text;
begin
  select id,stable_id,owner_email into t from public.tenants where id=p_tenant_id;
  if not found then return null; end if;
  select * into e from public.tenant_review_approval_epochs where tenant_stable_id=t.stable_id;
  select * into l from public.tenant_workspace_links where tenant_stable_id=t.stable_id;
  if not found then
    -- Unlink is never permission to resurrect a converted or transferred token.
    if e.workspace_id is not null then return null; end if;
    if not public.business_record_email_valid(lower(btrim(t.owner_email))) then return null; end if;
    return jsonb_build_object('tenantId',t.id,'workspaceId',null,'recipient',lower(btrim(t.owner_email)),
      'version',encode(sha256(convert_to(t.stable_id::text||coalesce(e.version::text,'')||lower(btrim(t.owner_email)),'UTF8')),'hex'),
      'conversionAt',null,'legacyAllowed',not coalesce(e.legacy_revoked,false));
  end if;
  if public.workspace_exit_completed(l.workspace_id) or e.version is null then return null; end if;
  select * into trust from public.business_owner_recipient_trust where workspace_id=l.workspace_id;
  if not found or not public.business_record_email_valid(trust.email) then return null; end if;
  -- A contradictory or unverified current owner must use signed-in recovery.
  if exists(select 1 from public.workspace_memberships m left join public.users u on u.id=m.user_id
    where m.workspace_id=l.workspace_id and m.role='owner'
      and (u.verified_at is null or lower(btrim(u.email)) is distinct from trust.email)) then return null; end if;
  select lower(btrim(c#>>'{after,value,email}')) into imported_email
    from public.business_record_revisions r cross join lateral jsonb_array_elements(r.changes) c
    where r.workspace_id=l.workspace_id and r.sequence=(l.receipt->>'sequence')::bigint and r.source='tenant_import'
      and c->>'entity'='fact' and c->>'id'='owner_recipient' limit 1;
  legacy:=not e.legacy_revoked and trust.trusted_via='conversion'
    and trust.email is not distinct from imported_email
    and trust.email is not distinct from lower(btrim(t.owner_email))
    and not exists(select 1 from public.workspace_memberships m where m.workspace_id=l.workspace_id and m.role='owner')
    and not exists(select 1 from public.workspace_invitations i where i.workspace_id=l.workspace_id and i.role='owner' and i.accepted_at is not null)
    and not exists(select 1 from public.agency_client_owner_claims c where c.customer_workspace_id=l.workspace_id and c.accepted_at is not null);
  v_version:=encode(sha256(convert_to(jsonb_build_object('epoch',e.version,'link',l.id,'workspace',l.workspace_id,
    'recipient',trust.email,'trustedAt',trust.trusted_at,'via',trust.trusted_via)::text,'UTF8')),'hex');
  return jsonb_build_object('tenantId',t.id,'workspaceId',l.workspace_id,'recipient',trust.email,
    'version',v_version,'conversionAt',l.linked_at,'legacyAllowed',coalesce(legacy,false));
end $$;
revoke all on function public.rotate_tenant_review_approval_epoch(uuid,uuid,boolean),
 public.rotate_workspace_review_approval_epochs(uuid),public.tenant_review_approval_link_epoch(),
 public.tenant_review_approval_owner_epoch(),public.read_tenant_review_approval_authority(text)
from public,anon,authenticated,service_role;
grant execute on function public.read_tenant_review_approval_authority(text) to service_role;

-- One authorization record, not another provider-outcome ledger. Existing
-- operator/listing receipts still own accepted, rejected and uncertain outcomes.
-- No FK to mutable tenant/workspace identity: admitted historical commands and
-- their reconciliation survive unlink, deletion, transfer and exit.
create table public.tenant_review_dispatch_grants (
  id uuid primary key,
  tenant_stable_id uuid not null,
  workspace_id uuid,
  event_id text not null,
  action text not null check(action in ('approved','dismissed')),
  authority_version text not null,
  recipient text not null,
  command jsonb not null,
  command_digest text not null,
  dispatch_state text not null default 'admitted' check(dispatch_state in ('admitted','spent','retry_allowed')),
  sequence bigint generated always as identity unique,
  admitted_at timestamptz not null default clock_timestamp()
);
alter table public.tenant_review_dispatch_grants enable row level security;
revoke all on public.tenant_review_dispatch_grants from public,anon,authenticated,service_role;

-- Exit/accepted owner evidence rotates the same per-tenant boundary. These
-- AFTER triggers use the fail-fast helper; no broad pre-statement lock changes
-- established unlink/invitation ordering or unrelated tenant updates.
create function public.tenant_review_authority_acceptance_epoch() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='workspace_exit_requests' then
    if tg_op<>'INSERT' then perform public.rotate_workspace_review_approval_epochs(old.workspace_id); end if;
    if tg_op<>'DELETE' and (tg_op='INSERT' or new.workspace_id is distinct from old.workspace_id) then
      perform public.rotate_workspace_review_approval_epochs(new.workspace_id);
    end if;
  elsif tg_table_name='workspace_invitations' then
    if new.role='owner' and new.accepted_at is not null then perform public.rotate_workspace_review_approval_epochs(new.workspace_id); end if;
  elsif tg_table_name='agency_client_owner_claims' then
    if new.accepted_at is not null then perform public.rotate_workspace_review_approval_epochs(new.customer_workspace_id); end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger review_admission_invitation_epoch after insert or update on public.workspace_invitations
for each row execute function public.tenant_review_authority_acceptance_epoch();
create trigger review_admission_owner_claim_epoch after insert or update on public.agency_client_owner_claims
for each row execute function public.tenant_review_authority_acceptance_epoch();
create trigger review_admission_exit_epoch after insert or update or delete on public.workspace_exit_requests
for each row execute function public.tenant_review_authority_acceptance_epoch();

create function public.admit_tenant_review_approval_dispatch(p_input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare a jsonb; stable uuid; captured_stable uuid; prior public.tenant_review_dispatch_grants; grant_id uuid; expires numeric;
begin
  -- Fresh statement snapshots after admission-lock waits are required. A stale
  -- caller snapshot must fail closed rather than admit a revoked token.
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'review_dispatch_isolation_unsupported'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'request') is distinct from 'object'
    or coalesce(p_input->>'eventId','')='' or length(p_input->>'eventId')>200
    or coalesce(p_input->>'attemptId','')='' or length(p_input->>'attemptId')>200
    or coalesce(p_input->>'action','') not in ('approved','dismissed')
    or coalesce(p_input->>'tokenKind','') not in ('legacy','review')
    or coalesce(p_input->>'ledger','') not in ('legacy','listing','event')
    or coalesce(p_input->>'ledgerId','')='' then raise exception 'review_dispatch_invalid'; end if;
  grant_id:=(p_input->>'grantId')::uuid;
  expires:=(p_input->>'tokenExpiresAt')::numeric;
  if grant_id is null or expires is null or expires < extract(epoch from clock_timestamp())*1000
    or expires > extract(epoch from clock_timestamp())*1000+1209600000 then raise exception 'review_dispatch_token_expired'; end if;
  if p_input->>'action'='approved' and (p_input->>'ledger'='event'
    or coalesce(p_input#>>'{request,reviewId}','')='' or coalesce(p_input#>>'{request,reply}','')=''
    or coalesce(p_input#>>'{request,providerTarget}','')='') then raise exception 'review_dispatch_invalid'; end if;
  if p_input->>'action'='dismissed' and p_input->>'ledger'<>'event' then raise exception 'review_dispatch_invalid'; end if;
  select stable_id into stable from public.tenants where id=p_input->>'tenantId';
  if stable is null then raise exception 'review_approval_authority_changed'; end if;
  captured_stable:=stable;
  if not pg_try_advisory_xact_lock(hashtextextended('review-authority:'||stable::text,7719)) then
    raise exception 'review_authority_busy_retry';
  end if;
  if expires < extract(epoch from clock_timestamp())*1000 then raise exception 'review_dispatch_token_expired'; end if;
  -- VOLATILE function: this query starts after the lock and sees committed
  -- owner/link/exit changes that won admission. No identity tuple locks.
  a:=public.read_tenant_review_approval_authority(p_input->>'tenantId');
  if a is null then raise exception 'review_approval_authority_changed'; end if;
  if p_input->>'tokenKind'='review' then
    if a->>'workspaceId' is distinct from p_input->>'workspaceId'
      or a->>'recipient' is distinct from p_input->>'recipient'
      or a->>'version' is distinct from p_input->>'authorityVersion' then raise exception 'review_approval_authority_changed'; end if;
  else
    if a->'legacyAllowed' is distinct from 'true'::jsonb
      or (p_input->>'tokenIssuedAt')::numeric is distinct from expires-1209600000
      or (a->>'conversionAt' is not null and (p_input->>'tokenIssuedAt')::numeric > extract(epoch from (a->>'conversionAt')::timestamptz)*1000)
      then raise exception 'review_approval_authority_changed'; end if;
  end if;
  select stable_id into stable from public.tenants where id=p_input->>'tenantId';
  if stable is null or stable is distinct from captured_stable then raise exception 'review_approval_authority_changed'; end if;
  if p_input->>'ledger'='legacy' and not exists(
    select 1 from public.operator_google_write_attempts x where x.attempt_id=(p_input->>'ledgerId')::uuid
      and x.tenant_id=p_input->>'tenantId' and x.write_kind='review_reply' and x.acceptance='pending'
      and x.command_key='approval:'||(p_input->>'eventId')
      and x.request=jsonb_build_object('reviewId',p_input#>>'{request,reviewId}','reply',p_input#>>'{request,reply}'))
    then raise exception 'review_dispatch_receipt_mismatch'; end if;
  if p_input->>'ledger'='listing' and not exists(
    select 1 from public.google_listing_receipts x where x.id=(p_input->>'ledgerId')::uuid
      and x.workspace_id=(a->>'workspaceId')::uuid and x.status='posting' and x.action in ('reply_post','reply_update')
      and x.target_ref=p_input#>>'{request,reviewId}' and x.after_state=jsonb_build_object('reply',p_input#>>'{request,reply}')
      and x.location_id=p_input#>>'{request,locationId}' and x.authority->>'kind'='owner_approval'
      and x.authority->>'approvalRef'='event:'||(p_input->>'eventId'))
    then raise exception 'review_dispatch_receipt_mismatch'; end if;
  select * into prior from public.tenant_review_dispatch_grants where id=grant_id;
  if found then
    if prior.command is distinct from p_input then raise exception 'review_dispatch_conflict'; end if;
    return jsonb_build_object('admitted',false,'grantId',grant_id);
  end if;
  -- A different random UUID is not permission to replay a pending/accepted/
  -- uncertain raw request. Only a recorded definitive 4xx response opens a
  -- new admission for this same provider receipt, which rechecks authority.
  select * into prior from public.tenant_review_dispatch_grants
    where command->>'ledger'=p_input->>'ledger' and command->>'ledgerId'=p_input->>'ledgerId'
    order by sequence desc limit 1;
  if found and prior.dispatch_state<>'retry_allowed' then raise exception 'review_dispatch_already_admitted'; end if;
  insert into public.tenant_review_dispatch_grants(id,tenant_stable_id,workspace_id,event_id,action,authority_version,recipient,command,command_digest)
  values(grant_id,stable,(a->>'workspaceId')::uuid,p_input->>'eventId',p_input->>'action',a->>'version',a->>'recipient',p_input,
    encode(sha256(convert_to(p_input::text,'UTF8')),'hex'));
  return jsonb_build_object('admitted',true,'grantId',grant_id);
end $$;
create function public.settle_tenant_review_dispatch_admission(p_grant_id uuid,p_ledger_id text,p_request jsonb,p_response_status integer)
returns void language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare g public.tenant_review_dispatch_grants; next_state text;
begin
  -- Historical outcome reporting is allowed after transfer/exit. This cannot
  -- grant dispatch and never changes the captured command or authority.
  select * into g from public.tenant_review_dispatch_grants where id=p_grant_id for update;
  if not found or g.command->>'ledgerId' is distinct from p_ledger_id or g.command->'request' is distinct from p_request
    or p_response_status is null or p_response_status<0 or p_response_status>599 then raise exception 'review_dispatch_settlement_mismatch'; end if;
  next_state:=case when g.action='approved' and p_response_status between 400 and 499 then 'retry_allowed' else 'spent' end;
  if g.dispatch_state='admitted' then update public.tenant_review_dispatch_grants set dispatch_state=next_state where id=g.id;
  elsif g.dispatch_state<>next_state then raise exception 'review_dispatch_settlement_conflict'; end if;
end $$;
revoke all on function public.tenant_review_authority_acceptance_epoch(),public.admit_tenant_review_approval_dispatch(jsonb)
from public,anon,authenticated,service_role;
revoke all on function public.settle_tenant_review_dispatch_admission(uuid,text,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.admit_tenant_review_approval_dispatch(jsonb) to service_role;
grant execute on function public.settle_tenant_review_dispatch_admission(uuid,text,jsonb,integer) to service_role;
commit;
