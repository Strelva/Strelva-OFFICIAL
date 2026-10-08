-- #297 private preparation only. Existing standing policies remain read-only.
-- No auto approval, provider project selection, external operation or price.
begin;
create table public.bundle_maintenance_attachments (
 id uuid primary key default gen_random_uuid(), bundle_id uuid not null unique references public.responsibility_bundles(id) on delete restrict,
 binding_id uuid not null references public.workspace_account_bindings(id) on delete restrict,
 location_id text not null, hours_source text not null check(hours_source='business_record'),
 reply_policy text not null check(reply_policy='approve'), standing_versions jsonb not null, approved_by uuid not null references public.users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp()
);
create table public.bundle_maintenance_preparations (
 id uuid primary key default gen_random_uuid(), attachment_id uuid not null references public.bundle_maintenance_attachments(id) on delete restrict,
 cycle_key text not null check(cycle_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
 action text not null check(action in ('hours','reply')), target_ref text not null,
 prepared_by uuid not null references public.users(id) on delete restrict, prepared_email text not null,
 record_revision bigint not null check(record_revision>=0), draft jsonb not null,
 created_at timestamptz not null default clock_timestamp(), unique(attachment_id,cycle_key,action,target_ref)
);
create unique index bundle_maintenance_one_review on public.bundle_maintenance_preparations(attachment_id,target_ref) where action='reply';
create table public.bundle_maintenance_event_links (
 preparation_id uuid primary key references public.bundle_maintenance_preparations(id) on delete restrict,
 event_id text not null unique check(length(event_id) between 1 and 200), created_at timestamptz not null default clock_timestamp()
);
alter table public.bundle_maintenance_attachments enable row level security;
alter table public.bundle_maintenance_preparations enable row level security;
alter table public.bundle_maintenance_event_links enable row level security;
revoke all on public.bundle_maintenance_attachments,public.bundle_maintenance_preparations,public.bundle_maintenance_event_links from public,anon,authenticated,service_role;
create trigger bundle_maintenance_attachment_immutable before update or delete on public.bundle_maintenance_attachments for each row execute function public.responsibility_immutable();
create trigger bundle_maintenance_preparation_immutable before update or delete on public.bundle_maintenance_preparations for each row execute function public.responsibility_immutable();
create trigger bundle_maintenance_event_immutable before update or delete on public.bundle_maintenance_event_links for each row execute function public.responsibility_immutable();

create function public.bundle_maintenance_holds(p_attachment_id uuid,p_user_id uuid,p_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.bundle_maintenance_attachments; b public.responsibility_bundles; r public.service_requests; binding public.workspace_account_bindings; config jsonb; scope text;
begin
 select * into a from public.bundle_maintenance_attachments where id=p_attachment_id for share;
 if not found then raise exception 'bundle_maintenance_not_found'; end if;
 select * into b from public.responsibility_bundles where id=a.bundle_id for share;
 perform 1 from public.workspaces where id=b.business_workspace_id for share;
 if public.workspace_exit_completed(b.business_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
 perform 1 from public.users where id=p_user_id and verified_at is not null and lower(email)=lower(btrim(coalesce(p_email,''))) for share;
 if not found then raise exception 'acting_provider_not_staffed'; end if;
 perform 1 from public.workspace_providers where customer_workspace_id=b.business_workspace_id and provider_workspace_id=b.provider_workspace_id and status='active' for share;
 if not found then raise exception 'bundle_maintenance_provider_changed'; end if;
 if public.assert_acting_provider(b.business_workspace_id,p_user_id,p_email,'google','google_location',a.location_id) is distinct from b.provider_workspace_id then raise exception 'bundle_maintenance_provider_changed'; end if;
 select * into r from public.service_requests where id=b.service_request_id for share;
 config:=jsonb_build_object('bindingId',a.binding_id,'locationId',a.location_id,'hoursSource',a.hours_source,'replyPolicy',a.reply_policy);
 if r.status<>'requested' or r.provider_acceptance<>'accepted' or r.provider_kind<>'agency' or r.business_workspace_id is distinct from b.business_workspace_id or r.created_by is distinct from a.approved_by or r.provider_agency_workspace_id is distinct from b.provider_workspace_id
  or not coalesce(array['gbp_replies','hours_sync','health','inquiry_reply_time','weekly_proof']::text[] <@ r.scope,false)
  or r.context->'standingInvestigations' is distinct from b.command->'investigations'
  or r.context->>'standingEverySeconds' is distinct from b.command->>'everySeconds'
  or public.inquiry_safe_timestamp(r.context->>'standingNextAt') is distinct from (b.command->>'nextAt')::timestamptz
  or r.context->'maintenanceAttachment' is distinct from config or coalesce(r.delivery_commitment->>'status','') not in ('running','submitted','accepted') then raise exception 'bundle_maintenance_mandate_revoked'; end if;
 perform 1 from public.users where id=a.approved_by and verified_at is not null for share;
 if not found then raise exception 'bundle_maintenance_owner_changed'; end if;
 perform 1 from public.workspace_memberships where workspace_id=b.business_workspace_id and user_id=a.approved_by and role='owner' for share;
 if not found then raise exception 'bundle_maintenance_owner_changed'; end if;
 perform 1 from public.responsibility_bundle_members m join public.standing_responsibilities s on s.id=m.standing_responsibility_id where m.bundle_id=b.id for share of s;
 if a.standing_versions is distinct from (select jsonb_object_agg(m.standing_responsibility_id::text,s.version) from public.responsibility_bundle_members m join public.standing_responsibilities s on s.id=m.standing_responsibility_id where m.bundle_id=b.id) then raise exception 'bundle_maintenance_source_changed'; end if;
 if (select count(*) from public.responsibility_bundle_members m join public.standing_responsibilities s on s.id=m.standing_responsibility_id where m.bundle_id=b.id and s.status='active' and s.payload->>'approvedAt' is not null)<>5 then raise exception 'bundle_maintenance_paused'; end if;
 select * into binding from public.workspace_account_bindings where id=a.binding_id and workspace_id=b.business_workspace_id for share;
 if not found or binding.status<>'connected' or not coalesce(binding.scopes @> array['https://www.googleapis.com/auth/business.manage'],false) then raise exception 'bundle_maintenance_google_disconnected'; end if;
 perform 1 from public.workspace_google_locations where workspace_id=b.business_workspace_id and binding_id=a.binding_id and location_id=a.location_id for share;
 if not found then raise exception 'bundle_maintenance_location_changed'; end if;
 perform 1 from public.google_listing_controls where workspace_id=b.business_workspace_id and location_id=a.location_id for share;
 if (public.read_google_listing_control(b.business_workspace_id,a.location_id)->>'paused')::boolean then raise exception 'bundle_maintenance_paused'; end if;
 scope:=coalesce((select t.id from public.tenants t where t.stable_id=binding.origin_tenant_stable_id),'workspace-'||b.business_workspace_id);
 return jsonb_build_object('attachmentId',a.id,'bundleId',b.id,'businessId',b.business_workspace_id,'providerWorkspaceId',b.provider_workspace_id,'serviceRequestId',b.service_request_id,'bindingId',a.binding_id,'locationId',a.location_id,'tenantId',scope,'hoursSource',a.hours_source,'replyPolicy',a.reply_policy);
end $$;
revoke all on function public.bundle_maintenance_holds(uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.attach_keep_me_found_maintenance(p_user_id uuid,p_verified_email text,p_bundle_id uuid,p_binding_id uuid,p_location_id text,p_hours_source text,p_reply_policy text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.responsibility_bundles; r public.service_requests; a public.bundle_maintenance_attachments; config jsonb; staff record;
begin
 perform 1 from public.users where id=p_user_id and verified_at is not null and lower(email)=lower(p_verified_email) for share;
 if not found then raise exception 'bundle_maintenance_owner_required'; end if;
 select * into b from public.responsibility_bundles where id=p_bundle_id for share;
 if not found then raise exception 'bundle_maintenance_not_found'; end if;
 perform 1 from public.workspace_memberships where workspace_id=b.business_workspace_id and user_id=p_user_id and role='owner' for share;
 if not found then raise exception 'bundle_maintenance_owner_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_bundle_id::text||':maintenance',0));
 config:=jsonb_build_object('bindingId',p_binding_id,'locationId',p_location_id,'hoursSource',p_hours_source,'replyPolicy',p_reply_policy);
 select * into r from public.service_requests where id=b.service_request_id for share;
 if r.created_by is distinct from p_user_id or r.context->'maintenanceAttachment' is distinct from config then raise exception 'bundle_maintenance_exact_consent_required'; end if;
 select * into a from public.bundle_maintenance_attachments where bundle_id=p_bundle_id;
 if found then
  if a.binding_id is distinct from p_binding_id or a.location_id is distinct from p_location_id or a.hours_source is distinct from p_hours_source or a.reply_policy is distinct from p_reply_policy or a.approved_by is distinct from p_user_id then raise exception 'bundle_maintenance_conflict'; end if;
 else
  insert into public.bundle_maintenance_attachments(bundle_id,binding_id,location_id,hours_source,reply_policy,standing_versions,approved_by) values(p_bundle_id,p_binding_id,p_location_id,p_hours_source,p_reply_policy,(select jsonb_object_agg(m.standing_responsibility_id::text,s.version) from public.responsibility_bundle_members m join public.standing_responsibilities s on s.id=m.standing_responsibility_id where m.bundle_id=b.id),p_user_id) returning * into a;
 end if;
 select u.id,u.email into staff from public.agency_client_staff s join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=s.user_id join public.users u on u.id=s.user_id and u.verified_at is not null where s.agency_workspace_id=b.provider_workspace_id and s.customer_workspace_id=b.business_workspace_id and s.status='active' order by u.id limit 1;
 if not found then raise exception 'bundle_maintenance_staff_required'; end if;
 -- Materialize the existing default so a concurrent pause serializes with
 -- this attachment's qualification instead of inserting an unlocked row.
 insert into public.google_listing_controls(workspace_id,location_id) values(b.business_workspace_id,a.location_id) on conflict do nothing;
 return public.bundle_maintenance_holds(a.id,staff.id,staff.email);
end $$;
revoke all on function public.attach_keep_me_found_maintenance(uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.attach_keep_me_found_maintenance(uuid,text,uuid,uuid,text,text,text) to service_role;

create function public.check_bundle_maintenance_attachment(p_attachment_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.bundle_maintenance_holds(p_attachment_id,p_user_id,p_verified_email) $$;
revoke all on function public.check_bundle_maintenance_attachment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.check_bundle_maintenance_attachment(uuid,uuid,text) to service_role;

create function public.reserve_bundle_maintenance_preparation(p_attachment_id uuid,p_user_id uuid,p_verified_email text,p_cycle_key text,p_record_revision bigint,p_draft jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare target jsonb; row_value public.bundle_maintenance_preparations; ref text; current_revision bigint; v_action text:=p_draft->>'action';
begin
 target:=public.bundle_maintenance_holds(p_attachment_id,p_user_id,p_verified_email);
 if v_action not in ('hours','reply') or p_cycle_key is null or p_cycle_key !~ '^[A-Za-z0-9_.:-]{1,128}$' or p_record_revision is null then raise exception 'bundle_maintenance_draft_invalid'; end if;
 select revision into current_revision from public.business_records where workspace_id=(target->>'businessId')::uuid for share;
 if not found or current_revision is distinct from p_record_revision then raise exception 'bundle_maintenance_source_changed'; end if;
 if v_action='hours' then
  if not exists(select 1 from public.business_record_facts where workspace_id=(target->>'businessId')::uuid and fact_key='hours') then raise exception 'bundle_maintenance_source_missing'; end if;
  if p_draft is distinct from jsonb_build_object('action','hours','hours',coalesce((select value from public.business_record_facts where workspace_id=(target->>'businessId')::uuid and fact_key='hours'),'null'::jsonb)) then raise exception 'bundle_maintenance_source_changed'; end if;
  ref:='hours';
 else
  if jsonb_typeof(p_draft->'text') is distinct from 'string' or p_draft->>'reviewId' is null or p_draft->>'reviewId' !~ '^[A-Za-z0-9_-]{1,200}$' or octet_length(btrim(p_draft->>'text')) not between 1 and 4096 or (select count(*) from jsonb_object_keys(p_draft))<>3 then raise exception 'bundle_maintenance_draft_invalid'; end if;
  ref:=p_draft->>'reviewId';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_attachment_id::text||':'||p_cycle_key||':'||v_action||':'||ref,0));
 select * into row_value from public.bundle_maintenance_preparations where attachment_id=p_attachment_id and (cycle_key=p_cycle_key or v_action='reply') and bundle_maintenance_preparations.action=v_action and target_ref=ref;
 if found then
  if row_value.draft is distinct from p_draft or row_value.record_revision is distinct from p_record_revision or row_value.prepared_by is distinct from p_user_id then raise exception 'bundle_maintenance_conflict'; end if;
  return to_jsonb(row_value)||jsonb_build_object('replayed',true,'eventId',(select event_id from public.bundle_maintenance_event_links where preparation_id=row_value.id),'target',target);
 end if;
 insert into public.bundle_maintenance_preparations(attachment_id,cycle_key,action,target_ref,prepared_by,prepared_email,record_revision,draft) values(p_attachment_id,p_cycle_key,v_action,ref,p_user_id,lower(p_verified_email),p_record_revision,p_draft) returning * into row_value;
 return to_jsonb(row_value)||jsonb_build_object('replayed',false,'eventId',null,'target',target);
end $$;
revoke all on function public.reserve_bundle_maintenance_preparation(uuid,uuid,text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_bundle_maintenance_preparation(uuid,uuid,text,text,bigint,jsonb) to service_role;

create function public.link_bundle_maintenance_event(p_preparation_id uuid,p_user_id uuid,p_verified_email text,p_event_id text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.bundle_maintenance_preparations; previous text;
begin
 select * into p from public.bundle_maintenance_preparations where id=p_preparation_id for share;
 if not found or p.prepared_by is distinct from p_user_id or lower(p.prepared_email) is distinct from lower(p_verified_email) then raise exception 'bundle_maintenance_actor_denied'; end if;
 perform public.bundle_maintenance_holds(p.attachment_id,p_user_id,p_verified_email);
 perform pg_advisory_xact_lock(hashtextextended(p_preparation_id::text||':event',0));
 select event_id into previous from public.bundle_maintenance_event_links where preparation_id=p_preparation_id;
 if found then
  if previous is distinct from p_event_id then raise exception 'bundle_maintenance_conflict'; end if;
  return;
 end if;
 insert into public.bundle_maintenance_event_links(preparation_id,event_id) values(p_preparation_id,p_event_id);
end $$;
revoke all on function public.link_bundle_maintenance_event(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.link_bundle_maintenance_event(uuid,uuid,text,text) to service_role;

-- Service-only execution check. Existing event authorization still owns the
-- exact human decision; this does not approve or dispatch anything.
create function public.check_bundle_maintenance_event(p_preparation_id uuid,p_event_id text,p_business_id uuid,p_binding_id uuid,p_location_id text,p_draft jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.bundle_maintenance_preparations; target jsonb;
begin
 select * into p from public.bundle_maintenance_preparations where id=p_preparation_id for share;
 if not found or p.draft is distinct from p_draft or not exists(select 1 from public.bundle_maintenance_event_links where preparation_id=p.id and event_id=p_event_id) then raise exception 'bundle_maintenance_event_changed'; end if;
 target:=public.bundle_maintenance_holds(p.attachment_id,p.prepared_by,p.prepared_email);
 if (target->>'businessId')::uuid is distinct from p_business_id or (target->>'bindingId')::uuid is distinct from p_binding_id or target->>'locationId' is distinct from p_location_id then raise exception 'bundle_maintenance_event_changed'; end if;
 perform 1 from public.business_records where workspace_id=p_business_id and revision=p.record_revision for share;
 if not found then raise exception 'bundle_maintenance_source_changed'; end if;
 if p.action='hours' and p.draft is distinct from jsonb_build_object('action','hours','hours',(select value from public.business_record_facts where workspace_id=p_business_id and fact_key='hours')) then raise exception 'bundle_maintenance_source_changed'; end if;
 return true;
end $$;
revoke all on function public.check_bundle_maintenance_event(uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.check_bundle_maintenance_event(uuid,text,uuid,uuid,text,jsonb) to service_role;
create function public.create_keep_me_found_maintenance_bundle(p_business_id uuid,p_service_request_id uuid,p_provider_id uuid,p_user_id uuid,p_verified_email text,p_idempotency_key text,p_investigations jsonb,p_every_seconds integer,p_next_at timestamptz,p_binding_id uuid,p_location_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare bundle jsonb; attachment jsonb;
begin
 bundle:=public.create_keep_me_found_bundle(p_business_id,p_service_request_id,p_provider_id,p_user_id,p_verified_email,p_idempotency_key,p_investigations,p_every_seconds,p_next_at);
 attachment:=public.attach_keep_me_found_maintenance(p_user_id,p_verified_email,(bundle->>'bundleId')::uuid,p_binding_id,p_location_id,'business_record','approve');
 return bundle||jsonb_build_object('maintenance',attachment);
end $$;
revoke all on function public.create_keep_me_found_maintenance_bundle(uuid,uuid,uuid,uuid,text,text,jsonb,integer,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.create_keep_me_found_maintenance_bundle(uuid,uuid,uuid,uuid,text,text,jsonb,integer,timestamptz,uuid,text) to service_role;
create function public.read_bundle_maintenance_receipts(p_business_id uuid,p_user_id uuid,p_verified_email text,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare provider uuid; direct boolean;
begin
 provider:=public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email);
 direct:=exists(select 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=p_user_id and role in ('owner','admin'));
 if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '32 days' then raise exception 'responsibility_period_invalid'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('responsibilityId',m.standing_responsibility_id,'receipt',public.google_listing_receipt_json(g)))
 from public.responsibility_bundles b join public.bundle_maintenance_attachments a on a.bundle_id=b.id
 join public.bundle_maintenance_preparations p on p.attachment_id=a.id join public.bundle_maintenance_event_links e on e.preparation_id=p.id
 join public.responsibility_bundle_members m on m.bundle_id=b.id and m.responsibility_key=case p.action when 'hours' then 'hours_sync' else 'gbp_replies' end
 join public.google_listing_receipts g on g.workspace_id=b.business_workspace_id and g.binding_id=a.binding_id and g.location_id=a.location_id and g.idempotency_key='google-draft:'||e.event_id
 where b.business_workspace_id=p_business_id and (direct or b.provider_workspace_id=provider) and g.created_at>=p_from and g.created_at<p_to),'[]'::jsonb);
end $$;
revoke all on function public.read_bundle_maintenance_receipts(uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.read_bundle_maintenance_receipts(uuid,uuid,text,timestamptz,timestamptz) to service_role;
commit;
