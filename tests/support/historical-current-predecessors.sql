\set ON_ERROR_STOP on
-- No substitutes: these tables/functions must be supplied by real forward
-- migrations before current access-review and enterprise contracts execute.
do $$
begin
  if to_regclass('public.customer_relationships') is null
    or to_regclass('public.customer_mapping_audit') is null
    or to_regclass('public.workspace_creation_receipts') is null
    or to_regclass('public.agency_prospecting_profiles') is null
    or to_regclass('public.prospects') is null
    or to_regclass('public.agency_client_additions') is null
    or to_regprocedure('public.enter_customer_business(uuid,text,text,uuid,text,uuid,text)') is null
    or to_regprocedure('public.read_website_agency_publish_permission(uuid,uuid,uuid,text)') is null
    or to_regprocedure('public.approve_website_document_for_agency(uuid,uuid,uuid,text,integer,text,uuid)') is null then
    raise exception 'historical_current_predecessor_missing';
  end if;
end;
$$;
