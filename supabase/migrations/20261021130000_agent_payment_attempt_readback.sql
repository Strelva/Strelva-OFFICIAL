-- Additive: SPT attempts share the immutable rail/idempotency reservation.
-- Provider key retention never authorizes another charge after an unknown effect.
create function public.prepare_agent_payment_attempt(p_payment_id uuid,p_account text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.business_payments%rowtype; provider_id text; started timestamptz;
begin
 select * into p from public.business_payments where id=p_payment_id for update;
 if p.id is null or p.merchant_account_id<>p_account
  or not exists(select 1 from public.business_payment_channels where payment_id=p.id and channel='agent')
  or not exists(select 1 from public.connected_accounts where workspace_id=p.workspace_id and stripe_account_id=p_account and state='ready' and 'merchant'=any(configurations))
 then raise exception 'agent_payment_attempt_denied';end if;
 select b.provider_id into provider_id from public.business_payment_provider_bindings b where b.payment_id=p.id and b.account_id=p_account;
 if provider_id is not null then return jsonb_build_object('providerObjectId',provider_id);end if;
 select started_at into started from public.business_payment_attempts where payment_id=p.id;
 if started is not null and started<clock_timestamp()-interval '23 hours' then raise exception 'payment_attempt_requires_reconciliation';end if;
 insert into public.business_payment_attempts(payment_id) values(p.id) on conflict do nothing;
 return '{}';
end;$$;
revoke all on function public.prepare_agent_payment_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_agent_payment_attempt(uuid,text) to service_role;

-- Signed account-scoped webhook recovery when create succeeded but the local
-- provider binding failed. Checkout events continue through their own verifier.
create function public.recover_agent_payment_provider(p_payment_id uuid,p_account text,p_provider text,p_amount bigint,p_currency text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.business_payments%rowtype;
begin
 select * into p from public.business_payments where id=p_payment_id for update;
 if not exists(select 1 from public.business_payment_channels where payment_id=p_payment_id and channel='agent') then return false;end if;
 if p.id is null or p.merchant_account_id<>p_account or p.amount_cents<>p_amount or p.currency<>p_currency
  or not exists(select 1 from public.business_payment_attempts where payment_id=p.id)
  or not exists(select 1 from public.agent_payment_reservations where payment_id=p.id and workspace_id=p.workspace_id and amount_cents=p.amount_cents and currency=p.currency)
 then raise exception 'agent_payment_provider_observation_mismatch';end if;
 perform public.bind_business_payment_provider(p.id,p_account,p_provider,p_currency,null);
 return true;
end;$$;
revoke all on function public.recover_agent_payment_provider(uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.recover_agent_payment_provider(uuid,text,text,bigint,text) to service_role;
