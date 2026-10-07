-- Internal-tool owner submit notices. Additive: no existing sender or RPC changes.
-- The app requires its off-by-default release plus all email gates before sending.
set local lock_timeout = '3s';

create or replace function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
    'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
    'make_real_live:booking_page', 'make_real_live:internal_app', 'connected_sites',
    'make_real_owner_link', 'publishing', 'publishing_record_google_policy', 'internal_tool_notices']::text[]
$$;

revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;


-- A submitter can claim only their own saved record, in the business they belong to.
-- One notice per record, including when no assigned-person field exists.
create function public.claim_internal_tool_submit_notice(
  p_workspace_id uuid, p_work_id uuid, p_record_id text, p_field_id text, p_user_id uuid, p_verified_email text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  record_row public.application_records%rowtype;
  person public.business_people%rowtype;
  notice public.internal_tool_notices%rowtype;
  owner_contact jsonb;
  linked_tenant text;
  person_link text;
  release_spec jsonb;
begin
  if p_user_id is null or p_verified_email is null or not exists (
    select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'workspace_membership_required'; end if;
  perform 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = p_user_id for share;
  if not found and not exists (
    select 1 from public.application_use_grants g where g.workspace_id = p_workspace_id and g.work_id = p_work_id
      and g.recipient_email = lower(btrim(p_verified_email)) and g.status = 'active'
      and g.expires_at > clock_timestamp() and g.record_submit and 'form' = any(g.views)
  ) then raise exception 'workspace_membership_required'; end if;
  select * into record_row from public.application_records
    where work_id = p_work_id and record_id = btrim(p_record_id) and workspace_id = p_workspace_id
      and created_by = p_user_id;
  if not found then raise exception 'internal_tool_notice_denied'; end if;
  select r.spec into release_spec from public.application_states a join public.application_releases r
    on r.work_id = a.work_id and r.version = a.current_release_version
    where a.work_id = p_work_id and a.workspace_id = p_workspace_id;
  if release_spec is null then raise exception 'internal_tool_notice_denied'; end if;
  if p_field_id is not null then
    if not exists (select 1 from jsonb_array_elements(release_spec->'fields') f
        where f->>'id' = p_field_id and f->>'type' = 'assigned_person') then
      raise exception 'internal_tool_notice_denied';
    end if;
    person_link := record_row.values->>p_field_id;
    if nullif(person_link, '') is not null then
      if person_link !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'internal_tool_notice_denied';
      end if;
      select * into person from public.business_people where id = person_link::uuid and workspace_id = p_workspace_id;
      if not found then raise exception 'internal_tool_notice_denied'; end if;
    end if;
  end if;
  owner_contact := public.resolve_business_owner_recipient(p_workspace_id);
  select t.id into linked_tenant from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
    where l.workspace_id = p_workspace_id order by l.linked_at, l.id limit 1;
  insert into public.internal_tool_notices(workspace_id, work_id, record_id, field_id, person_id, recipient_email, status, detail, created_by)
    values (p_workspace_id, p_work_id, record_row.record_id, coalesce(p_field_id, 'owner'), person.id, coalesce(owner_contact->>'email', person.email),
      case when coalesce(owner_contact->>'email', person.email) is null then 'skipped' else 'pending' end,
      case when coalesce(owner_contact->>'email', person.email) is null then 'owner_and_assignee_unavailable' end, p_user_id)
    on conflict (work_id, record_id) do nothing returning * into notice;
  if notice.id is null then
    select * into notice from public.internal_tool_notices where work_id = p_work_id and record_id = record_row.record_id;
    return jsonb_build_object('claimed', false, 'noticeId', notice.id, 'status', notice.status);
  end if;
  return jsonb_build_object('claimed', notice.status = 'pending', 'noticeId', notice.id, 'status', notice.status,
    'recipientEmail', notice.recipient_email, 'ownerName', owner_contact->>'name',
    'assignedEmail', person.email, 'personName', person.name, 'tenantId', linked_tenant);
end;
$$;
revoke all on function public.claim_internal_tool_submit_notice(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_internal_tool_submit_notice(uuid, uuid, text, text, uuid, text) to service_role;
