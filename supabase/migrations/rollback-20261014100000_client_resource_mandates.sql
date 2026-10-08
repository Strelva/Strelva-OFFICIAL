-- Rollback for 20261014100000_client_resource_mandates.sql
-- Forward SHA-256: 07fc4948ba20fb23a14a75908b96da10d3112d7b0e286fb927f803c91dead039
-- Agency 1.0 #255. Undo 20261014112000 first; undo every later file first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.client_resource_kinds(text)')))) is distinct from '5d7db12b83003a92a62a40d2a3012825' then raise exception 'rollback_wrong_order_or_function_drift: client_resource_kinds'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.client_resource_ref(text,text)')))) is distinct from 'd765a2ab765f7d8b19c6965648ac745f' then raise exception 'rollback_wrong_order_or_function_drift: client_resource_ref'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.client_resource_mandate_guard()')))) is distinct from 'cfda7734a7413a6932f7c13210a1e121' then raise exception 'rollback_wrong_order_or_function_drift: client_resource_mandate_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.provider_seat_end_mandates()')))) is distinct from '5d35c26ef47cf8568eb0c1a4cb3d5bf1' then raise exception 'rollback_wrong_order_or_function_drift: provider_seat_end_mandates'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.client_resource_mandate_json(client_resource_mandates)')))) is distinct from '6d808d6e8bb15c7591b0b8cbf3ceaee2' then raise exception 'rollback_wrong_order_or_function_drift: client_resource_mandate_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.client_resource_assert(text,text,text)')))) is distinct from '6b35e2cebe588d39215efe34b27c8f5d' then raise exception 'rollback_wrong_order_or_function_drift: client_resource_assert'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.acting_provider_check(uuid,uuid,text,text,text)')))) is distinct from '795281197290dc57dfc9b81467f17c28' then raise exception 'rollback_wrong_order_or_function_drift: acting_provider_check'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.acting_provider(uuid,uuid,text,text,text)')))) is distinct from '8a0f306f1e0fd666f50d9192a0d4d9fc' then raise exception 'rollback_wrong_order_or_function_drift: acting_provider'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.acting_provider_assert(uuid,uuid,text,text,text)')))) is distinct from 'e91332571efca552f280c01bedf37436' then raise exception 'rollback_wrong_order_or_function_drift: acting_provider_assert'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.assert_acting_provider(uuid,uuid,text,text,text,text)')))) is distinct from '7bbd3a63a5ecc626e49de93d33b13415' then raise exception 'rollback_wrong_order_or_function_drift: assert_acting_provider'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.platform_provider_for_resource(uuid,uuid,text,text,text)')))) is distinct from '4299c5d8770b819d31db078b8da2457b' then raise exception 'rollback_wrong_order_or_function_drift: platform_provider_for_resource'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.provider_email_send_allowed(uuid,uuid,text)')))) is distinct from '5d3019753969348c9f78f57ec217ad26' then raise exception 'rollback_wrong_order_or_function_drift: provider_email_send_allowed'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.client_resource_website_belongs(uuid,text)')))) is distinct from 'c0ed48fb1680caf30a38c059b49f4d07' then raise exception 'rollback_wrong_order_or_function_drift: client_resource_website_belongs'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.client_resource_mandate_insert(uuid,uuid,text,text,text,text,uuid,text)')))) is distinct from '80d729c7cc71a2aea1a82003818d7e3e' then raise exception 'rollback_wrong_order_or_function_drift: client_resource_mandate_insert'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.grant_client_resource_mandate(uuid,text,uuid,uuid,text,text,text)')))) is distinct from '8cc7018607c7202060fe93dc2a9bcbf0' then raise exception 'rollback_wrong_order_or_function_drift: grant_client_resource_mandate'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_conversion_resource_mandate(text,uuid,uuid,text,text,text,text)')))) is distinct from '50f69c36c8d977bd891eae8907778813' then raise exception 'rollback_wrong_order_or_function_drift: record_conversion_resource_mandate'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.end_client_resource_mandate(uuid,text,uuid,uuid,text)')))) is distinct from '6bb2526c071e29d5fe0e88010cc47c19' then raise exception 'rollback_wrong_order_or_function_drift: end_client_resource_mandate'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_client_resource_mandates(uuid,text,uuid)')))) is distinct from '9bfac84eaa542468c7ab9fe466b9f40a' then raise exception 'rollback_wrong_order_or_function_drift: read_client_resource_mandates'; end if;
  if to_regprocedure('public.needs_you_provider_id(uuid,uuid,text)') is not null then raise exception 'rollback_wrong_order: 20261014112000 is still applied'; end if;
end;
$rollback_guard$;
lock table public."client_resource_mandates" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261014100000_client_resource_mandates" as table public."client_resource_mandates";
revoke all on release_rollback_archive."m20261014100000_client_resource_mandates" from public, anon, authenticated, service_role;
drop trigger provider_seats_end_mandates on public.provider_seats;
drop function public.read_client_resource_mandates(uuid,text,uuid);
drop function public.end_client_resource_mandate(uuid,text,uuid,uuid,text);
drop function public.record_conversion_resource_mandate(text,uuid,uuid,text,text,text,text);
drop function public.grant_client_resource_mandate(uuid,text,uuid,uuid,text,text,text);
drop function public.client_resource_mandate_insert(uuid,uuid,text,text,text,text,uuid,text);
drop function public.client_resource_website_belongs(uuid,text);
drop function public.provider_email_send_allowed(uuid,uuid,text);
drop function public.platform_provider_for_resource(uuid,uuid,text,text,text);
drop function public.assert_acting_provider(uuid,uuid,text,text,text,text);
drop function public.acting_provider_assert(uuid,uuid,text,text,text);
drop function public.acting_provider(uuid,uuid,text,text,text);
drop function public.acting_provider_check(uuid,uuid,text,text,text);
drop function public.client_resource_assert(text,text,text);
drop function public.client_resource_mandate_json(public.client_resource_mandates);
drop table public."client_resource_mandates";
drop function public.client_resource_mandate_guard();
drop function public.provider_seat_end_mandates();
drop function public.client_resource_ref(text,text);
drop function public.client_resource_kinds(text);
commit;
