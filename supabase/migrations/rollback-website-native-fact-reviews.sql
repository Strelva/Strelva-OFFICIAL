begin;
set local lock_timeout = '3s';
drop function if exists public.record_native_website_fact_review(uuid,text,text);
drop function if exists public.claim_native_website_fact_review(uuid,uuid,text,text,bigint,uuid);
drop table if exists public.website_native_fact_reviews;
commit;
