-- Preparation only: preserve managed review approval across a silent conversion.
-- Depends on tenant conversion, owner-recipient trust, owner claims and workspace exit.
-- The reader performs no writes. Epochs retain revocation across change-back.
-- This does NOT serialize a read with a later Redis/provider action.
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
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.tenant_review_approval_epochs(tenant_stable_id, workspace_id, legacy_revoked)
  values(p_stable, p_workspace, p_revoke)
  on conflict(tenant_stable_id) do update set
    workspace_id = coalesce(excluded.workspace_id, tenant_review_approval_epochs.workspace_id),
    version = gen_random_uuid(),
    legacy_revoked = tenant_review_approval_epochs.legacy_revoked or excluded.legacy_revoked
$$;

create function public.rotate_workspace_review_approval_epochs(p_workspace uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t record;
begin
  for t in select tenant_stable_id from public.tenant_workspace_links where workspace_id=p_workspace and tenant_stable_id is not null
    union select tenant_stable_id from public.tenant_review_approval_epochs where workspace_id=p_workspace
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
commit;
