-- Read-only additive projection: no stored customer evidence to discard.
begin;
set local lock_timeout = '3s';
drop function if exists public.read_public_business_verification(text,text);
commit;
