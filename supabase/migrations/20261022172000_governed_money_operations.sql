-- Ordinary recorded-term producers. No price/rate/mandate is supplied here;
-- all existing ledger, approval and provider observation bytes are preserved.
begin;
set local lock_timeout='3s';
do $$begin if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('record_governed_money_configuration','read_governed_money_preparation','prepare_governed_collection_terms','register_governed_creator_listing','read_governed_money_configuration','assert_governed_payout_dispatch')) then raise exception 'governed_money_unsupported_baseline';end if;end$$;

create function public.record_governed_money_configuration(p_user_id uuid,p_verified_email text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=p_command->>'action'; a public.money_agreements; price public.platform_collection_prices; payout public.split_payouts; authorization public.split_payout_authorizations; c public.connected_accounts; found_before boolean; keys text[];
begin
 perform 1 from public.users u join public.super_admins s on s.user_id=u.id
 where u.id=p_user_id and u.verified_at is not null and lower(btrim(u.email))=lower(btrim(p_verified_email)) and lower(btrim(s.email))=lower(btrim(p_verified_email)) and s.revoked_at is null for share of u,s;
 if not found then raise exception 'governed_money_denied';end if;
 if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'governed_money_invalid';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if action='record_agreement' then
  if keys is distinct from array['action','effectiveFrom','effectiveUntil','kind','rateBps','rateReference','version','workspaceId'] or p_command->>'kind' not in('agency','creator') or p_command->>'rateBps' !~ '^[0-9]+$' or (p_command->>'rateBps')::integer not between 0 and 10000 or length(btrim(p_command->>'version')) not between 1 and 200 or length(btrim(p_command->>'rateReference')) not between 1 and 200 or (p_command->>'effectiveFrom')::timestamptz is null or not isfinite((p_command->>'effectiveFrom')::timestamptz) or ((p_command->>'effectiveUntil')::timestamptz is not null and not isfinite((p_command->>'effectiveUntil')::timestamptz)) or ((p_command->>'effectiveUntil')::timestamptz is not null and (p_command->>'effectiveUntil')::timestamptz<=(p_command->>'effectiveFrom')::timestamptz) then raise exception 'governed_money_invalid';end if;
  perform 1 from public.workspaces where id=(p_command->>'workspaceId')::uuid and kind='agency' for share;
  if not found or public.workspace_exit_completed((p_command->>'workspaceId')::uuid) then raise exception 'governed_money_denied';end if;
  perform pg_advisory_xact_lock(hashtextextended('agreement:'||(p_command->>'workspaceId')||':'||(p_command->>'kind')||':'||(p_command->>'version'),8815));
  select * into a from public.money_agreements where beneficiary_workspace_id=(p_command->>'workspaceId')::uuid and kind=p_command->>'kind' and version=p_command->>'version';found_before:=found;
  if not found_before then
   insert into public.money_agreements(beneficiary_workspace_id,kind,version,rate_reference,rate_bps,effective_from,effective_until,approved_by,approved_at) values((p_command->>'workspaceId')::uuid,p_command->>'kind',p_command->>'version',p_command->>'rateReference',(p_command->>'rateBps')::integer,(p_command->>'effectiveFrom')::timestamptz,(p_command->>'effectiveUntil')::timestamptz,p_user_id,clock_timestamp()) returning * into a;
  end if;
  if a.rate_reference is distinct from p_command->>'rateReference' or a.rate_bps is distinct from (p_command->>'rateBps')::integer or a.effective_from is distinct from (p_command->>'effectiveFrom')::timestamptz or a.effective_until is distinct from (p_command->>'effectiveUntil')::timestamptz or a.approved_by is distinct from p_user_id then raise exception 'governed_money_conflict';end if;
 elsif action='record_price' then
  if keys is distinct from array['action','amountCents','currency','definitionId','effectiveFrom','effectiveUntil','version'] or p_command->>'amountCents' !~ '^[0-9]+$' or (p_command->>'amountCents')::bigint not between 1 and 100000000 or p_command->>'currency' !~ '^[a-z]{3}$' or length(btrim(p_command->>'version')) not between 1 and 200 or (p_command->>'effectiveFrom')::timestamptz is null or not isfinite((p_command->>'effectiveFrom')::timestamptz) or ((p_command->>'effectiveUntil')::timestamptz is not null and not isfinite((p_command->>'effectiveUntil')::timestamptz)) or ((p_command->>'effectiveUntil')::timestamptz is not null and (p_command->>'effectiveUntil')::timestamptz<=(p_command->>'effectiveFrom')::timestamptz) then raise exception 'governed_money_invalid';end if;
  if p_command->>'definitionId' is not null and not exists(select 1 from public.offering_package_sources where definition_id=p_command->>'definitionId') then raise exception 'governed_money_source_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('price:'||(p_command->>'version'),8815));
  select * into price from public.platform_collection_prices where version=p_command->>'version';found_before:=found;
  if not found_before then
   insert into public.platform_collection_prices(version,amount_cents,currency,definition_id,effective_from,effective_until,approved_by,approved_at) values(p_command->>'version',(p_command->>'amountCents')::bigint,p_command->>'currency',p_command->>'definitionId',(p_command->>'effectiveFrom')::timestamptz,(p_command->>'effectiveUntil')::timestamptz,p_user_id,clock_timestamp()) returning * into price;
  end if;
  if price.amount_cents is distinct from (p_command->>'amountCents')::bigint or price.currency is distinct from p_command->>'currency' or price.definition_id is distinct from p_command->>'definitionId' or price.effective_from is distinct from (p_command->>'effectiveFrom')::timestamptz or price.effective_until is distinct from (p_command->>'effectiveUntil')::timestamptz or price.approved_by is distinct from p_user_id then raise exception 'governed_money_conflict';end if;
 elsif action='authorize_payout' then
  if keys is distinct from array['action','payoutId','profileVersion'] or length(btrim(p_command->>'profileVersion')) not between 1 and 200 then raise exception 'governed_money_invalid';end if;
  select * into payout from public.split_payouts where id=(p_command->>'payoutId')::uuid for update;
  if payout.id is null or payout.source_account_id<>'platform' then raise exception 'governed_money_denied';end if;
  select ca.* into c from public.connected_accounts ca join public.revenue_splits s on s.beneficiary_workspace_id=ca.workspace_id where s.id=payout.split_id and ca.stripe_account_id=payout.recipient_account_id for share of ca;
  if c.workspace_id is null or c.state<>'ready' or c.profile_version is distinct from p_command->>'profileVersion' or not 'recipient'=any(c.configurations) or c.capabilities#>>'{recipient,capabilities,stripe_balance,stripe_transfers,status}' is distinct from 'active' then raise exception 'governed_money_not_configured';end if;
  select * into authorization from public.split_payout_authorizations where payout_id=payout.id;found_before:=found;
  if not found_before then insert into public.split_payout_authorizations values(payout.id,p_user_id,clock_timestamp(),p_command->>'profileVersion') returning * into authorization;end if;
  if authorization.approved_by is distinct from p_user_id or authorization.profile_version is distinct from p_command->>'profileVersion' then raise exception 'governed_money_conflict';end if;
 else raise exception 'governed_money_invalid';end if;
 return jsonb_build_object('action',action,'recordedBy',p_user_id,'replayed',found_before,'command',p_command);
end $$;

create function public.read_governed_money_configuration(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare agreements jsonb; prices jsonb; payouts jsonb;
begin
 if not exists(select 1 from public.users u join public.super_admins s on s.user_id=u.id where u.id=p_user_id and u.verified_at is not null and lower(btrim(u.email))=lower(btrim(p_verified_email)) and lower(btrim(s.email))=lower(btrim(p_verified_email)) and s.revoked_at is null) then raise exception 'governed_money_denied';end if;
 if not exists(select 1 from public.workspaces where id=p_workspace_id) then raise exception 'governed_money_denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('kind',a.kind,'version',a.version,'rateReference',a.rate_reference,'rateBps',a.rate_bps,'effectiveFrom',a.effective_from,'effectiveUntil',a.effective_until,'recordedBy',a.approved_by) order by a.effective_from,a.id),'[]'::jsonb) into agreements from public.money_agreements a where a.beneficiary_workspace_id=p_workspace_id;
 select coalesce(jsonb_agg(jsonb_build_object('version',p.version,'amountCents',p.amount_cents,'currency',p.currency,'definitionId',p.definition_id,'effectiveFrom',p.effective_from,'effectiveUntil',p.effective_until) order by p.version),'[]'::jsonb) into prices from public.platform_collection_prices p;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amountCents',p.amount_cents,'currency',p.currency,'sourceAccountId',p.source_account_id,'sourceTransaction',p.source_transaction,'recipientAccountId',p.recipient_account_id,'agreementVersion',p.agreement_version,'profileVersion',c.profile_version,'authorizedBy',a.approved_by,'transferId',r.transfer_id) order by p.id),'[]'::jsonb) into payouts from public.split_payouts p join public.revenue_splits s on s.id=p.split_id left join public.split_payout_authorizations a on a.payout_id=p.id left join public.split_transfer_receipts r on r.payout_id=p.id left join public.connected_accounts c on c.workspace_id=s.beneficiary_workspace_id and c.stripe_account_id=p.recipient_account_id where s.beneficiary_workspace_id=p_workspace_id and p.source_account_id='platform';
 return jsonb_build_object('workspaceId',p_workspace_id,'agreements',agreements,'prices',prices,'payouts',payouts);
end $$;

create function public.read_governed_money_preparation(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.accounts; prices jsonb; terms jsonb; installations jsonb; can_prepare boolean;
begin
 perform public.connect_assert_reader(p_workspace_id,p_user_id,p_verified_email);
 if not exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer') then raise exception 'governed_money_denied';end if;
 select * into a from public.accounts where workspace_id=p_workspace_id and billing_home_kind='business';
 select not public.workspace_exit_completed(p_workspace_id) and exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') into can_prepare;
 select coalesce(jsonb_agg(jsonb_build_object('version',p.version,'amountCents',p.amount_cents,'currency',p.currency,'definitionId',p.definition_id,'effectiveFrom',p.effective_from,'effectiveUntil',p.effective_until) order by p.version),'[]'::jsonb) into prices from public.platform_collection_prices p join public.super_admins s on s.user_id=p.approved_by and s.revoked_at is null join public.users u on u.id=s.user_id and u.verified_at is not null where p.effective_from<=now() and (p.effective_until is null or p.effective_until>now()) and (p.definition_id is null or exists(select 1 from public.offering_installations i where i.business_workspace_id=p_workspace_id and i.status='active' and i.definition_id=p.definition_id));
 select coalesce(jsonb_agg(jsonb_build_object('lineId',t.line_id,'workspaceId',t.business_workspace_id,'priceVersion',t.agreement_version,'amountCents',t.amount_cents,'currency',t.currency,'installationId',t.installation_id,'acceptedBy',t.accepted_by,'acceptedAt',t.accepted_at,'periodStart',p.period_start,'periodEnd',p.period_end) order by t.accepted_at,t.line_id),'[]'::jsonb) into terms from public.platform_collection_terms t left join public.platform_collection_periods p on p.line_id=t.line_id where t.business_workspace_id=p_workspace_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'definitionId',i.definition_id) order by i.id),'[]'::jsonb) into installations from public.offering_installations i where i.business_workspace_id=p_workspace_id and i.status='active';
 return jsonb_build_object('workspaceId',p_workspace_id,'canPrepare',can_prepare,'payer',case when a.id is null then null else jsonb_build_object('kind',a.payer_kind,'workspaceId',coalesce(a.payer_workspace_id,p_workspace_id),'customerConfigured',a.stripe_customer_id is not null) end,'prices',prices,'terms',terms,'installations',installations,'collectionDispatch','not_configured');
