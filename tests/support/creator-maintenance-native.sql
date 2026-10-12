\set ON_ERROR_STOP on
begin;
create temporary table cm_input as select :'v1'::uuid owner_id, :'v2'::text owner_email, :'v3'::uuid admin_id, :'v4'::text admin_email, :'v5'::uuid business_id, :'v6'::uuid agency_id, :'v7'::text agreement, :'v8'::text rate;
create temporary table cm_result(body jsonb);
do $$
declare p record; creator uuid; revision uuid; listing jsonb; installation public.offering_installations; app uuid; q public.system_revision_qualifications;
begin
 select * into p from cm_input;
 if not exists(select 1 from public.users where id=p.owner_id and email=p.owner_email and verified_at is not null) or not exists(select 1 from public.users where id=p.admin_id and email=p.admin_email and verified_at is not null) then raise exception 'cm_fixture_actual_verified_auth_users_required';end if;
 -- Explicit disposable operator/membership/reviewer prerequisites, not approval
 -- receipts. Every source, review, installation and listing uses its real command.
 insert into public.super_admins(user_id,email) values(p.owner_id,p.owner_email) on conflict(user_id) do nothing;
 creator:=public.read_platform_workspace('strelva_agency');
 if creator is null then creator:=public.set_platform_workspace(p.owner_email,'strelva_agency',p.agency_id);end if;
 if public.workspace_exit_completed(creator) then raise exception 'cm_fixture_fresh_live_creator_required';end if;
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(creator,p.owner_id,'owner',p.owner_id),(creator,p.admin_id,'admin',p.owner_id) on conflict(workspace_id,user_id) do nothing;
 perform public.connect_assert_manager(creator,p.owner_id,p.owner_email);
 perform public.connect_assert_manager(creator,p.admin_id,p.admin_email);
 perform public.register_offering_package_source(p.owner_email,'private_staff_requests','1.0.0');
 select source_revision_id into revision from public.offering_package_sources where definition_id='private_staff_requests' and definition_version='1.0.0';
 if not exists(select 1 from public.system_version_source_revisions where id=revision and creator_workspace_id=creator) then raise exception 'cm_fixture_exact_source_creator_required';end if;
 select * into q from public.system_revision_qualifications where revision_id=revision;
 if q.human_state='pending' then
  insert into public.system_revision_reviewers(user_id,policy_version) values(p.admin_id,'fictional-local-creator-maintenance-review') on conflict(user_id) do nothing;
  perform public.review_system_revision_qualification(p.admin_id,p.admin_email,revision,true,'Owned fictional exact source native maintenance rehearsal; no commercial policy selected.');
 end if;
 if not public.system_revision_is_qualified(revision) then raise exception 'cm_fixture_genuine_source_qualification_required';end if;
 installation:=public.prepare_staff_request_offering(p.business_id,p.owner_id,p.owner_email,'cm-native:'||p.agreement,repeat('c',64),'{}','{"kind":"customer_operated","providerName":"Fictional local team"}',array['submit_requests','review_requests'],array['staff_app','business_workspace']);
 app:=(installation.native_resources->0->>'id')::uuid;
 perform public.rehearse_application_candidate(app,p.business_id,p.owner_id,p.owner_email,0);
 perform public.publish_application_candidate(app,p.business_id,p.owner_id,p.owner_email,0,0);
 installation:=public.activate_offering(p.business_id,installation.id,p.owner_id,p.owner_email,1);
 if installation.status<>'active' or installation.source_revision_id<>revision or installation.creator_workspace_id<>creator or installation.version_lineage_id is null then raise exception 'cm_fixture_original_installation_identity_required';end if;
 select to_jsonb(l) into listing from public.creator_listings l where definition_id='private_staff_requests' and source_revision_id=revision;
 if listing is null then listing:=public.register_creator_listing('private_staff_requests',revision,creator,p.owner_id,p.owner_email,p.agreement,p.rate);end if;
 -- There is no agreement-authoring HTTP/RPC producer. This explicit immutable
 -- fictional native policy row is a prerequisite, never a chosen Strelva rate.
 insert into public.money_agreements(beneficiary_workspace_id,kind,version,rate_reference,rate_bps,effective_from,effective_until,approved_by,approved_at)
 values(creator,'creator',p.agreement,p.rate,137,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 days',p.owner_id,clock_timestamp());
 insert into cm_result values(jsonb_build_object('workspaceId',creator,'listing',listing,'installation',to_jsonb(installation),'agreementVersion',p.agreement,'rateReference',p.rate));
end $$;
select body from cm_result;
commit;
