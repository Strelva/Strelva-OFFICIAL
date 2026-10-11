-- Recover only an unacknowledged request awaiting an undecided notice policy.
-- This selects no notice window, changes no provider/payer, and enables no flag.
begin;
set local lock_timeout='3s';
create table public.provider_change_cancellations (
 request_id uuid primary key references public.provider_change_requests(id),
 cancelled_by uuid not null references public.users(id),
 verified_email text not null,
 cancelled_at timestamptz not null default clock_timestamp()
);
alter table public.provider_change_cancellations enable row level security;
revoke all on public.provider_change_cancellations from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.provider_change_cancellations
 for each row execute function public.money_immutable_guard();
create function public.cancel_provider_change(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.provider_change_requests%rowtype; receipt public.provider_change_cancellations%rowtype;
begin
 -- Match acknowledgement/completion's request-first order. This row lock
 -- decides whether cancellation or notice acknowledgement wins.
 select * into q from public.provider_change_requests where id=p_request_id for update;
 if q.id is null then raise exception 'provider_change_denied';end if;
 -- A share lock also protects the current verified email against non-key
 -- changes while the existing owner helper locks membership/workspace/payer.
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'provider_seat_owner_required';end if;
 perform public.provider_seat_assert_owner(q.business_workspace_id,p_user_id,p_verified_email);
 if q.status='cancelled' then
  select * into receipt from public.provider_change_cancellations where request_id=q.id;
  if receipt.request_id is null then raise exception 'provider_change_stale';end if;
  return to_jsonb(q)||jsonb_build_object('cancellation',to_jsonb(receipt));
 end if;
 if q.status<>'awaiting_policy' or q.policy_version is not null or q.respond_by is not null
  or exists(select 1 from public.provider_change_responses where request_id=q.id)
  then raise exception 'provider_change_stale';end if;
 -- Serialize with current provider and any explicitly linked payer receipt.
 perform 1 from public.workspace_providers where id=q.old_provider_id and customer_workspace_id=q.business_workspace_id and status='active' for update;
 if not found then raise exception 'provider_change_stale';end if;
 if q.payer_transition_id is not null then
  perform 1 from public.workspace_payer_transitions where id=q.payer_transition_id and workspace_id=q.business_workspace_id for share;
  if not found then raise exception 'provider_change_stale';end if;
 end if;
 insert into public.provider_change_cancellations(request_id,cancelled_by,verified_email)
 values(q.id,p_user_id,lower(btrim(p_verified_email))) returning * into receipt;
 update public.provider_change_requests set status='cancelled' where id=q.id returning * into q;
 return to_jsonb(q)||jsonb_build_object('cancellation',to_jsonb(receipt));
end $$;
revoke all on function public.cancel_provider_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_provider_change(uuid,uuid,text) to service_role;
-- Enrich the existing pure reader only after its original authority check.
-- Preserve ordering and expose the immutable actor/time, not internal email proof.
alter function public.read_provider_change_requests(uuid,uuid,text) rename to read_provider_change_requests_before_cancel;
revoke all on function public.read_provider_change_requests_before_cancel(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.read_provider_change_requests(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare requests jsonb;
begin
 requests:=public.read_provider_change_requests_before_cancel(p_workspace_id,p_user_id,p_verified_email);
 return coalesce((select jsonb_agg(item||jsonb_build_object('cancellation',
  (select jsonb_build_object('cancelled_by',c.cancelled_by,'cancelled_at',c.cancelled_at)
   from public.provider_change_cancellations c where c.request_id=(item->>'id')::uuid)) order by position)
  from jsonb_array_elements(requests) with ordinality rows(item,position)),'[]');
end $$;
revoke all on function public.read_provider_change_requests(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_provider_change_requests(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
