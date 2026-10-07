begin;
set local lock_timeout='2s';
drop function if exists public.create_workspace_manual_booking(uuid,text,uuid,text,jsonb), public.read_workspace_manual_booking_context(uuid,text,uuid,text);
commit;
