-- Additive recovery state: legacy claims stay NULL and keep their old behavior.
-- unknown means a registration could have been accepted; automatic retries may
-- inspect it but cannot submit it again. Only a definite rejection or a saved
-- not_submitted intent permits a fresh registration after provider lookup.
alter table public.domain_claims add column registration_attempt text
  check (registration_attempt in ('not_submitted','unknown','rejected','confirmed'));
