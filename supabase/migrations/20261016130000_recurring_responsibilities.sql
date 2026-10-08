-- Agency 1.0 #297-299. Local preparation only. No outside writes, prices,
-- Stripe export, email permission or provider acceptance is created here.
create table public.responsibility_bundles (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  provider_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  idempotency_key text not null,
  command jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(business_workspace_id,idempotency_key), unique(service_request_id)
);
create table public.responsibility_bundle_members (
  bundle_id uuid not null references public.responsibility_bundles(id) on delete restrict,
  responsibility_key text not null check(responsibility_key in ('gbp_replies','hours_sync','health','inquiry_reply_time','weekly_proof')),
  standing_responsibility_id uuid not null unique references public.standing_responsibilities(id) on delete restrict,
  primary key(bundle_id,responsibility_key)
);
create table public.responsibility_meter_periods (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  month date not null check(extract(day from month)=1),
  captured_at timestamptz not null default clock_timestamp(),
  capture_day date not null default (clock_timestamp() at time zone 'UTC')::date,
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  unique(business_workspace_id,month,capture_day)
);
create table public.business_responsibility_report_state (
  business_workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  provider_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  cadence text not null check(cadence in ('weekly','monthly')),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.responsibility_bundles enable row level security;
alter table public.responsibility_bundle_members enable row level security;
alter table public.responsibility_meter_periods enable row level security;
alter table public.business_responsibility_report_state enable row level security;
revoke all on public.responsibility_bundles,public.responsibility_bundle_members,public.responsibility_meter_periods,public.business_responsibility_report_state from public,anon,authenticated,service_role;

create function public.responsibility_assert_actor(p_business_id uuid,p_user_id uuid,p_verified_email text,p_provider_only boolean default false) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare provider uuid;
begin
  if not exists(select 1 from public.users where id=p_user_id and verified_at is not null and lower(email)=lower(p_verified_email)) then raise exception 'responsibility_actor_unverified'; end if;
  provider:=public.platform_serving_provider(p_business_id,'email');
  if not p_provider_only and exists(select 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=p_user_id and role in ('owner','admin')) then return provider; end if;
  if provider is null then raise exception 'responsibility_provider_unqualified'; end if;
  if not exists(select 1 from public.agency_client_staff s join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=s.user_id
    where s.agency_workspace_id=provider and s.customer_workspace_id=p_business_id and s.user_id=p_user_id and s.status='active') then raise exception 'responsibility_membership_denied'; end if;
  return provider;
end $$;

create function public.create_keep_me_found_bundle(p_business_id uuid,p_service_request_id uuid,p_provider_id uuid,p_user_id uuid,p_verified_email text,p_idempotency_key text,p_investigations jsonb,p_every_seconds integer,p_next_at timestamptz) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare request public.service_requests%rowtype; existing public.responsibility_bundles%rowtype; bundle uuid; standing uuid; key text; title text; policy jsonb; command jsonb; at_time timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':responsibility-bundle',0));
  if public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email) is distinct from p_provider_id then raise exception 'responsibility_provider_conflict'; end if;
  command:=jsonb_build_object('request',p_service_request_id,'provider',p_provider_id,'investigations',p_investigations,'everySeconds',p_every_seconds,'nextAt',p_next_at);
  select * into existing from public.responsibility_bundles where business_workspace_id=p_business_id and idempotency_key=p_idempotency_key;
  if found then
    if existing.command is distinct from command then raise exception 'responsibility_idempotency_conflict'; end if;
    return jsonb_build_object('bundleId',existing.id,'businessId',p_business_id,'providerWorkspaceId',p_provider_id,'replayed',true,'responsibilities',(select jsonb_agg(jsonb_build_object('key',responsibility_key,'id',standing_responsibility_id) order by responsibility_key) from public.responsibility_bundle_members where bundle_id=existing.id));
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.:-]{1,128}$' or p_every_seconds is null or p_every_seconds not between 60 and 31536000 or p_next_at is null or p_next_at<=at_time
    or p_investigations is null or jsonb_typeof(p_investigations)<>'object' or (select count(*) from jsonb_object_keys(p_investigations))<>5 then raise exception 'responsibility_invalid'; end if;
  select * into request from public.service_requests where id=p_service_request_id and business_workspace_id=p_business_id for update;
  if not found or request.status<>'requested' or request.provider_acceptance<>'accepted' or request.provider_kind<>'agency' or request.provider_agency_workspace_id is distinct from p_provider_id
    or not (array['gbp_replies','hours_sync','health','inquiry_reply_time','weekly_proof']::text[] <@ request.scope)
    or request.context->'standingInvestigations' is distinct from p_investigations
    or request.context->>'standingEverySeconds' is distinct from p_every_seconds::text
    or public.inquiry_safe_timestamp(request.context->>'standingNextAt') is distinct from p_next_at
    or request.delivery_commitment is null or request.delivery_commitment->>'status' not in ('running','submitted','accepted')
    or not exists(select 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=request.created_by and role in ('owner','admin')) then raise exception 'responsibility_mandate_required'; end if;
  -- The requester accepted these exact native resources and cadence. A generic
  -- agency relationship or service acceptance cannot create automatic authority.
  insert into public.responsibility_bundles(business_workspace_id,provider_workspace_id,service_request_id,idempotency_key,command) values(p_business_id,p_provider_id,p_service_request_id,p_idempotency_key,command) returning id into bundle;
  foreach key in array array['gbp_replies','hours_sync','health','inquiry_reply_time','weekly_proof'] loop
    if not exists(select 1 from public.saved_product_work where id::text=p_investigations->>key and workspace_id=p_business_id and product_id='investigations' and resource_kind='investigation') then raise exception 'responsibility_scope_invalid'; end if;
    title:=case key when 'gbp_replies' then 'Google review replies' when 'hours_sync' then 'Business hours' when 'health' then 'Website health' when 'inquiry_reply_time' then 'Inquiry reply time' else 'Weekly proof' end;
    policy:=jsonb_build_object('version',1,'revision',0,'title',title,'intent','Keep me found: check the agreed sources, report gaps, and request approval for outside changes.','ownerId',request.created_by,'status','proposed',
      'scope',jsonb_build_object('steps',jsonb_build_array(jsonb_build_object('id',key,'operation','investigation.run','workId',p_investigations->>key,'input','{}'::jsonb,'dependsOn','[]'::jsonb,'maximumCents',0,'capabilityVersion',1))),
      'trigger',jsonb_build_object('kind','interval','everySeconds',p_every_seconds,'nextAt',to_char(p_next_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),'limits',jsonb_build_object('maxConcurrentJobs',1,'maxRuns',null),
      'exclusions',jsonb_build_array('No outside write without the existing exact approval.','No provider acceptance, payment or send implied by a check.'),'createdAt',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'history','[]'::jsonb);
    insert into public.standing_responsibilities(workspace_id,owner_id,version,revision,status,payload,next_trigger_at) values(p_business_id,request.created_by,1,0,'proposed',policy,p_next_at) returning id into standing;
    policy:=policy||jsonb_build_object('revision',1,'status','active','approvedBy',request.created_by,'approvedAt',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','approve','actorId',request.created_by,'at',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'detail','Exact owner mandate service_request:'||request.id::text)));
    perform public.update_standing_responsibility(standing,p_business_id,request.created_by,(select email from public.users where id=request.created_by),0,policy);
    insert into public.responsibility_bundle_members values(bundle,key,standing);
  end loop;
  return jsonb_build_object('bundleId',bundle,'businessId',p_business_id,'providerWorkspaceId',p_provider_id,'replayed',false,'responsibilities',(select jsonb_agg(jsonb_build_object('key',responsibility_key,'id',standing_responsibility_id) order by responsibility_key) from public.responsibility_bundle_members where bundle_id=bundle));
end $$;

create function public.guard_responsibility_bundle_job() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare bundle public.responsibility_bundles%rowtype;
begin
  select b.* into bundle from public.responsibility_bundles b join public.responsibility_bundle_members m on m.bundle_id=b.id where m.standing_responsibility_id=new.standing_responsibility_id;
  if found and (public.platform_serving_provider(bundle.business_workspace_id,'email') is distinct from bundle.provider_workspace_id or not exists(select 1 from public.service_requests r where r.id=bundle.service_request_id and r.status='requested' and r.provider_acceptance='accepted' and r.provider_agency_workspace_id=bundle.provider_workspace_id and r.context->'standingInvestigations'=bundle.command->'investigations' and r.delivery_commitment->>'status' in ('running','submitted','accepted'))) then raise exception 'responsibility_mandate_revoked'; end if;
  return new;
end $$;
create trigger responsibility_bundle_job_guard before insert on public.standing_responsibility_jobs for each row execute function public.guard_responsibility_bundle_job();

create function public.guard_responsibility_bundle_execution() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare bundle public.responsibility_bundles%rowtype;
begin
  if new.product_id<>'operations' or new.resource_kind<>'responsibility' or new.payload->>'status'<>'running' then return new; end if;
  select b.* into bundle from public.responsibility_bundles b join public.responsibility_bundle_members m on m.bundle_id=b.id join public.standing_responsibility_jobs j on j.standing_responsibility_id=m.standing_responsibility_id where j.finite_work_id=new.id;
  if found and (public.platform_serving_provider(bundle.business_workspace_id,'email') is distinct from bundle.provider_workspace_id or not exists(select 1 from public.service_requests r where r.id=bundle.service_request_id and r.status='requested' and r.provider_acceptance='accepted' and r.provider_agency_workspace_id=bundle.provider_workspace_id and r.context->'standingInvestigations'=bundle.command->'investigations' and r.delivery_commitment->>'status' in ('running','submitted','accepted'))) then raise exception 'responsibility_mandate_revoked'; end if;
  return new;
end $$;
create trigger responsibility_bundle_execution_guard before update on public.saved_product_work for each row execute function public.guard_responsibility_bundle_execution();
revoke all on function public.guard_responsibility_bundle_execution() from public,anon,authenticated,service_role;

create function public.responsibility_immutable() returns trigger language plpgsql as $$ begin raise exception 'responsibility_snapshot_immutable'; end $$;
create trigger responsibility_meter_immutable before update or delete on public.responsibility_meter_periods for each row execute function public.responsibility_immutable();
create trigger responsibility_bundle_immutable before update or delete on public.responsibility_bundles for each row execute function public.responsibility_immutable();
create trigger responsibility_bundle_member_immutable before update or delete on public.responsibility_bundle_members for each row execute function public.responsibility_immutable();

create function public.snapshot_responsibility_meter(p_business_id uuid,p_user_id uuid,p_verified_email text,p_month date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare captured timestamptz:=clock_timestamp(); existing jsonb; standing jsonb; offerings jsonb; sla jsonb; snapshot jsonb; payer record;
begin
  perform public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':responsibility-meter:'||p_month::text,0));
  select m.snapshot into existing from public.responsibility_meter_periods m where m.business_workspace_id=p_business_id and m.month=p_month and m.capture_day=(captured at time zone 'UTC')::date;
  if found then return existing; end if;
  -- Immutable daily preview observations within a monthly period. Final close
  -- is deliberately unavailable without complete accepted/status history. This
  -- does not pretend to reconstruct
  -- a past month from today's active state or compute a billable quantity.
  if p_month is null or p_month is distinct from date_trunc('month',captured at time zone 'UTC')::date then raise exception 'responsibility_meter_month_invalid'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'acceptedAt',s.payload->>'approvedAt','providerWorkspaceId',b.provider_workspace_id,'serviceRequestId',b.service_request_id,'evidence','standing_responsibility:'||s.id||':v'||s.version) order by s.id),'[]'::jsonb) into standing
    from public.standing_responsibilities s left join public.responsibility_bundle_members m on m.standing_responsibility_id=s.id left join public.responsibility_bundles b on b.id=m.bundle_id
    where s.workspace_id=p_business_id and s.status='active' and s.payload->>'approvedAt' is not null
      and (b.id is null or (public.platform_serving_provider(p_business_id,'email')=b.provider_workspace_id and exists(select 1 from public.service_requests r where r.id=b.service_request_id and r.status='requested' and r.provider_acceptance='accepted' and r.delivery_commitment->>'status' in ('running','submitted','accepted'))));
  select coalesce(jsonb_agg(jsonb_build_object('installationId',i.id,'definitionId',i.definition_id,'definitionVersion',i.definition_version,'providerWorkspaceId',i.responsibility->>'agencyWorkspaceId','deliveryId',d.id,'acceptedAt',d.accepted_at,'evidence','offering_provider_delivery:'||d.id) order by i.id),'[]'::jsonb) into offerings
    from public.offering_installations i join public.offering_provider_deliveries d on d.installation_id=i.id and d.business_workspace_id=i.business_workspace_id
    join public.operational_assignments a on a.id=d.assignment_id and a.status='accepted' and a.expires_at>captured
    where i.business_workspace_id=p_business_id and i.status='active' and d.status='accepted' and d.accepted_at is not null and d.expires_at>captured;
  sla:=public.inquiry_outcome_cohort(p_business_id,p_month::timestamp at time zone 'UTC',captured);
  select * into payer from public.business_payer_party(p_business_id);
  snapshot:=jsonb_build_object('version',1,'stage','preview','businessId',p_business_id,'month',to_char(p_month,'YYYY-MM'),'capturedAt',captured,'payerParty',jsonb_build_object('kind',payer.kind,'workspaceId',payer.workspace_id),'measurement','active_accepted_responsibilities_as_of_capture','standingResponsibilities',standing,'acceptedOfferings',offerings,'slaEvidence',sla,'slaVerdict','Measured cohort; an accepted service target is not inferred from reply-time counts.',
    'evidence',jsonb_build_array('inquiry_outcome_cohort:'||p_business_id||':'||p_month::text||':'||captured::text),'priced',false,'stripeExportEnabled',false);
  insert into public.responsibility_meter_periods(business_workspace_id,month,snapshot,captured_at) values(p_business_id,p_month,snapshot,captured);
  return snapshot;
