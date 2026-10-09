-- Prepared operator rollback, never an automatic recovery or credential replay.
-- Refuse populated lifecycle records and any source drift before touching objects.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
select pg_advisory_xact_lock(771904091);
do $$ declare prior record; begin
 if exists(select 1 from public.native_google_disconnect_receipts) or exists(select 1 from public.native_google_oauth_attempts) then raise exception 'native_google_rollback_populated_review_required'; end if;
 for prior in select * from public.native_google_lifecycle_prior_functions loop
  if md5(pg_get_functiondef(to_regprocedure(prior.signature))) is distinct from prior.applied_hash then raise exception 'native_google_rollback_source_drift'; end if;
 end loop;
 for prior in select * from public.native_google_lifecycle_prior_functions loop execute prior.definition; end loop;
end $$;
drop trigger native_google_legacy_credential_fence on public.tenant_client_records;
drop trigger native_google_legacy_lock on public.tenant_client_records;
drop trigger native_google_disconnect_fence on public.workspace_account_bindings;
drop trigger native_google_disconnect_lock on public.workspace_account_bindings;
drop function public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb);
drop function public.native_google_legacy_credential_fence();
drop function public.native_google_disconnect_fence();
drop function public.native_google_disconnect_lock();
drop table public.native_google_lifecycle_prior_functions;
drop table public.native_google_disconnect_receipts;
drop table public.native_google_oauth_attempts;
commit;
