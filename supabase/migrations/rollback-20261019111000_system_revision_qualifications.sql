-- Quarantine this preparatory writer while preserving evidence and read access.
-- Reapplying the forward migration restores its checked service-only writer.
begin;
set local lock_timeout='2s';
revoke all on function public.record_system_revision_qualification(uuid,text,uuid,jsonb,text[],jsonb) from public,anon,authenticated,service_role;
commit;
