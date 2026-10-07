-- Separate pause intent from provider health; no change to legacy writes while release is off.
begin;
set local lock_timeout = '3s';
create table public.google_listing_controls (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id text not null check (location_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  paused boolean not null default false,
  access_pending boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, location_id)
);
alter table public.google_listing_controls enable row level security;
revoke all on public.google_listing_controls from public, anon, authenticated, service_role;
create function public.google_listing_control_json(c public.google_listing_controls) returns jsonb
language sql stable set search_path = public, pg_temp as $$
 select jsonb_build_object('workspaceId',c.workspace_id,'locationId',c.location_id,'paused',c.paused,'accessPending',c.access_pending,'updatedAt',c.updated_at)
$$;
create function public.read_google_listing_control(p_workspace_id uuid, p_location_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce((select public.google_listing_control_json(c) from public.google_listing_controls c where c.workspace_id=p_workspace_id and c.location_id=p_location_id),
  jsonb_build_object('workspaceId',p_workspace_id,'locationId',p_location_id,'paused',false,'accessPending',false,'updatedAt',null))
$$;
create function public.set_google_listing_paused(p_workspace_id uuid,p_location_id text,p_user_id uuid,p_verified_email text,p_paused boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record;
begin
 v := public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,true);
 if v.work_ids is not null then raise exception 'business_record_access_denied'; end if;
 if not exists(select 1 from public.workspace_google_locations where workspace_id=p_workspace_id and location_id=p_location_id) then raise exception 'google_location_not_found'; end if;
 insert into public.google_listing_controls(workspace_id,location_id,paused) values(p_workspace_id,p_location_id,p_paused)
 on conflict(workspace_id,location_id) do update set paused=excluded.paused, updated_at=clock_timestamp();
 return public.read_google_listing_control(p_workspace_id,p_location_id);
end;
$$;
create function public.note_google_listing_access(p_workspace_id uuid,p_location_id text,p_pending boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 insert into public.google_listing_controls(workspace_id,location_id,access_pending) values(p_workspace_id,p_location_id,p_pending)
 on conflict(workspace_id,location_id) do update set access_pending=excluded.access_pending, updated_at=clock_timestamp();
 return public.read_google_listing_control(p_workspace_id,p_location_id);
end;
$$;
create or replace function public.read_business_publishing(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_limit integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  if v.work_ids is not null then
    return jsonb_build_object('businessId', p_workspace_id, 'scope', 'assigned', 'bindings', '[]'::jsonb, 'receipts', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'businessId', p_workspace_id,
    'scope', 'business',
    'controls', coalesce((select jsonb_agg(public.google_listing_control_json(c)) from public.google_listing_controls c where c.workspace_id = p_workspace_id), '[]'::jsonb),
    'bindings', coalesce((select jsonb_agg(public.account_binding_json(b, false) order by b.created_at, b.id)
      from public.workspace_account_bindings b where b.workspace_id = p_workspace_id), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(public.google_listing_receipt_json(r) order by r.created_at desc, r.id)
      from (select * from public.google_listing_receipts where workspace_id = p_workspace_id
        order by created_at desc, id limit v_limit) r), '[]'::jsonb));
end;
$$;


revoke all on function public.google_listing_control_json(public.google_listing_controls) from public,anon,authenticated,service_role;
revoke all on function public.read_google_listing_control(uuid,text) from public,anon,authenticated;
revoke all on function public.set_google_listing_paused(uuid,text,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.note_google_listing_access(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.read_google_listing_control(uuid,text) to service_role;
grant execute on function public.set_google_listing_paused(uuid,text,uuid,text,boolean) to service_role;
grant execute on function public.note_google_listing_access(uuid,text,boolean) to service_role;
create function public.check_google_listing_record_revision(p_workspace_id uuid,p_revision bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce((select revision = p_revision from public.business_records where workspace_id = p_workspace_id),false)
$$;
revoke all on function public.check_google_listing_record_revision(uuid,bigint) from public,anon,authenticated;
grant execute on function public.check_google_listing_record_revision(uuid,bigint) to service_role;
commit;
