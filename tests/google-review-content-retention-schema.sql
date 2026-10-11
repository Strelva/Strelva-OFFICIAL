\set ON_ERROR_STOP on
-- Fictional native fixture, coordinator execution pending.
begin;
create function pg_temp.gr_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'review retention: %',label;end if;end $$;
do $$
declare tenant text:='review-retention-'||gen_random_uuid()::text; rid uuid:=gen_random_uuid(); manual uuid:=gen_random_uuid(); lease jsonb; initial jsonb; owner_id uuid:=gen_random_uuid(); ws uuid:=gen_random_uuid(); build uuid:=gen_random_uuid(); customer_build uuid:=gen_random_uuid(); body text; before_body text;
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
 insert into public.reviews(tenant_id,source,author,rating,text,review_date,provider_content)
 values(tenant,'google','Customer imported author',5,'Customer imported Google label','2026-10-08',jsonb_build_object('source','customer_import','producer','authenticated_reviews_post'));
 perform pg_temp.gr_assert(exists(select 1 from public.reviews where tenant_id=tenant and text='Customer imported Google label'),'trusted customer import preserved');
 -- Explicit JSON null/scalar metadata are valid historical mirror shapes.
 insert into public.unified_events(tenant_id,source,type,title,body,metadata) values
 (tenant,'google','review','Provider title','Provider text',null),
 (tenant,'google','review','Provider title','Provider text','null'::jsonb),
 (tenant,'google','review','Provider title','Provider text','42'::jsonb),
 (tenant,'google','review','Provider title','Provider text','[]'::jsonb);
 insert into public.proposals(id,tenant_id,source,entity_type,kind,title,body,payload) values
 ('null-review-'||gen_random_uuid(),tenant,'google','review',null,'Provider title','Provider text',null),
 ('scalar-review-'||gen_random_uuid(),tenant,'google','review',null,'Provider title','Provider text','42'::jsonb);
 perform pg_temp.gr_assert(not exists(select 1 from public.unified_events e where e.tenant_id=tenant and e.source='google' and e.body<>''),'null/scalar native events scrub safely');
 perform public.purge_google_review_content();
 perform pg_temp.gr_assert(not exists(select 1 from public.reviews where tenant_id=tenant and source='google' and provider_content is null and text<>''),'unknown legacy content removed');
 perform pg_temp.gr_assert((select text='Customer review' from public.reviews where id=manual),'customer authored review preserved');
 -- Actual sealed archive completion binds day28 content to its original expiry.
 insert into public.users(id,email,verified_at) values(owner_id,'review-archive-owner@example.test',clock_timestamp());
 insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Fictional review archive',owner_id);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id);
 lease:=jsonb_build_object('source','google_business_profile_api','fetchedAt',clock_timestamp()-interval '28 days','expiresAt',clock_timestamp()+interval '1 second');
 body:=jsonb_build_object('data',jsonb_build_object('reviews',jsonb_build_array(jsonb_build_object('source','google','external_id','archive-provider-id','text','Day28 API comment','provider_content',lease))))::text;
 insert into public.workspace_export_builds(id,workspace_id,requested_by,requester_role,deliver_to) values(build,ws,owner_id,'owner','review-archive-owner@example.test');
 perform public.append_workspace_export_build_part(build,0,body);
 perform public.complete_workspace_export_build(build,'{}',repeat('b',64),'{}');
 perform pg_temp.gr_assert((select expires_at=(lease->>'expiresAt')::timestamptz and provider_content_expires_at=(lease->>'expiresAt')::timestamptz from public.workspace_export_builds where id=build),'archive lease cannot become seven more days');
 before_body:=public.read_workspace_export_build_part(build,repeat('b',64),0)->>'body';
 perform pg_temp.gr_assert(before_body=body,'live archive retains original sealed bytes');
 perform pg_temp.gr_assert(public.read_workspace_export_owner_part(build,owner_id,'review-archive-owner@example.test',0)->>'body'=body,'actual owner path uses live same bytes');
 perform pg_sleep(1.1);
 begin perform public.read_workspace_export_build_part(build,repeat('b',64),0);raise exception 'expired archive token admitted';exception when others then if sqlerrm<>'workspace_export_link_invalid' then raise;end if;end;
 begin perform public.read_workspace_export_owner_part(build,owner_id,'review-archive-owner@example.test',0);raise exception 'expired archive owner admitted';exception when others then if sqlerrm<>'workspace_export_link_invalid' then raise;end if;end;
 perform public.purge_google_review_content();
 perform pg_temp.gr_assert(not exists(select 1 from public.workspace_export_build_parts where build_id=build),'expired stored provider bytes physically removed');
 perform pg_temp.gr_assert(exists(select 1 from public.workspace_export_receipts where id=build) and exists(select 1 from public.workspace_export_builds where id=build and status='failed'),'request and receipt history survive');
 body:=jsonb_build_object('data',jsonb_build_object('reviews',jsonb_build_array(jsonb_build_object('source','google','external_id',null,'text','Customer archived import','provider_content',jsonb_build_object('source','customer_import','producer','authenticated_reviews_post')))))::text;
 insert into public.workspace_export_builds(id,workspace_id,requested_by,requester_role,deliver_to) values(customer_build,ws,owner_id,'owner','review-archive-owner@example.test');
 perform public.append_workspace_export_build_part(customer_build,0,body);
 perform public.complete_workspace_export_build(customer_build,'{}',repeat('c',64),'{}');
 perform public.purge_google_review_content();
 perform pg_temp.gr_assert(public.read_workspace_export_owner_part(customer_build,owner_id,'review-archive-owner@example.test',0)->>'body'=body,'customer archive retained without altering manifest or bytes');
 perform pg_temp.gr_assert(not has_function_privilege('service_role','public.read_workspace_export_build_part_before_review_retention(uuid,text,integer)','execute'),'old part reader not exposed as bypass');
 perform pg_temp.gr_assert(not has_function_privilege('authenticated','public.purge_google_review_content()','execute') and not has_function_privilege('anon','public.purge_google_review_content()','execute'),'purge service only');
end $$;
rollback;