end $$;

create function public.set_provider_responsibility_cadence(p_business_id uuid,p_user_id uuid,p_verified_email text,p_cadence text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare provider uuid; tenant record;
begin
  provider:=public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  if p_cadence is null or p_cadence not in ('weekly','monthly') then raise exception 'responsibility_cadence_invalid'; end if;
  insert into public.business_responsibility_report_state values(p_business_id,provider,p_cadence,p_user_id,clock_timestamp()) on conflict(business_workspace_id) do update set provider_workspace_id=excluded.provider_workspace_id,cadence=excluded.cadence,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  -- Extend the existing cadence owner and weekly-report transport for every site.
  for tenant in select t.id from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id where l.workspace_id=p_business_id loop perform public.set_tenant_report_cadence(tenant.id,p_cadence,'dual_write'); end loop;
  return jsonb_build_object('businessId',p_business_id,'providerWorkspaceId',provider,'cadence',p_cadence);
end $$;
revoke all on function public.responsibility_assert_actor(uuid,uuid,text,boolean),public.guard_responsibility_bundle_job(),public.responsibility_immutable() from public,anon,authenticated,service_role;
revoke all on function public.create_keep_me_found_bundle(uuid,uuid,uuid,uuid,text,text,jsonb,integer,timestamptz),public.snapshot_responsibility_meter(uuid,uuid,text,date),public.set_provider_responsibility_cadence(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_keep_me_found_bundle(uuid,uuid,uuid,uuid,text,text,jsonb,integer,timestamptz),public.snapshot_responsibility_meter(uuid,uuid,text,date),public.set_provider_responsibility_cadence(uuid,uuid,text,text) to service_role;

create function public.read_responsibility_bundle_state(p_business_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare provider uuid; can_set boolean;
begin
  provider:=public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email);
  can_set:=provider is not null and exists(select 1 from public.agency_client_staff s join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=s.user_id where s.agency_workspace_id=provider and s.customer_workspace_id=p_business_id and s.user_id=p_user_id and s.status='active');
  return jsonb_build_object('businessId',p_business_id,'providerWorkspaceId',provider,'canSetCadence',can_set,
    'cadence',coalesce((select cadence from public.business_responsibility_report_state where business_workspace_id=p_business_id and provider_workspace_id=provider),'monthly'),
    'mandates',coalesce((select jsonb_agg(jsonb_build_object('serviceRequestId',r.id,'providerWorkspaceId',provider,'investigations',r.context->'standingInvestigations','everySeconds',(r.context->>'standingEverySeconds')::integer,'nextAt',r.context->>'standingNextAt','idempotencyKey','keep-me-found:'||r.id::text)) from public.service_requests r where r.business_workspace_id=p_business_id and r.provider_kind='agency' and r.provider_agency_workspace_id=provider and r.status='requested' and r.provider_acceptance='accepted' and r.delivery_commitment->>'status' in ('running','submitted','accepted') and r.context->'standingInvestigations' is not null and r.context->>'standingEverySeconds' ~ '^[0-9]{1,8}$' and public.inquiry_safe_timestamp(r.context->>'standingNextAt')>clock_timestamp() and not exists(select 1 from public.responsibility_bundles b where b.service_request_id=r.id)),'[]'::jsonb),
    'bundles',coalesce((select jsonb_agg(jsonb_build_object('bundleId',b.id,'providerWorkspaceId',b.provider_workspace_id,'serviceRequestId',b.service_request_id)) from public.responsibility_bundles b where b.business_workspace_id=p_business_id),'[]'::jsonb));
end $$;
revoke all on function public.read_responsibility_bundle_state(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_responsibility_bundle_state(uuid,uuid,text) to service_role;
create function public.read_responsibility_domain_evidence(p_business_id uuid,p_user_id uuid,p_verified_email text,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email);
  if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '32 days' then raise exception 'responsibility_period_invalid'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'responsibilityId',m.standing_responsibility_id,'key',m.responsibility_key,
    'receipts',coalesce((select jsonb_agg(public.google_listing_receipt_json(g) order by g.created_at,g.id) from public.google_listing_receipts g where g.workspace_id=p_business_id and g.location_id=r.context->>'googleLocationId' and g.created_at>=p_from and g.created_at<p_to and ((m.responsibility_key='gbp_replies' and g.action in ('reply_post','reply_update')) or (m.responsibility_key='hours_sync' and g.action='hours_patch'))),'[]'::jsonb),
    'health',case when m.responsibility_key='health' then coalesce((select jsonb_agg(jsonb_build_object('websiteWorkId',h.website_work_id,'checkedAt',h.checked_at,'status',h.status,'revision',h.revision,'evidence','website_document_health:'||h.website_work_id||':'||h.checked_at::text)) from public.website_document_health h where h.workspace_id=p_business_id and h.website_work_id::text=r.context->>'websiteWorkId' and h.checked_at>=p_from and h.checked_at<p_to),'[]'::jsonb) else '[]'::jsonb end,
    'inquiries',case when m.responsibility_key='inquiry_reply_time' then public.inquiry_outcome_cohort(p_business_id,p_from,p_to) else null end,
    'reports',case when m.responsibility_key='weekly_proof' then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'at',c.created_at,'evidence','catalog_report_receipt:'||c.id)) from public.catalog_report_receipts c where c.workspace_id=p_business_id and c.created_at>=p_from and c.created_at<p_to),'[]'::jsonb) else '[]'::jsonb end
  )) from public.responsibility_bundle_members m join public.responsibility_bundles b on b.id=m.bundle_id join public.service_requests r on r.id=b.service_request_id where b.business_workspace_id=p_business_id),'[]'::jsonb);
