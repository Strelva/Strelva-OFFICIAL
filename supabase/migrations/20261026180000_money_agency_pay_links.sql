-- Agency Payment links on the agency's own connected Stripe account, plus the
-- numbered Invoice and Payment receipt each link produces. Legacy Redis pay
-- links get a Postgres home (agency_pay_links, rail 'platform_legacy') that is
-- only read after a verified backfill. No price, Stripe Price ID or platform
-- fee is set here: the amount belongs to each link and the fee stays 0. The
-- md5-pinned assert_business_checkout_admission and business_payments are not
-- touched; link checkout uses the existing 'checkout' purpose.
begin;
set local lock_timeout='3s';

create table public.agency_pay_links (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug)<=100 and slug not in('index','rohlax')),
 rail text not null check(rail in('platform_legacy','connected_account')),
 agency_workspace_id uuid references public.workspaces(id) on delete restrict,
 business_workspace_id uuid references public.workspaces(id) on delete restrict,
 client_name text not null check(char_length(client_name) between 1 and 160),
 description text check(description is null or char_length(description) between 1 and 1000),
 door text check(door is null or door in('build','managed_start')),
 -- Not named tenant_id: this is money evidence, not tenant teardown scope.
 legacy_tenant_id text,
 lead_slug text,
 return_url text,
 amount_cents bigint, min_cents bigint, max_cents bigint,
 currency text not null default 'usd' check(currency ~ '^[a-z]{3}$'),
 agency_display_name text,
 created_by text,
 created_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz, revoked_by text,
 checkout_generation integer not null default 0 check(checkout_generation>=0),
 legacy_source_hash text unique,
 check((amount_cents is not null and min_cents is null and max_cents is null and amount_cents between 1 and 100000000)
  or (amount_cents is null and min_cents is not null and max_cents is not null and min_cents>0 and min_cents<=max_cents and max_cents<=100000000)),
 check(rail='platform_legacy' or (agency_workspace_id is not null and description is not null and door is null)),
 check(rail='connected_account' or door is not null),
 check((revoked_at is null)=(revoked_by is null))
);
create index agency_pay_links_agency_idx on public.agency_pay_links(agency_workspace_id,created_at desc);

