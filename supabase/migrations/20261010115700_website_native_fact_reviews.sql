begin;
set local lock_timeout = '3s';
-- One dispatch attempt per linked native website and exact business revision.
-- A claimed/uncertain dispatch never gains another automatic queue attempt.
create table public.website_native_fact_reviews (
  claim_token uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete restrict,
  record_revision bigint not null check(record_revision>=0),
  claimed_by uuid not null references public.users(id) on delete restrict,
  status text not null default 'claimed' check(status in ('claimed','queued','blocked','unconfirmed')),
  event_id text check(event_id is null or char_length(event_id) between 1 and 200),
  claimed_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  unique(workspace_id,tenant_stable_id,record_revision),
  check((status='claimed')=(finished_at is null)),
  check(status<>'queued' or event_id is not null)
);
create unique index website_native_fact_reviews_dispatch_idx on public.website_native_fact_reviews(tenant_stable_id) where status in ('claimed','unconfirmed');
alter table public.website_native_fact_reviews enable row level security;
revoke all on public.website_native_fact_reviews from public,anon,authenticated,service_role;

create function public.claim_native_website_fact_review(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_record_revision bigint,p_claim_token uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare access text; t public.tenants; actual_revision bigint;
begin
  access:=public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
  if access<>'owner' and not(access='admin' and public.needs_you_operator_id(p_user_id,p_verified_email) is not null) then raise exception 'business_record_access_denied'; end if;
  select revision into actual_revision from public.business_records where workspace_id=p_workspace_id for share;
  if not found or actual_revision is distinct from p_record_revision then return false; end if;
  select * into t from public.tenants where id=p_tenant_id and active and delivery_model='custom_repo' for share;
  if t.id is null or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id) then raise exception 'business_record_access_denied'; end if;
  if exists(select 1 from public.workspace_release_flags where workspace_id=p_workspace_id and flag='systems' and state='off') then return false; end if;
  insert into public.website_native_fact_reviews(claim_token,workspace_id,tenant_stable_id,record_revision,claimed_by)
    values(p_claim_token,p_workspace_id,t.stable_id,p_record_revision,p_user_id) on conflict do nothing;
  return found;
end $$;

create function public.record_native_website_fact_review(p_claim_token uuid,p_status text,p_event_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.website_native_fact_reviews;
begin
  if p_status not in ('queued','blocked','unconfirmed') or (p_status='queued' and p_event_id is null) then raise exception 'website_fact_review_invalid'; end if;
  select * into r from public.website_native_fact_reviews where claim_token=p_claim_token for update;
  if not found then raise exception 'website_fact_review_missing'; end if;
  if r.status<>'claimed' then
    if r.status is distinct from p_status or r.event_id is distinct from p_event_id then raise exception 'website_fact_review_closed'; end if;
  else
    update public.website_native_fact_reviews set status=p_status,event_id=p_event_id,finished_at=clock_timestamp() where claim_token=p_claim_token returning * into r;
  end if;
  return jsonb_build_object('claimToken',r.claim_token,'workspaceId',r.workspace_id,'tenantStableId',r.tenant_stable_id,'recordRevision',r.record_revision,'status',r.status,'eventId',r.event_id,'finishedAt',r.finished_at);
end $$;
revoke all on function public.claim_native_website_fact_review(uuid,uuid,text,text,bigint,uuid),public.record_native_website_fact_review(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_native_website_fact_review(uuid,uuid,text,text,bigint,uuid),public.record_native_website_fact_review(uuid,text,text) to service_role;
commit;
