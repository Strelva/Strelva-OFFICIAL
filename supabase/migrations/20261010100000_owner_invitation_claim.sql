-- Pending operator owner invitations claimed by magic-link entry. Additive;
-- the original accept transaction rechecks sponsor, verified identity and both memberships.
set local lock_timeout = '3s';
create function public.claim_pending_business_owner(p_actor_id uuid, p_verified_email text, p_tenant_id text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare invitation public.workspace_invitations%rowtype; accepted record;
begin
  perform 1 from public.users where id = p_actor_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'workspace_invitation_identity_required'; end if;
  select i.* into invitation from public.workspace_invitations i
    join public.tenant_workspace_links l on l.workspace_id = i.workspace_id
    join public.tenants t on t.stable_id = l.tenant_stable_id
    where t.id = p_tenant_id and t.id <> 'demo' and i.recipient_email = lower(btrim(p_verified_email))
      and i.issued_by_kind = 'operator' and i.role = 'owner' and i.status = 'pending' and i.expires_at > clock_timestamp()
    order by i.created_at, i.id limit 1;
  if not found then return null; end if;
  select * into accepted from public.accept_workspace_invitation(invitation.token_hash, p_actor_id, p_verified_email);
  if accepted.invitation_status = 'accepted' then return accepted.workspace_id; end if;
  return null;
end;
$$;
revoke all on function public.claim_pending_business_owner(uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_pending_business_owner(uuid,text,text) to service_role;
