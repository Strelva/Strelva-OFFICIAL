-- Forward authority successor; no existing receipt, binding or historical SQL changes.
begin;
set local lock_timeout='3s';
create function public.assert_agent_payment_admission(p_payment_id uuid,p_account text,p_generation bigint)
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
 if r.expires_at<=clock_timestamp() or exists(select 1 from public.payment_request_actions where request_id=r.id and action='cancelled')
  or exists(select 1 from public.business_payment_events where payment_id=p.id and kind='paid') then raise exception 'agent_payment_admission_denied';end if;
 return true;
end $$;

create function public.assert_agency_billing_mutation(p_intent_id uuid,p_actor_id uuid,p_verified_email text,p_accepted_email text,p_account_id text,p_generation bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.agency_billing_intents; c public.connected_accounts; result jsonb;
begin
 perform 1 from public.users where id=p_actor_id and verified_at is not null and lower(btrim(email))=lower(btrim(p_verified_email)) for share;
 if not found then raise exception 'agency_invoice_denied';end if;
 result:=public.agency_billing_intent_command(jsonb_build_object('action','prepare','intentId',p_intent_id),p_actor_id,p_verified_email);
 select * into i from public.agency_billing_intents where id=p_intent_id for update;
 perform 1 from public.users where id=i.accepted_by and verified_at is not null and lower(btrim(email))=lower(btrim(p_accepted_email)) for share;
 if not found then raise exception 'agency_invoice_denied';end if;
 -- prepare locks the same manager, accepting owner membership and current payer.
 select * into c from public.connected_accounts where workspace_id=i.agency_workspace_id for share;
 if p_account_id is null or p_generation is null or c.stripe_account_id is distinct from p_account_id or c.generation is distinct from p_generation
  or c.state<>'ready' or not 'merchant'=any(c.configurations) then raise exception 'agency_invoice_denied';end if;
 if i.provider_object_id is not null then raise exception 'agency_invoice_conflict';end if;
 if i.provider_attempt_started_at<clock_timestamp()-interval '23 hours' then raise exception 'agency_invoice_conflict';end if;
 return result;
end $$;

-- The actor-authorized binding is used before subscription creation. Existing
-- provider observation routines stay usable after revocation for actual effects.
create function public.record_agency_billing_terms_authorized(p_intent_id uuid,p_actor_id uuid,p_verified_email text,p_accepted_email text,p_account_id text,p_generation bigint,p_customer_id text,p_price_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.assert_agency_billing_mutation(p_intent_id,p_actor_id,p_verified_email,p_accepted_email,p_account_id,p_generation);
 return public.record_agency_billing_terms(p_intent_id,p_account_id,p_customer_id,p_price_id);
end $$;

create or replace function public.call_agent_protected_tool(p_token_hash text,p_resource text,p_tool text,p_workspace_id uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; required_scope text;
begin
 required_scope:=case p_tool when 'read_business_context' then 'business:read' when 'read_customer_inquiries' then 'inquiries:read' when 'approve_quote' then 'quotes:approve' end;
 if p_tool='approve_quote' then
  -- Wait for the quote and lead before acquiring identity/credential locks and
  -- performing the final clock check. An expiring bearer gains no wait credit.
  perform pg_advisory_xact_lock(hashtextextended('agent-quote:'||(p_args->>'inquiryId')::uuid::text,1611));
  perform 1 from public.tenant_leads where id=(p_args->>'inquiryId')::uuid and workspace_id=p_workspace_id for share;
  select * into t from public.assistant_tokens where token_hash=p_token_hash;
  perform 1 from public.users where id=t.user_id and verified_at is not null and lower(btrim(email))=lower(btrim(t.verified_email)) for share;
  if not found then raise exception 'oauth_invalid_token';end if;
 end if;
 t:=public.lock_agent_oauth_token(p_token_hash,p_resource,required_scope,p_workspace_id);
 if p_tool='read_business_context' then return public.read_business_record(t.workspace_id,t.user_id,t.verified_email);end if;
 if t.agency_id is not null then raise exception 'oauth_invalid_token';end if;
 if p_tool='read_customer_inquiries' then return public.read_workspace_leads(t.workspace_id,t.user_id,t.verified_email,null,50,null);end if;
 if p_tool='approve_quote' then
  if t.expires_at<=clock_timestamp() or (t.connection_id is not null and exists(select 1 from public.assistant_connections where id=t.connection_id and expires_at<=clock_timestamp())) then raise exception 'oauth_invalid_token';end if;
  return public.record_agent_quote(t.workspace_id,t.user_id,t.verified_email,(p_args->>'inquiryId')::uuid,(p_args->>'requestId')::uuid,(p_args->>'amountCents')::bigint,p_args->>'currency',p_args->>'terms');
 end if;
 raise exception 'oauth_invalid_token';
end $$;
revoke all on function public.assert_agent_payment_admission(uuid,text,bigint),public.assert_agency_billing_mutation(uuid,uuid,text,text,text,bigint),public.record_agency_billing_terms_authorized(uuid,uuid,text,text,text,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.assert_agent_payment_admission(uuid,text,bigint),public.assert_agency_billing_mutation(uuid,uuid,text,text,text,bigint),public.record_agency_billing_terms_authorized(uuid,uuid,text,text,text,bigint,text,text) to service_role;
commit;
