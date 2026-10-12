-- Rollback for 20261001140000_agency_website_document_drafts.sql
-- Forward SHA-256: 30edc0cbb56e15294c11b694a8ea87abb19467aedde64f0b5193b3eb61cea371
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_catalog_native_section(text)')))) is distinct from '863b506ad8b33f5335acf0ecbc22a82b' then raise exception 'rollback_wrong_order_or_function_drift: website_catalog_native_section'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_website_document_target(uuid,text,uuid,uuid,text)')))) is distinct from 'e932bc9ef7912c8b91424993238fe228' then raise exception 'rollback_wrong_order_or_function_drift: agency_website_document_target'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_agency_website_document_candidate(uuid,text,uuid,uuid,text,boolean)')))) is distinct from 'a07f742c093561c404e3392114112dea' then raise exception 'rollback_wrong_order_or_function_drift: read_agency_website_document_candidate'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.commit_agency_website_document_candidate(uuid,text,uuid,uuid,text,integer,integer,integer,text,text,jsonb,jsonb,boolean)')))) is distinct from 'a0b3e1c6cd6fe2c9e2a303a7bf76238c' then raise exception 'rollback_wrong_order_or_function_drift: commit_agency_website_document_candidate'; end if;
end;
$rollback_guard$;
drop function public.website_catalog_native_section(text);
drop function public.agency_website_document_target(uuid,text,uuid,uuid,text);
drop function public.read_agency_website_document_candidate(uuid,text,uuid,uuid,text,boolean);
drop function public.commit_agency_website_document_candidate(uuid,text,uuid,uuid,text,integer,integer,integer,text,text,jsonb,jsonb,boolean);
commit;
