begin;
set local lock_timeout='3s';
drop function if exists public.correct_inquiry_business_fact(uuid,uuid,text,jsonb);
drop function if exists public.confirm_inquiry_business_fact(uuid,uuid,uuid,text);
drop function if exists public.inquiry_business_fact_revision(uuid,uuid);
drop function if exists public.read_inquiry_business_facts(uuid,uuid);
drop function if exists public.stage_inquiry_business_fact(uuid,uuid,text,jsonb,text);
-- Accepted business facts and their immutable history are kept on rollback.
drop table if exists public.inquiry_business_fact_proposals;
commit;
