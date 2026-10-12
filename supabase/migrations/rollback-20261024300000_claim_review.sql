-- Roll back 20261024300000 (claim review). Refuses once anything was staged,
-- granted before a claim or decided at a claim, so no found fact, pre-claim
-- grant or recorded owner consent is discarded.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.business_found_facts)
    or exists (select 1 from public.agency_client_claim_reviews)
    or exists (select 1 from public.agency_scope_grants where basis <> 'owner') then
    raise exception 'claim_review_rollback_refused: found facts, pre-claim grants or claim reviews exist';
  end if;
end $$;
drop function public.accept_agency_client_claim_review(text, uuid, text, jsonb, jsonb, jsonb);
drop function public.read_agency_client_claim_review(text, uuid, text);
drop function public.stage_agency_client_found_facts(uuid, text, uuid, uuid, jsonb);
drop function public.agency_client_assert_pre_claim(uuid, text, uuid, uuid);
drop trigger agency_client_claim_reviews_guard on public.agency_client_claim_reviews;
drop table public.agency_client_claim_reviews;
drop function public.agency_client_claim_review_guard();
drop table public.business_found_facts;
drop function public.business_found_fact_valid(text, text, jsonb);
drop function public.claim_review_areas();
alter table public.agency_scope_grants drop constraint agency_scope_grants_pre_claim_prepare_only;
alter table public.agency_scope_grants drop column basis;
commit;
