begin;
set local lock_timeout = '3s';
drop function if exists public.read_hosted_website_business_facts(text);
commit;
