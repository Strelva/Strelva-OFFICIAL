begin;
set local lock_timeout = '3s';
drop function if exists public.read_owner_decision_source_for_delivery(uuid,text,text);
commit;
