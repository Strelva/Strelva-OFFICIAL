-- #256: explicit operator permission per business, flag, agency and System.
-- No default grants or verification policy. Flag changes grant no data/effect authority.
begin;
set local lock_timeout='3s';
create table public.agency_release_flag_ceilings(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 flag text not null check(flag=any(public.workspace_release_flag_names())),
 agency_workspace_id uuid not null references public.workspaces(id),
 system_id uuid not null references public.systems(id),
 verification_effect text not null check(verification_effect=any(public.agency_effect_names())),
 max_state text not null check(max_state in ('off','operators','on')),
 revision bigint not null default 1 check(revision>0),
 changed_by uuid not null references public.users(id),changed_at timestamptz not null default clock_timestamp(),
 primary key(workspace_id,flag)
);
create table public.agency_release_flag_ceiling_history(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 flag text not null,before_state jsonb,after_state jsonb not null,
 reason text not null check(char_length(btrim(reason)) between 3 and 500),
 changed_by uuid not null references public.users(id),changed_at timestamptz not null default clock_timestamp()
);
alter table public.agency_release_flag_ceilings enable row level security;
alter table public.agency_release_flag_ceiling_history enable row level security;
revoke all on public.agency_release_flag_ceilings,public.agency_release_flag_ceiling_history from public,anon,authenticated,service_role;
create trigger agency_release_flag_ceiling_history_immutable before update or delete on public.agency_release_flag_ceiling_history
 for each row execute function public.workspace_release_flag_change_immutable();
