-- Financial evidence is checked against the accepted intent and locally bound
-- provider identities. Provider metadata never supplies authority or prices.
begin;
set local lock_timeout='3s';
alter table public.agency_billing_intents
 add column provider_customer_id text,
 add column provider_price_id text,
 add column payment_receipt_state text not null default 'unconfirmed' check(payment_receipt_state in('unconfirmed','matched','review')),
 add column last_payment_event_created bigint not null default 0,
 add column last_payment_event_id text not null default '',
 add column last_subscription_event_created bigint not null default 0,
 add column last_subscription_event_id text not null default '';
create unique index agency_billing_provider_identity on public.agency_billing_intents(provider_account_id,provider_object_id) where provider_object_id is not null;
alter table public.agency_billing_provider_events
 add column evidence jsonb not null default '{}',
 add column verification_result text not null default 'pending' check(verification_result in('pending','matched','review','stale')),
 add column review_reason text;
-- Prepared installations may already contain receipts from the old status-only
-- adapter. Keep their evidence history, but do not retain an unproved positive.
update public.agency_billing_provider_events set verification_result='review',review_reason='financial_evidence_missing' where event_status in('active','paid');
update public.agency_billing_intents i set payment_receipt_state='review',status=case when i.status in('active','paid') then 'awaiting_payment' else i.status end
 where exists(select 1 from public.agency_billing_provider_events e where e.intent_id=i.id and e.verification_result='review');

create function public.agency_billing_accepted_terms_guard() returns trigger language plpgsql as $$
begin
 if old.accepted_at is not null and (new.agency_workspace_id,new.business_workspace_id,new.kind,new.amount_cents,new.currency,new.description,new.payer_kind,new.payer_workspace_id,new.accepted_by,new.accepted_at,new.terms_digest)
  is distinct from (old.agency_workspace_id,old.business_workspace_id,old.kind,old.amount_cents,old.currency,old.description,old.payer_kind,old.payer_workspace_id,old.accepted_by,old.accepted_at,old.terms_digest) then raise exception 'agency_invoice_accepted_terms_immutable';end if;
 if old.provider_account_id is not null and new.provider_account_id is distinct from old.provider_account_id
  or old.provider_object_id is not null and new.provider_object_id is distinct from old.provider_object_id
  or old.provider_customer_id is not null and new.provider_customer_id is distinct from old.provider_customer_id
  or old.provider_price_id is not null and new.provider_price_id is distinct from old.provider_price_id then raise exception 'agency_invoice_provider_binding_immutable';end if;
 return new;
end $$;
create trigger agency_billing_accepted_terms_immutable before update on public.agency_billing_intents for each row execute function public.agency_billing_accepted_terms_guard();

-- Bind the generated customer/Price before subscription creation, so a signed
-- invoice racing the local subscription receipt retains verifiable evidence.
create function public.record_agency_billing_terms(p_intent_id uuid,p_account_id text,p_customer_id text,p_price_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.agency_billing_intents%rowtype;
begin
 select * into i from public.agency_billing_intents where id=p_intent_id for update;
 if i.id is null or i.kind<>'rebill' or i.accepted_at is null or i.status not in('accepted','awaiting_payment','active') then raise exception 'agency_invoice_conflict';end if;
 if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9]+$' or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$' or p_price_id is null or p_price_id !~ '^price_[A-Za-z0-9]+$' then raise exception 'agency_invoice_invalid';end if;
 if i.provider_account_id is not null and i.provider_account_id<>p_account_id or i.provider_customer_id is not null and i.provider_customer_id<>p_customer_id or i.provider_price_id is not null and i.provider_price_id<>p_price_id then raise exception 'agency_invoice_conflict';end if;
 update public.agency_billing_intents set provider_account_id=p_account_id,provider_customer_id=p_customer_id,provider_price_id=p_price_id where id=i.id returning * into i;
 return to_jsonb(i);