create table public.agency_pay_link_commands (
 agency_workspace_id uuid not null, user_id uuid not null, idempotency_key uuid not null,
 action text not null check(action in('create','revoke')), fingerprint text not null,
 link_id uuid not null references public.agency_pay_links(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 primary key(agency_workspace_id,user_id,idempotency_key)
);

create table public.money_document_counters (
 issuer_workspace_id uuid references public.workspaces(id) on delete restrict,
 kind text check(kind in('invoice','payment_receipt')),
 next_number bigint not null check(next_number>0),
 primary key(issuer_workspace_id,kind)
);

create table public.money_documents (
 id uuid primary key default gen_random_uuid(),
 issuer_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 kind text not null check(kind in('invoice','payment_receipt')),
 number bigint not null check(number>0),
 source_kind text not null check(source_kind in('agency_pay_link')),
 source_id uuid not null references public.agency_pay_links(id) on delete restrict,
 payment_id uuid references public.business_payments(id) on delete restrict,
 snapshot jsonb not null,
 issued_at timestamptz not null default clock_timestamp(),
 unique(issuer_workspace_id,kind,number),
 check((kind='invoice')=(payment_id is null))
);
create unique index money_documents_one_invoice on public.money_documents(source_kind,source_id) where kind='invoice';
create unique index money_documents_one_receipt on public.money_documents(payment_id) where kind='payment_receipt';
create function public.money_document_immutable_guard() returns trigger language plpgsql as $$ begin raise exception 'money_document_immutable'; end; $$;
create trigger money_documents_immutable before update or delete on public.money_documents for each row execute function public.money_document_immutable_guard();

do $$ declare t text; begin foreach t in array array['agency_pay_links','agency_pay_link_commands','money_document_counters','money_documents'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop; end $$;

-- Internal helpers: no caller, only the RPCs below.
create function public.agency_pay_link_paid(p_link uuid) returns table(payment_id uuid,paid_at timestamptz,amount_cents bigint,provider_object_id text)
language sql stable security definer set search_path=public,pg_temp as $$
 select e.payment_id,e.created_at,p.amount_cents,e.provider_object_id
 from public.agency_pay_links l
 join public.business_payments p on p.workspace_id=l.agency_workspace_id and p.purpose='checkout' and p.reference_id='agency_pay_link:'||l.id::text
 join public.business_payment_events e on e.payment_id=p.id and e.kind='paid'
 where l.id=p_link and l.rail='connected_account'
 order by e.created_at,e.id limit 1;
$$;
create function public.agency_pay_link_projection(l public.agency_pay_links) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'id',l.id,'slug',l.slug,'rail',l.rail,'agencyWorkspaceId',l.agency_workspace_id,'businessWorkspaceId',l.business_workspace_id,
  'clientName',l.client_name,'description',l.description,'door',l.door,'amountCents',l.amount_cents,'minCents',l.min_cents,'maxCents',l.max_cents,
  'currency',l.currency,'agencyDisplayName',l.agency_display_name,'createdBy',l.created_by,'createdAt',l.created_at,
  'revokedAt',l.revoked_at,'revokedBy',l.revoked_by,'checkoutGeneration',l.checkout_generation,
  'legacyTenantId',l.legacy_tenant_id,'leadSlug',l.lead_slug,'returnUrl',l.return_url,
  'status',case when exists(select 1 from public.agency_pay_link_paid(l.id)) then 'paid' when l.revoked_at is not null then 'expired' else 'open' end,
  'paidAt',(select x.paid_at from public.agency_pay_link_paid(l.id) x),'paidAmountCents',(select x.amount_cents from public.agency_pay_link_paid(l.id) x),
  'invoiceNumber',(select d.number from public.money_documents d where d.source_kind='agency_pay_link' and d.source_id=l.id and d.kind='invoice'),
  'receiptNumber',(select d.number from public.money_documents d where d.source_kind='agency_pay_link' and d.source_id=l.id and d.kind='payment_receipt' order by d.number desc limit 1));
$$;
create function public.money_document_next(p_issuer uuid,p_kind text) returns bigint
language sql security definer set search_path=public,pg_temp as $$
 insert into public.money_document_counters(issuer_workspace_id,kind,next_number) values(p_issuer,p_kind,2)
 on conflict(issuer_workspace_id,kind) do update set next_number=public.money_document_counters.next_number+1
 returning next_number-1;
$$;
revoke all on function public.agency_pay_link_paid(uuid) from public,anon,authenticated,service_role;
revoke all on function public.agency_pay_link_projection(public.agency_pay_links) from public,anon,authenticated,service_role;
revoke all on function public.money_document_next(uuid,text) from public,anon,authenticated,service_role;

create function public.agency_pay_link_command(p_command jsonb,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare agency uuid:=(p_command->>'agencyWorkspaceId')::uuid; key uuid:=(p_command->>'idempotencyKey')::uuid; act text:=p_command->>'action';
 receipt public.agency_pay_link_commands; l public.agency_pay_links; business uuid:=nullif(p_command->>'businessWorkspaceId','')::uuid;
 fixed bigint:=nullif(p_command->>'amountCents','')::bigint; lo bigint:=nullif(p_command->>'minCents','')::bigint; hi bigint:=nullif(p_command->>'maxCents','')::bigint;
 display text; n bigint;
begin
 perform public.connect_assert_manager(agency,p_user_id,p_verified_email);
 if not exists(select 1 from public.workspaces where id=agency and kind='agency') then raise exception 'agency_pay_link_denied'; end if;
 if act not in('create','revoke') then raise exception 'agency_pay_link_denied'; end if;
 select * into receipt from public.agency_pay_link_commands where agency_workspace_id=agency and user_id=p_user_id and idempotency_key=key;
 if found then
  if receipt.fingerprint is distinct from p_command->>'fingerprint' or receipt.action<>act then raise exception 'agency_pay_link_conflict'; end if;
  select * into l from public.agency_pay_links where id=receipt.link_id;
  return public.agency_pay_link_projection(l);
 end if;
 if act='create' then
  if not exists(select 1 from public.connected_accounts where workspace_id=agency and state='ready' and 'merchant'=any(configurations)) then raise exception 'agency_pay_link_merchant_unavailable'; end if;
  if business is not null and not exists(select 1 from public.workspace_providers where customer_workspace_id=business and provider_workspace_id=agency and status='active') then raise exception 'agency_pay_link_denied'; end if;
  if coalesce(p_command->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_command->>'slug')>100 or p_command->>'slug' in('index','rohlax') then raise exception 'agency_pay_link_slug_invalid'; end if;
  if fixed is not null then
   if lo is not null or hi is not null or fixed not between 100 and 100000000 then raise exception 'agency_pay_link_amount_invalid'; end if;
  elsif lo is null or hi is null or lo<5000 or hi>1000000 or hi<lo or (hi-lo)%5000<>0 then raise exception 'agency_pay_link_amount_invalid'; end if;
  display:=coalesce(nullif(btrim(p_command->>'agencyDisplayName'),''),(select name from public.workspaces where id=agency));
  begin
   insert into public.agency_pay_links(slug,rail,agency_workspace_id,business_workspace_id,client_name,description,amount_cents,min_cents,max_cents,currency,agency_display_name,created_by)
   values(p_command->>'slug','connected_account',agency,business,p_command->>'clientName',p_command->>'description',fixed,lo,hi,'usd',display,p_user_id::text) returning * into l;
  exception when unique_violation then raise exception 'agency_pay_link_slug_taken'; end;
  n:=public.money_document_next(agency,'invoice');
  insert into public.money_documents(issuer_workspace_id,kind,number,source_kind,source_id,snapshot)
  values(agency,'invoice',n,'agency_pay_link',l.id,jsonb_build_object('issuerName',display,'billTo',l.client_name,'description',l.description,'amountCents',l.amount_cents,'minCents',l.min_cents,'maxCents',l.max_cents,'currency','usd','slug',l.slug,'issuedAt',clock_timestamp()));
 else
  select * into l from public.agency_pay_links where slug=p_command->>'slug' for update;
  if not found or l.agency_workspace_id is distinct from agency then raise exception 'agency_pay_link_denied'; end if;
  if l.revoked_at is null then
   update public.agency_pay_links set revoked_at=clock_timestamp(),revoked_by=p_user_id::text where id=l.id returning * into l;
  end if;
 end if;
 insert into public.agency_pay_link_commands(agency_workspace_id,user_id,idempotency_key,action,fingerprint,link_id) values(agency,p_user_id,key,act,p_command->>'fingerprint',l.id);
 return public.agency_pay_link_projection(l);
end $$;

create function public.read_agency_pay_links(p_agency_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform public.connect_assert_manager(p_agency_workspace_id,p_user_id,p_verified_email);
 return coalesce((select jsonb_agg(public.agency_pay_link_projection(l) order by l.created_at desc) from public.agency_pay_links l where l.agency_workspace_id=p_agency_workspace_id),'[]'::jsonb);
end $$;

create function public.read_public_agency_pay_link(p_slug text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select public.agency_pay_link_projection(l) from public.agency_pay_links l where l.slug=p_slug;
$$;

create function public.list_agency_pay_links_for_support() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(public.agency_pay_link_projection(l) order by l.created_at desc),'[]'::jsonb) from public.agency_pay_links l;
$$;

create function public.begin_agency_pay_link_checkout(p_slug text,p_amount_cents bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.agency_pay_links;
begin
 select * into l from public.agency_pay_links where slug=p_slug for update;
 if not found or l.rail<>'connected_account' then raise exception 'agency_pay_link_missing'; end if;
 if l.revoked_at is not null then raise exception 'agency_pay_link_expired'; end if;
 if exists(select 1 from public.agency_pay_link_paid(l.id)) then raise exception 'agency_pay_link_paid'; end if;
 if l.amount_cents is not null then
  if p_amount_cents is distinct from l.amount_cents then raise exception 'agency_pay_link_amount_invalid'; end if;
 elsif p_amount_cents is null or p_amount_cents<l.min_cents or p_amount_cents>l.max_cents or (p_amount_cents-l.min_cents)%5000<>0 then raise exception 'agency_pay_link_amount_invalid'; end if;
 return jsonb_build_object('linkId',l.id,'workspaceId',l.agency_workspace_id,'slug',l.slug,'description',l.description,'currency',l.currency,'amountCents',p_amount_cents,
  'generation',l.checkout_generation,'referenceId','agency_pay_link:'||l.id::text,
  'idempotencyKey','agency-pay-link:'||l.id::text||':g'||l.checkout_generation::text||':'||p_amount_cents::text);
end $$;

create function public.assert_agency_pay_link_checkout_open(p_link_id uuid,p_payment_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.agency_pay_links; p public.business_payments;
begin
 select * into l from public.agency_pay_links where id=p_link_id for share;
 select * into p from public.business_payments where id=p_payment_id for share;
 if l.id is null or p.id is null or l.rail<>'connected_account' or p.workspace_id is distinct from l.agency_workspace_id or p.purpose<>'checkout'
  or p.reference_id is distinct from 'agency_pay_link:'||p_link_id::text or l.revoked_at is not null
  or exists(select 1 from public.agency_pay_link_paid(l.id)) or public.workspace_exit_completed(l.agency_workspace_id) then raise exception 'agency_pay_link_closed'; end if;
 return true;
end $$;

create function public.advance_agency_pay_link_checkout(p_link_id uuid,p_expected_generation integer) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare g integer;
begin
 update public.agency_pay_links set checkout_generation=checkout_generation+1 where id=p_link_id and checkout_generation=p_expected_generation and revoked_at is null;
 select checkout_generation into g from public.agency_pay_links where id=p_link_id;
 return g;
end $$;

create function public.read_agency_pay_link_open_checkouts(p_link_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('paymentId',p.id,'accountId',p.merchant_account_id,'sessionId',e.provider_object_id) order by e.created_at),'[]'::jsonb)
 from public.business_payments p
 join public.business_payment_events e on e.payment_id=p.id and e.kind='checkout_created'
 where p.reference_id='agency_pay_link:'||p_link_id::text and p.purpose='checkout'
  and not exists(select 1 from public.business_payment_events x where x.payment_id=p.id and x.kind='paid');
$$;

create function public.issue_agency_pay_link_receipt(p_link_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.agency_pay_links; paid record; doc public.money_documents; inv public.money_documents; n bigint;
begin
 select * into l from public.agency_pay_links where id=p_link_id and rail='connected_account' for update;
 if not found then raise exception 'agency_pay_link_missing'; end if;
 select * into paid from public.agency_pay_link_paid(l.id);
 if paid.payment_id is null then raise exception 'agency_pay_link_unpaid'; end if;
 select * into doc from public.money_documents where kind='payment_receipt' and payment_id=paid.payment_id;
 if found then return to_jsonb(doc); end if;
 select * into inv from public.money_documents where kind='invoice' and source_kind='agency_pay_link' and source_id=l.id;
 n:=public.money_document_next(l.agency_workspace_id,'payment_receipt');
 insert into public.money_documents(issuer_workspace_id,kind,number,source_kind,source_id,payment_id,snapshot)
 values(l.agency_workspace_id,'payment_receipt',n,'agency_pay_link',l.id,paid.payment_id,
  jsonb_build_object('issuerName',inv.snapshot->>'issuerName','billTo',l.client_name,'description',l.description,'amountPaidCents',paid.amount_cents,'currency',l.currency,
   'paidAt',paid.paid_at,'paymentReference',paid.payment_id,'providerObjectId',paid.provider_object_id)) returning * into doc;
 return to_jsonb(doc);
end $$;

create function public.read_money_document(p_kind text,p_link_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(d) from public.money_documents d where d.source_kind='agency_pay_link' and d.source_id=p_link_id and d.kind=p_kind order by d.number desc limit 1;
$$;

create function public.backfill_legacy_agency_pay_link(p_record jsonb,p_source_hash text,p_legacy_agency uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid; revoked timestamptz:=nullif(p_record->>'revokedAt','')::timestamptz;
begin
 if exists(select 1 from public.agency_pay_links where legacy_source_hash=p_source_hash) then return 'unchanged'; end if;
 if exists(select 1 from public.agency_pay_links where slug=p_record->>'slug') then return 'conflict'; end if;
 owner:=coalesce(nullif(p_record->>'agencyWorkspaceId','')::uuid,p_legacy_agency);
 if owner is null or not exists(select 1 from public.workspaces where id=owner and kind='agency') then raise exception 'agency_pay_link_backfill_owner'; end if;
 insert into public.agency_pay_links(slug,rail,agency_workspace_id,business_workspace_id,client_name,description,door,legacy_tenant_id,lead_slug,return_url,
  amount_cents,min_cents,max_cents,agency_display_name,created_by,created_at,revoked_at,revoked_by,legacy_source_hash)
 values(p_record->>'slug','platform_legacy',owner,nullif(p_record->>'businessWorkspaceId','')::uuid,p_record->>'clientName',nullif(p_record->>'customCopy',''),p_record->>'door',
  p_record->>'tenantId',p_record->>'leadSlug',p_record->>'returnUrl',nullif(p_record->>'amountCents','')::bigint,nullif(p_record->>'minCents','')::bigint,nullif(p_record->>'maxCents','')::bigint,
  p_record->>'agencyDisplayName',p_record->>'createdBy',coalesce(nullif(p_record->>'createdAt','')::timestamptz,clock_timestamp()),revoked,
  case when revoked is null then null else coalesce(nullif(p_record->>'revokedBy',''),'legacy') end,p_source_hash);
 return 'inserted';
end $$;

do $$ declare f text; begin foreach f in array array[
 'agency_pay_link_command(jsonb,uuid,text)','read_agency_pay_links(uuid,uuid,text)','read_public_agency_pay_link(text)','list_agency_pay_links_for_support()',
 'begin_agency_pay_link_checkout(text,bigint)','assert_agency_pay_link_checkout_open(uuid,uuid)','advance_agency_pay_link_checkout(uuid,integer)',
 'read_agency_pay_link_open_checkouts(uuid)','issue_agency_pay_link_receipt(uuid)','read_money_document(text,uuid)','backfill_legacy_agency_pay_link(jsonb,text,uuid)'] loop
 execute format('revoke all on function public.%s from public,anon,authenticated',f);
 execute format('grant execute on function public.%s to service_role',f);
 end loop; end $$;
revoke all on function public.money_document_immutable_guard() from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
