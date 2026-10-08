-- Issued terms never mutate; payment status is a ledger projection.
create table public.business_payment_requests(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 kind text not null check(kind in('quote','deposit')),source_record_id uuid not null,
 lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 50),
 amount_cents bigint not null check(amount_cents>0 and amount_cents<=100000000),currency text not null check(currency ~ '^[a-z]{3}$'),
 accepted_terms text,agent_quote_receipt_id uuid,
 expires_at timestamptz not null,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 cancellation_policy jsonb not null default '{}',issued_by uuid not null references public.users(id),issued_at timestamptz not null default now(),idempotency_key text not null,
 unique(workspace_id,idempotency_key),unique(workspace_id,kind,source_record_id)
);
create table public.payment_request_actions(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.business_payment_requests(id),action text not null check(action in('accepted','cancelled','refund_required','expired')),
 payment_id uuid references public.business_payments(id),created_at timestamptz not null default now(),unique(request_id,action)
);
alter table public.business_payment_requests enable row level security;alter table public.payment_request_actions enable row level security;
revoke all on public.business_payment_requests,public.payment_request_actions from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.business_payment_requests for each row execute function public.money_immutable_guard();
create trigger money_immutable before update or delete on public.payment_request_actions for each row execute function public.money_immutable_guard();
create function public.issue_business_payment_request(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_kind text,p_source_id uuid,p_lines jsonb,p_amount bigint,p_currency text,p_expires timestamptz,p_hash text,p_policy jsonb,p_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare r public.business_payment_requests%rowtype;total numeric;quote_receipt jsonb;begin
 perform public.connect_assert_manager(p_workspace_id,p_user_id,p_verified_email);
 if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then raise exception 'payment_request_owner_required';end if;
 if p_expires<=now() or p_expires>now()+interval '90 days' or length(p_key) not between 8 and 200 then raise exception 'payment_request_invalid';end if;
 if p_kind='deposit' then
 perform 1 from public.business_bookings where id=p_source_id and workspace_id=p_workspace_id and status='held' for update;
 if not found then raise exception 'payment_request_booking_invalid';end if;
 if jsonb_typeof(p_policy->'refundable') is distinct from 'boolean' then raise exception 'payment_request_policy_required';end if;
 elsif p_kind='quote' then
 -- Native business inquiries are authoritative, including converted customer leads.
 if not exists(select 1 from public.tenant_leads where id=p_source_id and workspace_id=p_workspace_id) then raise exception 'payment_request_inquiry_invalid';end if;
 else raise exception 'payment_request_invalid';end if;
 if p_kind='quote' and to_regclass('public.agent_quote_receipts') is not null then
 execute 'select to_jsonb(q) from public.agent_quote_receipts q where lead_id=$1 and workspace_id=$2 for share' into quote_receipt using p_source_id,p_workspace_id;
 if quote_receipt is not null and ((quote_receipt->>'amount_cents')::bigint<>p_amount or lower(quote_receipt->>'currency')<>p_currency or p_lines<>jsonb_build_array(jsonb_build_object('name','Quoted work','quantity',1,'unitCents',p_amount))) then raise exception 'payment_quote_receipt_mismatch';end if;
 end if;
 if jsonb_typeof(p_lines)<>'array'  or jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'payment_request_lines_invalid';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) l where l->>'name' is null or l->>'quantity' is null or l->>'unitCents' is null or length(l->>'name') not between 1 and 200 or (l->>'quantity') !~ '^[1-9][0-9]{0,3}$' or (l->>'unitCents') !~ '^[0-9]{1,8}$') then raise exception 'payment_request_lines_invalid';end if;
 select sum((l->>'quantity')::numeric*(l->>'unitCents')::numeric) into total from jsonb_array_elements(p_lines) l;
 if total<>p_amount then raise exception 'payment_request_amount_mismatch';end if;
 insert into public.business_payment_requests(workspace_id,kind,source_record_id,lines,amount_cents,currency,expires_at,token_hash,cancellation_policy,issued_by,idempotency_key,accepted_terms,agent_quote_receipt_id)
 values(p_workspace_id,p_kind,p_source_id,p_lines,p_amount,p_currency,p_expires,p_hash,p_policy,p_user_id,p_key,quote_receipt->>'terms',(quote_receipt->>'id')::uuid) on conflict(workspace_id,idempotency_key) do nothing;
 select * into r from public.business_payment_requests where workspace_id=p_workspace_id and idempotency_key=p_key;
 if r.source_record_id<>p_source_id or r.lines<>p_lines or r.amount_cents<>p_amount or r.currency<>p_currency or r.kind<>p_kind or r.expires_at<>p_expires or r.cancellation_policy<>p_policy or r.token_hash<>p_hash then raise exception 'payment_request_conflict';end if;
 return to_jsonb(r)-'token_hash';