end $$;

create function public.prepare_governed_collection_terms(p_user_id uuid,p_verified_email text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace uuid:=(p_command->>'workspaceId')::uuid; line text:=p_command->>'lineId'; a public.accounts; price public.platform_collection_prices; t public.platform_collection_terms; period public.platform_collection_periods;
begin
 if jsonb_typeof(p_command) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['amountCents','currency','installationId','lineId','periodEnd','periodStart','priceVersion','workspaceId'] then raise exception 'governed_money_invalid';end if;
 perform 1 from public.users where id=p_user_id and verified_at is not null and lower(btrim(email))=lower(btrim(p_verified_email)) for share;
 if not found then raise exception 'governed_money_denied';end if;
 perform 1 from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id and w.kind='customer' where m.workspace_id=workspace and m.user_id=p_user_id and m.role='owner' for share of m,w;
 if not found then raise exception 'collection_owner_required';end if;
 select * into a from public.accounts where workspace_id=workspace and billing_home_kind='business' for share;
 if a.id is null or a.stripe_customer_id is null then raise exception 'governed_money_not_configured';end if;
 select * into price from public.platform_collection_prices where version=p_command->>'priceVersion';
 if price.version is null then raise exception 'approved_platform_price_required';end if;
 perform 1 from public.super_admins s join public.users u on u.id=s.user_id and u.verified_at is not null where s.user_id=price.approved_by and s.revoked_at is null for share of s,u;
 if not found then raise exception 'approved_platform_price_required';end if;
 if p_command->>'installationId' is not null then
  perform 1 from public.offering_installations where id=(p_command->>'installationId')::uuid and business_workspace_id=workspace and status='active' and (price.definition_id is null or definition_id=price.definition_id) for share;
  if not found then raise exception 'governed_money_source_required';end if;
 elsif price.definition_id is not null then raise exception 'governed_money_source_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('collection-line:'||line,8815));
 -- Price/exit clocks are checked after every possible wait. Amount/currency
 -- are the exact quote the owner saw; customer ID is never supplied by HTTP.
 if public.workspace_exit_completed(workspace) or price.effective_from>clock_timestamp() or (price.effective_until is not null and price.effective_until<=clock_timestamp()) or price.amount_cents is distinct from (p_command->>'amountCents')::bigint or price.currency is distinct from p_command->>'currency' or (p_command->>'periodStart')::timestamptz is null or not isfinite((p_command->>'periodStart')::timestamptz) or not isfinite((p_command->>'periodEnd')::timestamptz) or (p_command->>'periodEnd')::timestamptz<=(p_command->>'periodStart')::timestamptz or line::uuid is null then raise exception 'governed_money_changed';end if;
 perform public.accept_platform_collection_terms(workspace,p_user_id,p_verified_email,line,price.amount_cents,price.currency,a.stripe_customer_id,price.version,(p_command->>'installationId')::uuid);
 perform public.freeze_platform_collection_period(line,p_user_id,p_verified_email,(p_command->>'periodStart')::timestamptz,(p_command->>'periodEnd')::timestamptz);
 select * into t from public.platform_collection_terms where line_id=line;
 select * into period from public.platform_collection_periods where line_id=line;
 if t.accepted_by is distinct from p_user_id then raise exception 'governed_money_conflict';end if;
 return jsonb_build_object('lineId',t.line_id,'workspaceId',t.business_workspace_id,'priceVersion',t.agreement_version,'amountCents',t.amount_cents,'currency',t.currency,'installationId',t.installation_id,'acceptedBy',t.accepted_by,'acceptedAt',t.accepted_at,'periodStart',period.period_start,'periodEnd',period.period_end);
end $$;

create function public.register_governed_creator_listing(p_user_id uuid,p_verified_email text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace uuid:=(p_command->>'workspaceId')::uuid; revision uuid:=(p_command->>'sourceRevisionId')::uuid; definition text; listing jsonb;
begin
 if jsonb_typeof(p_command) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['agreementVersion','rateReference','sourceRevisionId','workspaceId'] then raise exception 'governed_money_invalid';end if;
 perform 1 from public.users where id=p_user_id and verified_at is not null and lower(btrim(email))=lower(btrim(p_verified_email)) for share;
 if not found then raise exception 'governed_money_denied';end if;
 perform public.connect_assert_manager(workspace,p_user_id,p_verified_email);
 -- Only the actual existing source registry chooses its definition identity.
 -- An arbitrary definition ID cannot be paired with somebody else's revision.
 select s.definition_id into definition from public.offering_package_sources s join public.system_version_source_revisions r on r.id=s.source_revision_id where r.id=revision and r.creator_workspace_id=workspace for share of r,s;
 if definition is null then raise exception 'governed_money_source_required';end if;
 if not public.lock_system_revision_qualification(revision) then raise exception 'creator_listing_unqualified';end if;
 perform 1 from public.money_agreements where beneficiary_workspace_id=workspace and kind='creator' and version=p_command->>'agreementVersion' and rate_reference=p_command->>'rateReference' and effective_from<=clock_timestamp() and (effective_until is null or effective_until>clock_timestamp());
 if not found then raise exception 'approved_creator_agreement_required';end if;
 if public.workspace_exit_completed(workspace) then raise exception 'governed_money_denied';end if;
 listing:=public.register_creator_listing(definition,revision,workspace,p_user_id,p_verified_email,p_command->>'agreementVersion',p_command->>'rateReference');
 return jsonb_build_object('id',listing->'id','creatorWorkspaceId',listing->'creator_workspace_id','sourceRevisionId',listing->'source_revision_id','definitionId',listing->'definition_id','agreementVersion',listing->'agreement_version','rateReference',listing->'rate_reference');
end $$;

create function public.assert_governed_payout_dispatch(p_payout_id uuid,p_user_id uuid,p_verified_email text,p_profile_version text,p_recipient text,p_charge text,p_amount bigint,p_currency text,p_available bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare payout public.split_payouts; authorization public.split_payout_authorizations; receipt public.split_transfer_receipts; recipient public.connected_accounts; split public.revenue_splits; started timestamptz; remaining bigint;
begin
 select * into authorization from public.split_payout_authorizations where payout_id=p_payout_id;
 -- Lock both actual operator identities in the same order before any payout
 -- row. Configuration takes its operator lock before that same payout row.
 perform 1 from public.users where id in(p_user_id,authorization.approved_by) order by id for share;
 perform 1 from public.super_admins where user_id in(p_user_id,authorization.approved_by) order by user_id for share;
 select * into payout from public.split_payouts where id=p_payout_id for update;
 if payout.id is null or payout.source_account_id<>'platform' or payout.recipient_account_id is distinct from p_recipient or payout.source_transaction is distinct from p_charge or payout.amount_cents is distinct from p_amount or payout.currency is distinct from p_currency then raise exception 'governed_money_changed';end if;
 -- An accepted effect is an observation/recovery job. It is not a new grant
 -- to create a transfer, and its historical receipt survives later revocation.
 select * into receipt from public.split_transfer_receipts where payout_id=payout.id;
 if receipt.payout_id is not null then return to_jsonb(payout)||jsonb_build_object('transfer_id',receipt.transfer_id);end if;
 if not exists(select 1 from public.users u join public.super_admins s on s.user_id=u.id where u.id=p_user_id and u.verified_at is not null and lower(btrim(u.email))=lower(btrim(p_verified_email)) and lower(btrim(s.email))=lower(btrim(p_verified_email)) and s.revoked_at is null) or authorization.payout_id is null or authorization.profile_version is distinct from p_profile_version or not exists(select 1 from public.users u join public.super_admins s on s.user_id=u.id where u.id=authorization.approved_by and u.verified_at is not null and lower(btrim(u.email))=lower(btrim(s.email)) and s.revoked_at is null) then raise exception 'governed_money_denied';end if;
 -- Existing loss/reconciliation and reservation writers use these source
 -- locks. Current accrual and source capacity are checked after both waits.
 perform pg_advisory_xact_lock(hashtextextended('platform:'||p_charge,8811));
 perform pg_advisory_xact_lock(hashtextextended('platform:'||p_charge,8814));
 select * into split from public.revenue_splits where id=payout.split_id for share;
 select * into recipient from public.connected_accounts where workspace_id=split.beneficiary_workspace_id and stripe_account_id=p_recipient for share;
 if recipient.workspace_id is null or recipient.state<>'ready' or recipient.profile_version is distinct from p_profile_version or not 'recipient'=any(recipient.configurations) or recipient.capabilities#>>'{recipient,capabilities,stripe_balance,stripe_transfers,status}' is distinct from 'active' then raise exception 'governed_money_not_configured';end if;
 select split.amount_cents+coalesce(sum(amount_cents),0) into remaining from public.revenue_splits where original_split_id=split.id;
 select started_at into started from public.split_transfer_attempts where payout_id=payout.id;
 if remaining is distinct from payout.amount_cents or split.source_account_id<>'platform' or split.source_charge_id is distinct from p_charge or split.currency is distinct from p_currency or split.agreement_version is distinct from payout.agreement_version then raise exception 'payout_accrual_changed';end if;
 if started is null or started<clock_timestamp()-interval '23 hours' then raise exception 'payout_attempt_requires_reconciliation';end if;
 if p_available is null or p_available<0 or (select coalesce(sum(amount_cents),0) from public.split_payouts where source_account_id='platform' and source_transaction=p_charge)>p_available then raise exception 'payout_source_balance_changed';end if;
 return to_jsonb(payout);
end $$;

do $$declare f regprocedure;begin foreach f in array array['public.record_governed_money_configuration(uuid,text,jsonb)'::regprocedure,'public.read_governed_money_preparation(uuid,uuid,text)'::regprocedure,'public.prepare_governed_collection_terms(uuid,text,jsonb)'::regprocedure,'public.register_governed_creator_listing(uuid,text,jsonb)'::regprocedure,'public.read_governed_money_configuration(uuid,uuid,text)'::regprocedure,'public.assert_governed_payout_dispatch(uuid,uuid,text,text,text,text,bigint,text,bigint)'::regprocedure] loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f);execute format('grant execute on function %s to service_role',f);end loop;end$$;
do $canonical_governed_money$
declare expected record; p record; migrator oid:=(current_user::regrole)::oid;
begin
 for expected in select * from (values
 ('public.record_governed_money_configuration(uuid,text,jsonb)','c50a9dbfea6cd8fb74158f9c3131306e','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.read_governed_money_configuration(uuid,uuid,text)','cb48f96fadd0536308c1cdf9784145cd','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.read_governed_money_preparation(uuid,uuid,text)','069ebd4ec0274185bf97814ea64f6523','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.prepare_governed_collection_terms(uuid,text,jsonb)','d76caf2ab026b72931ce6af8570b7d36','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.register_governed_creator_listing(uuid,text,jsonb)','3971564a6293d3f7aba4c51a37d3b5c2','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.assert_governed_payout_dispatch(uuid,uuid,text,text,text,text,bigint,text,bigint)','7040fc98259767dea0a2b4a82a4a634a','v',array['p_payout_id','p_user_id','p_verified_email','p_profile_version','p_recipient','p_charge','p_amount','p_currency','p_available']::text[])) v(signature,source_hash,volatility,arg_names) loop
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=split_part(split_part(expected.signature,'.',2),'(',1))<>1 then raise exception 'governed_money_catalog_drift';end if;
  select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure(expected.signature);
  if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile::text<>expected.volatility or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from expected.arg_names or p.pronargs<>cardinality(expected.arg_names) or md5(p.prosrc)<>expected.source_hash then raise exception 'governed_money_catalog_drift';end if;
  if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=('service_role'::regrole)::oid) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in(migrator,('service_role'::regrole)::oid)) then raise exception 'governed_money_acl_drift';end if;
 end loop;
end $canonical_governed_money$;
notify pgrst,'reload schema';
commit;
