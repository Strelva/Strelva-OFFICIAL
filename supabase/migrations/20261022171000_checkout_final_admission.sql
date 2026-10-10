-- Additive final admission before a NEW connected Checkout session. No money
-- policy is selected and accepted provider receipt ports are unchanged.
begin;
set local lock_timeout='3s';
do $$begin if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='assert_business_checkout_admission') then raise exception 'checkout_admission_unsupported_baseline';end if;end$$;
create function public.assert_business_checkout_admission(p_payment_id uuid,p_account text,p_generation bigint,p_actor_id uuid,p_verified_email text,p_accepted_email text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.business_payments;r public.business_payment_requests;c public.connected_accounts;i jsonb;started timestamptz;
begin
 select * into p from public.business_payments where id=p_payment_id for share;
 if p.id is null or p_account is null or p_generation is null or p.merchant_account_id is distinct from p_account
  or not exists(select 1 from public.business_payment_channels where payment_id=p.id and channel='checkout') then raise exception 'checkout_admission_denied';end if;
 if p.purpose in('quote','deposit') then
  select * into r from public.business_payment_requests where workspace_id=p.workspace_id and id::text=p.reference_id for share;
  if r.id is null or r.kind<>p.purpose or r.amount_cents<>p.amount_cents or r.currency<>p.currency or p.idempotency_key<>'request:'||r.id::text
   or not exists(select 1 from public.payment_request_actions where request_id=r.id and payment_id=p.id and action='accepted') then raise exception 'checkout_admission_denied';end if;
  if r.kind='deposit' then
   perform 1 from public.business_bookings where id=r.source_record_id and workspace_id=r.workspace_id and status='held' for share;
   if not found then raise exception 'checkout_admission_denied';end if;
  end if;
 elsif p.purpose='pay_link' then
  -- Same transaction retains exact current manager, accepted owner/payer,
  -- supplied verified identities and merchant generation across later waits.
  if p_actor_id is null or p_verified_email is null or p_accepted_email is null then raise exception 'checkout_admission_denied';end if;
  i:=public.assert_agency_billing_mutation(p.reference_id::uuid,p_actor_id,p_verified_email,p_accepted_email,p_account,p_generation);
  if i->>'agency_workspace_id' is distinct from p.workspace_id::text or i->>'kind'<>'pay_link' or (i->>'amount_cents')::bigint is distinct from p.amount_cents or i->>'currency' is distinct from p.currency or p.idempotency_key is distinct from 'agency-invoice:'||(i->>'id') then raise exception 'checkout_admission_denied';end if;
 elsif p.purpose<>'checkout' then raise exception 'checkout_admission_denied';end if;
 select * into c from public.connected_accounts where workspace_id=p.workspace_id for share;
 select started_at into started from public.business_payment_attempts where payment_id=p.id;
 -- Every clock/state check is after all potentially blocking locks.
 if c.stripe_account_id is distinct from p_account or c.generation is distinct from p_generation or c.state is distinct from 'ready' or not 'merchant'=any(c.configurations)
  or started is null or started<clock_timestamp()-interval '23 hours' or public.workspace_exit_completed(p.workspace_id)
  or (i is not null and public.workspace_exit_completed((i->>'business_workspace_id')::uuid))
  or exists(select 1 from public.business_payment_events where payment_id=p.id and kind='paid') then raise exception 'checkout_admission_denied';end if;
 if r.id is not null and (r.expires_at<=clock_timestamp() or exists(select 1 from public.payment_request_actions where request_id=r.id and action='cancelled')) then raise exception 'checkout_admission_denied';end if;
 return true;
end $$;
revoke all on function public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text) to service_role;
do $canonical_checkout$
declare p record;migrator oid:=(current_user::regrole)::oid;
begin
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='assert_business_checkout_admission')<>1 then raise exception 'checkout_admission_catalog_drift';end if;
 select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure('public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text)');
 if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'boolean'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from array['p_payment_id','p_account','p_generation','p_actor_id','p_verified_email','p_accepted_email']::text[] or p.pronargs<>6 or md5(p.prosrc)<>'b42915e324220315b2447af6bd46c85e' then raise exception 'checkout_admission_catalog_drift';end if;
 if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in(migrator,('service_role'::regrole)::oid)) then raise exception 'checkout_admission_acl_drift';end if;
end $canonical_checkout$;

notify pgrst,'reload schema';
commit;
