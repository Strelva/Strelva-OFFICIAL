-- Rollback for 20261009152000_agency_verifications.sql
-- Forward SHA-256: 5dfc40731f7a2b8fae9d3c6d782abafdc9d449aa32457c9bcd23062eb19e130f
-- Batch 7A: reverse file order (20261009154000 first); undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_effect_names()')))) is distinct from '662b973906c9f8c462e45ff9ff711e95' then raise exception 'rollback_wrong_order_or_function_drift: agency_effect_names'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_verifications_guard()')))) is distinct from '5414e6457f6d912ab3a539e0c3f172b9' then raise exception 'rollback_wrong_order_or_function_drift: agency_verifications_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_effect_allowed(uuid,text)')))) is distinct from 'b916b9695a671996653b7fe0b90cc826' then raise exception 'rollback_wrong_order_or_function_drift: agency_effect_allowed'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_verification_state(uuid)')))) is distinct from '973a70189fbd305185f28f35d5069e2d' then raise exception 'rollback_wrong_order_or_function_drift: agency_verification_state'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_agency_verification(text,uuid,text,text,jsonb,text)')))) is distinct from 'ba5bc97332fd390dd3e5629657d39a7b' then raise exception 'rollback_wrong_order_or_function_drift: record_agency_verification'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_agency_verification(uuid,text,uuid)')))) is distinct from '1fae73c82772a9cce9a1ad7189fbcc0e' then raise exception 'rollback_wrong_order_or_function_drift: read_agency_verification'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_agency_verification_history(text,uuid)')))) is distinct from '9e2421776d224589bbad5823cd37722c' then raise exception 'rollback_wrong_order_or_function_drift: read_agency_verification_history'; end if;
  if to_regprocedure('public.platform_serving_provider(uuid,text)') is not null then raise exception 'rollback_wrong_order: a later 7A file is still applied'; end if;
end;
$rollback_guard$;
lock table public."agency_verifications" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009152000_agency_verifications" as table public."agency_verifications";
revoke all on release_rollback_archive."m20261009152000_agency_verifications" from public, anon, authenticated, service_role;
drop table public."agency_verifications";
drop function public.read_agency_verification_history(text,uuid);
drop function public.read_agency_verification(uuid,text,uuid);
drop function public.record_agency_verification(text,uuid,text,text,jsonb,text);
drop function public.agency_verification_state(uuid);
drop function public.agency_effect_allowed(uuid,text);
drop function public.agency_verifications_guard();
drop function public.agency_effect_names();
commit;
