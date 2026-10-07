set lock_timeout = '3s';
-- Disable STRELVA_OPERATOR_QUEUE_RELEASE first; originals remain callable.
drop function if exists public.read_operator_queue_context_v2(uuid,text);
drop function if exists public.read_google_listing_readback_failures_v2(uuid,text);
