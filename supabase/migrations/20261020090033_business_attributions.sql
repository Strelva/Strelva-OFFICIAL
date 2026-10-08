-- #284 / MO-06: owner-confirmed bringer evidence is independent of the operating
-- provider and of financial eligibility. No legacy source, agreement or rate is inferred.
begin;
set local lock_timeout='3s';
create table public.business_attributions (
 id uuid primary key default gen_random_uuid(),
 business_workspace_id uuid not null references public.workspaces(id),
 agency_workspace_id uuid not null references public.workspaces(id),
 source text not null check(source in ('signup','conversion','referral')),
 source_receipt jsonb not null,
 provider_snapshot_id uuid not null references public.workspace_providers(id),
 confirmed_by uuid not null references public.users(id),
 command_id uuid not null,
 from_at timestamptz not null default clock_timestamp(),
 receipt jsonb not null,
 unique(business_workspace_id,command_id)
);
create table public.business_attribution_endings (
 attribution_id uuid primary key references public.business_attributions(id),
 provider_change_request_id uuid not null references public.provider_change_requests(id),
 ended_by uuid not null references public.users(id),
 to_at timestamptz not null,
 receipt jsonb not null,
 unique(provider_change_request_id,attribution_id)
);
-- A private, transaction-local permission row lets only the successful MO-18
-- completion delegate end the current operating provider. No GUC/caller flag is authority.
create table public.business_attribution_change_permissions (
 request_id uuid primary key references public.provider_change_requests(id),
 provider_id uuid not null references public.workspace_providers(id),
 business_workspace_id uuid not null references public.workspaces(id),
 completed_by uuid not null references public.users(id)
);
alter table public.business_attributions enable row level security;
alter table public.business_attribution_endings enable row level security;
alter table public.business_attribution_change_permissions enable row level security;
revoke all on public.business_attributions,public.business_attribution_endings,public.business_attribution_change_permissions from public,anon,authenticated,service_role;
create trigger business_attribution_immutable before update or delete on public.business_attributions for each row execute function public.money_immutable_guard();
create trigger business_attribution_ending_immutable before update or delete on public.business_attribution_endings for each row execute function public.money_immutable_guard();

create function public.business_attribution_receipt(p_attribution public.business_attributions) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select p_attribution.receipt||jsonb_build_object('to',e.to_at,'ending',e.receipt)
 from (select 1) anchor left join public.business_attribution_endings e on e.attribution_id=p_attribution.id;
$$;
revoke all on function public.business_attribution_receipt(public.business_attributions) from public,anon,authenticated,service_role;

