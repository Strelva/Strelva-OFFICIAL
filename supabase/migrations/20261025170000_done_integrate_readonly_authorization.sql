-- Reader authorization must run in PostgREST READ ONLY transactions.
-- Exact identity, membership, seat and staffing checks remain; writer helpers
-- keep their current locks. No grants, flags, providers or customer data change.
begin;
set local lock_timeout='3s';
create schema done_integrate_readonly_rollback;
revoke all on schema done_integrate_readonly_rollback from public,anon,authenticated,service_role;
create table done_integrate_readonly_rollback.functions(
 signature text primary key,before_definition text,after_fingerprint text);
insert into done_integrate_readonly_rollback.functions(signature,before_definition)
select signature,pg_get_functiondef(signature::regprocedure) from unnest(array[
 'public.read_agency_proposals(uuid,text,uuid)',
 'public.read_agency_proposals_before_ux_agency_identity(uuid,text,uuid)',
 'public.read_inquiry_forwarding(uuid,uuid,text)',
 'public.read_service_request(uuid,text,uuid)']) signature;

create function public.agency_directory_assert_manager_readonly(p_agency_id uuid, p_user_id uuid, p_verified_email text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_agency_id and m.role in ('owner','admin');
  if not found then raise exception 'agency_directory_denied'; end if;
end;
$$;

create function public.inquiry_forwarding_actor_readonly(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_role text; v_agency uuid;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null
    or not exists (select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null) then
    raise exception 'inquiry_forwarding_access_denied';
  end if;
  if not exists (select 1 from public.workspaces where id = p_workspace_id and kind = 'customer') then
    raise exception 'inquiry_forwarding_access_denied';
  end if;
  select m.role into v_role from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
  if v_role in ('owner','admin','member') then return v_role; end if;
  -- A staffed member of an agency with an active seat that holds the
  -- inquiries area, or that added the business and still awaits the claim.
  select s.agency_workspace_id into v_agency from public.provider_seats s
    join public.workspaces a on a.id = s.agency_workspace_id and a.kind = 'agency'
    join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
    join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
      and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
    where s.customer_workspace_id = p_workspace_id and s.status = 'active'
      and (exists (select 1 from public.agency_scope_grants g where g.customer_workspace_id = s.customer_workspace_id
             and g.agency_workspace_id = s.agency_workspace_id and g.scope = 'inquiries' and g.status = 'active')
        or (s.granted_by_kind = 'agency_added'
          and not exists (select 1 from public.workspace_memberships o where o.workspace_id = p_workspace_id and o.role = 'owner')))
    limit 1;
  if v_agency is null then raise exception 'inquiry_forwarding_access_denied'; end if;
  return 'agency';
end;
$$;

create function public.service_request_assert_agency_client_readonly(p_business_id uuid, p_agency_id uuid, p_user_id uuid, p_verified_email text)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
    perform 1 from public.provider_seats s
      join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=p_user_id
      join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id
        and st.customer_workspace_id=s.customer_workspace_id and st.user_id=p_user_id and st.status='active'
      where s.customer_workspace_id=p_business_id and s.agency_workspace_id=p_agency_id and s.status='active';
  if not found then raise exception 'service_request_provider_ineligible'; end if;
end;
$$;

revoke all on function public.agency_directory_assert_manager_readonly(uuid,uuid,text),
 public.inquiry_forwarding_actor_readonly(uuid,uuid,text),
 public.service_request_assert_agency_client_readonly(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
insert into done_integrate_readonly_rollback.functions(signature) values
 ('public.agency_directory_assert_manager_readonly(uuid,uuid,text)'),
 ('public.inquiry_forwarding_actor_readonly(uuid,uuid,text)'),
 ('public.service_request_assert_agency_client_readonly(uuid,uuid,uuid,text)');

-- Replace only the exact reader calls. Definitions retain owner, return type,
-- volatility, security, configuration and existing ACLs.
do $$ declare row record; definition text; begin
 for row in select * from done_integrate_readonly_rollback.functions where before_definition is not null loop
  definition:=replace(row.before_definition,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
  -- The private historical proposal reader used nested aggregates. Preserve
  -- its original fields while using the current grouped aggregation layout.
  if row.signature='public.read_agency_proposals_before_ux_agency_identity(uuid,text,uuid)' then
   select replace(replace(before_definition,'FUNCTION public.read_agency_proposals(',
     'FUNCTION public.read_agency_proposals_before_ux_agency_identity('),
     '''proposalId'',public.agency_proposal_identity(b.id,p_agency_id),', '') into definition
    from done_integrate_readonly_rollback.functions where signature='public.read_agency_proposals(uuid,text,uuid)';
  end if;
  if row.signature like 'public.read_agency_proposals%' then
   definition:=replace(definition,'public.agency_directory_assert_manager(','public.agency_directory_assert_manager_readonly(');
  elsif row.signature='public.read_inquiry_forwarding(uuid,uuid,text)' then
   definition:=replace(definition,'public.inquiry_forwarding_actor(p_workspace_id, p_user_id, p_verified_email, false)',
     'public.inquiry_forwarding_actor_readonly(p_workspace_id, p_user_id, p_verified_email)');
  else
   definition:=replace(definition,'public.service_request_assert_agency_client(item.business_workspace_id,item.provider_agency_workspace_id,p_user_id,false,p_verified_email)',
     'public.service_request_assert_agency_client_readonly(item.business_workspace_id,item.provider_agency_workspace_id,p_user_id,p_verified_email)');
  end if;
  if definition=replace(row.before_definition,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION') then raise exception 'done_integrate_readonly_expected_reader_call_missing'; end if;
  execute definition;
 end loop;
end $$;
update done_integrate_readonly_rollback.functions s set after_fingerprint=md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
from pg_proc p where p.oid=s.signature::regprocedure;
notify pgrst,'reload schema';
commit;
