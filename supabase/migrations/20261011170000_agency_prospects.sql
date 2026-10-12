-- Agency-owned public check links and durable leads. No Strelva fallback.
-- Service-only profile configuration until the agency brand/profile stream (#264).
begin;
create table public.agency_prospecting_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  contact_url text not null check (contact_url ~ '^https://[^[:space:]]+$'),
  contact_email text not null check (contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  enabled boolean not null default false,
  daily_check_quota integer not null default 100 check (daily_check_quota between 1 and 1000),
  daily_lead_quota integer not null default 100 check (daily_lead_quota between 1 and 1000)
);
create table public.agency_prospect_quota (
  workspace_id uuid not null references public.agency_prospecting_profiles(workspace_id) on delete restrict,
  day date not null,
  checks integer not null default 0,
  leads integer not null default 0,
  primary key (workspace_id, day)
);
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  agency_workspace_id uuid not null references public.agency_prospecting_profiles(workspace_id) on delete restrict,
  source text not null check (source in ('monitor', 'audit')),
  result_id text not null check (char_length(result_id) between 1 and 160),
  name text not null check (char_length(name) <= 120),
  email text not null check (char_length(email) <= 160 and email = lower(email)),
  url text,
  business text not null check (char_length(business) <= 160),
  score integer not null check (score between 0 and 100),
  grade text not null check (grade in ('A','B','C','D','F')),
  created_at timestamptz not null default now(),
  unique (agency_workspace_id, source, result_id, email)
);
create index prospects_agency_created_idx on public.prospects(agency_workspace_id, created_at desc, id);
alter table public.prospects enable row level security;
alter table public.agency_prospecting_profiles enable row level security;
alter table public.agency_prospect_quota enable row level security;
revoke all on public.prospects, public.agency_prospecting_profiles, public.agency_prospect_quota from public, anon, authenticated;
grant all on public.prospects, public.agency_prospecting_profiles, public.agency_prospect_quota to service_role;

-- Membership tables are service-only. This predicate reads them without
-- exposing their rows. JWT sub is Supabase's verified identity, never a parameter.
create function public.agency_prospect_member(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.workspace_memberships m
    join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
    where m.workspace_id=p_workspace_id
      and m.user_id=auth.uid());
$$;
revoke all on function public.agency_prospect_member(uuid) from public, anon;
grant execute on function public.agency_prospect_member(uuid) to authenticated, service_role;
grant select on public.prospects to authenticated;
create policy prospects_agency_members_read on public.prospects for select to authenticated
  using (public.agency_prospect_member(agency_workspace_id));

create function public.agency_prospecting_profile(p_slug text)
returns table(workspace_id uuid, slug text, name text, contact_url text, contact_email text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.workspace_id,p.slug,w.name,p.contact_url,p.contact_email
  from public.agency_prospecting_profiles p join public.workspaces w on w.id=p.workspace_id
  where p.slug=p_slug and p.enabled and w.kind='agency';
$$;

create function public.agency_prospect_admit(p_workspace_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit integer; v_used integer;
begin
  select p.daily_check_quota into v_limit from public.agency_prospecting_profiles p
    join public.workspaces w on w.id=p.workspace_id and w.kind='agency'
    where p.workspace_id=p_workspace_id and p.enabled for share of p,w;
  if v_limit is null then raise exception 'agency_prospect_unavailable'; end if;
  insert into public.agency_prospect_quota(workspace_id,day,checks)
    values(p_workspace_id,(now() at time zone 'UTC')::date,1)
    on conflict (workspace_id,day) do update set checks=agency_prospect_quota.checks+1
    where agency_prospect_quota.checks < v_limit returning checks into v_used;
  if v_used is null then raise exception 'agency_prospect_quota'; end if;
end;
$$;

create function public.agency_prospect_capture(p_workspace_id uuid, p_source text, p_result_id text,
  p_name text,p_email text,p_url text,p_business text,p_score integer,p_grade text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit integer; v_used integer;
begin
  select p.daily_lead_quota into v_limit from public.agency_prospecting_profiles p
    join public.workspaces w on w.id=p.workspace_id and w.kind='agency'
    where p.workspace_id=p_workspace_id and p.enabled for share of p,w;
  if v_limit is null then raise exception 'agency_prospect_unavailable'; end if;
  -- Serialize dedupe and quota together per agency; a retry uses no quota.
  perform pg_advisory_xact_lock(hashtextextended('agency_prospect:'||p_workspace_id::text,0));
  if exists(select 1 from public.prospects where agency_workspace_id=p_workspace_id
    and source=p_source and result_id=p_result_id and email=lower(trim(p_email))) then return; end if;
  insert into public.agency_prospect_quota(workspace_id,day,leads)
    values(p_workspace_id,(now() at time zone 'UTC')::date,1)
    on conflict (workspace_id,day) do update set leads=agency_prospect_quota.leads+1
    where agency_prospect_quota.leads < v_limit returning leads into v_used;
  if v_used is null then raise exception 'agency_prospect_quota'; end if;
  insert into public.prospects(agency_workspace_id,source,result_id,name,email,url,business,score,grade)
    values(p_workspace_id,p_source,p_result_id,p_name,lower(trim(p_email)),p_url,p_business,p_score,p_grade);
end;
$$;

create function public.agency_prospect_list(p_workspace_id uuid,p_user_id uuid,p_email text)
returns setof public.prospects language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.workspace_memberships m
    join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
    join public.users u on u.id=m.user_id and u.verified_at is not null
    where m.workspace_id=p_workspace_id and m.user_id=p_user_id and lower(u.email)=lower(p_email))
    then raise exception 'agency_prospect_access'; end if;
  return query select * from public.prospects where agency_workspace_id=p_workspace_id
    order by created_at desc,id limit 200;
end;
$$;
revoke all on function public.agency_prospecting_profile(text), public.agency_prospect_admit(uuid),
  public.agency_prospect_capture(uuid,text,text,text,text,text,text,integer,text),
  public.agency_prospect_list(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.agency_prospecting_profile(text), public.agency_prospect_admit(uuid),
  public.agency_prospect_capture(uuid,text,text,text,text,text,text,integer,text),
  public.agency_prospect_list(uuid,uuid,text) to service_role;
commit;
