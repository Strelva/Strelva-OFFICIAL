-- #494: native Live Versions require the business owner's exact decision.
-- Agency staff still prepare drafts. App effect mandates are not qualified;
-- a legacy operator/provider decision is never permission to publish one.
begin;
set local lock_timeout='3s';
create table release_rollback_baseline.version_live_owner_authority (
  singleton boolean primary key check(singleton), definition text not null, after_hash text
);
revoke all on release_rollback_baseline.version_live_owner_authority from public,anon,authenticated,service_role;
insert into release_rollback_baseline.version_live_owner_authority values
  (true,pg_get_functiondef('public.save_system_version(uuid,text,uuid,bigint,jsonb)'::regprocedure),null);
do $patch$
declare before_body text; patched text;
begin
  select definition into before_body from release_rollback_baseline.version_live_owner_authority where singleton;
  patched:=replace(before_body,
    'and ((d.route=''owner_decides'' and d.decided_by_kind in (''owner_link'',''owner_session''))
          or (d.route=''strelva_reviews'' and d.decided_by_kind=''operator''))',
    'and d.route=''owner_decides'' and d.decided_by_kind=''owner_session''
        and exists(select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
          where m.workspace_id=d.workspace_id and m.role=''owner'' and m.user_id::text=d.decided_by
            and u.verified_at is not null)');
  if patched=before_body then raise exception 'version_live_owner_patch_drift: decision'; end if;
  before_body:=patched;
  patched:=replace(before_body,
    'if not found then raise exception ''system_version_release_approval_required''; end if;',
    'if not found then raise exception ''system_version_release_approval_required''; end if;
    -- Pin the deciding owner''s current role and identity through the effect,
    -- including when another current owner executes the exact decision.
    perform 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
      where m.workspace_id=approval.workspace_id and m.role=''owner'' and m.user_id::text=approval.decided_by
        and u.verified_at is not null for share of m,u;
    if not found then raise exception ''system_version_release_approval_required''; end if;
    perform 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
      where m.workspace_id=before_version.business_workspace_id and m.user_id=p_user_id and m.role=''owner''
        and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null for share of m,u;
    if not found then raise exception ''system_version_release_owner_required''; end if;');
  if patched=before_body then raise exception 'version_live_owner_patch_drift: actor'; end if;
  execute patched;
  update release_rollback_baseline.version_live_owner_authority set after_hash=md5(pg_get_functiondef('public.save_system_version(uuid,text,uuid,bigint,jsonb)'::regprocedure));
end $patch$;
commit;
