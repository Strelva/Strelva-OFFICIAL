-- Operators manage domains on a managed site, on the owner's approval
-- (website System spec 2026-10-06, behaviors 12-14; who-can-do-what table).
--
-- Additive. Local only until Jacob's yes.
--
-- manage_published_website_tenant stays owner-only. A domain change is the
-- owner's decision (system.go_live), but on a managed site Strelva does the
-- work. So:
--   approve_website_domain_change   the business owner approves one exact
--                                   hostname for one published site. The
--                                   approval is bound to the tenant's stable
--                                   identity, so it survives a slug rename,
--                                   and lapses after 14 days (the Needs you
--                                   chase clock).
--   authorize_website_domain_change returns 'owner' for the owner exactly as
--                                   before, or 'provider' for a verified,
--                                   active Strelva operator who is an admin of
--                                   this customer business, when a current
--                                   owner approved this hostname and is not
--                                   that operator. Checking a hostname already
--                                   attached to the site needs no new
--                                   approval: the owner decided it already.
-- Removing a domain is not offered here. Strelva removes only its own claim
-- (operator spec) and Vercel domains are never removed.

create table public.website_domain_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  website_work_id uuid not null,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete restrict,
  hostname text not null check (hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' and char_length(hostname) <= 253),
  approved_by uuid not null references public.users(id) on delete restrict,
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  foreign key (website_work_id,workspace_id) references public.saved_product_work(id,workspace_id) on delete restrict
);
create index website_domain_approvals_lookup_idx on public.website_domain_approvals(tenant_stable_id, hostname, approved_at desc);
alter table public.website_domain_approvals enable row level security;
revoke all on public.website_domain_approvals from public,anon,authenticated,service_role;

create function public.website_domain_approval_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'website_domain_approval_immutable'; end $$;
create trigger website_domain_approvals_immutable before update or delete on public.website_domain_approvals
  for each row execute function public.website_domain_approval_immutable();
revoke all on function public.website_domain_approval_immutable() from public,anon,authenticated,service_role;

create function public.approve_website_domain_change(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_hostname text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tenant_row public.tenants; approval public.website_domain_approvals; host text := lower(trim(coalesce(p_hostname,'')));
begin
  -- The owner path of the published-tenant check, unchanged.
  perform public.manage_published_website_tenant(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_tenant_id);
  perform public.website_document_assert_launch_owner(p_workspace_id,p_user_id);
  if host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' or char_length(host) > 253 then raise exception 'website_domain_invalid'; end if;
  select * into tenant_row from public.tenants where id=p_tenant_id;
  insert into public.website_domain_approvals(workspace_id,website_work_id,tenant_stable_id,hostname,approved_by,expires_at)
    values(p_workspace_id,p_work_id,tenant_row.stable_id,host,p_user_id,clock_timestamp()+interval '14 days') returning * into approval;
  return jsonb_build_object('id',approval.id,'hostname',approval.hostname,'approvedAt',approval.approved_at,'expiresAt',approval.expires_at);
end $$;
revoke all on function public.approve_website_domain_change(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.approve_website_domain_change(uuid,uuid,uuid,text,text,text) to service_role;

create function public.authorize_website_domain_change(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_hostname text,p_action text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role text; tenant_row public.tenants; host text := lower(trim(coalesce(p_hostname,'')));
begin
  if p_action is null or p_action not in ('attach','refresh') then raise exception 'website_domain_action_invalid'; end if;
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  -- Owners keep exactly the published-tenant check they had.
  begin
    perform public.manage_published_website_tenant(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_tenant_id);
    return 'owner';
  exception when others then
    if sqlerrm not like '%website_tenant_access_denied%' then raise; end if;
  end;
  select m.role into actor_role from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
    where w.id=p_workspace_id and w.kind='customer' and m.user_id=p_user_id for share of w,m;
  if actor_role is distinct from 'admin' or not exists(
    select 1 from public.super_admins sa join public.users u on u.id=sa.user_id where sa.user_id=p_user_id and sa.revoked_at is null and u.verified_at is not null
  ) then raise exception 'website_tenant_access_denied'; end if;
  select t.* into tenant_row from public.website_document_publications p join public.tenants t on t.id=p.tenant_id
    where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=p_tenant_id and t.active for share of p,t;
  if not found then raise exception 'website_tenant_access_denied'; end if;
  -- Checking a hostname the site already holds is checking, not deciding.
  if p_action='refresh' and to_regclass('public.domain_claims') is not null then
    if exists(select 1 from public.domain_claims c where c.tenant_id=tenant_row.id and c.domain=host) then return 'provider'; end if;
  end if;
  if exists(
    select 1 from public.website_domain_approvals a
    join public.workspace_memberships wm on wm.workspace_id=a.workspace_id and wm.user_id=a.approved_by and wm.role='owner'
    join public.users u on u.id=a.approved_by and u.verified_at is not null
    where a.workspace_id=p_workspace_id and a.website_work_id=p_work_id and a.tenant_stable_id=tenant_row.stable_id
      and a.hostname=host and a.approved_by<>p_user_id and a.expires_at>clock_timestamp()
  ) then return 'provider'; end if;
  raise exception 'website_domain_owner_approval_required';
end $$;
revoke all on function public.authorize_website_domain_change(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.authorize_website_domain_change(uuid,uuid,uuid,text,text,text,text) to service_role;

create function public.read_website_domain_approvals(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text) returns table(hostname text, approved_by uuid, approved_at timestamptz, expires_at timestamptz, current boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,false);
  return query select a.hostname, a.approved_by, a.approved_at, a.expires_at,
      (a.expires_at>clock_timestamp() and exists(select 1 from public.workspace_memberships wm where wm.workspace_id=a.workspace_id and wm.user_id=a.approved_by and wm.role='owner'))
    from public.website_domain_approvals a
    where a.workspace_id=p_workspace_id and a.website_work_id=p_work_id order by a.approved_at desc, a.id desc limit 50;
end $$;
revoke all on function public.read_website_domain_approvals(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_website_domain_approvals(uuid,uuid,uuid,text) to service_role;
