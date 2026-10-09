\set ON_ERROR_STOP on
-- PREPARED, UNRUN: run after 143 + 1401 + 1402 on an owned disposable schema.
-- Full behavior (unchanged acceptedAt rejection and valid recovery) is exercised
-- by native-google-completed-undo-schema.sql, not replaced by this catalog check.
begin;
do $$
declare body text; receipt jsonb:='{"adapterMode":"live","acceptedAt":"2026-10-09T00:00:00.000Z","providerRef":"fictional","reconciledBy":"provider_lookup"}';
begin
 select prosrc into body from pg_proc where oid='public.save_native_google_recovered_activation(uuid,uuid,text,text,integer,jsonb)'::regprocedure;
 if encode(pg_catalog.sha256(convert_to(body,'UTF8')),'hex') is distinct from '07c4df3b9c602f06b5dd9d78d3bc9f29332dbe852d19bed472c029ec7b0abedf'
  then raise exception 'native_google_recovery_grouping_fixture_source_drift'; end if;
 if ((jsonb_build_object('receipt',receipt)->'receipt')-array['providerRef','reconciledBy'])
  is distinct from '{"adapterMode":"live","acceptedAt":"2026-10-09T00:00:00.000Z"}'::jsonb
  then raise exception 'native_google_recovery_grouping_fixture_receipt_changed'; end if;
end $$;
rollback;
