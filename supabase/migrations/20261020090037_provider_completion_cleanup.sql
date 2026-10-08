-- Literal AG11 completion cleanup and explicit exit revocation. No notice policy or outside effect.
begin;
set local lock_timeout='3s';
alter table public.business_attribution_endings add column workspace_exit_request_id uuid references public.workspace_exit_requests(id);
alter table public.business_attribution_endings alter column provider_change_request_id drop not null;
alter table public.business_attribution_endings add constraint business_attribution_one_ending_origin check ((provider_change_request_id is null)<>(workspace_exit_request_id is null));
create table public.provider_exit_completion_permissions(
 workspace_exit_request_id uuid primary key references public.workspace_exit_requests(id),
 provider_id uuid not null references public.workspace_providers(id),
 business_workspace_id uuid not null references public.workspaces(id),ended_by uuid not null references public.users(id)
);
create table public.provider_completion_cleanup_receipts(
 provider_id uuid primary key references public.workspace_providers(id),
 business_workspace_id uuid not null references public.workspaces(id),
 agency_workspace_id uuid not null references public.workspaces(id),
 ended_by uuid references public.users(id),ended_at timestamptz not null,receipt jsonb not null
);
create table public.provider_completion_rollback_state(
 signature text primary key,definition text not null,normalized_acl jsonb not null,owner_name text not null
);
alter table public.provider_completion_rollback_state enable row level security;
revoke all on public.provider_completion_rollback_state from public,anon,authenticated,service_role;
create trigger provider_completion_rollback_state_immutable before update or delete on public.provider_completion_rollback_state for each row execute function public.money_immutable_guard();
alter table public.provider_exit_completion_permissions enable row level security;
alter table public.provider_completion_cleanup_receipts enable row level security;
revoke all on public.provider_exit_completion_permissions,public.provider_completion_cleanup_receipts from public,anon,authenticated,service_role;
create trigger provider_completion_cleanup_immutable before update or delete on public.provider_completion_cleanup_receipts for each row execute function public.money_immutable_guard();

create function public.provider_completion_end_authority() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare applications integer;websites integer;packages integer;assignments integer;at_time timestamptz;exit_id uuid;
begin
 at_time:=coalesce(new.ended_at,clock_timestamp());
 -- Candidate writers already hold these work rows. Finish an authorized
 -- in-flight edit before ending; a writer waiting here rechecks revoked grants.
 perform 1 from public.saved_product_work w where w.id in
  (select g.application_work_id from public.agency_application_draft_grants g where g.business_workspace_id=new.customer_workspace_id and g.agency_workspace_id=new.provider_workspace_id and g.status='active') order by w.id for update;
 update public.operational_assignments set status='revoked',revoked_at=at_time,revoked_by=new.ended_by
  where workspace_id=new.customer_workspace_id and assignee_kind='agency' and assignee_workspace_id=new.provider_workspace_id and status in ('offered','accepted');
 get diagnostics assignments=row_count;
 if new.ended_by is not null then
  update public.agency_application_draft_grants set status='revoked',revoked_at=at_time,revoked_by=new.ended_by,updated_at=at_time
   where business_workspace_id=new.customer_workspace_id and agency_workspace_id=new.provider_workspace_id and status='active';
  get diagnostics applications=row_count;
  update public.agency_managed_website_draft_grants set status='revoked',revoked_at=at_time,revoked_by=new.ended_by,updated_at=at_time
   where business_workspace_id=new.customer_workspace_id and agency_workspace_id=new.provider_workspace_id and status='active';
  get diagnostics websites=row_count;
 else
  -- Preserve an unattributed historical/admin end rather than invent an actor.
  update public.agency_application_draft_grants set expires_at=greatest(created_at+interval '1 microsecond',clock_timestamp()),updated_at=at_time
   where business_workspace_id=new.customer_workspace_id and agency_workspace_id=new.provider_workspace_id and status='active' and expires_at>clock_timestamp();
  get diagnostics applications=row_count;
  update public.agency_managed_website_draft_grants set expires_at=greatest(created_at+interval '1 microsecond',clock_timestamp()),updated_at=at_time
   where business_workspace_id=new.customer_workspace_id and agency_workspace_id=new.provider_workspace_id and status='active' and expires_at>clock_timestamp();
  get diagnostics websites=row_count;
 end if;
 update public.system_package_install_grants set status='revoked'
  where business_workspace_id=new.customer_workspace_id and agency_workspace_id=new.provider_workspace_id and status='active';
 get diagnostics packages=row_count;
 select workspace_exit_request_id into exit_id from public.provider_exit_completion_permissions where provider_id=new.id and business_workspace_id=new.customer_workspace_id and ended_by=new.ended_by;
 insert into public.provider_completion_cleanup_receipts values(new.id,new.customer_workspace_id,new.provider_workspace_id,new.ended_by,at_time,
  jsonb_build_object('providerId',new.id,'businessWorkspaceId',new.customer_workspace_id,'agencyWorkspaceId',new.provider_workspace_id,'endedBy',new.ended_by,'endedAt',at_time,'workspaceExitRequestId',exit_id,'applicationDraftGrantsEnded',applications,'websiteDraftGrantsEnded',websites,'packageInstallGrantsEnded',packages,'assignmentsEnded',assignments));
 return new;
