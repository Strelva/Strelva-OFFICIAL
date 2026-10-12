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

-- Real predecessor producers seal these bytes before retention migration exists.
insert into public.users(id,email,verified_at) values
 ('91009000-0000-4000-8000-000000000001','review-upgrade-owner@example.test',clock_timestamp()),
 ('91009000-0000-4000-8000-000000000002','review-upgrade-stranger@example.test',clock_timestamp());
insert into public.workspaces(id,kind,name,created_by) values
 ('91009000-0000-4000-8000-000000000003','customer','Fictional review archive upgrade','91009000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('91009000-0000-4000-8000-000000000003','91009000-0000-4000-8000-000000000001','owner','91009000-0000-4000-8000-000000000001');
do $$ declare i integer; build uuid; body text; lease jsonb;begin
 for i in 1..4 loop
  build:=('91009000-0000-4000-8000-'||lpad((10+i)::text,12,'0'))::uuid;
  lease:=case i when 1 then jsonb_build_object('source','google_business_profile_api','fetchedAt',clock_timestamp()-interval '28 days','expiresAt',clock_timestamp()+interval '12 hours')
   when 2 then jsonb_build_object('source','google_business_profile_api','fetchedAt',clock_timestamp()-interval '30 days','expiresAt',clock_timestamp()-interval '1 day')
   when 4 then jsonb_build_object('source','customer_import','producer','authenticated_reviews_post') else null end;
  body:=jsonb_build_object('data',jsonb_build_object('reviews',jsonb_build_array(jsonb_build_object('source','google','external_id',case when i=4 then null else 'pre-existing-api-review' end,'text','Sealed predecessor review '||i,'provider_content',lease))))::text;
  insert into public.workspace_export_builds(id,workspace_id,requested_by,requester_role,deliver_to)
   values(build,'91009000-0000-4000-8000-000000000003','91009000-0000-4000-8000-000000000001','owner','review-upgrade-owner@example.test');
  perform public.append_workspace_export_build_part(build,0,body);
  perform public.complete_workspace_export_build(build,jsonb_build_object('fixture','sealed-predecessor','index',i),repeat(i::text,64),'{}');
 end loop;
end $$;