end $$;

create function public.apply_agency_billing_provider_event(p_account_id text,p_event_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.agency_billing_intents%rowtype;e public.agency_billing_provider_events%rowtype;reason text;receipt_kind text;financial boolean;newer boolean;
begin
 select * into e from public.agency_billing_provider_events where account_id=p_account_id and event_id=p_event_id;
 select * into i from public.agency_billing_intents where provider_account_id=e.account_id and provider_object_id=e.provider_object_id for update;
 if i.id is null then return jsonb_build_object('pending',true);end if;
 receipt_kind:=e.evidence->>'kind';financial:=receipt_kind in('checkout','invoice');
 if i.accepted_at is null or i.accepted_by is null then reason:='accepted_intent_required';
 elsif i.kind='pay_link' and (receipt_kind is distinct from 'checkout' or e.event_status<>'paid') then reason:='checkout_receipt_required';
 elsif i.kind='rebill' and receipt_kind not in('subscription','invoice','subscription_cancelled') or receipt_kind is null then reason:='subscription_receipt_required';
 elsif i.kind='rebill' and (i.provider_customer_id is null or i.provider_price_id is null or e.evidence->>'customer_id' is distinct from i.provider_customer_id) then reason:='customer_binding_mismatch';
 elsif receipt_kind in('checkout','invoice') and e.evidence->'amount_cents' is distinct from to_jsonb(i.amount_cents) then reason:='accepted_amount_mismatch';
 elsif receipt_kind in('checkout','invoice','subscription') and e.evidence->>'currency' is distinct from i.currency then reason:='accepted_currency_mismatch';
 elsif receipt_kind in('invoice','subscription') and e.evidence->>'price_id' is distinct from i.provider_price_id then reason:='accepted_price_mismatch';
 elsif receipt_kind in('invoice','subscription') and e.evidence->'quantity' is distinct from '1'::jsonb then reason:='accepted_quantity_mismatch';
 elsif receipt_kind='subscription' and (e.event_status<>'active' or e.evidence->'unit_amount' is distinct from to_jsonb(i.amount_cents) or e.evidence->>'interval' is distinct from 'month' or e.evidence->'interval_count' is distinct from '1'::jsonb) then reason:='accepted_recurring_terms_mismatch';
 elsif receipt_kind='invoice' and e.event_status<>'active' or receipt_kind='subscription_cancelled' and e.event_status<>'cancelled' then reason:='receipt_kind_mismatch';
 elsif receipt_kind='subscription' and i.status='cancelled' then reason:='cancelled_subscription_cannot_reactivate';end if;
 if financial then newer:=(e.event_created,e.event_id)>(i.last_payment_event_created,i.last_payment_event_id);
 else newer:=(e.event_created,e.event_id)>(i.last_subscription_event_created,i.last_subscription_event_id);end if;
 update public.agency_billing_provider_events set intent_id=i.id,verification_result=case when reason is not null then 'review' when newer then 'matched' else 'stale' end,review_reason=reason where account_id=e.account_id and event_id=e.event_id;
 if reason is not null then
  if newer then update public.agency_billing_intents set payment_receipt_state='review' where id=i.id;end if;
  return jsonb_build_object('review',true,'reason',reason);
 end if;
 if not newer then return jsonb_build_object('stale',true);end if;
 if financial then
  -- An invoice payment proves payment; it does not prove that a subscription
  -- is operationally active, and cannot reactivate a cancelled subscription.
  update public.agency_billing_intents set payment_receipt_state='matched',status=case when receipt_kind='checkout' then 'paid' else status end,last_payment_event_created=e.event_created,last_payment_event_id=e.event_id,last_provider_event_created=greatest(last_provider_event_created,e.event_created),updated_at=clock_timestamp() where id=i.id;
 else
  update public.agency_billing_intents set status=e.event_status,last_subscription_event_created=e.event_created,last_subscription_event_id=e.event_id,last_provider_event_created=greatest(last_provider_event_created,e.event_created),updated_at=clock_timestamp() where id=i.id;
 end if;
 return jsonb_build_object('applied',true,'paymentMatched',financial);
end $$;

create or replace function public.record_agency_billing_checkout(p_intent_id uuid,p_account_id text,p_object_id text,p_url text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.agency_billing_intents%rowtype;e record;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_account_id||':'||p_object_id,1904));
 select * into i from public.agency_billing_intents where id=p_intent_id for update;
 if i.id is null or i.accepted_at is null or (i.status not in('accepted','awaiting_payment') and not(i.status in('active','paid','cancelled') and i.provider_object_id=p_object_id and i.provider_account_id=p_account_id)) then raise exception 'agency_invoice_conflict';end if;
 if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9]+$' or p_object_id is null or (i.kind='pay_link' and p_object_id !~ '^cs_[A-Za-z0-9_]+$') or (i.kind='rebill' and p_object_id !~ '^sub_[A-Za-z0-9_]+$') or (p_url is not null and p_url !~ '^https://(checkout|invoice)\.stripe\.com/') then raise exception 'agency_invoice_invalid';end if;
 if i.provider_account_id is not null and i.provider_account_id<>p_account_id or i.provider_object_id is not null and i.provider_object_id<>p_object_id or i.kind='rebill' and (i.provider_customer_id is null or i.provider_price_id is null) then raise exception 'agency_invoice_conflict';end if;
 update public.agency_billing_intents set status=case when status='accepted' then 'awaiting_payment' else status end,provider_account_id=p_account_id,provider_object_id=p_object_id,checkout_url=p_url,updated_at=clock_timestamp() where id=i.id;
 for e in select event_id from public.agency_billing_provider_events where account_id=p_account_id and provider_object_id=p_object_id and (verification_result='pending' or intent_id is null) order by event_created,event_id loop
  perform public.apply_agency_billing_provider_event(p_account_id,e.event_id);
 end loop;
 select * into i from public.agency_billing_intents where id=p_intent_id;
 return to_jsonb(i);
