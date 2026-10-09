-- Preserve completed workspace exit at the final new-charge admission.
begin;
set local lock_timeout='3s';
create or replace function public.assert_agent_payment_admission(p_payment_id uuid,p_account text,p_generation bigint)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.business_payments; r public.business_payment_requests; c public.connected_accounts;
begin
 select * into p from public.business_payments where id=p_payment_id for share;
 select * into r from public.business_payment_requests where workspace_id=p.workspace_id and id::text=p.reference_id for share;
 select * into c from public.connected_accounts where workspace_id=p.workspace_id for share;
 if p.id is null or r.id is null or p_account is null or p_generation is null or c.stripe_account_id is distinct from p_account
  or p.merchant_account_id is distinct from p_account or c.generation is distinct from p_generation or c.state<>'ready' or not 'merchant'=any(c.configurations)
  or not exists(select 1 from public.business_payment_channels where payment_id=p.id and channel='agent')
  or not exists(select 1 from public.agent_payment_reservations where payment_id=p.id and workspace_id=p.workspace_id and amount_cents=p.amount_cents and currency=p.currency)
  or r.amount_cents<>p.amount_cents or r.currency<>p.currency then raise exception 'agent_payment_admission_denied';end if;
 if r.kind='deposit' then
  perform 1 from public.business_bookings where id=r.source_record_id and workspace_id=r.workspace_id and status='held' for share;
  if not found then raise exception 'agent_payment_admission_denied';end if;
 end if;
 -- Clock/state checks come after every potentially blocking serialization lock.
 if public.workspace_exit_completed(p.workspace_id) or r.expires_at<=clock_timestamp() or exists(select 1 from public.payment_request_actions where request_id=r.id and action='cancelled')
  or exists(select 1 from public.business_payment_events where payment_id=p.id and kind='paid') then raise exception 'agent_payment_admission_denied';end if;
 return true;
end $$;

commit;
