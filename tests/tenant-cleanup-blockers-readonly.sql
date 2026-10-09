\set ON_ERROR_STOP on
-- Requires the preceding fixture persisted with keep_fixture=true in the
-- coordinator's disposable DB. No setup, lock, pause or write in this reader.
begin read only;
set local role service_role;
do $$ begin
 if not exists(select 1 from public.tenant_cleanup_teardown_blockers('cleanup-booking-only')
   where publications=0 and reservations=0 and booking_grants=1 and bookings=0)
 then raise exception 'cleanup_booking_only_readonly_failed'; end if;
 if exists(select 1 from public.tenant_cleanup_teardown_blockers('cleanup-other')
   where publications+reservations+booking_grants+bookings<>0)
 then raise exception 'cleanup_other_tenant_readonly_failed'; end if;
 if has_function_privilege('authenticated','public.tenant_cleanup_teardown_blockers(text)','execute')
   or has_function_privilege('anon','public.tenant_cleanup_teardown_blockers(text)','execute')
 then raise exception 'cleanup_blocker_public_authority_widened'; end if;
end $$;
rollback;
