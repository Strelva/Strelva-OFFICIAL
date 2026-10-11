-- Archive-only schema-2 facets. Existing inline export limits remain unchanged.
-- Owner access is rechecked by the cloned snapshot; no provider is contacted.
begin;
set local lock_timeout = '3s';
create or replace function public.export_workspace_archive_snapshot_base(
  p_workspace_id uuid,p_user_id uuid,p_verified_email text
) returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare
  result jsonb;
  receipt_id uuid := gen_random_uuid();
  result_size integer;
  attachment_count integer;
begin
  perform public.workspace_export_v3_role(p_workspace_id,p_user_id,p_verified_email);

  select count(*) into attachment_count
  from public.saved_product_work document
  join public.saved_product_work onboarding
    on onboarding.workspace_id=p_workspace_id
    and onboarding.product_id='onboarding'
    and onboarding.resource_kind='case'
  cross join lateral jsonb_array_elements(coalesce(onboarding.payload->'requirements','[]'::jsonb)) requirement
  where document.workspace_id=p_workspace_id
    and document.product_id='documents'
    and document.resource_kind='document'
    and document.input->>'source'='onboarding_upload'
    and requirement->'document'->>'workId'=document.id::text
    and requirement->'document'->>'source'='upload';


  select jsonb_build_object(
    'schemaVersion',2,
    'exportId',receipt_id,
    'exportedAt',clock_timestamp(),
    'workspace',jsonb_build_object('id',w.id,'name',w.name,'kind',w.kind,'createdAt',w.created_at,'updatedAt',w.updated_at),
    'manifest',jsonb_build_object(
      'scope','current_workspace_portability_snapshot',
      'included',jsonb_build_array(
        'workspace_identity','saved_results','native_application_releases','native_application_records',
        'economics_authorizations','economics_reservations','economics_usage_receipts','economics_execution_outcomes',
        'onboarding_cases','onboarding_attachment_references','workspace_exit_state'
      ),
      'omitted',jsonb_build_array(
        'credentials','provider_connection_data','invitation_tokens','agent_tokens',
        'idempotency_keys','command_digests','internal_product_learning','operator_notes',
        'onboarding_raw_attachment_bytes','deletion_and_retention_policy'
      ),
      'unavailable',jsonb_build_array(
        jsonb_build_object('category','account_closure_or_deletion','reason','Closure, deletion, and retention are separate unestablished actions.'),
        jsonb_build_object('category','managed_site_content_and_assets','reason','Tenant exports require separate tenant authorization.'),
        jsonb_build_object('category','provider_handover','reason','Provider handover requires a separate authorized operation.'),
        jsonb_build_object('category','memberships_invitations_and_delegations','reason','Access administration is not part of this portability snapshot.'),
        jsonb_build_object('category','ongoing_operations_and_agent_access','reason','Operational control records and internal access tokens are excluded.')
      ),
      'maximumBytes',2000000,
      'attachmentMaximumBytes',2000000,
      'maxAttachmentReferences',500
    ),
    'savedResults',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'productId',s.product_id,'resourceKind',s.resource_kind,'title',s.title,
      'payload',s.payload-'installation',
      'sourceWorkId',case when exists(select 1 from public.saved_product_work source
        where source.id=s.source_work_id and source.workspace_id=p_workspace_id) then s.source_work_id else null end,
      'createdAt',s.created_at,'updatedAt',s.updated_at
    ) order by s.created_at,s.id) from public.saved_product_work s
      where s.workspace_id=p_workspace_id and s.product_id in ('documents','tracker','ai_visibility','applications')),'[]'::jsonb),
    'nativeApplications',jsonb_build_object(
      'releases',coalesce((select jsonb_agg(jsonb_build_object(
        'workId',r.work_id,'version',r.version,'spec',r.spec,'publishedAt',r.published_at,'publicationSource',r.publication_source
      ) order by r.work_id,r.version) from public.application_releases r where r.workspace_id=p_workspace_id),'[]'::jsonb),
      'records',coalesce((select jsonb_agg(jsonb_build_object(
        'workId',r.work_id,'recordId',r.record_id,'values',r.values,'recordSource',r.record_source,'createdAt',r.created_at,'updatedAt',r.updated_at
      ) order by r.work_id,r.created_at,r.record_id) from public.application_records r where r.workspace_id=p_workspace_id),'[]'::jsonb)
    ),
    'economics',jsonb_build_object(
      'jobs',coalesce((select jsonb_agg(jsonb_build_object(
        'id',j.id,'workId',j.work_id,'productId',j.product_id,'resourceKind',j.resource_kind,'payerId',j.payer_id,
        'acceptedBy',j.accepted_by,'currency',j.currency,
        'estimateCents',j.estimate_cents,'maximumAuthorizedCents',j.max_authorized_cents,'reservedCents',j.reserved_cents,
        'usedCents',j.used_cents,'strelvaRetryCents',j.strelva_retry_cents,'actualCents',j.actual_cents,
        'actualKnown',j.actual_known,'status',j.status,'acceptedAt',j.accepted_at,'createdAt',j.created_at,'updatedAt',j.updated_at
      ) order by j.created_at,j.id) from public.job_economics j where j.workspace_id=p_workspace_id),'[]'::jsonb),
      'reservations',coalesce((select jsonb_agg(jsonb_build_object('jobId',r.job_id,'amountCents',r.amount_cents,'createdAt',r.created_at) order by r.created_at,r.id)
        from public.job_economics_reservations r join public.job_economics j on j.id=r.job_id where j.workspace_id=p_workspace_id),'[]'::jsonb),
      'usageReceipts',coalesce((select jsonb_agg(jsonb_build_object('jobId',u.job_id,'kind',u.kind,'attribution',u.attribution,'amountCents',u.amount_cents,'source',u.source,'createdAt',u.created_at) order by u.created_at,u.id)
        from public.job_economics_usage u join public.job_economics j on j.id=u.job_id where j.workspace_id=p_workspace_id),'[]'::jsonb),
      'executionOutcomes',coalesce((select jsonb_agg(jsonb_build_object('jobId',e.job_id,'maximumCents',e.maximum_cents,'kind',e.kind,'attribution',e.attribution,'status',e.status,'effect',e.effect,'amountCents',e.amount_cents,'billableCents',e.billable_cents,'createdAt',e.created_at,'startedAt',e.started_at,'finishedAt',e.finished_at,'reconciliationReference',e.reconciliation_reference) order by e.created_at,e.execution_key)
        from public.job_economics_executions e join public.job_economics j on j.id=e.job_id where j.workspace_id=p_workspace_id),'[]'::jsonb)
    ),
    'onboarding',jsonb_build_object(
      'cases',coalesce((select jsonb_agg(jsonb_build_object(
        'workId',work.id,'title',work.title,'case',work.payload,'createdAt',work.created_at,'updatedAt',work.updated_at
      ) order by work.created_at,work.id)
        from public.saved_product_work work
        where work.workspace_id=p_workspace_id and work.product_id='onboarding' and work.resource_kind='case'),'[]'::jsonb),
      'attachments',coalesce((select jsonb_agg(jsonb_build_object(
        'workId',document.id,
        'caseWorkId',onboarding.id,
        'requirementId',requirement->>'id',
        'title',document.title,
        'originalName',document.input->'provenance'->>'originalName',
        'contentType',document.input->'provenance'->>'contentType',
        'size',(document.input->'provenance'->>'size')::integer,
        'sha256',document.input->'provenance'->>'sha256',
        'uploadedAt',document.input->'provenance'->>'uploadedAt',
        'downloadReference','/api/onboarding/file?workId=' || document.id::text,
        'extraction',document.input->'extraction'
      ) order by document.created_at,document.id)
        from public.saved_product_work document
        join public.saved_product_work onboarding
          on onboarding.workspace_id=p_workspace_id
          and onboarding.product_id='onboarding'
          and onboarding.resource_kind='case'
        cross join lateral jsonb_array_elements(coalesce(onboarding.payload->'requirements','[]'::jsonb)) requirement
        where document.workspace_id=p_workspace_id
          and document.product_id='documents'
          and document.resource_kind='document'
          and document.input->>'source'='onboarding_upload'
          and requirement->'document'->>'workId'=document.id::text
          and requirement->'document'->>'source'='upload'),'[]'::jsonb)
    ),
    'lifecycle',jsonb_build_object(
      'exit',(select request.state from public.workspace_exit_requests request where request.workspace_id=p_workspace_id)
    )
  ) into result from public.workspaces w where w.id=p_workspace_id;
  if result is null then raise exception 'workspace_export_denied'; end if;
  result_size := octet_length(result::text);

  insert into public.workspace_export_receipts(id,workspace_id,requested_by,schema_version,byte_size,category_counts)
    values(receipt_id,p_workspace_id,p_user_id,3,result_size,jsonb_build_object(
      'savedResults',jsonb_array_length(result->'savedResults'),
      'applicationReleases',jsonb_array_length(result#>'{nativeApplications,releases}'),
      'applicationRecords',jsonb_array_length(result#>'{nativeApplications,records}'),
      'economicsJobs',jsonb_array_length(result#>'{economics,jobs}'),
      'reservations',jsonb_array_length(result#>'{economics,reservations}'),
      'usageReceipts',jsonb_array_length(result#>'{economics,usageReceipts}'),
      'executionOutcomes',jsonb_array_length(result#>'{economics,executionOutcomes}'),
      'onboardingCases',jsonb_array_length(result#>'{onboarding,cases}'),
      'onboardingAttachments',jsonb_array_length(result#>'{onboarding,attachments}'),
      'workspaceExit',case when jsonb_typeof(result#>'{lifecycle,exit}') = 'null' then 0 else 1 end
    ));
  return result;
end $$;


revoke all on function public.export_workspace_archive_snapshot_base(uuid,uuid,text) from public,anon,authenticated,service_role;
create or replace function public.export_workspace_archive_snapshot(
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  result_size integer;
  receipt_id uuid;
begin
  result := public.export_workspace_archive_snapshot_base(p_workspace_id, p_user_id, p_verified_email);
  receipt_id := (result->>'exportId')::uuid;
  result := jsonb_set(
    result,
    '{manifest,unavailable}',
    (result#>'{manifest,unavailable}') || jsonb_build_array(
      jsonb_build_object(
        'category', 'custom_application_artifacts_and_releases',
        'reason', 'Custom application source and built artifacts require a separate authorized transfer.'
      ),
      jsonb_build_object(
        'category', 'calendar_connections_and_event_receipts',
        'reason', 'Calendar credentials and provider event receipts are excluded from portability.'
      ),
      jsonb_build_object(
        'category', 'inquiry_records_and_followups',
        'reason', 'Inquiry routing and follow-up records use a separate tenant-authorized export.'
      ),
      jsonb_build_object(
        'category', 'offering_installations_and_provider_delivery',
        'reason', 'Offering and provider-delivery records are outside this workspace snapshot.'
      )
    ),
    true
  );
  -- Safe grant and reservation receipt projection; management credentials and
  -- provider event identifiers never enter the archive. The base already
  -- checked the current owner/operator role for this exact business.
  result := result || jsonb_build_object('publicBookings', jsonb_build_object(
    'grants', coalesce((select jsonb_agg(jsonb_build_object(
      'id', grant_row.id,
      'tenantStableId', grant_row.tenant_stable_id,
      'businessWorkspaceId', grant_row.business_workspace_id,
      'workId', grant_row.work_id,
      'capabilityId', grant_row.capability_id,
      'capabilityVersion', grant_row.capability_version,
      'inquiryCapabilityId', grant_row.inquiry_capability_id,
      'inquiryVersion', grant_row.inquiry_version,
      'provider', grant_row.provider,
      'displayName', grant_row.display_name,
      'timeZone', grant_row.time_zone,
      'status', grant_row.status,
      'revision', grant_row.revision,
      'publishedAt', grant_row.published_at,
      'createdAt', grant_row.created_at,
      'updatedAt', grant_row.updated_at,
      'revokedAt', grant_row.revoked_at,
      'revocationReason', grant_row.revocation_reason
    ) order by grant_row.updated_at, grant_row.id)
      from public.public_website_booking_grants grant_row
     where grant_row.business_workspace_id = p_workspace_id), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(jsonb_build_object(
      'reservationId', booking.id,
      'grantId', booking.grant_id,
      'tenantId', booking.tenant_id_at_reservation,
      'capabilityId', booking.capability_id,
      'version', booking.capability_version,
      'provider', booking.provider,
      'inquiryId', booking.inquiry_id,
      'title', booking.title,
      'start', booking.start_at,
      'end', booking.end_at,
      'timeZone', booking.time_zone,
      'status', booking.status,
      'createdAt', booking.created_at,
      'updatedAt', booking.updated_at
    ) order by booking.created_at, booking.id)
      from public.public_website_bookings booking
     where booking.business_workspace_id = p_workspace_id), '[]'::jsonb)
  ));
  result_size := octet_length(result::text);
  update public.workspace_export_receipts
  set byte_size = result_size
  where id = receipt_id;
  return result;
end;
$$;

revoke all on function public.export_workspace_archive_snapshot(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.export_workspace_archive_snapshot(uuid, uuid, text) to service_role;

commit;
