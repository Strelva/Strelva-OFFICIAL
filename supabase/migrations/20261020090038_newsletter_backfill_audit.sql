-- #251: append-only operator attribution for session-bound contact repair.
-- Preserve all deployed migration bytes, identity/release/link/consent gates.
begin;
set local lock_timeout = '3s';

create or replace function public.backfill_newsletter_contacts(
  p_tenant_id text, p_workspace_id uuid,
  p_apply boolean default false, p_after text default null, p_limit integer default 500
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_sub record; v_total integer := 0; v_creates integer := 0; v_merges integer := 0;
  v_invalid integer := 0; v_unsubscribed integer := 0; v_linked integer := 0; v_failed integer := 0;
  v_last text; v_state text;
begin
  -- The request JWT owns identity. A caller cannot borrow another operator's
  -- email, and a service-role request without a signed-in user is insufficient.
  perform 1 from public.users u
    join public.super_admins sa on sa.user_id = u.id
    where u.id = auth.uid() and u.verified_at is not null and sa.revoked_at is null
    for share of u, sa;
  if not found then raise exception 'newsletter_contact_operator_required'; end if;
  v_stable := public.newsletter_contact_assert_link(p_tenant_id, p_workspace_id);
  if p_apply is null or p_limit is null or p_limit not between 1 and 500 then raise exception 'newsletter_contact_invalid'; end if;
  if p_apply then
    select state into v_state from public.workspace_release_flags
      where workspace_id = p_workspace_id and flag = 'newsletter_contacts' for share;
    if v_state is distinct from 'on' then raise exception 'newsletter_contact_release_off'; end if;
    perform 1 from public.business_records where workspace_id = p_workspace_id for update;
  end if;
  for v_sub in select s.* from public.newsletter_subscribers s
    where s.tenant_id = p_tenant_id and (p_after is null or s.email > p_after)
    order by s.email limit p_limit loop
    v_total := v_total + 1; v_last := v_sub.email;
    if v_sub.status = 'unsubscribed' then v_unsubscribed := v_unsubscribed + 1; end if;
    if not public.business_record_email_valid(lower(btrim(v_sub.email))) then
      v_invalid := v_invalid + 1; continue;
    end if;
    if exists (select 1 from public.business_contacts c where c.workspace_id = p_workspace_id and c.email = lower(btrim(v_sub.email))) then
      v_merges := v_merges + 1;
    else v_creates := v_creates + 1; end if;
    if p_apply then
      if public.newsletter_contact_project(v_stable, p_workspace_id, v_sub.email, v_sub.name, v_sub.subscribed_at) = 'linked' then
        v_linked := v_linked + 1;
      else v_failed := v_failed + 1; end if;
    end if;
  end loop;
  -- Identity comes only from the locked request user above. Audit and
  -- projection share this transaction: an unavailable audit rolls back repair.
  -- Counts and scope suffice; never retain subscriber addresses in this log.
  perform public.record_workspace_operator_audit(p_workspace_id,
    'newsletter.contacts.backfill', 'newsletter_contacts', p_tenant_id, auth.uid(),
    jsonb_build_object('tenantId', p_tenant_id, 'tenantStableId', v_stable,
      'dryRun', not p_apply, 'limit', p_limit, 'hasCursor', p_after is not null,
      'examined', v_total, 'creates', v_creates, 'merges', v_merges,
      'invalid', v_invalid, 'unsubscribed', v_unsubscribed,
      'linked', v_linked, 'failed', v_failed));
  return jsonb_build_object('workspaceId', p_workspace_id, 'tenantId', p_tenant_id, 'dryRun', not p_apply,
    'examined', v_total, 'creates', v_creates, 'merges', v_merges, 'invalid', v_invalid,
    'unsubscribed', v_unsubscribed, 'linked', v_linked, 'failed', v_failed,
    'nextAfter', case when exists(select 1 from public.newsletter_subscribers where tenant_id = p_tenant_id and email > v_last) then v_last else null end);
end;
$$;

revoke all on function public.backfill_newsletter_contacts(text, uuid, boolean, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.backfill_newsletter_contacts(text, uuid, boolean, text, integer) to authenticated;
-- A service-only wrapper composes the current scoped readers and canonical
-- audit within one transaction. Neither scope nor actor comes from browser data.
create or replace function public.read_operator_inquiry_review_audited(
  p_user_id uuid, p_verified_email text, p_view text, p_limit integer,
  p_before timestamptz, p_before_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb; scope record; actor_email text;
begin
  select lower(u.email) into actor_email from public.users u
    join public.super_admins a on a.user_id=u.id and a.revoked_at is null
    where u.id=p_user_id and u.verified_at is not null and lower(u.email)=lower(btrim(p_verified_email))
    for share of u,a;
  if not found then raise exception 'inquiry_access_denied';end if;
  if p_view is null or p_view not in ('held','released','spam','notices') then raise exception 'inquiry_record_invalid';end if;
  if p_view='notices' then
    rows:=public.read_operator_inquiry_notice_issues(p_user_id,p_verified_email,p_limit,p_before,p_before_id);
  else
    rows:=public.read_operator_held_inquiries(p_user_id,p_verified_email,
      case p_view when 'held' then 'held_as_spam' when 'spam' then 'confirmed_spam' else 'released' end,
      p_limit,p_before,p_before_id);
  end if;
  -- Empty results disclose no records and have no business scope to log.
  -- Resolve immutable source-row tenant identity, never a capture slug which
  -- can be reused after deletion. Notice IDs identify events, held IDs leads.
  -- Refuse orphan PII rather than invent a tenant/workspace for its audit.
  if exists(select 1 from jsonb_array_elements(rows) r
    where nullif(r->>'workspaceId','') is null
      and not exists(select 1 from public.tenants t where t.stable_id=
        case when p_view='notices' then
          (select e.tenant_stable_id from public.inquiry_events e where e.id=(r->>'id')::uuid)
        else (select l.tenant_stable_id from public.tenant_leads l where l.id=(r->>'id')::uuid) end)) then
    raise exception 'inquiry_operator_audit_scope_unavailable';
  end if;
  for scope in select (r->>'workspaceId')::uuid workspace_id,
    jsonb_agg(r->>'id' order by r->>'id') row_ids,count(*) count
    from jsonb_array_elements(rows) r where nullif(r->>'workspaceId','') is not null
    group by (r->>'workspaceId')::uuid loop
    perform public.record_workspace_operator_audit(scope.workspace_id,
      'inquiries.operator-review.read','inquiry_review',p_view,p_user_id,
      jsonb_build_object('view',p_view,'count',scope.count,'rowIds',scope.row_ids));
  end loop;
  for scope in select t.id tenant_id,t.stable_id tenant_stable_id,
    jsonb_agg(r->>'id' order by r->>'id') row_ids,count(*) count
    from jsonb_array_elements(rows) r join public.tenants t on t.stable_id=
      case when p_view='notices' then
        (select e.tenant_stable_id from public.inquiry_events e where e.id=(r->>'id')::uuid)
      else (select l.tenant_stable_id from public.tenant_leads l where l.id=(r->>'id')::uuid) end
    where nullif(r->>'workspaceId','') is null group by t.id,t.stable_id loop
    insert into public.audit_logs(id,tenant_id,tenant_stable_id,action,target_type,target_id,time,
      actor_user_id,actor_email,actor_type,actor_is_super_admin,metadata)
    values(gen_random_uuid()::text,scope.tenant_id,scope.tenant_stable_id,
      'inquiries.operator-review.read','inquiry_review',p_view,clock_timestamp(),
      p_user_id,actor_email,'operator',true,
      jsonb_build_object('view',p_view,'count',scope.count,'rowIds',scope.row_ids));
  end loop;
  return rows;
end $$;
revoke all on function public.read_operator_inquiry_review_audited(uuid,text,text,integer,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.read_operator_inquiry_review_audited(uuid,text,text,integer,timestamptz,uuid) to service_role;
notify pgrst,'reload schema';
commit;
