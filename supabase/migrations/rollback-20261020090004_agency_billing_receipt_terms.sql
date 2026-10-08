-- Ordered private-candidate rollback. Financial evidence added by this migration
-- is removed; retained source observations and accepted retail terms stay intact.
begin;
set local lock_timeout='3s';
create or replace function public.record_agency_billing_checkout(p_intent_id uuid,p_account_id text,p_object_id text,p_url text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.agency_billing_intents%rowtype;e record;
begin
 select * into i from public.agency_billing_intents where id=p_intent_id for update;
 if not found or (i.status not in ('accepted','awaiting_payment') and not (i.status in ('active','paid') and i.provider_object_id=p_object_id and i.provider_account_id=p_account_id)) then raise exception 'agency_invoice_conflict';end if;
 if p_account_id !~ '^acct_[A-Za-z0-9]+$' or p_object_id !~ '^(cs_|sub_)[A-Za-z0-9_]+$' or (p_url is not null and p_url !~ '^https://(checkout|invoice)\.stripe\.com/') then raise exception 'agency_invoice_invalid';end if;
 if i.provider_object_id is not null and (i.provider_object_id<>p_object_id or i.provider_account_id<>p_account_id) then raise exception 'agency_invoice_conflict';end if;
 update public.agency_billing_intents set status=case when status='accepted' then 'awaiting_payment' else status end,provider_account_id=p_account_id,provider_object_id=p_object_id,checkout_url=p_url,updated_at=clock_timestamp() where id=i.id returning * into i;
 update public.agency_billing_provider_events set intent_id=i.id where account_id=p_account_id and provider_object_id=p_object_id and intent_id is null;
 select * into e from public.agency_billing_provider_events where intent_id=i.id order by event_created desc,event_id desc limit 1;
 if found and e.event_created>i.last_provider_event_created then update public.agency_billing_intents set status=e.event_status,last_provider_event_created=e.event_created where id=i.id returning * into i;end if;
 return to_jsonb(i);
end $$;
drop function public.record_agency_billing_provider_event(text,text,text,bigint,text,jsonb);
create or replace function public.record_agency_billing_provider_event(p_account_id text,p_event_id text,p_object_id text,p_created bigint,p_status text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.agency_billing_intents%rowtype;e public.agency_billing_provider_events%rowtype;
begin
 if p_created<0 or p_status not in ('active','paid','cancelled') then raise exception 'agency_invoice_invalid';end if;
 select * into i from public.agency_billing_intents where provider_account_id=p_account_id and provider_object_id=p_object_id for update;

 select * into e from public.agency_billing_provider_events where account_id=p_account_id and event_id=p_event_id;
 if found then
  if e.provider_object_id<>p_object_id or e.event_created<>p_created or e.event_status<>p_status then raise exception 'agency_invoice_conflict';end if;
  return jsonb_build_object('replayed',true);
 end if;
 if (i.kind='rebill' and p_status='paid') or (i.kind='pay_link' and p_status='active') then raise exception 'agency_invoice_invalid';end if;
 insert into public.agency_billing_provider_events(account_id,event_id,intent_id,provider_object_id,event_created,event_status) values(p_account_id,p_event_id,i.id,p_object_id,p_created,p_status);
 if i.id is null then return jsonb_build_object('pending',true);end if;
 if p_created>i.last_provider_event_created then
  update public.agency_billing_intents set status=p_status,last_provider_event_created=p_created,updated_at=clock_timestamp() where id=i.id;
 end if;
 return jsonb_build_object('applied',true);
end $$;
revoke all on function public.record_agency_billing_provider_event(text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.record_agency_billing_provider_event(text,text,text,bigint,text) to service_role;
drop function public.apply_agency_billing_provider_event(text,text);
drop function public.record_agency_billing_terms(uuid,text,text,text);
drop trigger agency_billing_accepted_terms_immutable on public.agency_billing_intents;
drop function public.agency_billing_accepted_terms_guard();
drop index public.agency_billing_provider_identity;
alter table public.agency_billing_provider_events drop column evidence,drop column verification_result,drop column review_reason;
alter table public.agency_billing_intents drop column provider_customer_id,drop column provider_price_id,drop column payment_receipt_state,drop column last_payment_event_created,drop column last_payment_event_id,drop column last_subscription_event_created,drop column last_subscription_event_id;
notify pgrst,'reload schema';
commit;