end $$;

drop function public.record_agency_billing_provider_event(text,text,text,bigint,text);
create function public.record_agency_billing_provider_event(p_account_id text,p_event_id text,p_object_id text,p_created bigint,p_status text,p_evidence jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.agency_billing_provider_events%rowtype;
begin
 if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9]+$' or p_event_id is null or length(p_event_id) not between 1 and 200 or p_object_id is null or p_object_id !~ '^(cs_|sub_)[A-Za-z0-9_]+$' or p_created is null or p_created<0 or p_status is null or p_status not in('active','paid','cancelled') or p_evidence is null or jsonb_typeof(p_evidence)<>'object' then raise exception 'agency_invoice_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_account_id||':'||p_object_id,1904));
 select * into e from public.agency_billing_provider_events where account_id=p_account_id and event_id=p_event_id;
 if found then
  if e.provider_object_id<>p_object_id or e.event_created<>p_created or e.event_status<>p_status or e.evidence<>p_evidence then raise exception 'agency_invoice_conflict';end if;
  return jsonb_build_object('replayed',true,'review',e.verification_result='review');
 end if;
 insert into public.agency_billing_provider_events(account_id,event_id,provider_object_id,event_created,event_status,evidence) values(p_account_id,p_event_id,p_object_id,p_created,p_status,p_evidence);
 return public.apply_agency_billing_provider_event(p_account_id,p_event_id);
end $$;
revoke all on function public.agency_billing_accepted_terms_guard(),public.apply_agency_billing_provider_event(text,text) from public,anon,authenticated,service_role;
revoke all on function public.record_agency_billing_terms(uuid,text,text,text),public.record_agency_billing_provider_event(text,text,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_agency_billing_terms(uuid,text,text,text),public.record_agency_billing_provider_event(text,text,text,bigint,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
