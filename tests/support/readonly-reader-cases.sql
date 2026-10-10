-- Requires readonly-reader-fixture.sql in this session. Cases are also reusable
-- by a local HTTP harness: rpc_name and parameters name the actual POST body.
create temporary table readonly_reader_cases(rpc_name text, parameters jsonb, statement text, denial text);
insert into readonly_reader_cases values
 ('agency_client_overview_v2',jsonb_build_object('p_agency_workspace_id','13230000-0000-4000-8000-000000000010','p_user_id','@actor','p_verified_email','@email','p_cursor',null,'p_limit',100),
 $$select public.agency_client_overview_v2('13230000-0000-4000-8000-000000000010','@actor','@email',null,100)->'clients' @> '[{"workspaceId":"13230000-0000-4000-8000-000000000011","status":"ready"}]'::jsonb$$,'business_record_access_denied'),
 ('business_inquiry_outcomes',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_from',date_trunc('month',now()),'p_to',date_trunc('month',now())+interval '1 month'),
 $$select (public.business_inquiry_outcomes('@workspace','@actor','@email',date_trunc('month',now()),date_trunc('month',now())+interval '1 month')->>'inquiries')::integer=1$$,'inquiry_access_denied'),
 ('business_outcome_month_inquiries',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_month',current_date),
 $$select public.business_outcome_month_inquiries('@workspace','@actor','@email',current_date)#>>'{inquiries,value}'='1'$$,'business_outcome_denied'),
 ('read_business_versions',jsonb_build_object('p_workspace_id','13230000-0000-4000-8000-000000000011','p_user_id','@actor','p_verified_email','@email'),
 $$select public.read_business_versions('13230000-0000-4000-8000-000000000011','@actor','@email')->'versions' @> '[{"id":"@version"}]'::jsonb$$,'business_record_access_denied'),
 ('read_google_listing_readback_failures_v2',jsonb_build_object('p_user_id','@actor','p_verified_email','@email'),
 $$select public.read_google_listing_readback_failures_v2('@actor','@email') @> '[{"workspaceId":"@workspace","readback":"failed"}]'::jsonb$$,'operator_queue_access_denied'),
 ('read_inquiry_booking_offer',jsonb_build_object('p_offer_id','@offer'),
 $$select public.read_inquiry_booking_offer('@offer'::uuid)#>>'{offer,id}'='@offer'$$,null),
 ('read_operator_google_uncertainty',jsonb_build_object('p_user_id','@actor','p_verified_email','@email'),
 $$select public.read_operator_google_uncertainty('@actor','@email') @> '[{"tenantId":"readonly-reader-site","acceptance":"unknown"}]'::jsonb$$,'operator_queue_access_denied'),
 ('read_operator_queue_context_v2',jsonb_build_object('p_user_id','@actor','p_verified_email','@email'),
 $$select public.read_operator_queue_context_v2('@actor','@email')->'businesses' @> '[{"id":"@workspace"}]'::jsonb$$,'operator_queue_access_denied'),
 ('read_provider_booking_evidence',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_date',current_date,'p_view','day'),
 $$select jsonb_typeof(public.read_provider_booking_evidence('@workspace','@actor','@email',current_date,'day')->'bookings')='array'$$,'business_record_access_denied'),
 ('read_version_binding_choices',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email'),
 $$select public.read_version_binding_choices('@workspace','@actor','@email') @> '[{"kind":"website_tenant"}]'::jsonb$$,'business_record_access_denied'),
 ('read_version_native_runtime',jsonb_build_object('p_workspace_id','13230000-0000-4000-8000-000000000011','p_user_id','@actor','p_verified_email','@email','p_version_id','@version'),
 $$select public.read_version_native_runtime('13230000-0000-4000-8000-000000000011','@actor','@email','@version')->>'kind'='internal_app'$$,'business_record_access_denied'),
 ('read_workspace_inquiry_inbox_page',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_states',null,'p_limit',50,'p_before',null,'p_before_id',null),
 $$select public.read_workspace_inquiry_inbox_page('@workspace','@actor','@email',null,50,null,null) @> '[{"id":"@lead"}]'::jsonb$$,'inquiry_access_denied'),
 ('read_workspace_inquiry_leads_with_receipts',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_states',null,'p_limit',50,'p_before',null),
 $$select public.read_workspace_inquiry_leads_with_receipts('@workspace','@actor','@email',null,50,null) @> '[{"id":"@lead","replyPermission":"owner"}]'::jsonb$$,'inquiry_access_denied'),
 ('read_workspace_inquiry_reply_receipts',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email'),
 $$select public.read_workspace_inquiry_reply_receipts('@workspace','@actor','@email') @> '[{"rowId":"@lead","status":"accepted"}]'::jsonb$$,'inquiry_access_denied'),
 ('workspace_inquiry_reply_permission',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_lead_row_id','@lead'),
 $$select public.workspace_inquiry_reply_permission('@workspace','@actor','@email','@lead')='owner'$$,'inquiry_access_denied');
insert into readonly_reader_cases values
 ('read_operator_queue_context',jsonb_build_object('p_user_id','@actor','p_verified_email','@email'),
 $$select public.read_operator_queue_context('@actor','@email')->'businesses' @> '[{"id":"@workspace"}]'::jsonb$$,'operator_queue_access_denied'),
 ('read_outside_write_receipts',jsonb_build_object('p_user_id','@actor','p_verified_email','@email','p_tenant_id',null,'p_workspace_id','@workspace','p_limit',10),
 $$select jsonb_typeof(public.read_outside_write_receipts('@actor','@email',null,'@workspace',10))='array'$$,'operator_queue_access_denied'),
 ('read_google_listing_readback_failures',jsonb_build_object('p_user_id','@actor','p_verified_email','@email','p_limit',10),
 $$select public.read_google_listing_readback_failures('@actor','@email',10) @> '[{"workspaceId":"@workspace"}]'::jsonb$$,'operator_queue_access_denied'),
 ('read_business_effort',jsonb_build_object('p_user_id','@actor','p_verified_email','@email','p_from','2026-01-01','p_business_id','@workspace'),
 $$select jsonb_typeof(public.read_business_effort('@actor','@email','2026-01-01','@workspace'))='array'$$,'business_effort_access_denied'),
 ('read_effort_businesses',jsonb_build_object('p_user_id','@actor','p_verified_email','@email'),
 $$select public.read_effort_businesses('@actor','@email') @> '[{"id":"@workspace"}]'::jsonb$$,'business_effort_access_denied'),
 ('read_make_real_activation',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_activation_id','missing'),
 $$select public.read_make_real_activation('@workspace','@actor','@email','missing') is null$$,'make_real_activation_access_denied'),
 ('export_workspace_v3_category',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_category','business_record','p_offset',0,'p_limit',10),
 $$select public.export_workspace_v3_category('@workspace','@actor','@email','business_record',0,10)->>'category'='business_record'$$,'workspace_export_denied'),
 ('export_workspace_v3_category',jsonb_build_object('p_workspace_id','@workspace','p_user_id','@actor','p_verified_email','@email','p_category','systems','p_offset',0,'p_limit',10),
 $$select public.export_workspace_v3_category('@workspace','@actor','@email','systems',0,10)->>'category'='systems'$$,'workspace_export_denied'),
 ('read_website_current_tenant',jsonb_build_object('p_workspace_id','@workspace','p_work_id','@work','p_user_id','@actor','p_verified_email','@email'),
 $$select count(*)=0 from public.read_website_current_tenant('@workspace','@work','@actor','@email')$$,'workspace_access_denied'),
 ('read_website_linked_publications',jsonb_build_object('p_workspace_id','@workspace','p_work_id','@work','p_user_id','@actor','p_verified_email','@email'),
 $$select count(*)=0 from public.read_website_linked_publications('@workspace','@work','@actor','@email')$$,'workspace_access_denied'),
 ('read_website_domain_approvals',jsonb_build_object('p_workspace_id','@workspace','p_work_id','@work','p_user_id','@actor','p_verified_email','@email'),
 $$select count(*)=0 from public.read_website_domain_approvals('@workspace','@work','@actor','@email')$$,'workspace_access_denied');
update readonly_reader_cases set
 statement=replace(replace(replace(replace(replace(replace(replace(statement,'@actor','13230000-0000-4000-8000-000000000001'),'@email','readonly-owner@example.test'),'@workspace',:'reader_workspace_id'),'@lead',:'reader_lead_id'),'@version',:'reader_version_id'),'@offer',:'reader_offer_id'),'@month',current_date::text),
 parameters=replace(replace(replace(replace(replace(replace(parameters::text,'@actor','13230000-0000-4000-8000-000000000001'),'@email','readonly-owner@example.test'),'@workspace',:'reader_workspace_id'),'@lead',:'reader_lead_id'),'@version',:'reader_version_id'),'@offer',:'reader_offer_id')::jsonb;

alter table readonly_reader_cases add column exposed boolean not null default true;
update readonly_reader_cases set exposed=false where rpc_name='workspace_inquiry_reply_permission';

update readonly_reader_cases set statement=replace(statement,'@work',:'reader_website_work_id'),parameters=replace(parameters::text,'@work',:'reader_website_work_id')::jsonb;
