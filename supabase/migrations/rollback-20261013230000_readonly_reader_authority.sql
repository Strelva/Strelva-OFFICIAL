-- Database readers use snapshot authorization. Mutations keep their original
-- locking helpers and recheck authority while holding the write locks.
-- All new helpers are private to SECURITY DEFINER readers. No grant is widened.
-- Rollback restores every reader body and removes only the private read helpers.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $repair$
declare target record; definition text;
begin
  for target in select * from (values
    ('public.read_operator_queue_context(uuid,text)', 'public.operator_queue_read_operator(', 'public.operator_queue_assert_operator('),
    ('public.read_operator_queue_context_v2(uuid,text)', 'public.operator_queue_read_operator(', 'public.operator_queue_assert_operator('),
    ('public.read_outside_write_receipts(uuid,text,text,uuid,integer)', 'public.operator_queue_read_operator(', 'public.operator_queue_assert_operator('),
    ('public.read_google_listing_readback_failures(uuid,text,integer)', 'public.operator_queue_read_operator(', 'public.operator_queue_assert_operator('),
    ('public.read_google_listing_readback_failures_v2(uuid,text)', 'public.operator_queue_read_operator(', 'public.operator_queue_assert_operator('),
    ('public.read_operator_google_uncertainty(uuid,text)', 'public.operator_queue_read_operator(', 'public.operator_queue_assert_operator('),
    ('public.read_business_effort(uuid,text,date,uuid)', 'public.business_effort_read_operator(', 'public.business_effort_assert_operator('),
    ('public.read_effort_businesses(uuid,text)', 'public.business_effort_read_operator(', 'public.business_effort_assert_operator('),
    ('public.read_make_real_activation(uuid,uuid,text,text)', 'public.make_real_read_actor(', 'public.make_real_activation_actor('),
    ('public.read_business_record(uuid,uuid,text)', 'public.business_record_read_actor(', 'public.business_record_assert_actor('),
    ('public.read_business_systems(uuid,uuid,text)', 'public.system_read_scope(', 'public.system_actor_scope('),
    ('public.read_business_versions_sibling_core(uuid,uuid,text)', 'public.system_read_scope(', 'public.system_actor_scope('),
    ('public.agency_overview_client(uuid,uuid,text,uuid,boolean)', 'public.system_read_scope(', 'public.system_actor_scope('),
    ('public.agency_overview_queue(uuid,uuid,text,uuid)', 'public.system_read_scope(', 'public.system_actor_scope('),
    ('public.agency_client_overview(uuid,uuid,text,uuid,integer)', 'public.system_read_scope(', 'public.system_actor_scope('),
    ('public.agency_client_overview_v2(uuid,uuid,text,uuid,integer)', 'public.system_read_scope(', 'public.system_actor_scope('),
    ('public.read_provider_booking_evidence(uuid,uuid,text,date,text)', 'public.system_read_scope(', 'public.system_actor_scope('),
    ('public.read_version_binding_choices(uuid,uuid,text)', 'public.system_read_scope(', 'public.system_actor_scope('),
    ('public.read_version_native_runtime(uuid,uuid,text,uuid)', 'public.system_version_read_access(', 'public.system_version_access('),
    ('public.read_website_current_tenant(uuid,uuid,uuid,text)', 'public.website_document_read_actor(', 'public.website_document_assert_actor('),
    ('public.read_website_linked_publications(uuid,uuid,uuid,text)', 'public.website_document_read_actor(', 'public.website_document_assert_actor('),
    ('public.read_website_domain_approvals(uuid,uuid,uuid,text)', 'public.website_document_read_actor(', 'public.website_document_assert_actor('),
    ('public.business_inquiry_outcomes(uuid,uuid,text,timestamp with time zone,timestamp with time zone)', 'public.inquiry_read_member(', 'public.inquiry_assert_member('),
    ('public.read_workspace_leads(uuid,uuid,text,text[],integer,timestamp with time zone)', 'public.inquiry_read_member(', 'public.inquiry_assert_member('),
    ('public.read_workspace_inquiry_inbox_page(uuid,uuid,text,text[],integer,timestamp with time zone,uuid)', 'public.inquiry_read_member(', 'public.inquiry_assert_member('),
    ('public.read_workspace_inquiry_reply_receipts(uuid,uuid,text)', 'public.inquiry_read_member(', 'public.inquiry_assert_member('),
    ('public.workspace_inquiry_reply_permission(uuid,uuid,text,uuid)', 'public.inquiry_read_member(', 'public.inquiry_assert_member('),
    ('public.read_inquiry_booking_offer(uuid)', 'public.inquiry_booking_read_witness(', 'public.inquiry_booking_witness(')
  ) changes(signature, old_call, new_call) loop
    definition := pg_get_functiondef(target.signature::regprocedure);
    if position(target.old_call in definition) = 0 then
      if position(target.new_call in definition) = 0 then
        raise exception 'reader_authority_call_not_found: %', target.signature;
      end if;
      continue; -- Safe retry of the already-applied migration.
    end if;
    execute replace(definition, target.old_call, target.new_call);
  end loop;
end $repair$;
drop function public.inquiry_booking_read_witness(text,text);
drop function public.inquiry_read_member(uuid,uuid,text);
drop function public.website_document_read_actor(uuid,uuid,uuid,text,boolean,boolean);
drop function public.make_real_read_actor(uuid,uuid,text,boolean);
drop function public.business_effort_read_operator(uuid,text);
drop function public.operator_queue_read_operator(uuid,text);
drop function public.system_version_read_access(system_versions,uuid,text,boolean);
drop function public.system_read_load(uuid,uuid,boolean,uuid[]);
drop function public.system_read_scope(uuid,uuid,text,boolean);
drop function public.business_record_read_actor(uuid,uuid,text,boolean);
drop function public.provider_seat_read_role(uuid,uuid,boolean);
notify pgrst, 'reload schema';
commit;
