-- Prepared exact-work creator authority; no publication or record-write grant.
begin;
set local lock_timeout='2s';
create function public.agency_can_author_created_application(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_work_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(
  select 1 from public.saved_product_work w join public.application_states a on a.work_id=w.id and a.workspace_id=w.workspace_id
  join public.users u on u.id=p_user_id and u.verified_at is not null and lower(u.email)=lower(btrim(p_verified_email))
  where w.id=p_work_id and w.workspace_id=p_workspace_id and w.created_by=p_user_id
   and w.product_id='applications' and w.resource_kind='application' and a.current_release_version is null
   and not exists(select 1 from public.application_releases r where r.work_id=w.id)
   and not exists(select 1 from public.application_records r where r.work_id=w.id)
   and not exists(select 1 from public.workspace_exit_requests e where e.workspace_id=w.workspace_id)
   and not exists(select 1 from public.agency_application_draft_grants g where g.application_work_id=w.id and g.operator_user_id=p_user_id)
   and not exists(select 1 from public.workspace_release_flags f where f.workspace_id=w.workspace_id and f.flag='systems'
     and (f.state='off' or (f.state='operators'
       and not exists(select 1 from public.super_admins sa where sa.user_id=p_user_id and sa.revoked_at is null)
       and not exists(select 1 from public.workspace_release_testers t where t.workspace_id=w.workspace_id and t.user_id=p_user_id))))
   and exists(select 1 from public.provider_seats seat
     join public.workspaces customer on customer.id=seat.customer_workspace_id and customer.kind='customer'
     join public.workspaces agency on agency.id=seat.agency_workspace_id and agency.kind='agency'
     join public.workspace_memberships member on member.workspace_id=seat.agency_workspace_id and member.user_id=p_user_id
     join public.agency_client_staff staff on staff.agency_workspace_id=seat.agency_workspace_id and staff.customer_workspace_id=seat.customer_workspace_id and staff.user_id=p_user_id and staff.status='active'
     where seat.customer_workspace_id=w.workspace_id and seat.status='active')
 );
$$;
create function public.agency_created_application_work_ids(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns uuid[] language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(array_agg(w.id order by w.id),'{}'::uuid[]) from public.saved_product_work w
 where w.workspace_id=p_workspace_id and w.created_by=p_user_id and w.product_id='applications' and w.resource_kind='application'
 and public.agency_can_author_created_application(p_workspace_id,p_user_id,p_verified_email,w.id);
$$;
-- One statement snapshot: eligibility and draft payload share the same MVCC view.
-- Never select customer records or release bodies on this implicit read path.
create function public.read_agency_created_application(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_work_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(w) || jsonb_build_object('payload',w.payload || jsonb_build_object(
  'status','draft','records','[]'::jsonb,'recordsRevision',0,'release',null,'releases','[]'::jsonb,
  'spec',a.candidate_spec,'specVersion',a.candidate_spec_version,'designRevision',a.candidate_design_revision,
  'versions',a.candidate_versions,'rehearsal',a.candidate_rehearsal,
  'candidate',jsonb_build_object('spec',a.candidate_spec,'specVersion',a.candidate_spec_version,
   'designRevision',a.candidate_design_revision,'rehearsal',a.candidate_rehearsal)))
 from public.saved_product_work w join public.application_states a on a.work_id=w.id and a.workspace_id=w.workspace_id
 where w.id=p_work_id and w.workspace_id=p_workspace_id
 and public.agency_can_author_created_application(p_workspace_id,p_user_id,p_verified_email,p_work_id);
$$;
-- Called before the core work lock; workspace-first serialization matches flags/exit.
-- The read scope above is genuinely STABLE and takes no row/advisory locks.
create function public.lock_agency_created_application(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_work_id uuid)
returns boolean language plpgsql volatile security definer set search_path=public,pg_temp as $$
begin
 if not public.agency_can_author_created_application(p_workspace_id,p_user_id,p_verified_email,p_work_id) then return false; end if;
 perform 1 from public.workspaces where id=p_workspace_id for update;
 perform 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
 perform 1 from public.users where id=p_user_id for share;
 perform 1 from public.provider_seats seat
  join public.workspace_memberships member on member.workspace_id=seat.agency_workspace_id and member.user_id=p_user_id
  join public.agency_client_staff staff on staff.agency_workspace_id=seat.agency_workspace_id and staff.customer_workspace_id=seat.customer_workspace_id and staff.user_id=p_user_id and staff.status='active'
  where seat.customer_workspace_id=p_workspace_id and seat.status='active' for share of seat,member,staff;
 perform 1 from public.workspace_release_flags where workspace_id=p_workspace_id and flag='systems' for share;
 -- The current predicates are evaluated again after every potentially blocking lock.
 return public.agency_can_author_created_application(p_workspace_id,p_user_id,p_verified_email,p_work_id);
end $$;

-- Patch only the precise candidate authority seam in the actual predecessor.
-- Keep later service-role/exit/current-schema guards and every existing ACL.
create table public.agency_created_application_predecessors(signature text primary key,before_definition text not null,after_sha256 text not null);
alter table public.agency_created_application_predecessors enable row level security;
revoke all on public.agency_created_application_predecessors from public,anon,authenticated,service_role;
do $patch$
declare signature text; before_definition text; next_definition text; old_fragment text; new_fragment text;
begin
 for signature in select unnest(array[
 'public.update_application_candidate(uuid,uuid,uuid,text,integer,jsonb)',
 'public.rehearse_application_candidate(uuid,uuid,uuid,text,integer)']) loop
  before_definition:=pg_get_functiondef(signature::regprocedure);
  if signature like 'public.update_%' then
   old_fragment:='if exists ('||chr(10)||'      select 1 from public.workspace_memberships';
   new_fragment:='if creator_admitted then'||chr(10)||'      null;'||chr(10)||'    elsif exists ('||chr(10)||'      select 1 from public.workspace_memberships';
  else
   old_fragment:='if not delegated then perform public.application_assert_identity';
   new_fragment:='if not delegated then delegated := creator_admitted; end if;'||chr(10)||'  if not delegated then perform public.application_assert_identity';
  end if;
  if strpos(before_definition,old_fragment)=0 or array_length(string_to_array(before_definition,old_fragment),1)<>2 then raise exception 'agency_creator_predecessor_changed'; end if;
  next_definition:=replace(before_definition,old_fragment,new_fragment);
  if strpos(next_definition,'declare ') = 0 then raise exception 'agency_creator_declaration_changed'; end if;
  next_definition:=replace(next_definition,'declare ','declare creator_admitted boolean := false; ');
  old_fragment:='perform public.application_lock_work(p_workspace_id, p_work_id);';
  if strpos(next_definition,old_fragment)=0 then old_fragment:='perform public.application_lock_work(p_workspace_id,p_work_id);'; end if;
  if strpos(next_definition,old_fragment)=0 or array_length(string_to_array(next_definition,old_fragment),1)<>2 then raise exception 'agency_creator_lock_predecessor_changed'; end if;
  next_definition:=replace(next_definition,old_fragment,'creator_admitted := public.lock_agency_created_application(p_workspace_id,p_user_id,p_verified_email,p_work_id);'||chr(10)||'  '||old_fragment);
  execute next_definition;
  insert into public.agency_created_application_predecessors values(signature,before_definition,encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex'));
 end loop;
end $patch$;

revoke all on function public.agency_can_author_created_application(uuid,uuid,text,uuid),public.agency_created_application_work_ids(uuid,uuid,text),public.lock_agency_created_application(uuid,uuid,text,uuid),public.read_agency_created_application(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.agency_can_author_created_application(uuid,uuid,text,uuid),public.agency_created_application_work_ids(uuid,uuid,text),public.lock_agency_created_application(uuid,uuid,text,uuid),public.read_agency_created_application(uuid,uuid,text,uuid) to service_role;
commit;
