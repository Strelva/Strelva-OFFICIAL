create function public.connected_account_by_stripe_id(p_account_id text) returns jsonb language sql security definer set search_path=public,pg_temp as $$select to_jsonb(c) from public.connected_accounts c where stripe_account_id=p_account_id and state<>'disconnected';$$;
revoke all on function public.connected_account_by_stripe_id(text) from public,anon,authenticated;grant execute on function public.connected_account_by_stripe_id(text) to service_role;
create table public.agent_payment_policies(workspace_id uuid primary key references public.workspaces(id),per_payment_cents bigint not null check(per_payment_cents>0),daily_cents bigint not null check(daily_cents>=per_payment_cents),currency text not null,agreement_version text not null,approved_at timestamptz not null,approved_by uuid not null references public.users(id));
create table public.agent_payment_reservations(payment_id uuid primary key references public.business_payments(id),workspace_id uuid not null references public.workspaces(id),amount_cents bigint not null,currency text not null,day date not null default (now() at time zone 'UTC')::date,created_at timestamptz not null default now());
alter table public.agent_payment_policies enable row level security;alter table public.agent_payment_reservations enable row level security;
revoke all on public.agent_payment_policies,public.agent_payment_reservations from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.agent_payment_policies for each row execute function public.money_immutable_guard();
create trigger money_immutable before update or delete on public.agent_payment_reservations for each row execute function public.money_immutable_guard();
create function public.reserve_agent_payment_request(p_workspace_id uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare q public.business_payment_requests%rowtype;policy public.agent_payment_policies%rowtype;p jsonb;spent bigint;begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,8812));
 select * into q from public.business_payment_requests where token_hash=p_hash and workspace_id=p_workspace_id for update;
 if q.id is null or q.expires_at<=now() then raise exception 'agent_payment_denied';end if;
 select * into policy from public.agent_payment_policies where workspace_id=p_workspace_id;
 if policy.workspace_id is null or policy.currency<>q.currency or q.amount_cents>policy.per_payment_cents then raise exception 'agent_payment_policy_required';end if;
 p:=public.accept_public_payment_request(p_hash);
 select coalesce(sum(amount_cents),0) into spent from public.agent_payment_reservations where workspace_id=p_workspace_id and day=(now() at time zone 'UTC')::date;
 if not exists(select 1 from public.agent_payment_reservations r join public.business_payments bp on bp.id=r.payment_id where bp.workspace_id=p_workspace_id and bp.reference_id=q.id::text) and spent+q.amount_cents>policy.daily_cents then raise exception 'agent_payment_daily_cap';end if;
 insert into public.agent_payment_reservations(payment_id,workspace_id,amount_cents,currency) select id,p_workspace_id,amount_cents,currency from public.business_payments where workspace_id=p_workspace_id and reference_id=q.id::text on conflict do nothing;
 return p||jsonb_build_object('paymentId',(select id from public.business_payments where workspace_id=p_workspace_id and reference_id=q.id::text),'agreementVersion',policy.agreement_version);
end;$$;
revoke all on function public.reserve_agent_payment_request(uuid,text) from public,anon,authenticated;grant execute on function public.reserve_agent_payment_request(uuid,text) to service_role;
-- Paid means the reserved amount was actually received, never Checkout-created.
create function public.payment_paid_amount_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if new.kind='paid' and new.amount_cents<>(select amount_cents from public.business_payments where id=new.payment_id) then raise exception 'payment_paid_amount_mismatch';end if;return new;end;$$;
create trigger payment_paid_amount_guard before insert on public.business_payment_events for each row execute function public.payment_paid_amount_guard();
-- A request chooses one payment rail before any outside write. Agent and hosted
-- checkout cannot both create independent charges for the same immutable intent.
create table public.business_payment_channels(payment_id uuid primary key references public.business_payments(id),channel text not null check(channel in('checkout','agent')),created_at timestamptz not null default now());
alter table public.business_payment_channels enable row level security;revoke all on public.business_payment_channels from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.business_payment_channels for each row execute function public.money_immutable_guard();
create function public.claim_business_payment_channel(p_payment_id uuid,p_channel text) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c text;begin
 perform 1 from public.business_payments where id=p_payment_id for update;if not found then raise exception 'payment_not_found';end if;
 insert into public.business_payment_channels(payment_id,channel) values(p_payment_id,p_channel) on conflict do nothing;
 select channel into c from public.business_payment_channels where payment_id=p_payment_id;
 if c<>p_channel then raise exception 'payment_rail_already_selected';end if;
