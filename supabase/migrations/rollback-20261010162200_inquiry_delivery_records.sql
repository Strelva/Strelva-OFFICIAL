begin;
set local lock_timeout = '3s';
drop function public.find_inquiry_delivery_reply_target(text);
-- Preserve durable checkpoint/routing history. Remove inquiry_delivery from
-- STRELVA_CLIENT_RECORDS_READ before rollback; retain its additive constraint.
commit;