end $$;
revoke all on function public.read_responsibility_domain_evidence(uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.read_responsibility_domain_evidence(uuid,uuid,text,timestamptz,timestamptz) to service_role;
create function public.read_responsibility_proof_rows(p_business_id uuid,p_user_id uuid,p_verified_email text,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare provider uuid; direct boolean;
begin
  provider:=public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email);
  direct:=exists(select 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=p_user_id and role in ('owner','admin'));
  if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '32 days' then raise exception 'responsibility_period_invalid'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('policy',to_jsonb(s),'runs',coalesce((select jsonb_agg(to_jsonb(run)||jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(receipt)) from public.standing_responsibility_receipts receipt where receipt.run_id=run.id and coalesce(receipt.finished_at,receipt.created_at)>=p_from and coalesce(receipt.finished_at,receipt.created_at)<p_to),'[]'::jsonb))) from public.standing_responsibility_runs run where run.standing_responsibility_id=s.id and (run.created_at>=p_from and run.created_at<p_to or exists(select 1 from public.standing_responsibility_receipts receipt where receipt.run_id=run.id and coalesce(receipt.finished_at,receipt.created_at)>=p_from and coalesce(receipt.finished_at,receipt.created_at)<p_to))),'[]'::jsonb))) from public.standing_responsibilities s where s.workspace_id=p_business_id and (direct or exists(select 1 from public.responsibility_bundle_members m join public.responsibility_bundles b on b.id=m.bundle_id where m.standing_responsibility_id=s.id and b.provider_workspace_id=provider))),'[]'::jsonb);