end $$;
revoke all on function public.provider_completion_end_authority() from public,anon,authenticated,service_role;
create trigger provider_completion_end_authority after update of status on public.workspace_providers for each row when(old.status='active' and new.status='ended') execute function public.provider_completion_end_authority();

-- Extend only the private effect permission with a genuine completed exit identity.
drop trigger business_attribution_provider_change on public.workspace_providers;
alter function public.business_attribution_require_provider_change() rename to business_attribution_require_provider_change_before_exit;
create function public.business_attribution_require_provider_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.business_attributions a where a.business_workspace_id=old.customer_workspace_id and not exists(select 1 from public.business_attribution_endings e where e.attribution_id=a.id))
  and not exists(select 1 from public.business_attribution_change_permissions permission join public.provider_change_requests q on q.id=permission.request_id
    where permission.provider_id=old.id and permission.business_workspace_id=old.customer_workspace_id and permission.completed_by=new.ended_by and q.old_provider_id=old.id and q.business_workspace_id=old.customer_workspace_id and q.status='notified')
  and not exists(select 1 from public.provider_exit_completion_permissions permission join public.workspace_exit_requests e on e.id=permission.workspace_exit_request_id
    where permission.provider_id=old.id and permission.business_workspace_id=old.customer_workspace_id and permission.ended_by=new.ended_by and e.workspace_id=old.customer_workspace_id and e.provider_participation='revoke' and e.state->>'status'='completed')
  then raise exception 'business_attribution_change_provider_required';end if;
 return new;
end $$;
revoke all on function public.business_attribution_require_provider_change(),public.business_attribution_require_provider_change_before_exit() from public,anon,authenticated,service_role;
create trigger business_attribution_provider_change before update on public.workspace_providers for each row when(old.status='active' and new.status='ended') execute function public.business_attribution_require_provider_change();

