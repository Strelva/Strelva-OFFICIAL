-- Lane 13 keep-your-site: the agency Queue and client Home follow a connected-site change.
-- Held and unapplied. read_agency_client_home is a verbatim copy of
-- 20261024123500_ux_chrome_recorded_actors.sql (its only definition after
-- 20261022190000) with exactly two additions: a connected-site Request takes
-- the stage of its change instead of staying "In progress" forever, and a
-- Release recorded without seeing the change live shows under delivery checks.
-- Any later replacement of this function must carry both additions.
-- Depends on 20261027160100_keep_your_site_changes.sql.
begin;
set local lock_timeout='3s';

create schema keep_your_site_home_rollback;
revoke all on schema keep_your_site_home_rollback from public,anon,authenticated,service_role;
create table keep_your_site_home_rollback.functions(signature text primary key,before_definition text not null,after_fingerprint text);
alter table keep_your_site_home_rollback.functions enable row level security;
revoke all on keep_your_site_home_rollback.functions from public,anon,authenticated,service_role;
insert into keep_your_site_home_rollback.functions(signature,before_definition)
 select 'public.read_agency_client_home(uuid,uuid,text)',pg_get_functiondef(to_regprocedure('public.read_agency_client_home(uuid,uuid,text)'));

create or replace function public.read_agency_client_home(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope record; decisions jsonb; changes jsonb; requests jsonb; checks jsonb;
begin
  scope := public.system_read_scope(p_workspace_id,p_user_id,p_verified_email,false);
  if not exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer') then
    raise exception 'business_record_access_denied'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'systemId',d.system_id,
    'since',public.system_version_ts(d.opened_at),'state',d.state) order by d.opened_at,d.id),'[]') into decisions
  from public.owner_decisions d
  where d.workspace_id=p_workspace_id and d.route='owner_decides'
    and d.change_kind in ('copy.routine','copy.marketing','structure','google.post','google.photo',
      'system.go_live','system.change_live','system.pause','running.approve','request.scope','health.fix','verify.failed')
    and (d.state='open' or d.updated_at>statement_timestamp()-interval '30 days')
    and (exists(select 1 from public.systems s where s.id=d.system_id and s.business_workspace_id=p_workspace_id
      and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids))
      or (scope.work_ids is null and d.system_id is null and d.source_lifecycle in ('service_request','provider_delivery','standing_responsibility','work_responsibility')));
  select coalesce(jsonb_agg(row order by at desc),'[]') into changes from (
    select r.created_at at,jsonb_build_object('id',r.id,'systemId',r.system_id,
      'title',coalesce(r.summary,s.name||' changed'),'at',public.system_version_ts(r.created_at),'actor',r.actor_snapshot) row
    from public.system_revisions r join public.systems s on s.id=r.system_id and s.business_workspace_id=p_workspace_id
    where r.business_workspace_id=p_workspace_id and r.created_at>statement_timestamp()-interval '7 days'
      and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids)
    order by r.created_at desc,r.id limit 100
  ) q;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.outcome,
    'stage',case when r.status='withdrawn' or r.provider_acceptance='declined' then 'closed'
      when r.context->>'source'='connected_site_change' and r.provider_acceptance='accepted' and public.connected_site_change_request_stage(r.id) is not null then public.connected_site_change_request_stage(r.id)
      when r.provider_acceptance<>'accepted' or r.delivery_commitment is null then 'asked'
      when r.delivery_commitment->>'status'='proposed' then 'needs_you'
      when r.delivery_commitment->>'status'='submitted' then 'ready_for_review'
      when r.delivery_commitment->>'status'='accepted' then 'done'
      when r.delivery_commitment->>'status'='cancelled' then 'closed' else 'in_progress' end,
    'provider',case when r.provider_kind='agency' then jsonb_build_object('kind','agency','agencyWorkspaceId',r.provider_agency_workspace_id) else jsonb_build_object('kind','strelva') end,
    'servingAgencyName',case when a.kind='agency' then case when coalesce(nullif(a.agency_brand->>'displayName',''),a.name)='Strelva' then 'Strelva Agency' else coalesce(nullif(a.agency_brand->>'displayName',''),a.name) end end,
    'dueAt',r.delivery_commitment->>'dueAt','updatedAt',public.system_version_ts(r.updated_at)) order by r.updated_at desc,r.id),'[]') into requests
  from public.service_requests r left join public.workspaces a on a.id=r.provider_agency_workspace_id
  where r.business_workspace_id=p_workspace_id and r.status<>'draft'
    and (exists(select 1 from public.workspace_memberships m where m.workspace_id=p_workspace_id and m.user_id=p_user_id)
      or (r.status='requested' and exists(select 1 from public.provider_seats seat
        join public.workspace_memberships m on m.workspace_id=seat.agency_workspace_id and m.user_id=p_user_id
        join public.agency_client_staff staff on staff.agency_workspace_id=seat.agency_workspace_id
          and staff.customer_workspace_id=seat.customer_workspace_id and staff.user_id=p_user_id and staff.status='active'
        where seat.customer_workspace_id=p_workspace_id and seat.agency_workspace_id=r.provider_agency_workspace_id and seat.status='active')));
  select coalesce(jsonb_agg(jsonb_build_object('key',key,'title',title,'systemId',system_id,'status',status,'at',public.system_version_ts(at)) order by at,key),'[]') into checks from (
    select 'listing:'||r.id key,'Google listing change'::text title,null::uuid system_id,r.readback status,r.created_at at
      from public.google_listing_receipts r where r.workspace_id=p_workspace_id and scope.work_ids is null
        and r.status='posted_unverified' and r.readback in ('failed','differs')
    union all
    select 'outside:'||r.id,case when r.provider='google_business' then 'Google change' else 'Website change' end,r.system_id,r.readback,r.created_at
      from public.outside_write_receipts r where coalesce(r.workspace_id,
        (select l.workspace_id from public.tenant_workspace_links l where l.tenant_stable_id=r.tenant_stable_id
          group by l.workspace_id having (select count(*) from public.tenant_workspace_links t where t.tenant_stable_id=r.tenant_stable_id)=1))=p_workspace_id and r.acceptance='accepted' and r.readback in ('failed','differs')
        and (r.system_id is null and scope.work_ids is null or exists(select 1 from public.systems s where s.id=r.system_id
          and s.business_workspace_id=p_workspace_id and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids)))
    union all
    select 'website:'||r.id,'Website deployment',r.system_id,r.read_back,r.recorded_at
      from public.website_change_receipts r where r.workspace_id=p_workspace_id and r.kind='deployed' and r.read_back in ('not_confirmed','not_checked')
        and exists(select 1 from public.systems s where s.id=r.system_id and s.business_workspace_id=p_workspace_id
          and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids))
    union all
    select 'site:'||st.id,'Website change on '||cs.site_host,c.system_id,'not_confirmed',st.recorded_at
      from public.connected_site_change_steps st join public.connected_site_changes c on c.id=st.change_id join public.connected_sites cs on cs.id=c.connected_site_id
      where c.business_workspace_id=p_workspace_id and st.kind='released' and st.read_back='not_confirmed'
        and exists(select 1 from public.systems s where s.id=c.system_id and s.business_workspace_id=p_workspace_id
          and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids))
  ) q;
  return jsonb_build_object('workspaceId',p_workspace_id,'decisions',decisions,'changes',changes,'deliveries',requests,'deliveryChecks',checks);
end $$;

update keep_your_site_home_rollback.functions f set after_fingerprint=md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
 from pg_proc p where p.oid=to_regprocedure('public.read_agency_client_home(uuid,uuid,text)') and f.signature='public.read_agency_client_home(uuid,uuid,text)';

commit;
