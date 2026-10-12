-- Forward-only. Admission history fences delayed callbacks and the new RPCs
-- become an authority boundary. No qualified inverse/archive contract exists;
-- refuse before touching functions, ACLs, tables or operation history.
begin;
set local lock_timeout='3s';
do $$ begin raise exception 'legacy_google_operation_forward_only'; end $$;
commit;
