\set ON_ERROR_STOP on
-- Run on an owned psql stdin-open session; keep transaction open after marker.
begin;
select public.complete_workspace_exit('d1720000-0000-4000-8000-000000000020','d1720000-0000-4000-8000-000000000002','gm-operator@example.test','cancel','revoke','{"kind":"stop"}','fictional-governed-creator-race-exit',repeat('b',64));
select 'GOVERNED_CREATOR_EXIT_HELD|' || jsonb_build_object('holderPid',pg_backend_pid(),'holderXid',pg_current_xact_id()::text,'workspaceId','d1720000-0000-4000-8000-000000000020')::text;
-- Harness sends COMMIT only after observer proves exact blocked row admission.
