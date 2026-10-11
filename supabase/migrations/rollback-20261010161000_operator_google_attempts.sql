-- Disable STRELVA_OPERATOR_QUEUE_RELEASE and stop dispatch first. Retain this
-- evidence table: removing it would allow accepted/uncertain Google retries.
set lock_timeout = '3s';
drop function if exists public.read_operator_google_uncertainty(uuid,text);
drop function if exists public.complete_operator_google_write(uuid,jsonb);
drop function if exists public.begin_operator_google_write(jsonb);
-- operator_google_write_attempts deliberately remains for later reconciliation.
