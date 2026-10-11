-- Rollback for 20261001120000_website_documents.sql
-- Forward SHA-256: d8ac38ab2e1d130444908d892dffe4172aba4b4656408f1417a7cd7d72de06f5
-- Batch 2: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.prune_website_crawl_pages()')))) is distinct from '71ae923757efe5609cb9b348b656fa71' then raise exception 'rollback_wrong_order_or_function_drift: prune_website_crawl_pages'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_document_immutable()')))) is distinct from '2e1423bc3bc474f63181d0340cb8894a' then raise exception 'rollback_wrong_order_or_function_drift: website_document_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_crawl_page_immutable()')))) is distinct from '4712223afaf521bb2da2ba7ba769e286' then raise exception 'rollback_wrong_order_or_function_drift: website_crawl_page_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_published_website_documents(text)')))) is distinct from '673760de0aba010e915584894af5e4bf' then raise exception 'rollback_wrong_order_or_function_drift: read_published_website_documents'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.export_workspace_snapshot(uuid,uuid,text)')))) is distinct from '38ffddaf2c4621a32379a10b46da8a1b' then raise exception 'rollback_wrong_order_or_function_drift: export_workspace_snapshot'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.manage_website_document(uuid,uuid,uuid,text)')))) is distinct from 'a39c3b8b026ffbac3fa89c5e6190864f' then raise exception 'rollback_wrong_order_or_function_drift: manage_website_document'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_website_crawl_pages(uuid,uuid,uuid,text)')))) is distinct from 'd694edb80c9e53dd2fa336fb19961ee3' then raise exception 'rollback_wrong_order_or_function_drift: read_website_crawl_pages'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_document_assert_launch_owner(uuid,uuid)')))) is distinct from '18fd28d5e5b79929928a914f1e252b20' then raise exception 'rollback_wrong_order_or_function_drift: website_document_assert_launch_owner'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_website_document_receipts(uuid,uuid,uuid,text)')))) is distinct from '86064b0f0f2c94e35124cd420a26ba50' then raise exception 'rollback_wrong_order_or_function_drift: read_website_document_receipts'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.retain_website_crawl_page(uuid,uuid,uuid,text,jsonb)')))) is distinct from 'cd9b5dbe81899d5dbcdc8d892015e55a' then raise exception 'rollback_wrong_order_or_function_drift: retain_website_crawl_page'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.manage_published_website_tenant(uuid,uuid,uuid,text,text)')))) is distinct from '66a13668b0a42e9f38899685b0883d9d' then raise exception 'rollback_wrong_order_or_function_drift: manage_published_website_tenant'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.accept_workspace_handoff(text,uuid,text,uuid,text,boolean)')))) is distinct from 'e4a76a953d5da33b6f6cb1b5dd6224c6' then raise exception 'rollback_wrong_order_or_function_drift: accept_workspace_handoff'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.approve_website_document(uuid,uuid,uuid,text,integer,text)')))) is distinct from 'f3a46fa32adbc4b3e8536c32e86fd0e3' then raise exception 'rollback_wrong_order_or_function_drift: approve_website_document'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.claim_website_rebuild(uuid,uuid,text,text,text,jsonb,jsonb)')))) is distinct from '62e7601ad34971b8b49eabb6eed95394' then raise exception 'rollback_wrong_order_or_function_drift: claim_website_rebuild'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_website_documents(uuid,uuid,uuid,text,integer,boolean)')))) is distinct from '73b786618513c0b40ec75181293992e9' then raise exception 'rollback_wrong_order_or_function_drift: read_website_documents'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.append_website_document(uuid,uuid,uuid,text,integer,text,jsonb)')))) is distinct from '803fb50c485ebdd437b8e74570b1621a' then raise exception 'rollback_wrong_order_or_function_drift: append_website_document'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.export_workspace_snapshot_pre_website_documents(uuid,uuid,text)')))) is distinct from '58ed5fff6c88176a16e5c61f7a100cba' then raise exception 'rollback_wrong_order_or_function_drift: export_workspace_snapshot_pre_website_documents'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_document_assert_actor(uuid,uuid,uuid,text,boolean,boolean)')))) is distinct from 'b5d239859a4fb28322b6971a9402f196' then raise exception 'rollback_wrong_order_or_function_drift: website_document_assert_actor'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)')))) is distinct from 'ba06782b5edaf981cffab3507091d51e' then raise exception 'rollback_wrong_order_or_function_drift: update_bounded_product_work'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text)')))) is distinct from '3c23ebd4dcb7f4ab3d9e176fb2a2507c' then raise exception 'rollback_wrong_order_or_function_drift: reserve_website_hosted_tenant'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb)')))) is distinct from 'c80422dd35b70e30fb869949b415693c' then raise exception 'rollback_wrong_order_or_function_drift: publish_website_document'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.accept_workspace_handoff_pre_website_documents(text,uuid,text,uuid,text,boolean)')))) is distinct from 'f06258c24c57ffdc63b2e5b3ddef1d98' then raise exception 'rollback_wrong_order_or_function_drift: accept_workspace_handoff_pre_website_documents'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.commit_website_document_candidate(uuid,uuid,uuid,text,integer,integer,text,jsonb,jsonb)')))) is distinct from '7fbb28d0b68c36d24bcee93221756571' then raise exception 'rollback_wrong_order_or_function_drift: commit_website_document_candidate'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_website_document_health(uuid,uuid,integer,text,timestamp with time zone,text,text)')))) is distinct from 'dacf32953ab5bfd23ca02c216572ea0b' then raise exception 'rollback_wrong_order_or_function_drift: record_website_document_health'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_document_publications') and attnum>0 and not attisdropped) <> 7 then raise exception 'rollback_wrong_order_or_table_drift: website_document_publications'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_document_receipts') and attnum>0 and not attisdropped) <> 6 then raise exception 'rollback_wrong_order_or_table_drift: website_document_receipts'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_document_health') and attnum>0 and not attisdropped) <> 7 then raise exception 'rollback_wrong_order_or_table_drift: website_document_health'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_crawl_pages') and attnum>0 and not attisdropped) <> 8 then raise exception 'rollback_wrong_order_or_table_drift: website_crawl_pages'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_hosted_tenant_reservations') and attnum>0 and not attisdropped) <> 6 then raise exception 'rollback_wrong_order_or_table_drift: website_hosted_tenant_reservations'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_document_heads') and attnum>0 and not attisdropped) <> 7 then raise exception 'rollback_wrong_order_or_table_drift: website_document_heads'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_documents') and attnum>0 and not attisdropped) <> 7 then raise exception 'rollback_wrong_order_or_table_drift: website_documents'; end if;
end;
$rollback_guard$;
lock table public."website_crawl_pages", public."website_document_heads", public."website_document_health", public."website_document_publications", public."website_document_receipts", public."website_documents", public."website_hosted_tenant_reservations" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261001120000_website_crawl_pages" as table public."website_crawl_pages";
revoke all on release_rollback_archive."m20261001120000_website_crawl_pages" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261001120000_website_document_heads" as table public."website_document_heads";
revoke all on release_rollback_archive."m20261001120000_website_document_heads" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261001120000_website_document_health" as table public."website_document_health";
revoke all on release_rollback_archive."m20261001120000_website_document_health" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261001120000_website_document_publications" as table public."website_document_publications";
revoke all on release_rollback_archive."m20261001120000_website_document_publications" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261001120000_website_document_receipts" as table public."website_document_receipts";
revoke all on release_rollback_archive."m20261001120000_website_document_receipts" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261001120000_website_documents" as table public."website_documents";
revoke all on release_rollback_archive."m20261001120000_website_documents" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261001120000_website_hosted_tenant_reservations" as table public."website_hosted_tenant_reservations";
revoke all on release_rollback_archive."m20261001120000_website_hosted_tenant_reservations" from public, anon, authenticated, service_role;
drop trigger "website_document_immutable_trg" on public."website_documents";
drop trigger "website_crawl_page_immutable_trg" on public."website_crawl_pages";
drop trigger "website_document_receipt_immutable_trg" on public."website_document_receipts";
alter table public."website_documents" drop constraint "website_documents_document_check";
alter table public."website_documents" drop constraint "website_documents_revision_check";
alter table public."website_documents" drop constraint "website_documents_content_hash_check";
alter table public."website_crawl_pages" drop constraint "website_crawl_pages_source_id_check";
alter table public."website_crawl_pages" drop constraint "website_crawl_pages_html_bytes_check";
alter table public."website_document_health" drop constraint "website_document_health_status_check";
alter table public."website_document_health" drop constraint "website_document_health_content_hash_check";
alter table public."website_document_health" drop constraint "website_document_health_observed_hash_check";
drop function public.prune_website_crawl_pages();
drop function public.website_document_immutable();
drop function public.website_crawl_page_immutable();
drop function public.read_published_website_documents(text);
drop function public.manage_website_document(uuid,uuid,uuid,text);
drop function public.read_website_crawl_pages(uuid,uuid,uuid,text);
drop function public.website_document_assert_launch_owner(uuid,uuid);
drop function public.read_website_document_receipts(uuid,uuid,uuid,text);
drop function public.retain_website_crawl_page(uuid,uuid,uuid,text,jsonb);
drop function public.manage_published_website_tenant(uuid,uuid,uuid,text,text);
drop function public.approve_website_document(uuid,uuid,uuid,text,integer,text);
drop function public.claim_website_rebuild(uuid,uuid,text,text,text,jsonb,jsonb);
drop function public.read_website_documents(uuid,uuid,uuid,text,integer,boolean);
drop function public.append_website_document(uuid,uuid,uuid,text,integer,text,jsonb);
drop function public.export_workspace_snapshot_pre_website_documents(uuid,uuid,text);
drop function public.website_document_assert_actor(uuid,uuid,uuid,text,boolean,boolean);
drop function public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text);
drop function public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb);
drop function public.accept_workspace_handoff_pre_website_documents(text,uuid,text,uuid,text,boolean);
drop function public.commit_website_document_candidate(uuid,uuid,uuid,text,integer,integer,text,jsonb,jsonb);
drop function public.record_website_document_health(uuid,uuid,integer,text,timestamp with time zone,text,text);
drop table public."website_crawl_pages", public."website_document_heads", public."website_document_health", public."website_document_publications", public."website_document_receipts", public."website_documents", public."website_hosted_tenant_reservations";
CREATE OR REPLACE FUNCTION public.export_workspace_snapshot(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  result jsonb;
  result_size integer;
  receipt_id uuid;
begin
  result := public.export_workspace_snapshot_base(p_workspace_id, p_user_id, p_verified_email);
  receipt_id := (result->>'exportId')::uuid;
  result := jsonb_set(
    result,
    '{manifest,unavailable}',
    (result#>'{manifest,unavailable}') || jsonb_build_array(
      jsonb_build_object(
        'category', 'custom_application_artifacts_and_releases',
        'reason', 'Custom application source and built artifacts require a separate authorized transfer.'
      ),
      jsonb_build_object(
        'category', 'calendar_connections_and_event_receipts',
        'reason', 'Calendar credentials and provider event receipts are excluded from portability.'
      ),
      jsonb_build_object(
        'category', 'inquiry_records_and_followups',
        'reason', 'Inquiry routing and follow-up records use a separate tenant-authorized export.'
      ),
      jsonb_build_object(
        'category', 'offering_installations_and_provider_delivery',
        'reason', 'Offering and provider-delivery records are outside this workspace snapshot.'
      )
    ),
    true
  );
  result_size := octet_length(result::text);
  if result_size > 2000000 then
    delete from public.workspace_export_receipts where id = receipt_id;
    raise exception 'workspace_export_too_large';
  end if;
  update public.workspace_export_receipts
  set byte_size = result_size
  where id = receipt_id;
  return result;
end;
$function$
;
revoke all on function public.export_workspace_snapshot(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.export_workspace_snapshot(uuid,uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.accept_workspace_handoff(p_token_hash text, p_user_id uuid, p_verified_email text, p_customer_workspace_id uuid, p_customer_workspace_name text, p_allow_agency_access boolean)
 RETURNS TABLE(handoff_id uuid, customer_workspace_id uuid, customer_work_id uuid, delegation_id uuid, already_accepted boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  h public.workspace_handoffs%rowtype;
  source_work public.saved_product_work%rowtype;
  customer_id uuid;
  copied_id uuid;
  delegated_id uuid;
  normalized_email text := lower(btrim(p_verified_email));
  customer_name text := btrim(coalesce(p_customer_workspace_name, ''));
begin
  select * into h from public.workspace_handoffs
    where token_hash = p_token_hash for update;
  if not found then raise exception 'handoff_not_found'; end if;

  -- Identity invariants precede the idempotent accepted return. Possessing an
  -- accepted token never lets an unverified or different identity replay it.
  if h.recipient_email <> normalized_email then raise exception 'handoff_recipient_mismatch'; end if;
  perform 1 from public.users u where u.id = p_user_id
    and lower(u.email) = normalized_email and u.verified_at is not null for update;
  if not found then raise exception 'verified_identity_required'; end if;

  if h.status = 'accepted' then
    if h.accepted_by <> p_user_id then raise exception 'handoff_already_claimed'; end if;
    -- Replays are actor-bound and destination-bound. A retry may return the
    -- original copy, but it cannot select or create another business. A lost
    -- response can safely retry the same named-new-business request.
    if h.accepted_destination_kind = 'new' then
      if p_customer_workspace_id is not null
        or p_customer_workspace_name is null
        or btrim(p_customer_workspace_name) <> h.accepted_destination_name then
        raise exception 'handoff_destination_changed';
      end if;
    elsif h.accepted_destination_kind = 'existing' then
      if p_customer_workspace_id is null
        or p_customer_workspace_id <> h.customer_workspace_id
        or p_customer_workspace_name is not null then
        raise exception 'handoff_destination_changed';
      end if;
    elsif p_customer_workspace_id is null
      or p_customer_workspace_id <> h.customer_workspace_id
      or p_customer_workspace_name is not null then
      -- Defensive path for a pre-migration row that could not be backfilled.
      raise exception 'handoff_destination_changed';
    end if;
    perform 1 from public.workspaces w
      join public.workspace_memberships m on m.workspace_id = w.id
      where w.id = h.customer_workspace_id
        and w.kind = 'customer' and m.user_id = p_user_id
      for update;
    if not found then raise exception 'handoff_destination_membership_required'; end if;
    return query select h.id, h.customer_workspace_id, h.customer_work_id,
      h.delegation_id, true;
    return;
  end if;

  if h.status = 'revoked' then raise exception 'handoff_revoked'; end if;
  if h.status <> 'pending' or h.expires_at <= now() then raise exception 'handoff_expired'; end if;

  if p_customer_workspace_id is null and p_customer_workspace_name is null then
    raise exception 'handoff_destination_required';
  end if;
  if p_customer_workspace_id is not null and p_customer_workspace_name is not null then
    raise exception 'handoff_destination_invalid';
  end if;

  select * into source_work from public.saved_product_work where id = h.source_work_id;
  if not found or source_work.workspace_id <> h.agency_workspace_id then
    raise exception 'handoff_source_invalid';
  end if;
  -- Native applications have separate definition, release, record and grant
  -- lifecycles. The generic handoff copier cannot install those safely, so an
  -- old pending token must fail before it creates a destination or copy.
  if source_work.product_id = 'applications' or source_work.resource_kind = 'application' then
    raise exception 'handoff_product_unsupported';
  end if;

  if p_customer_workspace_id is not null then
    -- A destination ID is valid only when this actor is still a member of an
    -- existing customer workspace. This check runs inside the acceptance
    -- transaction so a stale preview cannot redirect the copy elsewhere.
    select w.id into customer_id from public.workspaces w
      join public.workspace_memberships m on m.workspace_id = w.id
      where w.id = p_customer_workspace_id
        and w.kind = 'customer' and m.user_id = p_user_id
      for update;
    if customer_id is null then raise exception 'handoff_destination_membership_required'; end if;
    -- Keep the requested destination kind with the accepted handoff so the
    -- same request can be replayed if its response is lost.
  else
    if char_length(customer_name) not between 1 and 120 then
      raise exception 'handoff_destination_invalid';
    end if;
    if (select count(*) from public.workspaces where created_by = p_user_id) >= 5 then
      raise exception 'workspace_limit_reached';
    end if;
    insert into public.workspaces (kind, name, created_by)
      values ('customer', customer_name, p_user_id)
      returning id into customer_id;
    insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
      values (customer_id, p_user_id, 'owner', p_user_id);
  end if;

  -- A copied tracker belongs to a different workspace. Source assignments,
  -- related work links, and their undo receipts cannot cross that boundary.
  -- Change only this local copy; keep the source and ordinary cell history.
  if source_work.product_id = 'tracker' and source_work.resource_kind = 'tracker' then
    if jsonb_typeof(source_work.payload->'tracker'->'rows') is distinct from 'array'
      or jsonb_typeof(source_work.payload->'tracker'->'history') is distinct from 'array' then
      raise exception 'handoff_source_invalid';
    end if;
    source_work.payload := jsonb_set(source_work.payload, '{tracker,rows}', (
      select coalesce(jsonb_agg(record.value - 'coordination' order by record.ordinality), '[]'::jsonb)
      from jsonb_array_elements(source_work.payload->'tracker'->'rows') with ordinality as record(value, ordinality)
    ));
    source_work.payload := jsonb_set(source_work.payload, '{tracker,history}', (
      select coalesce(jsonb_agg(receipt.value order by receipt.ordinality), '[]'::jsonb)
      from jsonb_array_elements(source_work.payload->'tracker'->'history') with ordinality as receipt(value, ordinality)
      where not (receipt.value ? 'coordinationChanges')
    ));
  end if;
  insert into public.saved_product_work (
    workspace_id, product_id, resource_kind, title, payload, input,
    source_work_id, created_by
  ) values (
    customer_id, source_work.product_id, source_work.resource_kind,
    source_work.title, source_work.payload, source_work.input,
    source_work.id, p_user_id
  ) returning id into copied_id;

  if p_allow_agency_access then
    insert into public.workspace_delegations (
      customer_workspace_id, customer_work_id, agency_workspace_id, scope, granted_by, accepted_by
    ) values (
      customer_id, copied_id, h.agency_workspace_id, array['work:read']::text[], p_user_id, p_user_id
    ) returning id into delegated_id;
  end if;

  update public.workspace_handoffs set
    status = 'accepted', accepted_by = p_user_id, accepted_at = now(),
    customer_workspace_id = customer_id, customer_work_id = copied_id,
    delegation_id = delegated_id,
    accepted_destination_kind = case when p_customer_workspace_id is null then 'new' else 'existing' end,
    accepted_destination_name = case when p_customer_workspace_id is null then customer_name else null end
  where id = h.id;

  return query select h.id, customer_id, copied_id, delegated_id, false;
end;
$function$
;
revoke all on function public.accept_workspace_handoff(text,uuid,text,uuid,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.accept_workspace_handoff(text,uuid,text,uuid,text,boolean) to "service_role";
CREATE OR REPLACE FUNCTION public.update_bounded_product_work(p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_product_id text, p_expected_revision integer, p_payload jsonb)
 RETURNS SETOF saved_product_work
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare existing public.saved_product_work; latest jsonb;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  -- Serialize website mutations with the workspace exit command. The row lock
  -- matches complete_workspace_exit's workspace lock; the advisory key also
  -- keeps this boundary in the workspace-wide lock family used by other
  -- customer-owned transitions.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
  perform 1 from public.workspaces where id=p_workspace_id for update;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or p_product_id is null or p_product_id not in ('applications','scheduling','investigations','websites') or existing.product_id is distinct from p_product_id then raise exception 'workspace_access_denied'; end if;
  if p_product_id = 'websites' and public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647 then raise exception 'bounded_payload_invalid'; end if;
  if existing.payload->>'revision' is distinct from p_expected_revision::text then raise exception 'bounded_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>2000000
    or jsonb_typeof(p_payload->'version') is distinct from 'number'
    or jsonb_typeof(p_payload->'revision') is distinct from 'number'
    or p_payload->>'version' is distinct from '1'
    or p_payload->>'revision' is distinct from (p_expected_revision+1)::text
    or jsonb_typeof(p_payload->'title') is distinct from 'string'
    or char_length(p_payload->>'title') not between 1 and 160
    or p_payload->'createdBy' is distinct from existing.payload->'createdBy'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or jsonb_typeof(existing.payload->'history') is distinct from 'array' then raise exception 'bounded_payload_invalid'; end if;
  if jsonb_array_length(p_payload->'history')<>jsonb_array_length(existing.payload->'history')+1
    or jsonb_array_length(p_payload->'history')>500
    or ((p_payload->'history')-(jsonb_array_length(p_payload->'history')-1)) is distinct from existing.payload->'history' then raise exception 'bounded_payload_invalid'; end if;
  latest := p_payload->'history'->(jsonb_array_length(p_payload->'history')-1);
  if jsonb_typeof(latest->'revision') is distinct from 'number'
    or latest->>'revision' is distinct from (p_expected_revision+1)::text
    or latest->>'actorId' is distinct from p_user_id::text
    or coalesce(latest->>'kind','')=''
    or coalesce(latest->>'at','')='' then raise exception 'bounded_payload_invalid'; end if;
  return query update public.saved_product_work set payload=p_payload,title=p_payload->>'title',updated_at=clock_timestamp() where id=p_work_id returning *;
end $function$
;
revoke all on function public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb) to "service_role";
commit;