-- Workspace-wide provider/consent policy switches remain operator-owned.
-- This mechanism never manufactures owner consent or an outside-effect mandate.
create function public.agency_release_flag_system_kind(p_flag text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_flag when 'make_real_live:hosted_website' then 'website' when 'make_real_live:tenant_content' then 'website'
 when 'make_real_live:inquiry_form' then 'inquiry' when 'make_real_live:booking_page' then 'booking'
 when 'make_real_live:internal_app' then 'internal_app' when 'website_rebuild' then 'website'
 when 'connected_sites' then 'website' when 'newsletter_contacts' then 'newsletter' end
$$;
create function public.agency_release_flag_read_scope(p_agency_id uuid,p_workspace_id uuid,p_user_id uuid,p_email text)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id and m.workspace_id=p_agency_id
   join public.workspaces a on a.id=m.workspace_id and a.kind='agency'
   join public.provider_seats s on s.agency_workspace_id=a.id and s.customer_workspace_id=p_workspace_id and s.status='active'
   join public.agency_client_staff st on st.agency_workspace_id=a.id and st.customer_workspace_id=p_workspace_id and st.user_id=u.id and st.status='active'
   where u.id=p_user_id and lower(u.email)=lower(btrim(p_email)) and u.verified_at is not null;
 if not found then raise exception 'workspace_access_denied'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_access_denied'; end if;
end $$;
create function public.agency_release_flag_scope(p_agency_id uuid,p_workspace_id uuid,p_user_id uuid,p_email text)
returns void language plpgsql volatile security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id and m.workspace_id=p_agency_id
   join public.workspaces a on a.id=m.workspace_id and a.kind='agency'
   join public.provider_seats s on s.agency_workspace_id=a.id and s.customer_workspace_id=p_workspace_id and s.status='active'
   join public.agency_client_staff st on st.agency_workspace_id=a.id and st.customer_workspace_id=p_workspace_id and st.user_id=u.id and st.status='active'
   where u.id=p_user_id and lower(u.email)=lower(btrim(p_email)) and u.verified_at is not null for share of u,m,s,st;
 if not found then raise exception 'workspace_access_denied'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_access_denied'; end if;
end $$;
create function public.agency_release_flag_rows(p_agency_id uuid,p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('agencyWorkspaceId',p_agency_id,'workspaceId',p_workspace_id,'flags',coalesce(jsonb_agg(jsonb_build_object(
  'flag',c.flag,'ceiling',c.max_state,'ceilingRevision',c.revision,'systemId',c.system_id,'systemName',s.name,
  'verificationEffect',c.verification_effect,'verified',public.agency_effect_allowed(p_agency_id,c.verification_effect),
  'state',coalesce(f.state,'off'),'revision',coalesce(f.revision,0),'changedAt',f.changed_at) order by c.flag),'[]'::jsonb))
 from public.agency_release_flag_ceilings c join public.systems s on s.id=c.system_id and s.business_workspace_id=c.workspace_id
 left join public.workspace_release_flags f on f.workspace_id=c.workspace_id and f.flag=c.flag
 where c.workspace_id=p_workspace_id and c.agency_workspace_id=p_agency_id
$$;
create function public.read_agency_release_flags(p_agency_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.agency_release_flag_read_scope(p_agency_id,p_workspace_id,p_user_id,p_verified_email);
 return public.agency_release_flag_rows(p_agency_id,p_workspace_id);
end $$;
create function public.read_operator_agency_release_flags(p_user_id uuid,p_verified_email text,p_agency_id uuid,p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.users u join public.super_admins a on a.user_id=u.id
  where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null and a.revoked_at is null) then raise exception 'workspace_access_denied';end if;
 return public.agency_release_flag_rows(p_agency_id,p_workspace_id)||jsonb_build_object('history',coalesce((select jsonb_agg(to_jsonb(h)) from
  (select * from public.agency_release_flag_ceiling_history where workspace_id=p_workspace_id order by changed_at desc,id limit 200) h),'[]'::jsonb));
end $$;
create function public.set_agency_release_flag_ceiling(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_flag text,
 p_agency_id uuid,p_system_id uuid,p_verification_effect text,p_max_state text,p_expected_revision bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare before_row public.agency_release_flag_ceilings; after_row public.agency_release_flag_ceilings; operator_id uuid; f public.workspace_release_flags; next_state text;
begin
 operator_id:=public.workspace_release_assert_operator(p_verified_email);
 if operator_id is distinct from p_user_id then raise exception 'workspace_access_denied'; end if;
 perform 1 from public.users u join public.super_admins a on a.user_id=u.id where u.id=operator_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null and a.revoked_at is null for share of u,a;
 if not found then raise exception 'workspace_access_denied'; end if;
 if p_flag is null or not(p_flag=any(public.workspace_release_flag_names())) then raise exception 'workspace_release_flag_unknown'; end if;
 if p_flag in ('publishing_record_google_policy','make_real_owner_link','owner_decision_links','agent_channel') then raise exception 'agency_release_flag_operator_only'; end if;
 if p_max_state is null or p_max_state not in ('off','operators','on') or p_verification_effect is null or not(p_verification_effect=any(public.agency_effect_names())) then raise exception 'workspace_release_state_invalid'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'workspace_release_reason_required'; end if;
 perform public.workspace_release_assert_workspace(p_workspace_id);
 perform 1 from public.workspaces where id=p_agency_id and kind='agency';
 if not found then raise exception 'workspace_access_denied'; end if;
 perform 1 from public.provider_seats where customer_workspace_id=p_workspace_id and agency_workspace_id=p_agency_id and status='active' for share;
 if not found then raise exception 'workspace_access_denied'; end if;
 perform 1 from public.systems where id=p_system_id and business_workspace_id=p_workspace_id
  and (public.agency_release_flag_system_kind(p_flag) is null or kind=public.agency_release_flag_system_kind(p_flag)) for share;
 if not found then raise exception 'agency_release_flag_system_mismatch'; end if;
 select * into before_row from public.agency_release_flag_ceilings where workspace_id=p_workspace_id and flag=p_flag for update;
 if p_expected_revision is distinct from coalesce(before_row.revision,0) then raise exception 'workspace_release_revision_conflict'; end if;
 insert into public.agency_release_flag_ceilings(workspace_id,flag,agency_workspace_id,system_id,verification_effect,max_state,revision,changed_by)
 values(p_workspace_id,p_flag,p_agency_id,p_system_id,p_verification_effect,p_max_state,coalesce(before_row.revision,0)+1,operator_id)
 on conflict(workspace_id,flag) do update set agency_workspace_id=excluded.agency_workspace_id,system_id=excluded.system_id,
 verification_effect=excluded.verification_effect,max_state=excluded.max_state,revision=excluded.revision,changed_by=excluded.changed_by,changed_at=clock_timestamp()
 returning * into after_row;
 insert into public.agency_release_flag_ceiling_history(workspace_id,flag,before_state,after_state,reason,changed_by)
 values(p_workspace_id,p_flag,to_jsonb(before_row),to_jsonb(after_row),btrim(p_reason),operator_id);
 -- A lower/reassigned ceiling closes current client exposure in this transaction.
 select * into f from public.workspace_release_flags where workspace_id=p_workspace_id and flag=p_flag for update;
 next_state:=case when before_row.agency_workspace_id is distinct from p_agency_id then 'off' when p_max_state='off' then 'off'
 when p_max_state='operators' and f.state='on' then 'operators' else f.state end;
 if f.state is not null and next_state is distinct from f.state then
  update public.workspace_release_flags set state=next_state,revision=revision+1,changed_by=operator_id,changed_at=clock_timestamp() where workspace_id=p_workspace_id and flag=p_flag;
  insert into public.workspace_release_flag_changes(workspace_id,subject,from_state,to_state,reason,changed_by)
  values(p_workspace_id,p_flag,f.state,next_state,btrim(p_reason),operator_id);
 end if;
 return public.agency_release_flag_rows(p_agency_id,p_workspace_id);
end $$;
create function public.set_agency_workspace_release_flag(p_agency_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,
 p_flag text,p_state text,p_expected_revision bigint,p_ceiling_revision bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ceiling public.agency_release_flag_ceilings; f public.workspace_release_flags; scope record; s public.systems;
begin
 if p_flag is null or not(p_flag=any(public.workspace_release_flag_names())) then raise exception 'workspace_release_flag_unknown'; end if;
 if p_state is null or p_state not in ('off','operators','on') then raise exception 'workspace_release_state_invalid'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'workspace_release_reason_required'; end if;
 -- Same workspace lock order as the operator setter, then ceiling, then flag.
 perform public.workspace_release_assert_workspace(p_workspace_id);
 perform public.agency_release_flag_scope(p_agency_id,p_workspace_id,p_user_id,p_verified_email);
 select * into ceiling from public.agency_release_flag_ceilings where workspace_id=p_workspace_id and flag=p_flag for share;
 if not found or ceiling.agency_workspace_id is distinct from p_agency_id then raise exception 'agency_release_flag_not_permitted'; end if;
 if ceiling.revision is distinct from p_ceiling_revision then raise exception 'workspace_release_revision_conflict'; end if;
 if ceiling.max_state='off' or (ceiling.max_state='operators' and p_state='on') then raise exception 'agency_release_flag_above_ceiling'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('agency-verification:'||p_agency_id::text,0));
 if not public.agency_effect_allowed(p_agency_id,ceiling.verification_effect) then raise exception 'agency_release_flag_unverified'; end if;
 scope:=public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,true);
 s:=public.system_load(p_workspace_id,ceiling.system_id,true,scope.work_ids);
 if public.agency_release_flag_system_kind(p_flag) is not null and s.kind<>public.agency_release_flag_system_kind(p_flag) then raise exception 'agency_release_flag_system_mismatch'; end if;
 select * into f from public.workspace_release_flags where workspace_id=p_workspace_id and flag=p_flag for update;
 if p_expected_revision is distinct from coalesce(f.revision,0) then raise exception 'workspace_release_revision_conflict'; end if;
 if f.state is distinct from p_state then
  insert into public.workspace_release_flags(workspace_id,flag,state,revision,changed_by) values(p_workspace_id,p_flag,p_state,coalesce(f.revision,0)+1,p_user_id)
  on conflict(workspace_id,flag) do update set state=excluded.state,revision=excluded.revision,changed_by=excluded.changed_by,changed_at=clock_timestamp();
  insert into public.workspace_release_flag_changes(workspace_id,subject,from_state,to_state,reason,changed_by)
   values(p_workspace_id,p_flag,coalesce(f.state,'unset'),p_state,btrim(p_reason),p_user_id);
 end if;
 return public.agency_release_flag_rows(p_agency_id,p_workspace_id);
end $$;
-- Existing operator off/unset is an absolute withdrawal of agency permission.
-- On/operators retain the approved operator path and do not create a grant.
alter function public.set_workspace_release_flag(text,uuid,text,text,text,bigint) rename to set_workspace_release_flag_before_agency;
create function public.set_workspace_release_flag(p_operator_email text,p_workspace_id uuid,p_flag text,p_state text,p_reason text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; c public.agency_release_flag_ceilings; who uuid;
begin
 result:=public.set_workspace_release_flag_before_agency(p_operator_email,p_workspace_id,p_flag,p_state,p_reason,p_expected_revision);
 if p_state in ('off','unset') then
  select * into c from public.agency_release_flag_ceilings where workspace_id=p_workspace_id and flag=p_flag for update;
  if found and c.max_state<>'off' then
   who:=public.workspace_release_assert_operator(p_operator_email);
   update public.agency_release_flag_ceilings set max_state='off',revision=revision+1,changed_by=who,changed_at=clock_timestamp() where workspace_id=p_workspace_id and flag=p_flag;
   insert into public.agency_release_flag_ceiling_history(workspace_id,flag,before_state,after_state,reason,changed_by)
    select p_workspace_id,p_flag,to_jsonb(c),to_jsonb(x),btrim(p_reason),who from public.agency_release_flag_ceilings x where x.workspace_id=p_workspace_id and x.flag=p_flag;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.agency_release_flag_read_scope(uuid,uuid,uuid,text),public.agency_release_flag_scope(uuid,uuid,uuid,text),public.agency_release_flag_rows(uuid,uuid),public.agency_release_flag_system_kind(text),public.set_workspace_release_flag_before_agency(text,uuid,text,text,text,bigint),public.set_workspace_release_flag(text,uuid,text,text,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.read_operator_agency_release_flags(uuid,text,uuid,uuid),public.read_agency_release_flags(uuid,uuid,uuid,text),public.set_agency_workspace_release_flag(uuid,uuid,uuid,text,text,text,bigint,bigint,text),public.set_agency_release_flag_ceiling(uuid,text,uuid,text,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.read_operator_agency_release_flags(uuid,text,uuid,uuid),public.read_agency_release_flags(uuid,uuid,uuid,text),public.set_agency_workspace_release_flag(uuid,uuid,uuid,text,text,text,bigint,bigint,text),public.set_agency_release_flag_ceiling(uuid,text,uuid,text,uuid,uuid,text,text,bigint,text) to service_role;
commit;