end $$;
revoke all on function public.read_responsibility_proof_rows(uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.read_responsibility_proof_rows(uuid,uuid,text,timestamptz,timestamptz) to service_role;
-- Trusted read for the existing report transport. Same provider verification
-- and identity source as the neutral service actor; never returns grants/tokens.
create function public.read_responsibility_proof_for_tenant(p_tenant_id text,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare business uuid; provider uuid; reader record;
begin
  select l.workspace_id into business from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id where t.id=p_tenant_id;
  if business is null or not exists(select 1 from public.responsibility_bundles where business_workspace_id=business) then return null; end if;
  provider:=public.platform_serving_provider(business,'email');
  if provider is null then return jsonb_build_object('businessId',business,'status','unavailable'); end if;
  select * into reader from public.platform_service_identity(business,provider);
  if reader.user_id is null then return jsonb_build_object('businessId',business,'status','unavailable'); end if;
  return jsonb_build_object('businessId',business,'providerWorkspaceId',provider,'rows',public.read_responsibility_proof_rows(business,reader.user_id,reader.email,p_from,p_to),'domain',public.read_responsibility_domain_evidence(business,reader.user_id,reader.email,p_from,p_to));
end $$;
revoke all on function public.read_responsibility_proof_for_tenant(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.read_responsibility_proof_for_tenant(text,timestamptz,timestamptz) to service_role;

create table public.responsibility_meter_capture_attempts (
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  month date not null,
  attempted_at timestamptz not null,
  status text not null check(status in ('captured','unavailable')),
  primary key(business_workspace_id,month)
);
alter table public.responsibility_meter_capture_attempts enable row level security;
revoke all on public.responsibility_meter_capture_attempts from public,anon,authenticated,service_role;

-- Bounded capture in the existing guarded work cron. No final close, bills or exports. Current-month previews only.
-- Per-business failures remain explicit and cannot stop the execution sweep.
create function public.snapshot_due_responsibility_meters(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare business record; provider uuid; reader record; processed integer:=0; failures jsonb:='[]'::jsonb; capture_month date:=date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'responsibility_meter_limit_invalid'; end if;
  for business in select w.id from public.workspaces w left join public.responsibility_meter_capture_attempts a on a.business_workspace_id=w.id and a.month=capture_month where
    (exists(select 1 from public.standing_responsibilities s where s.workspace_id=w.id and s.status='active' and s.payload->>'approvedAt' is not null)
      or exists(select 1 from public.offering_installations i where i.business_workspace_id=w.id and i.status='active'))
    and not exists(select 1 from public.responsibility_meter_periods m where m.business_workspace_id=w.id and m.month=capture_month and m.capture_day=(clock_timestamp() at time zone 'UTC')::date)
    order by coalesce(a.attempted_at,'epoch'::timestamptz),w.id limit p_limit
  loop
    begin
      provider:=public.platform_serving_provider(business.id,'email');
      if provider is null then raise exception 'responsibility_provider_unqualified'; end if;
      select * into reader from public.platform_service_identity(business.id,provider);
      if reader.user_id is null then raise exception 'responsibility_identity_unavailable'; end if;
      perform public.snapshot_responsibility_meter(business.id,reader.user_id,reader.email,capture_month);
      processed:=processed+1;
      insert into public.responsibility_meter_capture_attempts values(business.id,capture_month,clock_timestamp(),'captured') on conflict(business_workspace_id,month) do update set attempted_at=excluded.attempted_at,status=excluded.status;
    exception when others then
      failures:=failures||jsonb_build_array(jsonb_build_object('businessId',business.id,'status','unavailable'));
      insert into public.responsibility_meter_capture_attempts values(business.id,capture_month,clock_timestamp(),'unavailable') on conflict(business_workspace_id,month) do update set attempted_at=excluded.attempted_at,status=excluded.status;
    end;
  end loop;
  return jsonb_build_object('processed',processed,'failed',jsonb_array_length(failures),'failures',failures,'priced',false,'stripeExportEnabled',false);
end $$;
revoke all on function public.snapshot_due_responsibility_meters(integer) from public,anon,authenticated;
grant execute on function public.snapshot_due_responsibility_meters(integer) to service_role;