end;$$;
create function public.read_public_payment_request(p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r public.business_payment_requests%rowtype;paid boolean;begin
 select * into r from public.business_payment_requests where token_hash=p_hash;
 if r.id is null then raise exception 'payment_request_not_found';end if;
 select exists(select 1 from public.business_payments p join public.business_payment_events e on e.payment_id=p.id and e.kind='paid' where p.workspace_id=r.workspace_id and p.reference_id=r.id::text) into paid;
 return jsonb_build_object('id',r.id,'workspaceId',r.workspace_id,'kind',r.kind,'lines',r.lines,'acceptedTerms',r.accepted_terms,'amountCents',r.amount_cents,'currency',r.currency,'expiresAt',r.expires_at,'paid',paid,'status',case when paid then 'paid' when exists(select 1 from public.payment_request_actions where request_id=r.id and action='cancelled') then 'cancelled' when r.expires_at<=now() then 'expired' else 'unpaid' end);
end;$$;
create function public.accept_public_payment_request(p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r public.business_payment_requests%rowtype;p jsonb;begin
 select * into r from public.business_payment_requests where token_hash=p_hash for update;
 if r.id is null or r.expires_at<=now() or exists(select 1 from public.payment_request_actions where request_id=r.id and action='cancelled') then raise exception 'payment_request_unavailable';end if;
 if r.kind='deposit' and not exists(select 1 from public.business_bookings where id=r.source_record_id and workspace_id=r.workspace_id and status='held') then raise exception 'payment_request_booking_unavailable';end if;
 p:=public.reserve_business_payment(r.workspace_id,'request:'||r.id::text,r.kind,r.amount_cents,r.currency,r.id::text);
 insert into public.payment_request_actions(request_id,action,payment_id) values(r.id,'accepted',(p->>'id')::uuid) on conflict do nothing;
 return public.read_public_payment_request(p_hash);
end;$$;
create function public.booking_deposit_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare r public.business_payment_requests%rowtype;paid boolean;begin
 select * into r from public.business_payment_requests where source_record_id=new.id and workspace_id=new.workspace_id and kind='deposit';
 if r.id is null then return new;end if;
 select exists(select 1 from public.business_payments p join public.business_payment_events e on e.payment_id=p.id and e.kind='paid' where p.workspace_id=r.workspace_id and p.reference_id=r.id::text) into paid;
 if new.status in('requested','confirmed') and old.status='held' and (not paid or r.expires_at<=now()) then raise exception 'booking_deposit_unpaid_or_expired';end if;
 if new.status='cancelled' and old.status<>'cancelled' then
 insert into public.payment_request_actions(request_id,action) values(r.id,'cancelled') on conflict do nothing;
 if paid and (r.cancellation_policy->>'refundable')::boolean then insert into public.payment_request_actions(request_id,action) values(r.id,'refund_required') on conflict do nothing;end if;
 end if;return new;
end;$$;
create trigger booking_deposit_guard before update on public.business_bookings for each row execute function public.booking_deposit_guard();
DO $$declare f record;begin for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('issue_business_payment_request','read_public_payment_request','accept_public_payment_request')loop execute format('revoke all on function %s from public,anon,authenticated',f.name);execute format('grant execute on function %s to service_role',f.name);end loop;end $$;
-- Late provider success is preserved and queued for refund review; it cannot confirm an expired hold.
create function public.payment_request_late_success() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare r public.business_payment_requests%rowtype;begin
 if new.kind<>'paid' then return new;end if;
 select q.* into r from public.business_payment_requests q join public.business_payments p on p.reference_id=q.id::text and p.workspace_id=q.workspace_id where p.id=new.payment_id;
 if r.id is not null and (r.expires_at<=now() or exists(select 1 from public.payment_request_actions where request_id=r.id and action='cancelled')) then
 insert into public.payment_request_actions(request_id,action,payment_id) values(r.id,'refund_required',new.payment_id) on conflict do nothing;end if;return new;
end;$$;
create trigger payment_request_late_success after insert on public.business_payment_events for each row execute function public.payment_request_late_success();
