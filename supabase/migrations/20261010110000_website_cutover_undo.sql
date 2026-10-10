-- Local preparation only. No DNS/provider writes: owner confirms the old
-- project and restored DNS before restoring the runtime. Issued releases stay.
begin;
set local lock_timeout = '3s';
create table public.website_cutover_undos (
  command_id uuid primary key,
  workspace_id uuid not null,
  website_work_id uuid not null,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete restrict,
  publication_id uuid not null unique references public.website_linked_publications(id) on delete restrict,
  restored_by uuid not null references public.users(id) on delete restrict,
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.website_cutover_undos enable row level security;
revoke all on public.website_cutover_undos from public,anon,authenticated,service_role;
create trigger website_cutover_undos_immutable before update or delete on public.website_cutover_undos
  for each row execute function public.website_document_immutable();

create function public.undo_website_linked_cutover(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_revision integer,p_content_hash text,p_command_id uuid,p_domain_restored boolean,p_fallback_verified boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tenants; p public.website_document_publications; lp public.website_linked_publications;
  prior public.website_cutover_undos; first_release public.website_linked_publications; receipt jsonb;
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  perform public.website_document_assert_launch_owner(p_workspace_id,p_user_id);
  if p_domain_restored is not true or p_fallback_verified is not true then raise exception 'website_fallback_confirmation_required'; end if;
  select t0.* into t from public.tenants t0 join public.tenant_workspace_links l on l.tenant_stable_id=t0.stable_id and l.workspace_id=p_workspace_id where t0.id=p_tenant_id and t0.active for update of t0;
  if not found then raise exception 'website_tenant_not_linked'; end if;
  select * into prior from public.website_cutover_undos where command_id=p_command_id;
  if found then
    if prior.workspace_id<>p_workspace_id or prior.website_work_id<>p_work_id or prior.tenant_stable_id<>t.stable_id or prior.restored_by<>p_user_id or prior.receipt->>'contentHash' is distinct from p_content_hash or prior.receipt->>'revision' is distinct from p_revision::text then raise exception 'website_revision_conflict'; end if;
    return prior.receipt;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||t.stable_id::text,7416));
  select * into p from public.website_document_publications where tenant_id=t.id for update;
  if not found or p.workspace_id<>p_workspace_id or p.website_work_id<>p_work_id or p.revision<>p_revision or p.content_hash<>p_content_hash then raise exception 'website_revision_conflict'; end if;
  select * into lp from public.website_linked_publications where tenant_stable_id=t.stable_id and website_work_id=p_work_id and revision=p_revision and content_hash=p_content_hash order by published_at desc,id desc limit 1;
  select * into first_release from public.website_linked_publications where tenant_stable_id=t.stable_id and website_work_id=p_work_id order by published_at,id limit 1;
  if lp.id is null or first_release.prior_delivery_model<>'custom_repo' or first_release.fallback_until<=clock_timestamp() or t.delivery_model<>'platform_template' then raise exception 'website_fallback_unavailable'; end if;
  receipt := jsonb_build_object('receiptId',p_command_id,'kind','rebuild_cutover_undone','tenantId',t.id,'tenantStableId',t.stable_id,'workId',p_work_id,'revision',p_revision,'contentHash',p_content_hash,'restoredBy',p_user_id,'restoredAt',clock_timestamp(),'deliveryModel','custom_repo','domainRestored',true,'fallbackVerified',true);
  insert into public.website_cutover_undos(command_id,workspace_id,website_work_id,tenant_stable_id,publication_id,restored_by,receipt) values(p_command_id,p_workspace_id,p_work_id,t.stable_id,lp.id,p_user_id,receipt);
  -- Keep immutable documents, publication receipts and reservation for recovery.
  delete from public.website_document_publications where tenant_id=t.id;
  update public.tenants set delivery_model='custom_repo' where stable_id=t.stable_id;
  return receipt;
end $$;
revoke all on function public.undo_website_linked_cutover(uuid,uuid,uuid,text,text,integer,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.undo_website_linked_cutover(uuid,uuid,uuid,text,text,integer,text,uuid,boolean,boolean) to service_role;
commit;