end;$$;
revoke all on function public.claim_business_payment_channel(uuid,text) from public,anon,authenticated;grant execute on function public.claim_business_payment_channel(uuid,text) to service_role;
create function public.issue_payment_from_agent_quote(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_quote_receipt_id uuid,p_expires timestamptz,p_hash text,p_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare q jsonb;result jsonb;begin
 perform public.connect_assert_manager(p_workspace_id,p_user_id,p_verified_email);
 if to_regclass('public.agent_quote_receipts') is null then raise exception 'agent_quote_unavailable';end if;
 execute 'select to_jsonb(q) from public.agent_quote_receipts q where id=$1 and workspace_id=$2 for share' into q using p_quote_receipt_id,p_workspace_id;
 if q is null then raise exception 'agent_quote_denied';end if;
 result:=public.issue_business_payment_request(p_workspace_id,p_user_id,p_verified_email,'quote',(q->>'lead_id')::uuid,jsonb_build_array(jsonb_build_object('name','Quoted work','quantity',1,'unitCents',(q->>'amount_cents')::bigint)),(q->>'amount_cents')::bigint,lower(q->>'currency'),p_expires,p_hash,'{}',p_key);
 -- Terms are pinned during creation, never edited afterward. The immutable
 -- request stores the source lead; the original quote receipt remains authoritative.
 return result||jsonb_build_object('quoteReceiptId',q->>'id','acceptedTerms',q->>'terms');
end;$$;
revoke all on function public.issue_payment_from_agent_quote(uuid,uuid,text,uuid,timestamptz,text,text) from public,anon,authenticated;grant execute on function public.issue_payment_from_agent_quote(uuid,uuid,text,uuid,timestamptz,text,text) to service_role;
alter table public.provider_change_requests add column payer_transition_id uuid references public.workspace_payer_transitions(id);
alter function public.request_provider_change(uuid,uuid,text,uuid,text) rename to request_provider_change_without_payer;
revoke all on function public.request_provider_change_without_payer(uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
create function public.request_provider_change(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_new_agency_id uuid,p_key text,p_payer_transition_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;t public.workspace_payer_transitions%rowtype;begin
 if p_payer_transition_id is not null then
 select * into t from public.workspace_payer_transitions where id=p_payer_transition_id and workspace_id=p_workspace_id and status in('pending','accepted') for share;
 if t.id is null or (p_new_agency_id is null and t.successor_kind<>'business') or (p_new_agency_id is not null and (t.successor_kind<>'agency' or t.successor_workspace_id<>p_new_agency_id)) then raise exception 'provider_payer_transition_mismatch';end if;end if;
 result:=public.request_provider_change_without_payer(p_workspace_id,p_user_id,p_verified_email,p_new_agency_id,p_key);
 if exists(select 1 from public.provider_change_requests where id=(result->>'id')::uuid and payer_transition_id is not null and payer_transition_id is distinct from p_payer_transition_id) then raise exception 'provider_payer_transition_conflict';end if;
 update public.provider_change_requests set payer_transition_id=p_payer_transition_id where id=(result->>'id')::uuid;
 return result||jsonb_build_object('payerTransitionId',p_payer_transition_id);
end;$$;
alter function public.complete_provider_change(uuid,uuid,text) rename to complete_provider_change_without_payer;
revoke all on function public.complete_provider_change_without_payer(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.complete_provider_change(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare q public.provider_change_requests%rowtype;begin
 select * into q from public.provider_change_requests where id=p_request_id for update;
 if q.payer_transition_id is not null and not exists(select 1 from public.workspace_payer_transitions where id=q.payer_transition_id and workspace_id=q.business_workspace_id and status='accepted') then raise exception 'provider_payer_acceptance_required';end if;
 return public.complete_provider_change_without_payer(p_request_id,p_user_id,p_verified_email);
end;$$;
revoke all on function public.request_provider_change(uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;grant execute on function public.request_provider_change(uuid,uuid,text,uuid,text,uuid) to service_role;
revoke all on function public.complete_provider_change(uuid,uuid,text) from public,anon,authenticated;grant execute on function public.complete_provider_change(uuid,uuid,text) to service_role;
create table public.business_refund_requests(id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.business_payments(id),idempotency_key text not null,amount_cents bigint not null check(amount_cents>0),requested_by uuid not null references public.users(id),created_at timestamptz not null default now(),unique(payment_id,idempotency_key));
alter table public.business_refund_requests enable row level security;revoke all on public.business_refund_requests from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.business_refund_requests for each row execute function public.money_immutable_guard();
create table public.business_refund_receipts(refund_request_id uuid primary key references public.business_refund_requests(id),provider_refund_id text not null unique);
alter table public.business_refund_receipts enable row level security;revoke all on public.business_refund_receipts from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.business_refund_receipts for each row execute function public.money_immutable_guard();
create function public.record_business_refund_receipt(p_request_id uuid,p_refund_id text) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p_refund_id !~ '^re_[A-Za-z0-9]+$' then raise exception 'refund_receipt_invalid';end if;
 insert into public.business_refund_receipts values(p_request_id,p_refund_id) on conflict do nothing;
 if not exists(select 1 from public.business_refund_receipts where refund_request_id=p_request_id and provider_refund_id=p_refund_id) then raise exception 'refund_receipt_conflict';end if;end;$$;
revoke all on function public.record_business_refund_receipt(uuid,text) from public,anon,authenticated;grant execute on function public.record_business_refund_receipt(uuid,text) to service_role;
create function public.reserve_business_refund(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_payment_id uuid,p_amount bigint,p_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare p public.business_payments%rowtype;r public.business_refund_requests%rowtype;pi text;spent bigint;external bigint;begin
 perform public.connect_assert_reader(p_workspace_id,p_user_id,p_verified_email);
 if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then raise exception 'refund_owner_required';end if;
 select * into p from public.business_payments where id=p_payment_id and workspace_id=p_workspace_id for update;
 if p.id is null or p_amount<=0 or length(p_key) not between 8 and 200 then raise exception 'payment_refund_denied';end if;
 select provider_object_id into pi from public.business_payment_events where payment_id=p.id and kind='paid' and provider_object_id ~ '^pi_[A-Za-z0-9]+$' order by created_at limit 1;
 if pi is null then raise exception 'payment_refund_settled_source_required';end if;
 select * into r from public.business_refund_requests where payment_id=p.id and idempotency_key=p_key;
 if found then if r.amount_cents<>p_amount then raise exception 'refund_idempotency_conflict';end if;
 else
 select coalesce(sum(amount_cents),0) into spent from public.business_refund_requests where payment_id=p.id;
 select coalesce(sum(amount_cents),0) into external from public.business_payment_events where payment_id=p.id and kind='refund';
 -- Both pending requests and observed merchant-side refunds restrict the next
 -- request. This conservative ceiling can need reconciliation after failure.
 if spent+external-coalesce((select sum(least(e.amount_cents,rq.amount_cents)) from public.business_payment_events e join public.business_refund_receipts rr on rr.provider_refund_id=e.provider_object_id join public.business_refund_requests rq on rq.id=rr.refund_request_id where e.payment_id=p.id and e.kind='refund'),0)+p_amount>p.amount_cents then raise exception 'payment_refund_overdraw';end if;
 insert into public.business_refund_requests(payment_id,idempotency_key,amount_cents,requested_by) values(p.id,p_key,p_amount,p_user_id) returning * into r;end if;
 return to_jsonb(r)||jsonb_build_object('merchant_account_id',p.merchant_account_id,'payment_intent_id',pi);
end;$$;
revoke all on function public.reserve_business_refund(uuid,uuid,text,uuid,bigint,text) from public,anon,authenticated;grant execute on function public.reserve_business_refund(uuid,uuid,text,uuid,bigint,text) to service_role;
-- The response clock starts when a currently authorized agency manager reads
-- and acknowledges the notice. Queuing a receipt never claims delivery.
create function public.acknowledge_provider_change_notice(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare q public.provider_change_requests%rowtype;p public.workspace_providers%rowtype;policy public.provider_change_policy%rowtype;begin
 select * into q from public.provider_change_requests where id=p_request_id for update;
 select * into p from public.workspace_providers where id=q.old_provider_id;
 if p.id is null then raise exception 'provider_change_denied';end if;
 perform public.connect_assert_manager(p.provider_workspace_id,p_user_id,p_verified_email);
 if q.status='notified' then return to_jsonb(q);end if;
 if q.status not in('awaiting_policy','awaiting_notice') then raise exception 'provider_change_stale';end if;
 select * into policy from public.provider_change_policy where version=q.policy_version;
 if policy.version is null then select * into policy from public.provider_change_policy order by approved_at desc limit 1;end if;
 if policy.version is null then raise exception 'provider_change_policy_required';end if;
 update public.provider_change_requests set status='notified',policy_version=policy.version,respond_by=now()+make_interval(secs=>policy.response_window_seconds) where id=q.id returning * into q;
 return to_jsonb(q);
end;$$;
revoke all on function public.acknowledge_provider_change_notice(uuid,uuid,text) from public,anon,authenticated;grant execute on function public.acknowledge_provider_change_notice(uuid,uuid,text) to service_role;
create table public.platform_collections(id uuid primary key default gen_random_uuid(),business_workspace_id uuid not null references public.workspaces(id),invoice_line_id text not null,amount_cents bigint not null check(amount_cents>0),currency text not null,customer_id text not null,agreement_version text not null,installation_id uuid references public.offering_installations(id),idempotency_key text not null,created_at timestamptz not null default now(),unique(business_workspace_id,idempotency_key),unique(invoice_line_id));
alter table public.platform_collections enable row level security;revoke all on public.platform_collections from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.platform_collections for each row execute function public.money_immutable_guard();
create function public.reserve_platform_collection(p_business_id uuid,p_line_id text,p_amount bigint,p_currency text,p_customer_id text,p_key text,p_agreement text,p_installation_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r public.platform_collections%rowtype;a public.accounts%rowtype;begin
 perform 1 from public.workspaces where id=p_business_id and kind='customer' for share;if not found or public.workspace_exit_completed(p_business_id) then raise exception 'platform_collection_denied';end if;
 select * into a from public.accounts where workspace_id=p_business_id;
 if a.id is null or a.stripe_customer_id is distinct from p_customer_id then raise exception 'platform_collection_payer_mismatch';end if;
 if not exists(select 1 from public.platform_collection_prices where version=p_agreement and amount_cents=p_amount and currency=p_currency and effective_from<=now() and (effective_until is null or effective_until>now())) then raise exception 'platform_collection_agreement_required';end if;
 if p_installation_id is not null and not exists(select 1 from public.offering_installations where id=p_installation_id and business_workspace_id=p_business_id and status='active') then raise exception 'platform_collection_installation_invalid';end if;
 insert into public.platform_collections(business_workspace_id,invoice_line_id,amount_cents,currency,customer_id,agreement_version,installation_id,idempotency_key) values(p_business_id,p_line_id,p_amount,p_currency,p_customer_id,p_agreement,p_installation_id,p_key) on conflict do nothing;
 select * into r from public.platform_collections where business_workspace_id=p_business_id and idempotency_key=p_key;
 if r.id is null or r.invoice_line_id<>p_line_id or r.amount_cents<>p_amount or r.currency<>p_currency or r.agreement_version<>p_agreement or r.installation_id is distinct from p_installation_id then raise exception 'platform_collection_conflict';end if;return to_jsonb(r);
end;$$;
revoke all on function public.reserve_platform_collection(uuid,text,bigint,text,text,text,text,uuid) from public,anon,authenticated;grant execute on function public.reserve_platform_collection(uuid,text,bigint,text,text,text,text,uuid) to service_role;
