begin;
set local lock_timeout = '2s';
drop function if exists public.mark_workspace_booking_no_show(uuid,uuid,text,text,text);
drop function if exists public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date);
commit;
