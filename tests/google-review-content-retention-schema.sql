\set ON_ERROR_STOP on
-- Fictional native fixture, coordinator execution pending.
begin;
create function pg_temp.gr_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'review retention: %',label;end if;end $$;
do $$
declare tenant text:='review-retention-'||gen_random_uuid()::text; rid uuid:=gen_random_uuid(); manual uuid:=gen_random_uuid(); lease jsonb; initial jsonb;
begin
 insert into public.tenants(id,site_name,active) values(tenant,'Fictional review retention',true);
 lease:=jsonb_build_object('source','google_business_profile_api','fetchedAt',clock_timestamp(),'expiresAt',clock_timestamp()+interval '29 days'-interval '1 second');
 insert into public.reviews(id,tenant_id,source,external_id,author,rating,text,reply,provider_content)
 values(rid,tenant,'google','exact-provider-review','Provider author',5,'Provider comment','Customer reply',lease),
 (manual,tenant,'manual',null,'Customer author',5,'Customer review','Customer reply',null);
 perform pg_temp.gr_assert((select text='Provider comment' from public.reviews where id=rid),'live API content accepted');
 update public.reviews set provider_content=jsonb_build_object('source','google_business_profile_api','fetchedAt',clock_timestamp(),'expiresAt',clock_timestamp()+interval '30 days'),reply='Customer edited reply' where id=rid;
 perform pg_temp.gr_assert((select provider_content=lease and reply='Customer edited reply' from public.reviews where id=rid),'reply cannot extend original lease');
 perform pg_temp.gr_assert(not public.google_review_content_live(lease||jsonb_build_object('expiresAt','2099-01-01')),'extended lease rejected');
 initial:=public.project_google_review_row(jsonb_build_object('source','google','text','Legacy API text','reply','Customer reply','author','Provider author','rating',5));
 perform pg_temp.gr_assert(initial->>'text'='' and initial->>'reply'='Customer reply','unknown review projection preserves reply');
 initial:=public.project_google_review_event(jsonb_build_object('source','ai','type','review','body','Authored reply draft','title','Provider author','metadata',jsonb_build_object('kind','review_reply_draft','reviewId','provider','review',jsonb_build_object('text','Provider comment'),'draftedReply','Authored reply draft','execution',jsonb_build_object('state','external_accepted'))));
 perform pg_temp.gr_assert(initial->>'body'='Authored reply draft' and not (initial->'metadata' ? 'review') and initial->'metadata'->'execution'->>'state'='external_accepted','proposal projection retains effect history');
 insert into public.reviews(tenant_id,source,author,text,reply) values(tenant,'google','Unknown provider','Legacy API text','Customer reply');
 perform public.purge_google_review_content();
 perform pg_temp.gr_assert(not exists(select 1 from public.reviews where tenant_id=tenant and source='google' and provider_content is null and text<>''),'unknown legacy content removed');
 perform pg_temp.gr_assert((select text='Customer review' from public.reviews where id=manual),'customer authored review preserved');
 perform pg_temp.gr_assert(not has_function_privilege('authenticated','public.purge_google_review_content()','execute') and not has_function_privilege('anon','public.purge_google_review_content()','execute'),'purge service only');
end $$;
rollback;
