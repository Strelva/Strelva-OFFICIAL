-- Roll back 20261023143000: drop the read-only budget function.
begin;
drop function public.business_ai_budget(uuid);
commit;
