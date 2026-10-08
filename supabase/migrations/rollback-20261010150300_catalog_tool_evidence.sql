-- Disable Systems first. Preserve conflicts; restore the link resolver from
-- 20261010150100 after dropping these readers (that migration is replace-safe).
begin;
set local lock_timeout = '3s';
drop function if exists public.read_catalog_tool_releases(uuid,uuid,text);
drop function if exists public.read_catalog_tool_contact_conflicts(uuid,text);
commit;
