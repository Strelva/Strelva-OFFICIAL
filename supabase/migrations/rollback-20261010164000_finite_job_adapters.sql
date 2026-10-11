-- Turn STRELVA_FINITE_JOBS_RELEASE and STRELVA_APPROVAL_STORE_RELEASE off
-- before rollback. Native records and all commands are unaffected.
begin;
set local lock_timeout = '3s';
drop function if exists public.read_finite_job_sources(uuid,text,uuid);
-- Keep disabled release flag names and their audit history. Deleting these
-- would require bypassing immutable history, with no operational benefit.
commit;