create function public.record_business_attribution(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_agency_workspace_id uuid,p_source text,p_source_receipt jsonb,p_command_id uuid,p_expected_provider_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.business_attributions; provider public.workspace_providers; receipt jsonb; at_time timestamptz;
begin
 perform public.provider_seat_assert_owner(p_workspace_id,p_user_id,p_verified_email);
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'provider_seat_owner_required';end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked';end if;
 if p_command_id is null or p_expected_provider_id is null or p_agency_workspace_id is null or p_source is null or p_source not in ('signup','conversion','referral')
  or jsonb_typeof(p_source_receipt) is distinct from 'object' or p_source_receipt->>'kind' is distinct from 'owner_statement'
  or (p_source_receipt-array['kind','reference'])<>'{}'::jsonb or jsonb_typeof(p_source_receipt->'reference') is distinct from 'string'
  or p_source_receipt->>'reference'<>btrim(p_source_receipt->>'reference') or char_length(p_source_receipt->>'reference') not between 1 and 2000 then raise exception 'business_attribution_input_invalid';end if;
 -- Even replay requires the current owner identity, but a prior accepted receipt
 -- survives operator/source changes. Never rewrite an opening to make it current.
 select * into a from public.business_attributions where business_workspace_id=p_workspace_id and command_id=p_command_id;
 if found then
  if a.agency_workspace_id<>p_agency_workspace_id or a.source<>p_source or a.source_receipt<>p_source_receipt or a.confirmed_by<>p_user_id or a.provider_snapshot_id<>p_expected_provider_id then raise exception 'business_attribution_command_conflict';end if;
  return public.business_attribution_receipt(a);
 end if;
 perform 1 from public.workspaces where id=p_agency_workspace_id and kind='agency' for share;
 if not found then raise exception 'business_attribution_agency_invalid';end if;
 select * into provider from public.workspace_providers where customer_workspace_id=p_workspace_id and status='active' for update;
 if provider.id is null or provider.id<>p_expected_provider_id then raise exception 'business_attribution_provider_stale';end if;
 if exists(select 1 from public.business_attributions b where b.business_workspace_id=p_workspace_id and not exists(select 1 from public.business_attribution_endings e where e.attribution_id=b.id)) then raise exception 'business_attribution_already_active';end if;
 -- A recorded source is an exact current-owner statement, not an observed signup,
 -- conversion, referral, written agreement, operating permission or revenue claim.
 at_time:=clock_timestamp();
 a.id:=gen_random_uuid();
 receipt:=jsonb_build_object('attributionId',a.id,'businessWorkspaceId',p_workspace_id,'agencyWorkspaceId',p_agency_workspace_id,'source',p_source,'sourceReceipt',p_source_receipt,'from',at_time,'to',null,'confirmedBy',p_user_id,'commandId',p_command_id,'providerSnapshotId',provider.id,'evidence','owner_confirmed_statement','financialEligibility','not_selected');
 insert into public.business_attributions(id,business_workspace_id,agency_workspace_id,source,source_receipt,provider_snapshot_id,confirmed_by,command_id,from_at,receipt)
 values(a.id,p_workspace_id,p_agency_workspace_id,p_source,p_source_receipt,provider.id,p_user_id,p_command_id,at_time,receipt) returning * into a;
 return public.business_attribution_receipt(a);
end $$;

create function public.read_business_attributions(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare provider jsonb; history jsonb;
begin
 if not exists(select 1 from public.users u join public.workspace_memberships m on m.user_id=u.id join public.workspaces w on w.id=m.workspace_id
  where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null and m.workspace_id=p_workspace_id and m.role='owner' and w.kind='customer') then raise exception 'business_attribution_owner_denied';end if;
 select jsonb_build_object('providerId',id,'agencyWorkspaceId',provider_workspace_id) into provider from public.workspace_providers where customer_workspace_id=p_workspace_id and status='active';
 select coalesce(jsonb_agg(public.business_attribution_receipt(a) order by a.from_at,a.id),'[]'::jsonb) into history from public.business_attributions a where a.business_workspace_id=p_workspace_id;
 return jsonb_build_object('businessWorkspaceId',p_workspace_id,'currentProvider',provider,'attributions',history);
end $$;

create function public.business_attribution_require_provider_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.business_attributions a where a.business_workspace_id=old.customer_workspace_id and not exists(select 1 from public.business_attribution_endings e where e.attribution_id=a.id))
  and not exists(select 1 from public.business_attribution_change_permissions permission join public.provider_change_requests q on q.id=permission.request_id
    where permission.provider_id=old.id and permission.business_workspace_id=old.customer_workspace_id and q.old_provider_id=old.id and q.business_workspace_id=old.customer_workspace_id and q.status='notified') then raise exception 'business_attribution_change_provider_required';end if;
 return new;
end $$;
revoke all on function public.business_attribution_require_provider_change() from public,anon,authenticated,service_role;
create trigger business_attribution_provider_change before update on public.workspace_providers for each row when(old.status='active' and new.status='ended') execute function public.business_attribution_require_provider_change();

-- Delegate to the exact prior complete command, including future compatible
-- cancellation/response and existing payer/notice checks. No policy is inserted.
alter function public.complete_provider_change(uuid,uuid,text) rename to complete_provider_change_before_attribution;
revoke all on function public.complete_provider_change_before_attribution(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.complete_provider_change(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.provider_change_requests; result jsonb; a public.business_attributions; provider public.workspace_providers; at_time timestamptz;
begin
 select * into q from public.provider_change_requests where id=p_request_id;
 if q.id is null then raise exception 'provider_change_denied';end if;
 -- Same workspace serialization as record/start and current membership locks.
 perform public.provider_seat_assert_owner(q.business_workspace_id,p_user_id,p_verified_email);
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'provider_seat_owner_required';end if;
 select * into q from public.provider_change_requests where id=p_request_id for update;
 if q.status='completed' then
  result:=public.complete_provider_change_before_attribution(p_request_id,p_user_id,p_verified_email);
  return result||jsonb_build_object('attributionEndings',coalesce((select jsonb_agg(e.receipt order by e.attribution_id) from public.business_attribution_endings e where e.provider_change_request_id=q.id),'[]'::jsonb));
 end if;
 select * into a from public.business_attributions b where b.business_workspace_id=q.business_workspace_id and not exists(select 1 from public.business_attribution_endings e where e.attribution_id=b.id);
 if a.id is not null then
  -- The inherited command still refuses stale/cancelled/unnotified/window-open
  -- requests. The private permission alone cannot perform an effect.
  insert into public.business_attribution_change_permissions values(q.id,q.old_provider_id,q.business_workspace_id,p_user_id);
 end if;
 result:=public.complete_provider_change_before_attribution(p_request_id,p_user_id,p_verified_email);
 select * into q from public.provider_change_requests where id=p_request_id;
 if q.status is distinct from 'completed' then raise exception 'business_attribution_completion_unconfirmed';end if;
 if a.id is not null then
  select * into provider from public.workspace_providers where id=q.old_provider_id;
  if provider.status is distinct from 'ended' or provider.customer_workspace_id<>a.business_workspace_id then raise exception 'business_attribution_completion_unconfirmed';end if;
  at_time:=provider.ended_at;
  if at_time is null or at_time<a.from_at then raise exception 'business_attribution_completion_unconfirmed';end if;
  insert into public.business_attribution_endings(attribution_id,provider_change_request_id,ended_by,to_at,receipt)
  values(a.id,q.id,p_user_id,at_time,jsonb_build_object('attributionId',a.id,'businessWorkspaceId',a.business_workspace_id,'agencyWorkspaceId',a.agency_workspace_id,'from',a.from_at,'to',at_time,'source',a.source,'sourceReceipt',a.source_receipt,'providerChangeRequestId',q.id,'endedBy',p_user_id,'oldProviderId',q.old_provider_id,'newOperatorAgencyWorkspaceId',q.new_agency_workspace_id,'completionReceipt',result));
  delete from public.business_attribution_change_permissions where request_id=q.id;
 end if;
 return result||jsonb_build_object('attributionEndings',coalesce((select jsonb_agg(e.receipt order by e.attribution_id) from public.business_attribution_endings e where e.provider_change_request_id=q.id),'[]'::jsonb));
end $$;
revoke all on function public.record_business_attribution(uuid,uuid,text,uuid,text,jsonb,uuid,uuid),public.read_business_attributions(uuid,uuid,text),public.complete_provider_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_business_attribution(uuid,uuid,text,uuid,text,jsonb,uuid,uuid),public.read_business_attributions(uuid,uuid,text),public.complete_provider_change(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
