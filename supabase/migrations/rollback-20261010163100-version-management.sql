begin;
set local lock_timeout='2s';
-- Disable the Systems release first. Retain '*' restoration drafts/history;
-- do not restore the old check until these are explicitly reconciled.
drop function if exists public.create_version_system_command(uuid,text,jsonb,text,text,uuid);
drop function if exists public.read_version_binding_choices(uuid,uuid,text);
commit;
