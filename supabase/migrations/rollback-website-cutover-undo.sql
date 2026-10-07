-- Roll back callable capability; preserve all issued receipts and tables.
begin;
set local lock_timeout='3s';
drop function if exists public.undo_website_linked_cutover(uuid,uuid,uuid,text,text,integer,text,uuid,boolean,boolean);
commit;
