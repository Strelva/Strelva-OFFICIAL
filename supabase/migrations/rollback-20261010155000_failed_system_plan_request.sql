begin;
set local lock_timeout = '3s';
drop function if exists public.file_failed_system_plan_request(uuid,uuid,text,text,text);
-- Retain already-filed Requests and their idempotency receipts.
commit;
