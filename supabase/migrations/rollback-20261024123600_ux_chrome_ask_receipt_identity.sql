-- Retain all saved receipt identity. Rollback stops future capture only.
begin;
set local lock_timeout = '3s';
drop trigger ask_request_capture_identity on public.service_requests;
drop function public.ask_request_capture_identity();
commit;
