-- Bounded, owner-requested portability snapshot. This does not close an
-- account, delete data, hand over a provider, or establish retention policy.

create table public.workspace_export_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete restrict,
  schema_version integer not null check (schema_version=1),
  byte_size integer not null check (byte_size between 1 and 2000000),
  category_counts jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index workspace_export_receipts_workspace_created_idx
  on public.workspace_export_receipts(workspace_id,created_at desc);
alter table public.workspace_export_receipts enable row level security;
revoke all on public.workspace_export_receipts from public,anon,authenticated;
grant select,insert on public.workspace_export_receipts to service_role;

create or replace function public.export_workspace_snapshot(
  p_workspace_id uuid,p_user_id uuid,p_verified_email text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  result jsonb;
  receipt_id uuid := gen_random_uuid();
  result_size integer;
begin
  perform 1 from public.users u where u.id=p_user_id
    and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null for share;
  if not found then raise exception 'workspace_export_denied'; end if;
  perform 1 from public.workspace_memberships m where m.workspace_id=p_workspace_id
    and m.user_id=p_user_id and m.role='owner' for share;
  if not found then raise exception 'workspace_export_denied'; end if;

  select jsonb_build_object(
    'schemaVersion',1,
    'exportId',receipt_id,
    'exportedAt',clock_timestamp(),
    'workspace',jsonb_build_object('id',w.id,'name',w.name,'kind',w.kind,'createdAt',w.created_at,'updatedAt',w.updated_at),
    'manifest',jsonb_build_object(
      'scope','current_workspace_portability_snapshot',
      'included',jsonb_build_array('workspace_identity','saved_results','native_application_releases','native_application_records','economics_authorizations','economics_reservations','economics_usage_receipts','economics_execution_outcomes'),
      'omitted',jsonb_build_array('credentials','provider_connection_data','invitation_tokens','agent_tokens','idempotency_keys','command_digests','internal_product_learning','operator_notes'),
      'unavailable',jsonb_build_array(
        jsonb_build_object('category','account_closure_or_deletion','reason','Closure, deletion, and retention are separate unestablished actions.'),
        jsonb_build_object('category','managed_site_content_and_assets','reason','Tenant exports require separate tenant authorization.'),
        jsonb_build_object('category','provider_handover','reason','Provider handover requires a separate authorized operation.'),
        jsonb_build_object('category','memberships_invitations_and_delegations','reason','Access administration is not part of this portability snapshot.'),
        jsonb_build_object('category','ongoing_operations_and_agent_access','reason','Operational control records and internal access tokens are excluded.')
      ),
      'maximumBytes',2000000
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
    )
  ) into result from public.workspaces w where w.id=p_workspace_id;
  if result is null then raise exception 'workspace_export_denied'; end if;
  result_size := octet_length(result::text);
  if result_size>2000000 then raise exception 'workspace_export_too_large'; end if;
  insert into public.workspace_export_receipts(id,workspace_id,requested_by,schema_version,byte_size,category_counts)
    values(receipt_id,p_workspace_id,p_user_id,1,result_size,jsonb_build_object(
      'savedResults',jsonb_array_length(result->'savedResults'),
      'applicationReleases',jsonb_array_length(result#>'{nativeApplications,releases}'),
      'applicationRecords',jsonb_array_length(result#>'{nativeApplications,records}'),
      'economicsJobs',jsonb_array_length(result#>'{economics,jobs}'),
      'reservations',jsonb_array_length(result#>'{economics,reservations}'),
      'usageReceipts',jsonb_array_length(result#>'{economics,usageReceipts}'),
      'executionOutcomes',jsonb_array_length(result#>'{economics,executionOutcomes}')));
  return result;
end $$;
revoke all on function public.export_workspace_snapshot(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.export_workspace_snapshot(uuid,uuid,text) to service_role;
