-- Explicit optional claim delivery. No existing client is enrolled or emailed.
begin;
set local lock_timeout = '3s';
lock table public.agency_client_owner_claims in access exclusive mode;
-- Preserve the exact claim identity/lifecycle guard and add only delivery
-- transitions. Acceptance is terminal; an unknown provider result cannot retry.
create table public.done_agency_claim_email_predecessor(definition text not null, definition_hash text);
alter table public.done_agency_claim_email_predecessor enable row level security;
revoke all on public.done_agency_claim_email_predecessor from public,anon,authenticated,service_role;
insert into public.done_agency_claim_email_predecessor(definition)
  select pg_get_functiondef('public.agency_client_owner_claim_guard()'::regprocedure);
do $$ declare original text; updated text; begin
  select definition into original from public.done_agency_claim_email_predecessor;
  updated := replace(original, E'begin\n', $guard$begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'delivery') = (to_jsonb(old) - 'delivery')
    and ((old.status = 'pending' and old.delivery->>'status' = 'not_sent' and new.delivery->>'status' = 'sending')
      or (old.delivery->>'status' = 'sending' and new.delivery->>'status' in ('accepted','not_sent','unknown'))) then
    return new;
  end if;
$guard$);
  if updated = original then raise exception 'done_agency_claim_email_predecessor_drift'; end if;
  execute updated;
end $$;
update public.done_agency_claim_email_predecessor
  set definition_hash=md5(pg_get_functiondef('public.agency_client_owner_claim_guard()'::regprocedure));
create function public.prepare_agency_owner_claim_email(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_claim_id uuid, p_token_hash text
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.agency_client_owner_claims%rowtype;
begin
  perform public.agency_client_assert_actor(p_user_id,p_verified_email,p_agency_workspace_id);
  select * into c from public.agency_client_owner_claims where id=p_claim_id and agency_workspace_id=p_agency_workspace_id for update;
  if not found or c.created_by<>p_user_id or c.status<>'pending' or c.expires_at<=clock_timestamp()
    or c.token_hash<>p_token_hash or c.delivery->>'status'<>'not_sent' then return false; end if;
  -- Existing managed clients stay silent, independently of global email flags.
  if exists(select 1 from public.tenant_workspace_links where workspace_id=c.customer_workspace_id)
    or exists(select 1 from public.tenants where lower(btrim(owner_email))=c.recipient_email)
    or not public.agency_client_waiting_for_owner(c.customer_workspace_id)
    or not exists(select 1 from public.agency_client_additions where customer_workspace_id=c.customer_workspace_id and agency_workspace_id=p_agency_workspace_id)
    or public.workspace_exit_completed(c.customer_workspace_id)
    or not public.agency_effect_allowed(p_agency_workspace_id,'email')
    or not exists(select 1 from public.workspace_providers where customer_workspace_id=c.customer_workspace_id and provider_workspace_id=p_agency_workspace_id and status='active')
    or not exists(select 1 from public.provider_seats where customer_workspace_id=c.customer_workspace_id and agency_workspace_id=p_agency_workspace_id and status='active') then return false; end if;
  update public.agency_client_owner_claims set delivery=delivery||jsonb_build_object('status','sending','reason','delivery_unconfirmed') where id=c.id;
  return true;
end $$;
create function public.record_agency_owner_claim_email(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_claim_id uuid, p_token_hash text, p_delivery jsonb
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A provider receipt remains recordable after membership loss; the exact
  -- original claim creator and token are required. This grants no new send.
  if p_delivery is null or jsonb_typeof(p_delivery) is distinct from 'object'
    or coalesce(p_delivery->>'status','') not in ('accepted','not_sent','unknown')
    or octet_length(p_delivery::text)>2000 then raise exception 'agency_client_claim_invalid'; end if;
  update public.agency_client_owner_claims set delivery=p_delivery
    where id=p_claim_id and agency_workspace_id=p_agency_workspace_id and created_by=p_user_id
      and token_hash=p_token_hash and delivery->>'status'='sending';
  return found;
end $$;
revoke all on function public.prepare_agency_owner_claim_email(uuid,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.record_agency_owner_claim_email(uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_agency_owner_claim_email(uuid,text,uuid,uuid,text) to service_role;
grant execute on function public.record_agency_owner_claim_email(uuid,text,uuid,uuid,text,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
