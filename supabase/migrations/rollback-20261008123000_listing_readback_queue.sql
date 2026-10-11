-- Rollback for 20261008123000_listing_readback_queue.sql
-- Forward SHA-256: 1566ab25d9e55ec627f0f25f534b8c23cdce97046908b2053601378d188df6d1
-- Batch 5: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_google_listing_readback_failures(uuid,text,integer)')))) is distinct from '677ff21375a12df07237d9c54bb149fa' then raise exception 'rollback_wrong_order_or_function_drift: read_google_listing_readback_failures'; end if;
end;
$rollback_guard$;
drop function public.read_google_listing_readback_failures(uuid,text,integer);
commit;
