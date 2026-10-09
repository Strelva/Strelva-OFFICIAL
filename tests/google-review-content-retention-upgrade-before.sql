\set ON_ERROR_STOP on
-- Root-owned disposable predecessor clone ONLY, before applying new1009.
insert into public.tenants(id,site_name,active) values('google-review-upgrade-fictional','Fictional review upgrade',true);
insert into public.reviews(tenant_id,source,external_id,author,rating,text,review_date,reply) values
 ('google-review-upgrade-fictional','google',null,'Imported author',5,'Accepted customer Google-labelled import','2026-10-08','Customer reply'),
 ('google-review-upgrade-fictional','google','provider-review-id','API author',5,'Legacy API comment','2026-10-08','Customer API reply'),
 ('google-review-upgrade-fictional','google',null,'Ambiguous author',5,'API mirror evidence comment','2026-10-08','Customer ambiguous reply');
insert into public.unified_events(tenant_id,source,type,title,body,metadata) values
 ('google-review-upgrade-fictional','google','review','Old API title','Old API body',null),
 ('google-review-upgrade-fictional','google','review','Old API title','Old API body','null'::jsonb),
 ('google-review-upgrade-fictional','google','review','Old API title','Old API body','42'::jsonb),
 ('google-review-upgrade-fictional','google','review','Ambiguous author','API mirror evidence comment','{"author":"Ambiguous author","reviewId":"actual-provider-evidence"}'::jsonb);
insert into public.proposals(id,tenant_id,source,entity_type,title,body,payload) values
 ('google-review-upgrade-null','google-review-upgrade-fictional','google','review','Old API title','Old API body',null),
 ('google-review-upgrade-scalar','google-review-upgrade-fictional','google','review','Old API title','Old API body','42'::jsonb);
