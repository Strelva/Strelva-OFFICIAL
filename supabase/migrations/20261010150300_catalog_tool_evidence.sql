-- Internal-tool release history and contact conflicts, separate from delivery.
set local lock_timeout = '3s';
create table public.internal_tool_contact_conflicts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null references public.saved_product_work(id) on delete cascade,
  field_id text not null,
  email_contact_id uuid not null references public.business_contacts(id) on delete cascade,
  phone_contact_id uuid not null references public.business_contacts(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  unique(work_id,field_id,email_contact_id,phone_contact_id)
);
alter table public.internal_tool_contact_conflicts enable row level security;
revoke all on public.internal_tool_contact_conflicts from public,anon,authenticated,service_role;

-- Extend only the already opt-in link resolver. A denied/invalid submission
-- rolls this insertion back with the existing contact + record transaction.
do $migration$
declare definition text; anchor text;
begin
  definition := pg_get_functiondef('public.resolve_internal_tool_links(uuid,uuid,uuid,text,jsonb)'::regprocedure);
  anchor := '      if found_id is null then raise exception ''business_record_conflict''; end if;';
  if position(anchor in definition)=0 then raise exception 'internal_tool_resolver_drift'; end if;
  definition := replace(definition,anchor,anchor||E'\n      if email_match is not null and phone_match is not null and email_match<>phone_match then\n        insert into public.internal_tool_contact_conflicts(workspace_id,work_id,field_id,email_contact_id,phone_contact_id)\n          values(p_workspace_id,p_work_id,field_id,email_match,phone_match) on conflict do nothing;\n      end if;');
  execute definition;
end; $migration$;

create function public.read_catalog_tool_releases(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found or public.workspace_make_systems_authority(p_workspace_id,p_user_id) is null then raise exception 'workspace_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('workId',w.id,'version',r.version,'at',r.published_at,'provenance',r.provenance))
    from public.saved_product_work w join lateral (
      select version,published_at,publication_source as provenance from public.application_releases where work_id=w.id order by version desc limit 20
    ) r on true where w.workspace_id=p_workspace_id and w.product_id='applications'), '[]'::jsonb);
end; $$;

create function public.read_catalog_tool_contact_conflicts(p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.workspace_release_assert_operator(p_verified_email);
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null)
    then raise exception 'workspace_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'workspaceId',workspace_id,'workId',work_id,'at',created_at))
    from public.internal_tool_contact_conflicts), '[]'::jsonb);
end; $$;
revoke all on function public.read_catalog_tool_releases(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.read_catalog_tool_contact_conflicts(uuid,text) from public,anon,authenticated;
grant execute on function public.read_catalog_tool_releases(uuid,uuid,text) to service_role;
grant execute on function public.read_catalog_tool_contact_conflicts(uuid,text) to service_role;