alter function public.request_provider_change(uuid,uuid,text,uuid,text,uuid) rename to request_provider_change_before_completion_cleanup;
revoke all on function public.request_provider_change_before_completion_cleanup(uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.request_provider_change(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_new_agency_id uuid,p_key text,p_payer_transition_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid;
begin
 business:=p_workspace_id;
 -- Same key as provider_seat_assert_owner, before any inherited request/row lock.
 perform pg_advisory_xact_lock(hashtextextended(business::text,7415));

 return public.request_provider_change_before_completion_cleanup(p_workspace_id,p_user_id,p_verified_email,p_new_agency_id,p_key,p_payer_transition_id);
end $$;
revoke all on function public.request_provider_change(uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.request_provider_change(uuid,uuid,text,uuid,text,uuid) to service_role;

alter function public.choose_business_provider(uuid,text,uuid,uuid) rename to choose_business_provider_before_completion_cleanup;
revoke all on function public.choose_business_provider_before_completion_cleanup(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
create function public.choose_business_provider(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_agency_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid;
begin
 business:=p_workspace_id;
 -- Same key as provider_seat_assert_owner, before any inherited request/row lock.
 perform pg_advisory_xact_lock(hashtextextended(business::text,7415));
 if public.workspace_exit_completed(business) then raise exception 'workspace_exit_future_work_blocked';end if;
 return public.choose_business_provider_before_completion_cleanup(p_user_id,p_verified_email,p_workspace_id,p_agency_workspace_id);
end $$;
revoke all on function public.choose_business_provider(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.choose_business_provider(uuid,text,uuid,uuid) to service_role;

alter function public.end_business_provider(uuid,text,uuid,text) rename to end_business_provider_before_completion_cleanup;
revoke all on function public.end_business_provider_before_completion_cleanup(uuid,text,uuid,text) from public,anon,authenticated,service_role;
create function public.end_business_provider(p_user_id uuid,p_verified_email text,p_business_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid;
begin
 business:=p_business_id;
 -- Same key as provider_seat_assert_owner, before any inherited request/row lock.
 perform pg_advisory_xact_lock(hashtextextended(business::text,7415));

 return public.end_business_provider_before_completion_cleanup(p_user_id,p_verified_email,p_business_id,p_reason);
end $$;
revoke all on function public.end_business_provider(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.end_business_provider(uuid,text,uuid,text) to service_role;

alter function public.acknowledge_provider_change_notice(uuid,uuid,text) rename to acknowledge_provider_change_notice_before_completion_cleanup;
revoke all on function public.acknowledge_provider_change_notice_before_completion_cleanup(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.acknowledge_provider_change_notice(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid;
begin
 business:=(select business_workspace_id from public.provider_change_requests where id=p_request_id);
 -- Same key as provider_seat_assert_owner, before any inherited request/row lock.
 perform pg_advisory_xact_lock(hashtextextended(business::text,7415));

 return public.acknowledge_provider_change_notice_before_completion_cleanup(p_request_id,p_user_id,p_verified_email);
end $$;
revoke all on function public.acknowledge_provider_change_notice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.acknowledge_provider_change_notice(uuid,uuid,text) to service_role;

alter function public.complete_provider_change(uuid,uuid,text) rename to complete_provider_change_before_completion_cleanup;
revoke all on function public.complete_provider_change_before_completion_cleanup(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.complete_provider_change(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid;
begin
 business:=(select business_workspace_id from public.provider_change_requests where id=p_request_id);
 -- Same key as provider_seat_assert_owner, before any inherited request/row lock.
 perform pg_advisory_xact_lock(hashtextextended(business::text,7415));

 return public.complete_provider_change_before_completion_cleanup(p_request_id,p_user_id,p_verified_email);
end $$;
revoke all on function public.complete_provider_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_provider_change(uuid,uuid,text) to service_role;

alter function public.cancel_provider_change(uuid,uuid,text) rename to cancel_provider_change_before_completion_cleanup;
revoke all on function public.cancel_provider_change_before_completion_cleanup(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.cancel_provider_change(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid;
begin
 business:=(select business_workspace_id from public.provider_change_requests where id=p_request_id);
 -- Same key as provider_seat_assert_owner, before any inherited request/row lock.
 perform pg_advisory_xact_lock(hashtextextended(business::text,7415));

 return public.cancel_provider_change_before_completion_cleanup(p_request_id,p_user_id,p_verified_email);
end $$;
revoke all on function public.cancel_provider_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_provider_change(uuid,uuid,text) to service_role;

alter function public.grant_agency_application_draft_edit(uuid,text,uuid,uuid) rename to grant_agency_application_draft_edit_before_completion_cleanup;
revoke all on function public.grant_agency_application_draft_edit_before_completion_cleanup(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
create function public.grant_agency_application_draft_edit(p_user_id uuid,p_verified_email text,p_delivery_id uuid,p_work_id uuid) returns setof public.agency_application_draft_grants
language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid;
begin
 business:=(select business_workspace_id from public.offering_provider_deliveries where id=p_delivery_id);
 -- Same key as provider_seat_assert_owner, before any inherited request/row lock.
 perform pg_advisory_xact_lock(hashtextextended(business::text,7415));
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'agency_application_draft_edit_denied';end if;
 perform 1 from public.workspaces where id=business for update;
 if not found then raise exception 'agency_application_draft_edit_denied';end if;
 perform 1 from public.workspace_memberships where workspace_id=business and user_id=p_user_id and role='owner' for share;
 if not found then raise exception 'agency_application_draft_edit_denied';end if;

 return query select * from public.grant_agency_application_draft_edit_before_completion_cleanup(p_user_id,p_verified_email,p_delivery_id,p_work_id);
end $$;
revoke all on function public.grant_agency_application_draft_edit(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.grant_agency_application_draft_edit(uuid,text,uuid,uuid) to service_role;

alter function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz) rename to grant_system_package_install_before_completion_cleanup;
revoke all on function public.grant_system_package_install_before_completion_cleanup(uuid,uuid,text,uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
create function public.grant_system_package_install(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_agency_workspace_id uuid,p_revision_id uuid,p_command_id uuid,p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid;
begin
 business:=p_workspace_id;
 -- Same key as provider_seat_assert_owner, before any inherited request/row lock.
 perform pg_advisory_xact_lock(hashtextextended(business::text,7415));
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'business_record_access_denied';end if;
 perform 1 from public.workspaces where id=business for update;
 if not found then raise exception 'business_record_access_denied';end if;
 perform 1 from public.workspace_memberships where workspace_id=business and user_id=p_user_id and role='owner' for share;
 if not found then raise exception 'business_record_access_denied';end if;

 return public.grant_system_package_install_before_completion_cleanup(p_workspace_id,p_user_id,p_verified_email,p_agency_workspace_id,p_revision_id,p_command_id,p_expires_at);
end $$;
revoke all on function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz) to service_role;

alter function public.complete_workspace_exit(uuid,uuid,text,text,text,jsonb,text,text,text) rename to complete_workspace_exit_before_completion_cleanup;
revoke all on function public.complete_workspace_exit_before_completion_cleanup(uuid,uuid,text,text,text,jsonb,text,text,text) from public,anon,authenticated,service_role;
create function public.complete_workspace_exit(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_future_work text,p_provider_participation text,p_maintained_resources jsonb,p_idempotency_key text,p_command_digest text,p_notes text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;exit_row public.workspace_exit_requests;provider public.workspace_providers;a public.business_attributions;at_time timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'workspace_exit_denied';end if;
 perform 1 from public.workspaces where id=p_workspace_id for update;
 if not found then raise exception 'workspace_exit_denied';end if;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner' for share;
 if not found then raise exception 'workspace_exit_denied';end if;
 result:=public.complete_workspace_exit_before_completion_cleanup(p_workspace_id,p_user_id,p_verified_email,p_future_work,p_provider_participation,p_maintained_resources,p_idempotency_key,p_command_digest,p_notes);
 if p_provider_participation='revoke' then
  select * into exit_row from public.workspace_exit_requests where workspace_id=p_workspace_id for update;
  if exit_row.id is null or exit_row.provider_participation<>'revoke' or exit_row.state->>'status' is distinct from 'completed' or result#>>'{state,status}' is distinct from 'completed' then raise exception 'provider_exit_completion_unconfirmed';end if;
  select * into provider from public.workspace_providers where customer_workspace_id=p_workspace_id and status='active' for update;
  if provider.id is not null then
   select * into a from public.business_attributions b where b.business_workspace_id=p_workspace_id and not exists(select 1 from public.business_attribution_endings e where e.attribution_id=b.id);
   insert into public.provider_exit_completion_permissions values(exit_row.id,provider.id,p_workspace_id,p_user_id);
   -- The exact exit owner premises remain locked through this local projection.
   -- Do not call the normal switch RPC, insert a notice policy, or fake MO18.
   at_time:=clock_timestamp();
   update public.workspace_providers set status='ended',ended_by=p_user_id,ended_at=at_time,end_reason='Owner completed workspace exit with provider participation revoked.' where id=provider.id;
   if a.id is not null then
    if at_time<a.from_at then raise exception 'provider_exit_completion_unconfirmed';end if;
    insert into public.business_attribution_endings(attribution_id,provider_change_request_id,workspace_exit_request_id,ended_by,to_at,receipt)
    values(a.id,null,exit_row.id,p_user_id,at_time,jsonb_build_object('attributionId',a.id,'businessWorkspaceId',a.business_workspace_id,'agencyWorkspaceId',a.agency_workspace_id,'from',a.from_at,'to',at_time,'source',a.source,'sourceReceipt',a.source_receipt,'providerChangeRequestId',null,'workspaceExitRequestId',exit_row.id,'endedBy',p_user_id,'oldProviderId',provider.id,'newOperatorAgencyWorkspaceId',null,'completionReceipt',result));
   end if;
   delete from public.provider_exit_completion_permissions where workspace_exit_request_id=exit_row.id;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.complete_workspace_exit(uuid,uuid,text,text,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_workspace_exit(uuid,uuid,text,text,text,jsonb,text,text,text) to service_role;
-- Full definitions and normalized ACLs bind every new wrapper/helper and renamed predecessor.
-- Definition includes security, volatility, parameter defaults and configuration.
set local search_path=public,pg_temp;
insert into public.provider_completion_rollback_state(signature,definition,normalized_acl,owner_name)
select p.oid::regprocedure::text,pg_get_functiondef(p.oid),coalesce((select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb),pg_get_userbyid(p.proowner)
from pg_proc p where p.oid=any(array[
  'public.request_provider_change(uuid,uuid,text,uuid,text,uuid)'::regprocedure,
 'public.request_provider_change_before_completion_cleanup(uuid,uuid,text,uuid,text,uuid)'::regprocedure,
 'public.choose_business_provider(uuid,text,uuid,uuid)'::regprocedure,
 'public.choose_business_provider_before_completion_cleanup(uuid,text,uuid,uuid)'::regprocedure,
 'public.end_business_provider(uuid,text,uuid,text)'::regprocedure,
 'public.end_business_provider_before_completion_cleanup(uuid,text,uuid,text)'::regprocedure,
 'public.acknowledge_provider_change_notice(uuid,uuid,text)'::regprocedure,
 'public.acknowledge_provider_change_notice_before_completion_cleanup(uuid,uuid,text)'::regprocedure,
 'public.complete_provider_change(uuid,uuid,text)'::regprocedure,
 'public.complete_provider_change_before_completion_cleanup(uuid,uuid,text)'::regprocedure,
 'public.cancel_provider_change(uuid,uuid,text)'::regprocedure,
 'public.cancel_provider_change_before_completion_cleanup(uuid,uuid,text)'::regprocedure,
 'public.grant_agency_application_draft_edit(uuid,text,uuid,uuid)'::regprocedure,
 'public.grant_agency_application_draft_edit_before_completion_cleanup(uuid,text,uuid,uuid)'::regprocedure,
 'public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz)'::regprocedure,
 'public.grant_system_package_install_before_completion_cleanup(uuid,uuid,text,uuid,uuid,uuid,timestamptz)'::regprocedure,
 'public.complete_workspace_exit(uuid,uuid,text,text,text,jsonb,text,text,text)'::regprocedure,
 'public.complete_workspace_exit_before_completion_cleanup(uuid,uuid,text,text,text,jsonb,text,text,text)'::regprocedure,
 'public.provider_completion_end_authority()'::regprocedure,
 'public.business_attribution_require_provider_change()'::regprocedure,
 'public.business_attribution_require_provider_change_before_exit()'::regprocedure
]::oid[]);
do $$begin
 if (select count(*) from public.provider_completion_rollback_state)<>21 then raise exception 'provider_completion_rollback_state_incomplete';end if;
end $$;
notify pgrst,'reload schema';
commit;
